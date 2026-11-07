// Highlights in the note, saved as Markdown that people and AIs can read:
//   ==text==           yellow highlight (Obsidian's syntax)
//   =={green}text==    another colour: yellow green blue purple pink red orange gray
//   =={!!!}text==      exam importance: !!! must know · !! important · ! good to know
import { $markSchema, $remark, $inputRule, $prose } from '@milkdown/kit/utils';
import { markRule } from '@milkdown/kit/prose';
import { keymap } from '@milkdown/kit/prose/keymap';

export const COLORS = ['yellow', 'green', 'blue', 'purple', 'pink', 'red', 'orange', 'gray'];
export const EXAM = [
  { tone: '!!!', label: 'Must know', hint: 'Definitely comes up in the exam' },
  { tone: '!!', label: 'Important', hint: 'Likely to be asked' },
  { tone: '!', label: 'Good to know', hint: 'Detail that can earn extra marks' },
];
const TONES = new Set([...COLORS, ...EXAM.map((e) => e.tone)]);
export const isExamTone = (t) => /^!{1,3}$/.test(t || '');
const examLabel = (t) => EXAM.find((e) => e.tone === t)?.label;

// ---------- Markdown → tree: find ==…== in text and wrap it in a "highlight" node ----------
const DELIM = new RegExp(`==(?:\\{(${[...TONES].map((t) => t.replace(/!/g, '\\!')).join('|')})\\})?`, 'g');
const SKIP = new Set(['code', 'inlineCode', 'math', 'inlineMath', 'html']);

function highlightTree(node) {
  if (!node.children || SKIP.has(node.type)) return;
  for (const c of node.children) highlightTree(c);
  if (!node.children.some((c) => c.type === 'text' && c.value.includes('=='))) return;

  // Split text into plain pieces and "==" delimiters (with what's around them).
  const tokens = [];
  for (const child of node.children) {
    if (child.type !== 'text') {
      tokens.push({ node: child });
      continue;
    }
    const v = child.value;
    let last = 0;
    for (const m of v.matchAll(DELIM)) {
      const prev = m.index > 0 ? v[m.index - 1] : null;
      const next = v[m.index + m[0].length] ?? null;
      if (prev === '=' || next === '=') continue; // "===" and longer runs are just text
      if (m.index > last) tokens.push({ text: v.slice(last, m.index) });
      tokens.push({ delim: m[0], tone: m[1], prevWs: prev !== null && /\s/.test(prev), nextWs: next !== null && /\s/.test(next) });
      last = m.index + m[0].length;
    }
    if (last < v.length) tokens.push({ text: v.slice(last) });
  }

  const out = [];
  let open = -1;
  let opener = null;
  for (const t of tokens) {
    if (!t.delim) {
      out.push(t.node || { type: 'text', value: t.text });
      continue;
    }
    if (open >= 0 && !t.tone && !t.prevWs && out.length > open) {
      const inner = out.splice(open);
      out.push({ type: 'highlight', tone: opener.tone || 'yellow', children: mergeText(inner) });
      open = -1;
      continue;
    }
    if (open < 0 && !t.nextWs) {
      open = out.length;
      opener = t;
      continue;
    }
    out.push({ type: 'text', value: t.delim });
  }
  if (open >= 0) out.splice(open, 0, { type: 'text', value: opener.delim });
  node.children = mergeText(out);
}

function mergeText(nodes) {
  const res = [];
  for (const n of nodes) {
    const last = res.at(-1);
    if (n.type === 'text' && last?.type === 'text') res[res.length - 1] = { type: 'text', value: last.value + n.value };
    else res.push(n);
  }
  return res;
}

// ---------- tree → Markdown ----------
function highlightToMarkdown(node, _parent, state, info) {
  const tone = node.tone && node.tone !== 'yellow' ? `{${node.tone}}` : '';
  const tracker = state.createTracker(info);
  let value = tracker.move('==' + tone);
  value += tracker.move(state.containerPhrasing(node, { ...tracker.current(), before: value, after: '=' }));
  value += tracker.move('==');
  return value;
}

function remarkHighlight() {
  const data = this.data();
  (data.toMarkdownExtensions ||= []).push({ handlers: { highlight: highlightToMarkdown } });
  return (tree) => highlightTree(tree);
}

// ---------- the editor side ----------
const remarkPlugin = $remark('remarkHighlight', () => remarkHighlight);

