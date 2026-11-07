// Interactive multiple-choice quiz, written in a note as plain text:
//
// ```quiz
// title: Check yourself — Lexical semantics
// Q: Which pair is related but NOT similar?
// - [ ] coffee / tea
// - [x] coffee / cup
// - [ ] car / automobile
// > Coffee and cup are associated, but they don't share meaning.
//
// Q: …
// ```
//
// "- [x]" marks the right answer, "> …" is the explanation shown after checking.

export const QUIZ_TEMPLATE = [
  'title: Check yourself',
  'Q: Write the question here?',
  '- [ ] A wrong answer',
  '- [x] The right answer',
  '- [ ] Another wrong answer',
  '> Why the right answer is right.',
].join('\n');

export function parseQuiz(text) {
  let title = '';
  const questions = [];
  let q = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = /^title:\s*(.+)$/i.exec(line))) title = m[1];
    else if ((m = /^(?:Q\d*[:.)]|\d+[.)])\s*(.+)$/i.exec(line))) questions.push((q = { q: m[1], options: [], answer: -1, why: '' }));
    else if (q && (m = /^[-*+]\s*\[( |x|X)\]\s*(.+)$/.exec(line))) {
      if (m[1].toLowerCase() === 'x') q.answer = q.options.length;
      q.options.push(m[2]);
    } else if (q && (m = /^(?:>|why:)\s*(.*)$/i.exec(line))) q.why = (q.why ? q.why + ' ' : '') + m[1];
    else if (q && !q.options.length) q.q += ' ' + line;
  }
  return { title, questions: questions.filter((x) => x.options.length) };
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
// Allow **bold**, *italic* and `code` inside questions and options.
const rich = (node, text) => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  for (const p of parts) {
    if (/^\*\*.+\*\*$/.test(p)) node.append(el('strong', '', p.slice(2, -2)));
    else if (/^`.+`$/.test(p)) node.append(el('code', '', p.slice(1, -1)));
    else if (/^\*.+\*$/.test(p)) node.append(el('em', '', p.slice(1, -1)));
    else if (p) node.append(p);
  }
  return node;
};

let seq = 0;
// Answers survive the quiz being redrawn (the editor unloads blocks that scroll off screen).
const states = new Map();

/**
 * The editor sanitises previews by copying their HTML, which drops event handlers. So the preview is just a
 * placeholder carrying the quiz text, and hydrateQuizzes() swaps in the live quiz once it's on the page.
 */
export function quizPlaceholder(text) {
  const mount = el('div', 'quiz-mount', 'Loading quiz…');
  mount.setAttribute('data-quiz', text);
  return mount;
}
export function hydrateQuizzes(root) {
  for (const mount of root.querySelectorAll('.quiz-mount')) {
    const text = mount.getAttribute('data-quiz') || '';
    if (mount.dataset.live === text) continue;
    mount.dataset.live = text;
    mount.replaceChildren(renderQuiz(text));
  }
}

export function renderQuiz(text) {
  const { title, questions } = parseQuiz(text);
  const saved = states.get(text) || { answers: new Map(), checked: false, open: false };
  states.set(text, saved);
  const root = el('details', 'quiz');
  root.open = saved.open;
  root.addEventListener('toggle', () => { saved.open = root.open; });
  const summary = el('summary', 'quiz-summary');
  summary.append(el('span', 'quiz-badge', '✎ Quiz'), el('span', 'quiz-title', title || 'Check your understanding'), el('span', 'quiz-count', `${questions.length} question${questions.length === 1 ? '' : 's'}`));
  root.append(summary);
  if (!questions.length) {
    root.append(el('p', 'quiz-empty', 'No questions yet. Use the code view to write "Q:" lines with "- [ ]" / "- [x]" options.'));
    return root;
  }
  const id = ++seq;
  const answers = saved.answers;
  let checked = saved.checked;
  const body = el('div', 'quiz-body');
  const score = el('div', 'quiz-score');
  const check = el('button', 'quiz-btn', 'Check answers');
  const retry = el('button', 'quiz-btn secondary', 'Retry');

  const draw = () => {
    body.replaceChildren();
    questions.forEach((q, i) => {
      const sec = el('div', 'quiz-q');
      sec.append(rich(el('div', 'quiz-q-text', `${i + 1}. `), q.q));
      q.options.forEach((opt, j) => {
        const label = el('label', 'quiz-opt');
        const input = el('input');
        input.type = 'radio';
        input.name = `quiz-${id}-${i}`;
        input.checked = answers.get(i) === j;
        input.addEventListener('change', () => {
          answers.set(i, j);
          checked = saved.checked = false;
          draw();
        });
        if (checked && j === q.answer) label.classList.add('right');
        if (checked && answers.get(i) === j && j !== q.answer) label.classList.add('wrong');
        label.append(input, rich(el('span', '', `${String.fromCharCode(65 + j)}. `), opt));
        sec.append(label);
      });
      if (checked) {
        const ok = answers.get(i) === q.answer;
        const fb = el('p', 'quiz-feedback ' + (ok ? 'right' : 'wrong'), ok ? 'Correct. ' : `Not quite. Answer: ${String.fromCharCode(65 + q.answer)}. `);
        if (q.why) rich(fb, q.why);
        sec.append(fb);
      }
      body.append(sec);
    });
    check.disabled = answers.size !== questions.length;
    score.textContent = checked ? `Score: ${questions.filter((q, i) => answers.get(i) === q.answer).length} / ${questions.length}` : '';
  };
  check.addEventListener('click', () => {
    checked = saved.checked = true;
    draw();
  });
  retry.addEventListener('click', () => {
    answers.clear();
    checked = saved.checked = false;
    draw();
  });
  const actions = el('div', 'quiz-actions');
  actions.append(check, retry);
  root.append(body, score, actions);
  // Keep clicks inside the quiz from moving the editor's cursor.
  for (const ev of ['mousedown', 'pointerdown', 'keydown']) root.addEventListener(ev, (e) => e.stopPropagation());
  draw();
  return root;
}
