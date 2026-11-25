export async function extractAnswer(page, questionData) {
  const fromState = await extractFromPageState(page);
  if (fromState) return fromState;

  const solved = solveQuestion(questionData.text);
  if (solved !== null) {
    return { type: 'type', value: solved };
  }

  if (questionData.type === 'multiple_choice') {
    const fromChoices = await extractFromChoices(page);
    if (fromChoices) return fromChoices;
  }

  return null;
}

function solveQuestion(text) {
  if (!text) return null;
  const t = text.replace(/\s+/g, ' ').trim();

  // "Write X/Y as a percentage"
  let m = t.match(/(?:write|convert|express)\s+(\d+)\s*[\/÷]\s*(\d+)\s+as\s+a\s+percentage/i);
  if (m) return String((parseInt(m[1]) / parseInt(m[2])) * 100);

  // "What is X% of Y"
  m = t.match(/what\s+is\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)/i);
  if (m) return String((parseFloat(m[1]) / 100) * parseFloat(m[2]));

  // "X% of Y"
  m = t.match(/(?:find|calculate|work out)\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)/i);
  if (m) return String((parseFloat(m[1]) / 100) * parseFloat(m[2]));

  // "Write X as a fraction of Y" → X/Y simplified
  m = t.match(/write\s+(\d+)\s+as\s+a\s+fraction\s+of\s+(\d+)/i);
  if (m) { const f = simplifyFraction(parseInt(m[1]), parseInt(m[2])); return `${f[0]}/${f[1]}`; }

  // "Simplify X/Y" or "Simplify X:Y"
  m = t.match(/simplify\s+(\d+)\s*[\/÷]\s*(\d+)/i);
  if (m) { const f = simplifyFraction(parseInt(m[1]), parseInt(m[2])); return `${f[0]}/${f[1]}`; }
  m = t.match(/simplify\s+(\d+)\s*:\s*(\d+)/i);
  if (m) { const f = simplifyFraction(parseInt(m[1]), parseInt(m[2])); return `${f[0]}:${f[1]}`; }

  // "Convert X.Y to a percentage"
  m = t.match(/convert\s+(\d+\.\d+)\s+to\s+a\s+percentage/i);
  if (m) return String(parseFloat(m[1]) * 100);

  // "Convert X/Y to a decimal"
  m = t.match(/convert\s+(\d+)\s*[\/÷]\s*(\d+)\s+to\s+a\s+decimal/i);
  if (m) return String(parseInt(m[1]) / parseInt(m[2]));

  // "Convert X% to a decimal"
  m = t.match(/convert\s+(\d+(?:\.\d+)?)\s*%\s+to\s+a\s+decimal/i);
  if (m) return String(parseFloat(m[1]) / 100);

  // "X + Y", "X - Y", "X × Y", "X ÷ Y" (calculate/work out/evaluate)
  m = t.match(/(?:calculate|work out|evaluate|find|what is)\s+(-?\d+(?:\.\d+)?)\s*([+\-×x*÷\/])\s*(-?\d+(?:\.\d+)?)/i);
  if (m) {
    const a = parseFloat(m[1]), b = parseFloat(m[3]);
    const op = m[2];
    if (op === '+') return String(a + b);
    if (op === '-' || op === '−') return String(a - b);
    if ('×x*'.includes(op)) return String(a * b);
    if (op === '÷' || op === '/') return String(a / b);
  }

  // "X squared" or "X²"
  m = t.match(/(\d+)\s*(?:squared|²)/i);
  if (m) return String(parseInt(m[1]) ** 2);

  // "X cubed" or "X³"
  m = t.match(/(\d+)\s*(?:cubed|³)/i);
  if (m) return String(parseInt(m[1]) ** 3);

  // "square root of X"
  m = t.match(/square\s+root\s+of\s+(\d+)/i);
  if (m) { const r = Math.sqrt(parseInt(m[1])); return Number.isInteger(r) ? String(r) : null; }

  // "X/Y of Z" (fraction of a number)
  m = t.match(/(\d+)\s*[\/÷]\s*(\d+)\s+of\s+(\d+)/i);
  if (m) return String((parseInt(m[1]) / parseInt(m[2])) * parseInt(m[3]));

  // "increase/decrease X by Y%"
  m = t.match(/increase\s+(\d+(?:\.\d+)?)\s+by\s+(\d+(?:\.\d+)?)\s*%/i);
  if (m) return String(parseFloat(m[1]) * (1 + parseFloat(m[2]) / 100));
  m = t.match(/decrease\s+(\d+(?:\.\d+)?)\s+by\s+(\d+(?:\.\d+)?)\s*%/i);
  if (m) return String(parseFloat(m[1]) * (1 - parseFloat(m[2]) / 100));

  // "round X to Y decimal places"
  m = t.match(/round\s+(\d+\.\d+)\s+to\s+(\d+)\s+decimal\s+place/i);
  if (m) return String(parseFloat(parseFloat(m[1]).toFixed(parseInt(m[2]))));

  // "round X to the nearest 10/100/1000"
  m = t.match(/round\s+(\d+(?:\.\d+)?)\s+to\s+the\s+nearest\s+(\d+)/i);
  if (m) { const n = parseFloat(m[1]), r = parseInt(m[2]); return String(Math.round(n / r) * r); }

  // "0.45 as a fraction" or "write 0.45 as a fraction in its simplest form"
  m = t.match(/(\d+\.\d+)\s+(?:as\s+a\s+fraction|in\s+(?:its\s+)?simplest\s+form)/i);
  if (m) {
    const dec = m[1];
    const places = dec.split('.')[1].length;
    const denom = Math.pow(10, places);
    const numer = Math.round(parseFloat(dec) * denom);
    const f = simplifyFraction(numer, denom);
    return `${f[0]}/${f[1]}`;
  }

  // "convert 0.X to a fraction"
  m = t.match(/convert\s+(\d+\.\d+)\s+to\s+a\s+fraction/i);
  if (m) {
    const dec = m[1];
    const places = dec.split('.')[1].length;
    const denom = Math.pow(10, places);
    const numer = Math.round(parseFloat(dec) * denom);
    const f = simplifyFraction(numer, denom);
    return `${f[0]}/${f[1]}`;
  }

  return null;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function simplifyFraction(n, d) {
  const g = gcd(Math.abs(n), Math.abs(d));
  return [n / g, d / g];
}

