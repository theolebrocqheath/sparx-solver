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
  let m = t.match(/(?:write|convert|express|give)\s+(\d+)\s*[\/÷]\s*(\d+)\s+as\s+a\s+percentage/i);
  if (m) return String((parseInt(m[1]) / parseInt(m[2])) * 100);

  // "What is X/Y as a percentage"
  m = t.match(/what\s+is\s+(\d+)\s*[\/÷]\s*(\d+)\s+as\s+a\s+percentage/i);
  if (m) return String((parseInt(m[1]) / parseInt(m[2])) * 100);

  // "What is X% of Y"
  m = t.match(/what\s+is\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(\d+(?:\.\d+)?)/i);
  if (m) return String((parseFloat(m[1]) / 100) * parseFloat(m[2]));

  // "Find/Calculate/Work out X% of Y"
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

  // "Convert X.Y to a percentage" or "X.Y as a percentage"
  m = t.match(/(?:convert|write|express|give)\s+(\d+\.\d+)\s+(?:to|as)\s+a\s+percentage/i);
  if (m) return String(parseFloat(m[1]) * 100);

  // "Convert X/Y to a decimal"
  m = t.match(/(?:convert|write|express|give)\s+(\d+)\s*[\/÷]\s*(\d+)\s+(?:to|as)\s+a\s+decimal/i);
  if (m) return String(parseInt(m[1]) / parseInt(m[2]));

  // "Convert X% to a decimal"
  m = t.match(/(?:convert|write|express|give)\s+(\d+(?:\.\d+)?)\s*%\s+(?:to|as)\s+a\s+decimal/i);
  if (m) return String(parseFloat(m[1]) / 100);

  // "X + Y", "X - Y", "X × Y", "X ÷ Y" (calculate/work out/evaluate)
  m = t.match(/(?:calculate|work out|evaluate|find|what is)\s+(-?\d+(?:\.\d+)?)\s*([+\-−×x*÷\/])\s*(-?\d+(?:\.\d+)?)/i);
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
  if (m) { const r = Math.sqrt(parseInt(m[1])); return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, ''); }

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

  // "What percentage of X is Y" → (Y/X)*100
  m = t.match(/what\s+percentage\s+of\s+(\d+(?:\.\d+)?)\s+is\s+(\d+(?:\.\d+)?)/i);
  if (m) return String((parseFloat(m[2]) / parseFloat(m[1])) * 100);

  // "X out of Y as a percentage"
  m = t.match(/(\d+)\s+out\s+of\s+(\d+)\s+as\s+a\s+percentage/i);
  if (m) return String((parseInt(m[1]) / parseInt(m[2])) * 100);

  // Quadratic: "solve ax² + bx + c = 0" or similar — give to N d.p.
  const quadResult = solveQuadratic(t);
  if (quadResult) return quadResult;

  // Any question mentioning a decimal and asking for a fraction/simplest form
  if (/as\s+a\s+fraction|simplest\s+form|convert.*to\s+a\s+fraction/i.test(t)) {
    m = t.match(/(0\.\d+)/);
    if (m) {
      const dec = m[1];
      const places = dec.split('.')[1].length;
      const denom = Math.pow(10, places);
      const numer = Math.round(parseFloat(dec) * denom);
      const f = simplifyFraction(numer, denom);
      return `${f[0]}/${f[1]}`;
    }
  }

  // "X as a percentage" where X is a decimal
  m = t.match(/(0\.\d+)\s+as\s+a\s+percentage/i);
  if (m) return String(parseFloat(m[1]) * 100);

  return null;
}

