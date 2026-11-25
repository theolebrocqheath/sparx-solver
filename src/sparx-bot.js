import { chromium } from 'playwright';
import { extractAnswer } from './answer-extractor.js';

const SPARX_MATHS_URL = 'https://www.sparxmaths.uk';
const SPARX_SCIENCE_URL = 'https://www.sparxscience.com';
const SPARX_READER_URL = 'https://www.sparxreader.com';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const humanDelay = () => delay(1500 + Math.random() * 3000);

export class SparxBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.module = 'maths';
  }

  async launch() {
    try {
      this.browser = await chromium.launch({ headless: true });
    } catch (err) {
      if (err.message.includes('Executable doesn\'t exist') || err.message.includes('browserType.launch')) {
        throw new Error(
          'Browser not installed yet. Run: npx playwright install chromium'
        );
      }
      throw err;
    }
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    this.page = await context.newPage();
  }

  async login(school, username, password) {
    await this.launch();

    await this.page.goto(SPARX_MATHS_URL, { waitUntil: 'networkidle' });

    // Sparx login: find school, then enter credentials
    // The login flow: select school → enter username/password → submit
    const schoolInput = await this.page.waitForSelector(
      'input[placeholder*="school" i], input[name*="school" i], input[aria-label*="school" i]',
      { timeout: 15000 }
    );
    await schoolInput.fill(school);
    await delay(1000);

    // Wait for school dropdown and click first match
    const schoolOption = await this.page.waitForSelector(
      '[role="option"], .school-option, .dropdown-item, li[data-value]',
      { timeout: 10000 }
    );
    await schoolOption.click();
    await delay(1500);

    // Enter username
    const usernameInput = await this.page.waitForSelector(
      'input[name*="user" i], input[placeholder*="user" i], input[type="text"]:not([name*="school" i])',
      { timeout: 10000 }
    );
    await usernameInput.fill(username);
    await delay(500);

    // Enter password
    const passwordInput = await this.page.waitForSelector(
      'input[type="password"], input[name*="pass" i]',
      { timeout: 10000 }
    );
    await passwordInput.fill(password);
    await delay(500);

    // Submit
    const submitBtn = await this.page.waitForSelector(
      'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")',
      { timeout: 5000 }
    );
    await submitBtn.click();

    // Wait for navigation to dashboard
    await this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });

    // Check if login succeeded by looking for homework or dashboard elements
    const url = this.page.url();
    if (url.includes('login') || url.includes('error')) {
      throw new Error('Login failed — check your school name, username and password');
    }

    // Detect which module we're on
    if (url.includes('sparxscience')) this.module = 'science';
    else if (url.includes('sparxreader')) this.module = 'reader';
    else this.module = 'maths';

    const studentName = await this.page
      .locator('[class*="student-name"], [class*="user-name"], [data-testid*="name"]')
      .first()
      .textContent()
      .catch(() => username);

    return { studentName: studentName?.trim() || username, module: this.module };
  }

  async getHomework() {
    // Navigate to homework page
    const homeworkLink = await this.page.waitForSelector(
      'a[href*="homework"], a:has-text("Homework"), [data-testid*="homework"], nav a:has-text("My Homework")',
      { timeout: 10000 }
    );
    await homeworkLink.click();
    await this.page.waitForLoadState('networkidle');
    await delay(2000);

    // Extract homework tasks from the page
    const homework = await this.page.evaluate(() => {
      const tasks = [];
      // Look for homework task cards/items
      const taskElements = document.querySelectorAll(
        '[class*="task"], [class*="homework-item"], [class*="package"], [data-testid*="task"]'
      );
      taskElements.forEach((el) => {
        const name =
          el.querySelector('[class*="title"], [class*="name"], h3, h4')?.textContent?.trim() ||
          'Unknown Task';
        const status =
          el.querySelector('[class*="status"], [class*="progress"], [class*="badge"]')
            ?.textContent?.trim() || '';
        const link = el.querySelector('a')?.href || el.closest('a')?.href || '';
        const questions =
          el.querySelector('[class*="question"], [class*="count"]')?.textContent?.trim() || '';

        tasks.push({ name, status, questions, url: link });
      });

      // Fallback: look for any clickable homework-related elements
      if (tasks.length === 0) {
        document.querySelectorAll('a[href*="task"], a[href*="package"]').forEach((a) => {
          tasks.push({
            name: a.textContent?.trim() || 'Task',
            status: '',
            questions: '',
            url: a.href,
          });
        });
      }

      return tasks;
    });

    return homework;
  }

  async solveTask(taskUrl, onProgress) {
    if (taskUrl) {
      await this.page.goto(taskUrl, { waitUntil: 'networkidle' });
    }

    onProgress({ type: 'status', message: 'Starting task...' });
    await delay(2000);

    let questionNum = 0;
    let solved = 0;
    let failed = 0;

    // Loop through questions until done
    while (true) {
      questionNum++;
      onProgress({
        type: 'progress',
        message: `Working on question ${questionNum}...`,
        questionNum,
        solved,
        failed,
      });

      // Check if the task is complete
      const isComplete = await this.page.evaluate(() => {
        const body = document.body.innerText.toLowerCase();
        return (
          body.includes('well done') ||
          body.includes('all caught up') ||
          body.includes('completed') ||
          body.includes('100%') ||
          document.querySelector('[class*="complete"], [class*="finished"], [class*="done"]') !==
            null
        );
      });

      if (isComplete) {
        onProgress({ type: 'status', message: 'Task complete!', solved, failed });
        break;
      }

      // Try to extract and answer the current question
      try {
        const questionData = await this.extractQuestion();
        onProgress({
          type: 'question',
          message: `Q${questionNum}: ${questionData.text?.substring(0, 80) || 'Reading question...'}`,
          questionNum,
        });

        // Try to get the answer from page data first
        const answer = await extractAnswer(this.page, questionData);

        if (answer) {
          onProgress({
            type: 'answering',
            message: `Found answer for Q${questionNum}`,
            questionNum,
          });
          await this.submitAnswer(answer);
          solved++;
        } else {
          onProgress({
            type: 'skip',
            message: `Could not extract answer for Q${questionNum}, skipping`,
            questionNum,
          });
          failed++;
          await this.skipQuestion();
        }
      } catch (err) {
        onProgress({
          type: 'error',
          message: `Error on Q${questionNum}: ${err.message}`,
          questionNum,
        });
        failed++;
        await this.skipQuestion();
      }

      await humanDelay();

      // Check if we're stuck (no new question loaded)
      const stillSamePage = await this.page.evaluate(() => {
        return !document.querySelector(
          '[class*="question"], [class*="problem"], [class*="task-content"]'
        );
      });

      if (stillSamePage && questionNum > 2) {
        onProgress({ type: 'status', message: 'No more questions detected', solved, failed });
        break;
      }

      if (questionNum > 50) {
        onProgress({ type: 'status', message: 'Safety limit reached (50 questions)', solved, failed });
        break;
      }
    }
  }

  async extractQuestion() {
    return await this.page.evaluate(() => {
      // Try multiple selectors for question content
      const selectors = [
        '[class*="question-text"]',
        '[class*="problem"]',
        '[class*="stimulus"]',
        '[class*="prompt"]',
        '[data-testid*="question"]',
        '.question',
        'main p',
      ];

      let text = '';
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) {
          text = el.textContent.trim();
          break;
        }
      }

      // Look for answer input type
      const hasMultipleChoice = document.querySelectorAll(
        '[class*="choice"], [class*="option"], input[type="radio"]'
      ).length > 0;
      const hasNumberInput =
        document.querySelector('input[type="number"], input[inputmode="numeric"]') !== null;
      const hasTextInput =
        document.querySelector(
          'input[type="text"]:not([name*="school"]):not([name*="user"]):not([name*="pass"])'
        ) !== null;
      const hasDragDrop =
        document.querySelector('[draggable="true"], [class*="drag"]') !== null;

      let type = 'unknown';
      if (hasMultipleChoice) type = 'multiple_choice';
      else if (hasNumberInput) type = 'number';
      else if (hasTextInput) type = 'text';
      else if (hasDragDrop) type = 'drag_drop';

      // Get image URLs if any
      const images = Array.from(
        document.querySelectorAll('[class*="question"] img, main img')
      ).map((img) => img.src);

      return { text, type, images };
    });
  }

  async submitAnswer(answer) {
    if (answer.type === 'click') {
      // Click on a specific element (multiple choice)
      await this.page.click(answer.selector);
    } else if (answer.type === 'type') {
      // Type into an input field
      const input = await this.page.waitForSelector(answer.selector, { timeout: 5000 });
      await input.fill(String(answer.value));
    } else if (answer.type === 'select') {
      // Click the matching option
      await this.page.click(`text="${answer.value}"`);
    }

    await delay(800 + Math.random() * 1200);

    // Click submit/next button
    const submitBtn = await this.page
      .waitForSelector(
        'button:has-text("Submit"), button:has-text("Next"), button:has-text("Check"), button[class*="submit"], button[class*="next"]',
        { timeout: 5000 }
      )
      .catch(() => null);

    if (submitBtn) {
      await submitBtn.click();
      await delay(2000);
    }
  }

  async skipQuestion() {
    // Try skip/next buttons
    const skipBtn = await this.page
      .waitForSelector(
        'button:has-text("Skip"), button:has-text("Next"), button:has-text("I don\'t know")',
        { timeout: 3000 }
      )
      .catch(() => null);

    if (skipBtn) {
      await skipBtn.click();
      await delay(1500);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
