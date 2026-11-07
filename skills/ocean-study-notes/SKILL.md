---
name: ocean-study-notes
description: Write and edit study notes in Ocean, a local notes app whose pages are Markdown files (default folder ~/Documents/Ocean). Use when the user shares lecture slides or a PDF and wants notes, asks to add quizzes or questions to a lecture, wants slides added to notes, wants an interactive explainer, or mentions Ocean, their notes folder, or moving their Notion study workflow. Needs file access (Filesystem extension or Claude Code).
---

# Ocean study notes

Ocean is the user's study notebook. Each page is a Markdown file; the Ocean app shows it like Notion and
**updates live when you change a file**. You work by reading and writing those files — there is no API.

## 1. Find the notes folder

1. Use your file tools (Filesystem extension / Claude Code). The folder is usually **`~/Documents/Ocean`**
   (`/Users/<name>/Documents/Ocean`). If you can't see it, ask the user to allow that folder in the Filesystem
   extension's settings (or to tell you where their Ocean folder is).
2. **Read `CLAUDE.md` in that folder first** — it is the full, authoritative guide (layout, slide links, quiz
   format, house style). If it's missing, use `reference.md` in this skill, which is the same guide.
3. List the folder to find the course page and existing lecture notes; open one recent `Week N …` note and copy
   its style.

If you have no file access at all, write the note as a Markdown answer the user can paste into a new Ocean page,
following the same format, and say that file access would let you save it directly.

## 2. The rules you must not get wrong

- Page = `Name.md`; its sub-pages, slides and files go in a folder `Name/` next to it. Title = file name; never
  put a `# Title` line at the top. Keep the `---` front matter (e.g. `icon: "icon:reference:gray"`).
- Links are relative to the file you edit; wrap paths with spaces in `<…>`:
  `![Slide 8](<Week 3 Word Embeddings/slides/p08.jpg>)`.
- Slides are `slides/pNN.jpg` (two digits) plus `slides/slides.md` (the text of each slide). They're created when
  the user **drops the lecture PDF onto the page in Ocean**. If they aren't there yet, still link slides by number
  and ask the user to drop the PDF on the page — the images appear automatically.
- When you create a sub-page, add a link line for it in the parent page: `[Title](<Parent/Title.md>)`.
- Quizzes: a ```` ```quiz ```` block at the end of every top-level section; 3–5 questions, 4 options, exactly one
  `- [x]`, and a `> explanation` line per question.
- Never delete files; move unwanted pages into `.trash/`.
- Each page can also have a **Short** (`Page.short.md`) and a **Recall** (`Page.recall.md`) version next to it — separate files, same link paths, no front matter. See `CLAUDE.md` §7.

## 3. Workflow: "here are my slides, make the notes"

1. Find or create the course page, then create `Course/Week N Title.md` (with an icon) and add its link line to
   the course page in week order.
2. Make sure the slides are imported (`Course/Week N Title/slides/slides.md` exists). If not, ask the user to drop
   the PDF onto that page in Ocean, or work from the PDF they gave you and link slides by number.
3. Read `slides.md`, then look at the slide images that hold diagrams, tables and worked examples.
4. Write the note in the house style (see `CLAUDE.md` §6): Overview → Quick reminder of last week → numbered
   sections with the right slide under each sub-section, a Key idea, and a quiz → Slide Errata → Exam-Focused
   Summary → Super Short Memory Sheet. Formulas in LaTeX, tables as Markdown, every worked-example step shown.
   Mark exam importance on key phrases: `=={!!!}must know==`, `=={!!}important==`, `=={!}good to know==` (`CLAUDE.md` §3b), sparingly.
5. Re-read the file you wrote: front matter intact, slide paths correct, one `[x]` per question.
6. Tell the user the page is ready in Ocean and summarise what's in it (sections, quizzes, anything you weren't
   sure about on the slides).

Other common asks: **add questions/quizzes** (only add quiz blocks, change nothing else), **add slides to an
existing note** (insert `![Slide N](…)` under the matching sub-sections), **visuals / interactive explainers** (free HTML in ```` ```visual ```` or ```` ```widget ```` blocks; see `CLAUDE.md` §5), **exam prep** (refresh the summary and memory
sheet), **mark what matters for the exam** (add `=={!!!}…==` / `=={!!}…==` / `=={!}…==` around key phrases only; change no other text), **short / recall versions** ("make the short read / recall sheet for Week 3" → write `Week 3 ….short.md` / `.recall.md` next to the page, from the detailed note, without changing it).
