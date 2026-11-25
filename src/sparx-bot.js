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

      const allLinks = document.querySelectorAll('a[href]');
      allLinks.forEach((el) => {
        const fullText = el.textContent?.trim() || '';
        const href = el.href || '';
        if (!fullText.includes('Homework due') && !fullText.includes('homework due')) return;

        const titleMatch = fullText.match(/Homework due\s+\w+\s+\d+\w*\s+\w+\s+\d+(?:am|pm)/i);
        const name = titleMatch ? titleMatch[0] : fullText.split(/Bookwork|Completed|Not started|In progress|Start/i)[0].trim();

        if (seen.has(name)) return;
        seen.add(name);

        const isCompleted = /Completed/i.test(fullText);
        const inProgress = /In progress/i.test(fullText);
        const status = isCompleted ? 'Completed' : inProgress ? 'In progress' : 'Not started';

        tasks.push({ name, status, questions: '', url: href });
      });

      if (tasks.length === 0) {
        const allElements = document.querySelectorAll('button, [role="button"], [class*="package"], [class*="task"], [class*="homework"]');
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

          const link = el.closest('a');
          tasks.push({ name, status, questions: '', url: link?.href || '' });
        });
      }

      return tasks;
    });

    return homework;
  }

  async solveTask(taskUrl, onProgress, taskName) {
    onProgress({ type: 'status', message: 'Starting task...' });

    // Step 1: Navigate to the task page
    if (taskUrl) {
      onProgress({ type: 'status', message: `Navigating to task...` });
      await this.page.goto(taskUrl, { waitUntil: 'networkidle' });
    }
    await delay(2000);

    // Step 2: Verify we're on a question page, not still on homework list
    let url = this.page.url();
    onProgress({ type: 'status', message: `On: ${url.substring(0, 80)}` });

    if (!url.includes('/package/') && !url.includes('/task/')) {
      onProgress({ type: 'status', message: 'Not on question page — clicking through...' });

      // Try clicking a homework link that goes to a package
      const navResult = await this.page.evaluate((name) => {
        // First try: links with package/task in href
        const packageLinks = document.querySelectorAll('a[href*="package"], a[href*="task"]');
        for (const link of packageLinks) {
          const text = link.textContent || '';
          if (!/completed/i.test(text)) {
            link.click();
            return 'clicked-package-link';
          }
        }
        if (packageLinks.length > 0) {
          packageLinks[0].click();
          return 'clicked-first-package-link';
        }

        // Second try: click by task name
        if (name) {
          const allEls = document.querySelectorAll('a, button, [role="button"], [role="link"]');
          for (const el of allEls) {
            if (el.textContent?.includes(name.substring(0, 20))) {
              el.click();
              return 'clicked-by-name';
            }
          }
        }

        // Third try: any clickable homework element
        const hwElements = document.querySelectorAll('a, button, [role="button"]');
        for (const el of hwElements) {
          const text = el.textContent || '';
          if (/homework due/i.test(text) && !/completed/i.test(text)) {
            el.click();
            return 'clicked-homework-element';
          }
        }

        return 'nothing-to-click';
      }, taskName);

      onProgress({ type: 'status', message: `Navigation: ${navResult}` });

      if (navResult !== 'nothing-to-click') {
        try {
          await this.page.waitForURL(u => u.href.includes('/package/') || u.href.includes('/task/'), { timeout: 15000 });
        } catch {
          // URL didn't change, but page content might have
        }
        await this.page.waitForLoadState('networkidle');
        await delay(2000);
      }

      url = this.page.url();
      onProgress({ type: 'status', message: `Now on: ${url.substring(0, 80)}` });
    }

    // Step 3: Dismiss cookie banner on the question page
    await this.dismissCookieBanner();
    await delay(1000);

    // Step 4: Check if there's a "Start" or "Continue" button to begin
    const startBtn = await this.page.$('button:has-text("Start"), button:has-text("Continue"), button:has-text("Resume")');
    if (startBtn) {
      onProgress({ type: 'status', message: 'Clicking Start/Continue...' });
      await startBtn.click();
      await delay(2000);
      await this.page.waitForLoadState('networkidle');
    }

    // Step 5: Detect sub-question tabs
    const tabs = await this.detectTabs();
    const questionsToSolve = tabs.length > 0 ? tabs : ['single'];
    onProgress({ type: 'status', message: `Found ${questionsToSolve.length} sub-questions: ${tabs.join(', ') || 'single task'}` });

    // Step 6: Debug — log what the page shows
    const pagePreview = await this.page.evaluate(() => {
      const text = document.body.innerText || '';
      return text.substring(0, 300).replace(/\s+/g, ' ');
    });
    onProgress({ type: 'status', message: `Page text: ${pagePreview.substring(0, 150)}` });

    let solved = 0;
    let failed = 0;

    for (let i = 0; i < questionsToSolve.length; i++) {
      const tabLabel = questionsToSolve[i];
      const questionNum = i + 1;

      // Click the tab if not 'single'
      if (tabLabel !== 'single') {
        const clicked = await this.clickTab(tabLabel);
        if (!clicked) {
          onProgress({ type: 'skip', message: `Could not find tab ${tabLabel}`, questionNum });
          failed++;
          continue;
        }
        await delay(1500);
      }

      onProgress({ type: 'progress', message: `Working on ${tabLabel}...`, questionNum, solved, failed });

      try {
        const questionData = await this.extractQuestion();
        const qPreview = questionData.text?.substring(0, 100) || 'No question text found';
        onProgress({ type: 'question', message: `${tabLabel}: ${qPreview}`, questionNum });

        if (!questionData.text || questionData.text.length < 5) {
          onProgress({ type: 'skip', message: `${tabLabel}: No question text detected`, questionNum });
          failed++;
          continue;
        }

        const answer = await extractAnswer(this.page, questionData);

        if (answer) {
          onProgress({ type: 'answering', message: `${tabLabel} → ${answer.value || 'clicking option'}`, questionNum });
          await this.submitAnswer(answer);
          solved++;
        } else {
          onProgress({ type: 'skip', message: `Could not solve ${tabLabel}, skipping`, questionNum });
          failed++;
        }
      } catch (err) {
        onProgress({ type: 'error', message: `Error on ${tabLabel}: ${err.message}`, questionNum });
        failed++;
      }

      await humanDelay();
    }

    onProgress({ type: 'complete', message: `Done! Solved ${solved}/${questionsToSolve.length}`, solved, failed });
  }

  async detectTabs() {
    return await this.page.evaluate(() => {
      const found = [];
      const seen = new Set();

      // Strategy 1: Look for elements whose DIRECT text (not children) matches tab pattern
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .join('');
        const fullText = el.textContent?.trim() || '';

        // Match "1A", "1B" etc — either as direct text or full text if element is small
        const textToCheck = directText || (fullText.length <= 3 ? fullText : '');
        if (textToCheck && /^\d+[A-Z]$/i.test(textToCheck) && el.offsetParent !== null) {
          const label = textToCheck.toUpperCase();
          if (!seen.has(label)) {
            seen.add(label);
            found.push(label);
          }
        }
      }

      // Strategy 2: Check for aria tabs
      if (found.length === 0) {
        document.querySelectorAll('[role="tab"]').forEach(el => {
          const text = el.textContent?.trim();
          if (text && /^\d+[A-Z]$/i.test(text)) {
            const label = text.toUpperCase();
            if (!seen.has(label)) {
              seen.add(label);
              found.push(label);
            }
          }
        });
      }

      // Strategy 3: Look for navigation-like containers with short labels
      if (found.length === 0) {
        document.querySelectorAll('nav, [class*="tab"], [class*="nav"], [class*="step"]').forEach(container => {
          container.querySelectorAll('a, button, div, span').forEach(el => {
            const text = el.textContent?.trim();
            if (text && /^\d+[A-Z]$/i.test(text) && el.offsetParent !== null) {
              const label = text.toUpperCase();
              if (!seen.has(label)) {
                seen.add(label);
                found.push(label);
              }
            }
          });
        });
      }

      found.sort((a, b) => {
        const numA = parseInt(a), numB = parseInt(b);
        if (numA !== numB) return numA - numB;
        return a.localeCompare(b);
      });

      return found;
    });
  }

  async clickTab(tabLabel) {
    return await this.page.evaluate((label) => {
      // Try multiple strategies to find and click the tab

      // Strategy 1: Direct text match on interactive elements
      const interactive = document.querySelectorAll('a, button, [role="tab"]');
      for (const el of interactive) {
        if (el.textContent?.trim().toUpperCase() === label && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }

      // Strategy 2: Any visible element with matching text
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      while (walker.nextNode()) {
        const el = walker.currentNode;
        const directText = Array.from(el.childNodes)
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent.trim())
          .join('');
        if (directText.toUpperCase() === label && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }

      // Strategy 3: Element whose full text matches (for small elements)
      const allEls = document.querySelectorAll('div, span, li, a, button');
      for (const el of allEls) {
        const text = el.textContent?.trim();
        if (text && text.toUpperCase() === label && text.length <= 3 && el.offsetParent !== null) {
          el.click();
          return true;
        }
      }

      return false;
    }, tabLabel);
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

      // Noise: lines that are UI chrome, not question content
      const isNoise = (line) => {
        if (!line || line.length === 0) return true;
        if (/^\d+[A-Za-z]$/.test(line)) return true;
        if (/^\d+[A-Za-z]\d+[A-Za-z]/.test(line)) return true;
        if (/^(Summary|Menu|Bookwork)$/i.test(line)) return true;
        if (/^\d[\d,]*\s*XP/i.test(line)) return true;
        if (/^Hey\s+\w+/i.test(line)) return true;
        if (/^Sparx\s*(Maths|Science|Reader)?$/i.test(line)) return true;
        if (/^Calculator\s*(not\s*)?allowed/i.test(line)) return true;
        if (/^Watch\s+video/i.test(line)) return true;
        if (/^(Submit|Check|Skip|Next|Back|I don't know)/i.test(line)) return true;
        if (/personalised\s+homework/i.test(line)) return true;
        if (/answer\s+every\s+question/i.test(line)) return true;
        if (/complete\s+it.*\d+\/\d+/i.test(line)) return true;
        if (/^Homework\s+due/i.test(line)) return true;
        if (/^(Completed|Not started|In progress)$/i.test(line)) return true;
        if (/^\d+\/\d+$/.test(line)) return true;
        if (/^(XP|Bookwork code)/i.test(line)) return true;
        // Single/two word lines that aren't math
        if (line.length <= 3 && !/\d/.test(line)) return true;
        return false;
      };

      const bodyText = document.body.innerText || '';
      const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      // Collect all non-noise lines
      const questionLines = [];
      for (const line of lines) {
        if (isNoise(line)) continue;
        // Stop at button-like lines at the end
        if (/^(Submit|Check answer)/i.test(line)) break;
        questionLines.push(line);
      }

      let text = questionLines.join(' ').replace(/\s+/g, ' ').trim();

      // Fallback: try specific DOM selectors
      if (!text || text.length < 10) {
        const selectors = [
          '[class*="question"]', '[class*="stimulus"]', '[class*="prompt"]',
          '[class*="problem"]', '[class*="wac-text"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim().length > 10) {
            text = readMathText(el).replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }

      // Last resort: grab text from main content area
      if (!text || text.length < 10) {
        const main = document.querySelector('main') || document.querySelector('[class*="content"]');
        if (main) {
          text = readMathText(main).replace(/\s+/g, ' ').trim();
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