async function extractFromPageState(page) {
  return await page.evaluate(() => {
    const root = document.getElementById('root') || document.getElementById('app');
    if (!root) return null;
    const fiberKey = Object.keys(root).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (!fiberKey) return null;

    function findInFiber(fiber, depth = 0) {
      if (!fiber || depth > 20) return null;
      const props = fiber.memoizedProps;
      if (props) {
        for (const key of ['answer', 'solution', 'correctAnswer', 'correct']) {
          if (props[key] !== undefined) return props[key];
        }
        if (props.result?.answer) return props.result.answer;
      }
      return findInFiber(fiber.child, depth + 1) || findInFiber(fiber.sibling, depth + 1);
    }

    const answer = findInFiber(root[fiberKey]);
    if (answer && (typeof answer === 'string' || typeof answer === 'number')) {
      return { type: 'type', value: String(answer) };
    }
    return null;
  });
}

async function extractFromChoices(page) {
  return await page.evaluate(() => {
    const choices = document.querySelectorAll('[class*="choice"], [class*="option"], [role="radio"]');
    for (const choice of choices) {
      const classes = choice.className || '';
      if (classes.includes('correct') || choice.dataset.correct === 'true') {
        const idx = Array.from(choices).indexOf(choice);
        return { type: 'click', selector: `[class*="choice"]:nth-child(${idx + 1})` };
      }
    }
    return null;
  });
}