function solveQuadratic(text) {
  const dpMatch = text.match(/to\s+(\d+)\s+d\.?\s*p\.?/i) || text.match(/(\d+)\s+decimal\s+place/i);
  const dp = dpMatch ? parseInt(dpMatch[1]) : 2;

  let a = 0, b = 0, c = 0;
  let found = false;

  // Pattern: ax² + bx + c = 0
  let m = text.match(/(-?\d*)\s*x\s*[²\^2]\s*([+\-−])\s*(\d*)\s*x\s*([+\-−])\s*(\d+)\s*=\s*0/i);
  if (m) {
    a = parseInt(m[1] || '1') || 1;
    b = parseInt((m[2] === '-' || m[2] === '−' ? '-' : '') + (m[3] || '1'));
    c = parseInt((m[4] === '-' || m[4] === '−' ? '-' : '') + m[5]);
    found = true;
  }

  // Pattern: ax² + bx = c
  if (!found) {
    m = text.match(/(-?\d*)\s*x\s*[²\^2]\s*([+\-−])\s*(\d*)\s*x\s*=\s*(-?\d+)/i);
    if (m) {
      a = parseInt(m[1] || '1') || 1;
      b = parseInt((m[2] === '-' || m[2] === '−' ? '-' : '') + (m[3] || '1'));
      c = -parseInt(m[4]);
      found = true;
    }
  }

  if (!found) return null;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
  const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);

  const r1 = x1.toFixed(dp);
  const r2 = x2.toFixed(dp);

  if (r1 === r2) return r1;
  const sorted = [parseFloat(r1), parseFloat(r2)].sort((a, b) => a - b);
  return `${sorted[0].toFixed(dp)}, ${sorted[1].toFixed(dp)}`;
}

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function simplifyFraction(n, d) {
  const g = gcd(Math.abs(n), Math.abs(d));
  return [n / g, d / g];
}

async function extractFromPageState(page) {
  return await page.evaluate(() => {
    // Deep scan of React state for answers
    const roots = [
      document.getElementById('root'),
      document.getElementById('app'),
      document.getElementById('__next'),
    ].filter(Boolean);

    for (const root of roots) {
      const fiberKey = Object.keys(root).find(k =>
        k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (!fiberKey) continue;

      const answers = [];
      function findInFiber(fiber, depth = 0) {
        if (!fiber || depth > 30) return;
        const props = fiber.memoizedProps;
        if (props && typeof props === 'object') {
          for (const key of Object.keys(props)) {
            const val = props[key];
            if (/answer|solution|correct/i.test(key) && val !== undefined && val !== null) {
              if (typeof val === 'string' || typeof val === 'number') {
                answers.push(String(val));
              } else if (typeof val === 'object' && val.value) {
                answers.push(String(val.value));
              }
            }
          }
          if (props.question?.answer) answers.push(String(props.question.answer));
          if (props.result?.answer) answers.push(String(props.result.answer));
          if (props.data?.answer) answers.push(String(props.data.answer));
          if (props.item?.answer) answers.push(String(props.item.answer));
        }

        const state = fiber.memoizedState;
        if (state && typeof state === 'object' && state.memoizedState) {
          const s = state.memoizedState;
          if (typeof s === 'object' && s !== null) {
            for (const key of Object.keys(s)) {
              if (/answer|solution/i.test(key) && s[key]) {
                answers.push(String(s[key]));
              }
            }
          }
        }

        findInFiber(fiber.child, depth + 1);
        findInFiber(fiber.sibling, depth + 1);
      }

      findInFiber(root[fiberKey]);
      if (answers.length > 0) {
        return { type: 'type', value: answers[0] };
      }
    }

    // Also check for window/global state
    const globalKeys = ['__SPARX_STATE__', '__NEXT_DATA__', '__APP_STATE__'];
    for (const key of globalKeys) {
      const state = window[key];
      if (!state) continue;
      const json = JSON.stringify(state);
      const answerMatch = json.match(/"(?:answer|correctAnswer|solution)"\s*:\s*"([^"]+)"/);
      if (answerMatch) {
        return { type: 'type', value: answerMatch[1] };
      }
    }

    return null;
  });
}

async function extractFromChoices(page) {
  return await page.evaluate(() => {
    const choices = document.querySelectorAll('[class*="choice"], [class*="option"], [role="radio"]');
    for (const choice of choices) {
      const classes = (typeof choice.className === 'string' ? choice.className : '').toLowerCase();
      if (classes.includes('correct') || choice.dataset.correct === 'true') {
        const idx = Array.from(choices).indexOf(choice);
        return { type: 'click', selector: `[class*="choice"]:nth-child(${idx + 1})` };
      }
    }
    return null;
  });
}
