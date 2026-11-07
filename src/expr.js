// A tiny, safe maths evaluator for widgets: numbers, variables, + - * / ^, comparisons, ?:, and a fixed set of
// functions. No access to JavaScript, so widget text written by an AI can't run code.

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, ln: Math.log, log2: Math.log2, log10: Math.log10,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  floor: Math.floor, ceil: Math.ceil, round: Math.round, min: Math.min, max: Math.max, pow: Math.pow,
  sigmoid: (z) => 1 / (1 + Math.exp(-z)), sigma: (z) => 1 / (1 + Math.exp(-z)),
  clamp: (x, a, b) => Math.min(Math.max(x, a), b),
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    const op = /^(<=|>=|==|!=|&&|\|\||[-+*/^%(),<>?:!])/.exec(src.slice(i));
    if (op) { out.push({ t: 'op', v: op[0] }); i += op[0].length; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}

// Pratt parser → closure tree.
export function compile(src) {
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const take = (v) => {
    const t = toks[p];
    if (v && (!t || t.v !== v)) throw new Error(`Expected "${v}"`);
    p++;
    return t;
  };
  const BIN = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6, '^': 8 };
  function primary() {
    const t = take();
    if (!t) throw new Error('Unexpected end');
    if (t.t === 'num') return () => t.v;
    if (t.t === 'id') {
      if (peek()?.v === '(') {
        const fn = Object.hasOwn(FUNCS, t.v) ? FUNCS[t.v] : null;
        if (!fn) throw new Error(`Unknown function ${t.v}`);
        take('(');
        const args = [];
        if (peek()?.v !== ')') do args.push(expr(0)); while (peek()?.v === ',' && take(','));
        take(')');
        return (s) => fn(...args.map((a) => a(s)));
      }
      const name = t.v;
      if (Object.hasOwn(CONSTS, name)) return () => CONSTS[name];
      return (s) => {
        if (!Object.hasOwn(s, name)) throw new Error(`Unknown name ${name}`);
        return s[name];
      };
    }
    if (t.v === '(') {
      const e = expr(0);
      take(')');
      return e;
    }
    if (t.v === '-') { const e = expr(7); return (s) => -e(s); }
    if (t.v === '+') return expr(7);
    if (t.v === '!') { const e = expr(7); return (s) => (e(s) ? 0 : 1); }
    throw new Error(`Unexpected "${t.v}"`);
  }
  function expr(minBp) {
    let left = primary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== 'op') break;
      if (t.v === '?' && minBp <= 0) {
        take('?');
        const a = expr(0);
        take(':');
        const b = expr(0);
        const c = left;
        left = (s) => (c(s) ? a(s) : b(s));
        continue;
      }
      const bp = BIN[t.v];
      if (!bp || bp < minBp) break;
      take();
      const right = expr(t.v === '^' ? bp : bp + 1);
      const l = left;
      const f = {
        '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b, '%': (a, b) => a % b,
        '^': (a, b) => a ** b, '<': (a, b) => +(a < b), '>': (a, b) => +(a > b), '<=': (a, b) => +(a <= b), '>=': (a, b) => +(a >= b),
        '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b), '&&': (a, b) => +(a && b), '||': (a, b) => +(a || b),
      }[t.v];
      left = (s) => f(l(s), right(s));
    }
    return left;
  }
  const fn = expr(0);
  if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}"`);
  return fn;
}

/** Evaluate an expression with variables; returns NaN (never throws) on errors. */
export function evaluate(src, scope) {
  try {
    return compile(src)(scope);
  } catch {
    return NaN;
  }
}

/** Format a number for display: "3" / "0.57" / "1.2e-5". */
export function fmt(v, digits = 3) {
  if (typeof v !== 'number' || Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (Math.abs(v) !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6)) return v.toExponential(2);
  return String(Number(v.toFixed(digits)));
}
