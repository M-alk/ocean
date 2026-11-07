# Ocean notes folder — guide for AI assistants

You are working inside **Ocean**, a study notebook. Every page is a Markdown file in this folder; the Ocean
app shows it like Notion and **reloads instantly when you edit a file**. You don't need an API, MCP server or
special tool: read and write the files directly. (Claude Code, Codex, Cursor and the Claude desktop app with
the Filesystem extension all work.)

Read this whole file before your first edit.

## ✅ Every lecture note = 4 things (don't stop after the first)

When the student asks for notes on a lecture, you are **not done** until all four exist:

1. **The detailed note** — `Course/Week N Title.md` in the house style (§6), with slides (§2) and a quiz per section (§4).
2. **Exam-importance marks inside it** — `=={!!!}…==`, `=={!!}…==`, `=={!}…==` around the key phrases (§3b).
   Mark while you write, not as an afterthought.
3. **The Short read** — `Course/Week N Title.short.md` (§7).
4. **The Recall sheet** — `Course/Week N Title.recall.md` (§7).

Then, before you reply, run the checklist in §8 and tell the student which of the four you wrote. Skip one only if
the student says so ("just the detailed note").

---

## 1. Layout

```
Course.md                                   ← a page (the course hub)
Course/                                     ← that page's sub-pages and files
  Week 3 Word Embeddings.md                 ← a lecture note
  Week 3 Word Embeddings/
    slides/p01.jpg, p02.jpg …               ← one image per lecture slide (made by Ocean)
    slides/slides.md                        ← the text of every slide: "## Slide 8 — p08.jpg"
    slides/<lecture>.pdf                    ← the original file
    assets/                                 ← other images
    embeds/                                 ← interactive HTML files
```

- A page's sub-pages and files live in a folder with **exactly the same name** as the page (no `.md`), next to it.
- The page title **is the file name**. Never start the body with a `# Title` line.
- File names can't contain `: / \ * ? " < > | # ^ [ ]` — write "Week 3: Embeddings" as `Week 3 Embeddings.md`.
- Never delete anything. To remove a page, move its `.md` (and its folder) into `.trash/`.
- Ignore `.ocean/`, `.trash/`, `CLAUDE.md`, `AGENTS.md` when listing notes.

### Front matter

```yaml
---
icon: "icon:reference:gray"
---
```

`icon` is optional: an emoji (`"🧠"`) or an Ocean icon `"icon:<name>:<color>"`. Useful names: `reference`,
`graduate`, `book`, `library`, `code`, `brain`, `light-bulb`, `mathematics`, `microscope`, `science`,
`calculator`, `chart-line`, `checklist`, `calendar`, `pencil`, `dependency`, `following`, `immigration`.
Colors: gray (shows white in dark mode), lightgray, brown, yellow, orange, green, blue, purple, pink, red.
Keep any keys that are already there (e.g. `imported_from`).

### Sub-pages appear where they're linked

A parent page lists its sub-pages as **page links, one per line**, and the sidebar uses that order:

```md
[Week 3: Word Embeddings](<Natural Language Processing/Week 3 Word Embeddings.md>)
```

Links are **relative to the file you're editing**; put `<…>` around any path with spaces. When you create a
sub-page, also add its link line to the parent (where it belongs in the order).

---

## 2. Slides

A page's slides live in `<page folder>/slides/`: one image per slide, `pNN.jpg` (slide N = PDF page N, two
digits: `p04.jpg`, `p17.jpg`; three digits if the deck has 100+ slides), `slides.md` with each slide's text, and
the original PDF.

**Getting the slides in — do this yourself whenever you have the PDF as a file:**

1. **Copy the PDF into `<page folder>/slides/`** (create the folder), e.g.
   `Course/Week 3 Word Embeddings/slides/Lecture 5.pdf`. That's all: Ocean turns it into `pNN.jpg` +
   `slides.md` by itself as soon as the page is open (a bar shows the progress). No extra tools needed.
2. Or, if you can render PDF pages yourself (e.g. `pdftoppm -jpeg -r 110 lecture.pdf slides/p` → rename to
   `p01.jpg`, `p02.jpg`…), write the images and `slides.md` directly. Use exactly the `pNN.jpg` names.
3. Only if you can't save files (e.g. the PDF is just a chat attachment), ask the student to **drop the PDF onto
   the page** in Ocean.

Either way, write the note straight away and link slides by number: Ocean shows a small "Slide 8 · not added yet"
tag until the image exists, then the picture appears by itself — even while the page is open.

