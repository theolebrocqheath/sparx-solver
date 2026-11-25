/**
 * Extracts answers from Sparx's page data.
 * Sparx often embeds answer data in the page's JavaScript state,
 * network responses, or DOM attributes.
 */

export async function extractAnswer(page, questionData) {
  // Strategy 1: Check for answers in the page's JS state / React internals
  const fromState = await extractFromPageState(page);
  if (fromState) return fromState;

  // Strategy 2: Check for answers in data attributes
  const fromAttributes = await extractFromAttributes(page, questionData);
  if (fromAttributes) return fromAttributes;

  // Strategy 3: For multiple choice, try to identify the correct option
  if (questionData.type === 'multiple_choice') {
    const fromChoices = await extractFromChoices(page);
    if (fromChoices) return fromChoices;
  }

  // Strategy 4: Check intercepted network responses
  const fromNetwork = await extractFromNetworkData(page);
  if (fromNetwork) return fromNetwork;

  // Strategy 5: Look for validation/answer data in inline scripts
  const fromScripts = await extractFromScripts(page);
  if (fromScripts) return fromScripts;

  return null;
}

async function extractFromPageState(page) {
  return await page.evaluate(() => {
    // Sparx apps are React-based — dig into React fiber/state
    // Look for answer data in React component state
    const root = document.getElementById('root') || document.getElementById('app');
    if (!root?._reactRootContainer && !root?.__reactFiber) return null;

    // Walk React fiber tree looking for answer-related state
    function findInFiber(fiber, depth = 0) {
      if (!fiber || depth > 20) return null;

      const state = fiber.memoizedState;
      const props = fiber.memoizedProps;

      // Look for answer/solution data in props
      if (props) {
        if (props.answer !== undefined) return props.answer;
        if (props.solution !== undefined) return props.solution;
        if (props.correctAnswer !== undefined) return props.correctAnswer;
        if (props.correct !== undefined) return props.correct;
        if (props.result?.answer) return props.result.answer;
      }

      // Check state hooks
      let hook = state;
      while (hook) {
        if (hook.queue?.lastRenderedState) {
          const s = hook.queue.lastRenderedState;
          if (s?.answer) return s.answer;
          if (s?.solution) return s.solution;
          if (s?.correctAnswer) return s.correctAnswer;
        }
        hook = hook.next;
      }

      // Recurse into children
      const childResult = findInFiber(fiber.child, depth + 1);
      if (childResult) return childResult;
      return findInFiber(fiber.sibling, depth + 1);
    }

    // Get React fiber from root
    const fiberKey = Object.keys(root).find(
      (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
    );
    if (fiberKey) {
      const fiber = root[fiberKey];
      const answer = findInFiber(fiber);
      if (answer) {
        if (typeof answer === 'string' || typeof answer === 'number') {
          return { type: 'type', selector: 'input', value: answer };
        }
        if (answer.index !== undefined) {
          return {
            type: 'click',
            selector: `[class*="choice"]:nth-child(${answer.index + 1}), [class*="option"]:nth-child(${answer.index + 1})`,
          };
        }
      }
    }

    return null;
  });
}

async function extractFromAttributes(page, questionData) {
  return await page.evaluate(() => {
    // Look for data attributes that might contain answers
    const answerAttrs = [
      'data-answer',
      'data-correct',
      'data-correct-answer',
      'data-solution',
      'data-value',
      'data-expected',
    ];

    for (const attr of answerAttrs) {
      const el = document.querySelector(`[${attr}]`);
      if (el) {
        const val = el.getAttribute(attr);
        if (val) {
          const input = document.querySelector('input[type="number"], input[type="text"]');
          if (input) {
            return { type: 'type', selector: `[${attr}]`, value: val };
          }
          return { type: 'select', value: val };
        }
      }
    }

    // Check aria-labels for answer hints
    const options = document.querySelectorAll('[role="radio"], [role="option"], [class*="choice"]');
    for (const opt of options) {
      const label = opt.getAttribute('aria-label') || '';
      if (label.toLowerCase().includes('correct')) {
        return { type: 'click', selector: `[aria-label="${label}"]` };
      }
    }

    return null;
  });
}

async function extractFromChoices(page) {
  return await page.evaluate(() => {
    // For multiple choice: look for distinguishing marks on the correct option
    const choices = document.querySelectorAll(
      '[class*="choice"], [class*="option"], [role="radio"], label:has(input[type="radio"])'
    );

    for (const choice of choices) {
      const classes = choice.className || '';
      const dataAttrs = Object.keys(choice.dataset).join(' ');

      // Check if any class or data attribute hints at correctness
      if (
        classes.includes('correct') ||
        dataAttrs.includes('correct') ||
        choice.dataset.correct === 'true'
      ) {
        return { type: 'click', selector: `.${classes.split(' ').find((c) => c.includes('correct')) || 'correct'}` };
      }
    }

    // Check if the choices have pre-loaded result styling
    for (const choice of choices) {
      const style = window.getComputedStyle(choice);
      const bg = style.backgroundColor;
      // Green-ish backgrounds often indicate correct answers in pre-loaded state
      if (bg && bg.includes('rgb') && !bg.includes('255, 255, 255')) {
        const rgb = bg.match(/\d+/g)?.map(Number);
        if (rgb && rgb[1] > rgb[0] && rgb[1] > rgb[2]) {
          const idx = Array.from(choices).indexOf(choice);
          return {
            type: 'click',
            selector: `[class*="choice"]:nth-child(${idx + 1}), [class*="option"]:nth-child(${idx + 1})`,
          };
        }
      }
    }

    return null;
  });
}

async function extractFromNetworkData(page) {
  // Intercept API responses that might contain answer data
  // This needs to be set up before navigation ideally, but we can check
  // the performance entries for cached responses
  return await page.evaluate(() => {
    // Check performance entries for API calls that returned answer data
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries) {
      if (
        entry.name.includes('/api/') &&
        (entry.name.includes('answer') ||
          entry.name.includes('solution') ||
          entry.name.includes('question'))
      ) {
        // The URL exists but we can't read the response from perf entries
        // This is more of a signal that answer data might be available via XHR
        return null;
      }
    }
    return null;
  });
}

async function extractFromScripts(page) {
  return await page.evaluate(() => {
    // Look through inline script tags for answer data
    const scripts = document.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const text = script.textContent;
      if (!text) continue;

      // Look for JSON data containing answers
      const patterns = [
        /["']answer["']\s*:\s*["']([^"']+)["']/i,
        /["']correctAnswer["']\s*:\s*["']([^"']+)["']/i,
        /["']solution["']\s*:\s*["']([^"']+)["']/i,
        /correct_answer\s*=\s*["']([^"']+)["']/i,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          return { type: 'type', selector: 'input', value: match[1] };
        }
      }
    }

    return null;
  });
}