export const highlightSchema = $markSchema('highlight', () => ({
  attrs: { tone: { default: 'yellow' } },
  inclusive: false,
  parseDOM: [{ tag: 'mark', getAttrs: (dom) => ({ tone: TONES.has(dom.dataset.tone) ? dom.dataset.tone : 'yellow' }) }],
  toDOM: (mark) => {
    const tone = mark.attrs.tone;
    const label = examLabel(tone);
    return ['mark', { class: 'hl' + (label ? ' hl-exam' : ''), 'data-tone': tone, ...(label ? { title: label + ' for the exam' } : {}) }];
  },
  parseMarkdown: {
    match: (node) => node.type === 'highlight',
    runner: (state, node, markType) => {
      state.openMark(markType, { tone: node.tone || 'yellow' });
      state.next(node.children);
      state.closeMark(markType);
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'highlight',
    runner: (state, mark) => {
      state.withMark(mark, 'highlight', undefined, { tone: mark.attrs.tone });
    },
  },
}));

// Typing ==text== (or =={!!!}text==) turns it into a highlight.
const inputRule = $inputRule((ctx) =>
  markRule(/(?<![=\w])==(?:\{(!{1,3}|[a-z]+)\})?([^=\s](?:[^=]*[^=\s])?)==$/, highlightSchema.type(ctx), {
    getAttr: (m) => ({ tone: TONES.has(m[1]) ? m[1] : 'yellow' }),
  }),
);

const LAST = 'ocean.hlTone';
const lastTone = () => {
  try { return localStorage.getItem(LAST) || 'yellow'; } catch { return 'yellow'; }
};

/** Highlight the selection with a tone (or remove highlights with null). */
export function applyHighlight(view, tone) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  const type = state.schema.marks.highlight;
  if (empty || !type) return false;
  const tr = state.tr.removeMark(from, to, type);
  if (tone) {
    tr.addMark(from, to, type.create({ tone }));
    try { localStorage.setItem(LAST, tone); } catch { /* ignore */ }
  }
  view.dispatch(tr.scrollIntoView());
  return true;
}

/** The highlight tone under the selection, if any. */
export function currentTone(state) {
  const type = state.schema.marks.highlight;
  if (!type) return null;
  const { from, to, empty, $from } = state.selection;
  if (empty) return type.isInSet($from.marks())?.attrs.tone ?? null;
  let tone = null;
  state.doc.nodesBetween(from, to, (n) => {
    const m = type.isInSet(n.marks);
    if (m) tone ??= m.attrs.tone;
  });
  return tone;
}

// ⌘⇧H highlights with the last colour you used (or removes it).
const keys = $prose(() =>
  keymap({
    'Mod-Shift-h': (state, _dispatch, view) => applyHighlight(view, currentTone(state) ? null : lastTone()),
  }),
);

export const highlightPlugins = [remarkPlugin, highlightSchema, inputRule, keys].flat();

// ---------- the colour menu (opened from the selection toolbar) ----------
export const HIGHLIGHT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/></svg>';

let openMenu = null;
export function closeHighlightMenu() {
  openMenu?.remove();
  openMenu = null;
}

export function openHighlightMenu(view) {
  closeHighlightMenu();
  const { from, to } = view.state.selection;
  if (from === to) return;
  const current = currentTone(view.state);
  const menu = document.createElement('div');
  menu.className = 'hl-menu';
  menu.addEventListener('mousedown', (e) => e.preventDefault()); // keep the text selected

  const section = (title) => {
    const h = document.createElement('div');
    h.className = 'hl-menu-title';
    h.textContent = title;
    menu.append(h);
  };
  const item = (tone, label, hint) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hl-menu-item' + (current === tone ? ' on' : '');
    const sw = document.createElement('span');
    sw.className = 'hl-swatch' + (isExamTone(tone) ? ' hl-exam' : '');
    sw.dataset.tone = tone || 'none';
    sw.textContent = isExamTone(tone) ? tone : 'A';
    const name = document.createElement('span');
    name.className = 'hl-name';
    name.textContent = label;
    b.append(sw, name);
    if (hint) b.title = hint;
    if (current === tone) {
      const tick = document.createElement('span');
      tick.className = 'hl-tick';
      tick.textContent = '✓';
      b.append(tick);
    }
    b.addEventListener('click', () => {
      applyHighlight(view, tone);
      closeHighlightMenu();
      view.focus();
    });
    menu.append(b);
  };

  section('Exam importance');
  for (const e of EXAM) item(e.tone, e.label, e.hint);
  section('Highlight');
  for (const c of COLORS) item(c, c[0].toUpperCase() + c.slice(1), null);
  if (current) {
    const sep = document.createElement('div');
    sep.className = 'hl-menu-sep';
    menu.append(sep);
    item(null, 'Remove highlight', null);
  }

  document.body.append(menu);
  const a = view.coordsAtPos(from);
  const b = view.coordsAtPos(to);
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  let top = Math.max(a.bottom, b.bottom) + 8;
  if (top + h > innerHeight - 8) top = Math.max(8, Math.min(a.top, b.top) - h - 8);
  menu.style.top = top + 'px';
  menu.style.left = Math.max(8, Math.min(a.left, innerWidth - w - 8)) + 'px';
  openMenu = menu;

  const away = (e) => {
    if (menu.contains(e.target)) return;
    closeHighlightMenu();
    cleanup();
  };
  const esc = (e) => {
    if (e.key === 'Escape') {
      closeHighlightMenu();
      cleanup();
      view.focus();
    }
  };
  const cleanup = () => {
    removeEventListener('mousedown', away, true);
    removeEventListener('keydown', esc, true);
    removeEventListener('scroll', away, true);
  };
  setTimeout(() => {
    addEventListener('mousedown', away, true);
    addEventListener('keydown', esc, true);
    addEventListener('scroll', away, true);
  });
}
