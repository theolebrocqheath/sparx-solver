import { chromium } from 'playwright';
import { extractAnswer } from './answer-extractor.js';

const SELECT_SCHOOL_URL = 'https://selectschool.sparx-learning.com/?app=sparx_learning&route=https%3A%2F%2Fmaths.sparx-learning.com%2F';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const humanDelay = () => delay(1500 + Math.random() * 3000);

export class SparxBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.module = 'maths';
  }

  async launchBrowser(headless = true) {
    const launchOptions = { headless };
    if (!headless) {
      launchOptions.args = [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
      ];
    }
    try {
      this.browser = await chromium.launch(launchOptions);
    } catch (err) {
      if (err.message.includes("Executable doesn't exist") || err.message.includes('browserType.launch')) {
        throw new Error('Browser not installed yet. Run: npx playwright install chromium');
      }
      throw err;
    }
    const context = await this.browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    if (!headless) {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
    }
    this.page = await context.newPage();
  }

  async dismissCookieBanner() {
    await this.page.evaluate(() => {
      document.querySelectorAll('[id*="cookiescript"], [class*="cookie-banner"], [class*="cookie-consent"], [class*="consent-banner"]').forEach(el => el.remove());
    });
    await delay(300);
  }

  async selectSchool(schoolSlug) {
    await this.page.goto(SELECT_SCHOOL_URL, { waitUntil: 'networkidle' });

    const alreadyOnAuth = this.page.url().includes('auth.sparx-learning.com');
    if (alreadyOnAuth) return;

    await this.dismissCookieBanner();

    const input = await this.page.waitForSelector(
      'input[placeholder*="school" i]',
      { timeout: 15000 }
    );
    await input.type(schoolSlug, { delay: 50 });
    await delay(1500);

    const option = await this.page.waitForSelector(
      '[class*="result"], [class*="option"], [class*="school-item"], li',
      { timeout: 10000 }
    ).catch(() => null);

    if (option) {
      await option.click();
      await delay(500);
    }

    const continueBtn = await this.page.waitForSelector(
      'button:has-text("Continue")',
      { timeout: 5000 }
    ).catch(() => null);

    if (continueBtn) {
      await continueBtn.click();
    }

    await this.page.waitForURL(
      url => url.href.includes('auth.sparx-learning.com') || url.href.includes('accounts.google.com'),
      { timeout: 15000 }
    );
    await this.page.waitForLoadState('networkidle');
  }

  async login(schoolSlug, username, password) {
    await this.launchBrowser(true);
    await this.selectSchool(schoolSlug);

    const usernameInput = await this.page.waitForSelector(
      'input[name="username"], input[placeholder*="user" i], input[type="text"]',
      { timeout: 10000 }
    );
    await usernameInput.fill(username);
    await delay(300);

    const passwordInput = await this.page.waitForSelector(
      'input[type="password"], input[name="password"]',
      { timeout: 10000 }
    );
    await passwordInput.fill(password);
    await delay(300);

    const loginBtn = await this.page.waitForSelector(
      'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")',
      { timeout: 5000 }
    );
    await loginBtn.click();

    await this.page.waitForURL('**/maths.sparx-learning.com/**', { timeout: 30000 });
    await this.page.waitForLoadState('networkidle');

    return this.getStudentInfo(username);
  }

  async loginWithGoogle(schoolSlug) {
    await this.launchBrowser(false);
    await this.selectSchool(schoolSlug);

    const currentUrl = this.page.url();
    if (!currentUrl.includes('accounts.google.com')) {
      const googleBtn = await this.page.waitForSelector(
        'button:has-text("Google"), a:has-text("Google")',
        { timeout: 10000 }
      );
      await googleBtn.click();
    }

    await this.page.waitForURL(
      url => url.href.includes('maths.sparx-learning.com') || url.href.includes('science.sparx-learning.com') || url.href.includes('reader.sparx-learning.com'),
      { timeout: 300000 }
    );
    await this.page.waitForLoadState('networkidle');

    return this.getStudentInfo('Student');
  }

  async getStudentInfo(fallbackName) {
    const url = this.page.url();
    if (url.includes('science')) this.module = 'science';
    else if (url.includes('reader')) this.module = 'reader';
    else this.module = 'maths';

    const studentName = await this.page.evaluate(() => {
      const heyMatch = document.body.innerText.match(/Hey\s+([A-Za-z]+)/);
      if (heyMatch) return heyMatch[1];
      const selectors = [
        '[class*="student-name"]', '[class*="user-name"]', '[data-testid*="name"]',
        '[class*="greeting"]', '[class*="welcome"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }
      return null;
    }).catch(() => null);

    return { studentName: studentName || fallbackName, module: this.module };
  }

  async getHomework() {
    const alreadyOnHomework = this.page.url().includes('homework');
    if (!alreadyOnHomework) {
      const homeworkLink = await this.page.waitForSelector(
        'a[href*="homework"], a:has-text("Homework"), [data-testid*="homework"]',
        { timeout: 10000 }
      ).catch(() => null);
      if (homeworkLink) {
        await homeworkLink.click();
        await this.page.waitForLoadState('networkidle');
      }
    }
    await delay(2000);

    const homework = await this.page.evaluate(() => {
      const tasks = [];
      const seen = new Set();

      const allElements = document.querySelectorAll('a, button, [role="button"], [class*="package"], [class*="task"], [class*="homework"]');
      allElements.forEach((el) => {
        const fullText = el.textContent?.trim() || '';
        if (!fullText.includes('Homework due') && !fullText.includes('homework due')) return;

        const titleMatch = fullText.match(/Homework due\s+\w+\s+\d+\w*\s+\w+\s+\d+(?:am|pm)/i);
        const name = titleMatch ? titleMatch[0] : fullText.split(/Bookwork|Completed|Not started|In progress|Start/i)[0].trim();

        if (seen.has(name)) return;
        seen.add(name);

        const isCompleted = /Completed/i.test(fullText);
        const inProgress = /In progress/i.test(fullText);
        const status = isCompleted ? 'Completed' : inProgress ? 'In progress' : 'Not started';

        tasks.push({
          name,
          status,
          questions: '',
          url: el.href || el.closest('a')?.href || '',
        });
      });

      if (tasks.length === 0) {
        document.querySelectorAll('a[href*="task"], a[href*="package"], a[href*="homework"]').forEach((a) => {
          const text = a.textContent?.trim();
          if (text && !seen.has(text)) {
            seen.add(text);
            tasks.push({ name: text, status: '', questions: '', url: a.href });
          }
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

    while (true) {
      questionNum++;
      onProgress({ type: 'progress', message: `Working on question ${questionNum}...`, questionNum, solved, failed });

      const isComplete = await this.page.evaluate(() => {
        const url = window.location.href;
        if (url.includes('summary') || url.includes('complete') || url.includes('results')) return true;

        const main = document.querySelector('main') || document.querySelector('[class*="content"]');
        if (!main) return false;
        const mainText = main.innerText.toLowerCase();

        const hasCompletionMessage =
          mainText.includes('well done') ||
          mainText.includes('all caught up') ||
          mainText.includes('you have completed') ||
          mainText.includes('task complete') ||
          mainText.includes('all tasks complete');

        const hasNoQuestions =
          !document.querySelector('input:not([type="hidden"])') &&
          !document.querySelector('[class*="choice"], [class*="option"]') &&
          !document.querySelector('[class*="question"]');

        return hasCompletionMessage && hasNoQuestions;
      });

      if (isComplete) {
        onProgress({ type: 'status', message: 'Task complete!', solved, failed });
        break;
      }

      try {
        const questionData = await this.extractQuestion();
        onProgress({ type: 'question', message: `Q${questionNum}: ${questionData.text?.substring(0, 80) || 'Reading question...'}`, questionNum });

        const answer = await extractAnswer(this.page, questionData);

        if (answer) {
          onProgress({ type: 'answering', message: `Q${questionNum} → ${answer.value || 'clicking option'}`, questionNum });
          await this.submitAnswer(answer);
          solved++;
        } else {
          onProgress({ type: 'skip', message: `Could not extract answer for Q${questionNum}, skipping`, questionNum });
          failed++;
          await this.skipQuestion();
        }
      } catch (err) {
        onProgress({ type: 'error', message: `Error on Q${questionNum}: ${err.message}`, questionNum });
        failed++;
        await this.skipQuestion();
      }

      await humanDelay();

      const hasContent = await this.page.evaluate(() => {
        return !!(
          document.querySelector('input:not([type="hidden"])') ||
          document.querySelector('[class*="choice"], [class*="option"]') ||
          document.querySelector('[class*="question"]') ||
          document.querySelector('[class*="stimulus"]')
        );
      });

      if (!hasContent && questionNum > 2) {
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
      function readMathText(el) {
        if (!el) return '';
        let result = '';
        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            result += node.textContent;
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const cls = (typeof node.className === 'string' ? node.className : '').toLowerCase();
            const tag = node.tagName.toLowerCase();
            if (cls.includes('fraction') || cls.includes('frac')) {
              const parts = node.querySelectorAll('span, div');
              if (parts.length >= 2) {
                const num = parts[0].textContent.trim();
                const den = parts[parts.length - 1].textContent.trim();
                result += `${num}/${den}`;
                continue;
              }
            }
            if (tag === 'sup') { result += node.textContent; continue; }
            if (tag === 'sub') { result += node.textContent; continue; }
            result += readMathText(node);
          }
        }
        return result;
      }

      const mainContent = document.querySelector('main') || document.querySelector('[class*="content"]') || document.body;
      let text = readMathText(mainContent).replace(/\s+/g, ' ').trim();

      if (!text || text.length < 5) {
        const selectors = [
          '[class*="question"]', '[class*="problem"]', '[class*="stimulus"]',
          '[class*="prompt"]', 'main p', 'main div',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim().length > 5) {
            text = readMathText(el).replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }

      const hasMultipleChoice = document.querySelectorAll('[class*="choice"], [class*="option"], input[type="radio"]').length > 0;
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])');
      const hasInput = Array.from(inputs).some(inp => {
        const name = (inp.name || '').toLowerCase();
        return !name.includes('school') && !name.includes('user') && !name.includes('pass');
      });

      let type = 'unknown';
      if (hasMultipleChoice) type = 'multiple_choice';
      else if (hasInput) type = 'text';

      return { text, type, images: [] };
    });
  }

  async submitAnswer(answer) {
    if (answer.type === 'click') {
      await this.page.click(answer.selector);
    } else if (answer.type === 'type') {
      const input = await this.page.waitForSelector(
        'input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]):not([name*="school"]):not([name*="user"]):not([name*="pass"]), [contenteditable="true"]',
        { timeout: 5000 }
      ).catch(() => null);
      if (input) {
        await input.click();
        await delay(200);
        await input.fill(String(answer.value));
      }
    }

    await delay(800 + Math.random() * 1200);

    const submitBtn = await this.page
      .waitForSelector('button:has-text("Submit"), button:has-text("Check"), button[class*="submit"], button[class*="check"]', { timeout: 5000 })
      .catch(() => null);

    if (submitBtn) {
      await submitBtn.click();
      await delay(2000);
    }
  }

  async skipQuestion() {
    const skipBtn = await this.page
      .waitForSelector('button:has-text("Skip"), button:has-text("Next"), button:has-text("I don\'t know")', { timeout: 3000 })
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