- **Read `slides/slides.md` first** for the text (or the PDF itself if it isn't imported yet), then **look at the
  slide images** you need (diagrams, tables, worked examples) — the text alone misses them.
- Never link images on other sites (Notion, Google) — they don't load in Ocean. Use the slide, or save the
  picture into `<page folder>/assets/`.
- Rename or move pages **inside Ocean**, which updates the slide links; renaming the folder in Finder breaks them.

Show a slide under the section it belongs to:

```md
![Slide 8](<Week 3 Word Embeddings/slides/p08.jpg>)
```

(path relative to the page file; alt text `Slide N`). To mention a slide without the picture:
`[Slide 19](<Week 3 Word Embeddings/slides/p19.jpg>)`. **Every section should reference at least one slide** —
Ocean's slide panel uses these to follow the student's reading.

---

## 3. Blocks (all plain Markdown)

| Want | Write |
|---|---|
| Table | GitHub table. Escape a literal pipe as `\|`; inside maths in a table write `\lvert V\rvert`, not `|V|` |
| Maths | inline `$p(w_2 \mid w_1)$`; display on its own lines: `$$` … `$$` (KaTeX) |
| Diagram | a ```` ```mermaid ```` code block |
| Callout | `> 💡 **Key idea:** …` |
| Code | fenced block with a language |
| Checklist | `- [ ] task` / `- [x] done` |
| Divider | `---` on its own line |
| Link to a page | `[Week 2](<../Week 2 N-gram Language Models.md>)` (relative) |
| Image you made | save it in `<page folder>/assets/`, link like a slide |
| Highlight | `==text==` (yellow) or `=={green}text==` — §3b |
| Exam importance | `=={!!!}must know==` · `=={!!}important==` · `=={!}good to know==` — §3b |
| Quiz | a ```` ```quiz ```` block — §4 |
| Diagram / interactive example in the note | a ```` ```visual ```` block (free HTML/SVG) — §5 |
| Interactive explainer beside a section | a ```` ```widget ```` block — §5 |
| Interactive HTML | file in `<page folder>/embeds/` + an ```` ```embed ```` block — §5b (fallback) |

Prefer real tables, maths and Mermaid over screenshots of them: they stay searchable and editable.

---

## 3b. Highlights and exam importance

Highlights are plain Markdown, so you can add and read them:

| Write | Shows as |
|---|---|
| `==text==` | yellow highlight (same as Obsidian) |
| `=={green}text==` | a colour: `yellow green blue purple pink red orange gray` |
| `=={!!!}text==` | **Must know** — will almost certainly be examined (red) |
| `=={!!}text==` | **Important** — likely to be asked (orange) |
| `=={!}text==` | **Good to know** — detail that earns extra marks (blue underline) |

The `!` levels are the **exam importance** marks. The student can show them, hide them, or switch on a focus
view that fades everything except the must-know (or must-know + important) points — so they're how the student
revises the night before. Use them well:

- **Be selective.** Roughly: a few `!!!` per big section, a few more `!!`, `!` only where useful. If everything
  is marked, nothing stands out.
- **Mark short phrases**, not paragraphs: the term being defined, the one sentence that states the key idea,
  what a formula means, the result of a worked example, a common trap. Readable on its own in focus view.
- Judge importance from the lecture: what the slides stress or repeat, definitions, formulas, "A vs B"
  comparisons, anything the lecturer says will be examined, and past-paper style questions.
- Put the marks around text, not around whole maths blocks; inline maths inside a mark is fine:
  `=={!!!}PPMI clips negative PMI to 0: $\max(\text{PMI}, 0)$==`.
- Don't mark headings, quizzes, image captions or the Recall version's tables (the Recall version is already
  the important part). The student's own colour highlights belong to them — don't remove or recolour them.

---

## 4. Quizzes (one after every top-level section)

````md
```quiz
title: Check yourself — Lexical semantics
Q: "coffee" and "cup" are best described as:
- [ ] Synonyms
- [ ] Similar
- [x] Related but not similar
- [ ] Antonyms
> Relatedness is not similarity: coffee/tea are similar, coffee/cup are only related.

Q: Next question…
- [x] The right answer
- [ ] A wrong answer
- [ ] Another wrong answer
- [ ] Another wrong answer
> One line on why.
```
````

Rules: put the block at the **end of each top-level section** (just before the next `# N.` heading or `---`).
3–5 questions, 4 options, **exactly one `- [x]`**, and a `>` explanation for every question. Ask only about
what that section says; mix recall, "why" and one small calculation where the topic has numbers; make wrong
options plausible (common confusions), not silly.

---

## 5. Visuals and interactive explainers — express the idea freely

Not every idea needs one, and they should **not all look the same**. For each idea, decide whether a picture or
something to play with would make it click, and if so **design whatever fits that idea**: a diagram with arrows,
a sentence of clickable word chips, a table you click cell by cell, a step-through of an algorithm, an animation,
a small game, sliders on a formula… Vary the form across the note. Skip it for definitions and plain lists.

Two places to put one:

**In the note** — a ```` ```visual ```` block, shown inline where it sits (diagrams, small interactive examples):

````md
```visual
<div class="chips"><span class="t">apricot</span> <span class="c">jam</span></div>
<style>
  .chips span { padding: 4px 10px; border-radius: 8px; background: var(--surface); }
  .chips .t { background: var(--text); color: #fff; }
  .chips .c { background: var(--blue-bg); color: var(--blue); }
</style>
<script>/* optional: make it interactive */</script>
```
````

**Beside its section** — a ```` ```widget ```` block with the same kind of HTML. The note shows a small "▶ Title"
chip and Ocean opens it in an **Interactive column only while the student reads that section** (matched to the
nearest `#`/`##` heading above it). Use this for bigger explainers the student works through while reading.
Name it with `<title>…</title>` (shown on the chip).

How to write the HTML:

- Plain HTML + inline `<style>` + inline `<script>` (no build step). It runs **sandboxed**: no access to the app,
  files or the page around it. Public CDN scripts are allowed but rarely needed.
- **Don't set a page background or a fixed font** — Ocean makes the frame transparent and gives you its look as
  CSS variables. Use them so it fits light and dark mode:
  - text: `--text`, `--text-2` (secondary), `--text-3` (faint); `--font`, `--mono`
  - surfaces: `--surface`, `--surface-2`, `--border`; `--accent`
  - colours: `--blue --green --orange --purple --red --yellow --pink --gray`, and soft backgrounds
    `--blue-bg --green-bg --orange-bg --purple-bg --red-bg --yellow-bg`
- Use the lecture's own examples and numbers, so it matches the slides. Double-check any maths it computes.
- Keep it focused on one idea; one caption line can say what to try ("Click any word…", "Drag the slider…").
- The frame grows to fit the content; avoid `height: 100vh`.

**Quick sliders** (optional shortcut): when all you need is sliders driving a formula, a ```` ```widget ```` can
use Ocean's short syntax instead of HTML — one component per line:

| Line | What it shows |
|---|---|
| `title: …` / `text: …` / `note: …` | heading / sentence (`**bold**`, `$maths$`) / small grey sentence |
| `slider name = default in min..max step s "label"` | a slider; `name` becomes a variable |
| `let name = expr` · `value "label" = expr [unit "…"]` | computed variable · live number |
| `formula: LaTeX with [[expr]]` | KaTeX with live values |
| `sequence name from expr next expr steps n` | a repeated update (e.g. gradient steps) |
| `plot x0..x1 [y y0..y1]` + indented `curve` / `points` / `vector` / `point` lines | a chart |
| `bars "title": a = expr; b = expr` · `check "question" = expr` | bars · type-in answer check |

Expressions: numbers, variables, `+ - * / ^ %`, comparisons, `a ? b : c`, `sqrt abs exp log ln log2 log10 sin cos
tan asin acos atan floor ceil round min max pow sigmoid clamp`, `pi`, `e`.

## 5b. HTML files (embeds)

For a big, separate HTML file (e.g. one exported from ChatGPT).

Save a self-contained file (inline CSS/JS, or scripts from a public CDN; support `prefers-color-scheme: dark`)
in `<page folder>/embeds/name.html`, then where it belongs:

````md
```embed
Week 3 Word Embeddings/embeds/gradient_descent.html
```
````

It runs sandboxed (no access to other files). Good uses: a slider that shows an effect (learning rate, k in
k-NN, temperature), a step-through of an algorithm, a mini-quiz with feedback.

**It must look like part of the note, not a separate page.** Ocean gives embedded HTML the note's transparent
background, font, text colour and heading sizes, so:

- Don't set a page background colour, a font family, a page `max-width`/padding, or text colours on `body`/`html`.
- Use `currentColor` and transparent backgrounds; for borders use `color-mix(in srgb, currentColor 15%, transparent)`.
- Colour only the widget itself (chart lines, dots, buttons), and check it reads in both light and dark mode.
- Keep headings to `h2`/`h3` (the note already has the title) and keep text short — the note carries the explanation.

---

## 6. How to write a lecture note (the house style)

Use the student's existing notes as the model (for example any `Week N …` page in a course folder). Structure:

```md
**Professor Name** (Lectures 5–6)

## Overview

One or two short paragraphs: the question this week answers and how the lecture builds the answer.

Topics covered:

- …

Reading: Book (year) Chapter N.

---

# 0. Quick Reminder: Week N−1        ← 3 bullets + "How this week connects" (link to last week's page)

---

# 1. First Big Topic

## 1.1 Sub-topic

![Slide 8](<Week 3 …/slides/p08.jpg>)

- Short bullets in plain English; **bold** the terms the exam uses
- Define every symbol the first time it appears

### Key idea            ← or "Main intuition": 1–3 sentences, the thing to remember

```quiz …```             ← quiz for section 1

---

# 2. Next Big Topic …

# Slide Errata          ← mistakes or confusing notation on the slides, with the fix
# Exam-Focused Summary  ← must-know definitions; comparisons (A vs B) as short pairs; formulas
# Super Short Memory Sheet  ← one line per topic, with the key numbers from worked examples
```

Writing rules:

- Follow the lecture's order and numbering; one `#` section per big topic, `##` per slide group.
- Explain like a good tutor: plain English first, then the formula; one short example per idea.
- **Worked examples:** show every step as a numbered list with the actual numbers; add a "My extra check" step
  with a second example you computed yourself. Double-check all arithmetic.
- Put **every slide that carries content** in the note (skip title/outline/thank-you slides).
- Write formulas in LaTeX (`$…$` / `$$…$$`), never as images or screenshots.
- Mark exam importance as you write (§3b): `=={!!!}…==` for must-know points, `=={!!}…==` and `=={!}…==` sparingly.
- If a slide is wrong or ambiguous, say so in the section ("Note on the slide") and list it under Slide Errata.
- No filler, no emojis in headings, no "In this lecture we will…".

---

## 7. Note versions: Detailed · Short · Recall

Each lecture page can have three versions. The student switches between them at the top right of the page;
each is **its own file**, so changing one never changes the others:

| Version | File | What it is |
|---|---|---|
| Detailed | `Week 3 Word Embeddings.md` | the full note (§6) |
| Short | `Week 3 Word Embeddings.short.md` | a 5-minute read of the same lecture |
| Recall | `Week 3 Word Embeddings.recall.md` | an exam-time sheet: what to remember and test |

The version files sit **next to** the detailed page, so slide and image links are written exactly the same way
(`![Slide 8](<Week 3 Word Embeddings/slides/p08.jpg>)`). Don't give them front matter (the title and icon come
from the detailed page) and don't start them with a `# Title`.

**Short** — about a quarter of the detailed note. Same section numbers and titles (`# 1. Lexical Semantics`),
3–6 tight bullets per section in plain English, the one slide that best captures each section, the key formula
if there is one, and the section's **Key idea** in one sentence. No worked-example steps, no quizzes, no errata.

**Recall** — one or two screens for exam time:
1. *Must-know definitions* — a two-column table (term | one-line meaning).
2. *Formulas* — LaTeX, each with one line on when to use it.
3. *Comparisons* — "A vs B" pairs (one line each).
4. *Numbers to remember* — results of the lecture's worked examples.
5. *Common traps* — mistakes students make, and slide errors.
6. *Test yourself* — one ```` ```quiz ```` block with 8–10 questions across the whole lecture.

Write versions **from the detailed note** (and the slides), and never edit the detailed note while doing it.

---

## 8. Workflows

**A. New lecture from slides** (all steps, in order):
1. Find (or create) the course page; create `Course/Week N Title.md` with an icon; add its link line to the course page.
2. Slides: if `Course/Week N Title/slides/slides.md` doesn't exist, copy the PDF into `Course/Week N Title/slides/` (§2).
3. Read the slide text and the key slide images.
4. Write the detailed note in the house style: slides under each section, a quiz per section, **exam-importance
   marks on the key phrases** (§3b), and finish with Errata / Exam summary / Memory sheet.
5. Write `Course/Week N Title.short.md` (Short read) and `Course/Week N Title.recall.md` (Recall sheet) from it (§7).
6. Run the checklist below, then tell the student what you wrote (all four parts).

**B. Add quizzes to an existing note.** Add one ```` ```quiz ```` block at the end of each top-level section that
doesn't have one. Don't change anything else.

**C. Add visuals / interactive explainers.** Find the few ideas that are hardest to get from text and, for
each, design the form that explains it best (§5): an inline ```` ```visual ```` or a ```` ```widget ```` beside the
section. Vary the forms; don't add them where plain text is enough.

**D. Exam prep.** Add or refresh "Exam-Focused Summary" and "Super Short Memory Sheet" at the end of the detailed note.

**E. Short and Recall versions.** Write `Page.short.md` and/or `Page.recall.md` next to the page (§7).

**F. Mark what matters for the exam.** Read the note (and its slides) and add exam-importance marks (§3b)
around the key phrases. Change no other text; keep the student's own highlights.

**Checklist before you reply** (re-open the files):
- [ ] Detailed note: front matter intact, no `# Title` at the top, a slide under every section, a quiz per section.
- [ ] Exam marks: the detailed note contains `=={!!!}` marks (a few per big section) and some `=={!!}` / `=={!}`.
- [ ] `….short.md` and `….recall.md` exist next to the note and follow §7.
- [ ] Every image path points at an existing file (or a slide number that will exist); no links to Notion/Google images.
- [ ] Every quiz has exactly one `[x]` per question.
