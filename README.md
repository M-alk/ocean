# Ocean

**The calm way to study.** Ocean is a Notion-style study notebook built on plain Markdown files (like Obsidian),
so any AI tool — Claude, ChatGPT, Codex, Cursor — can read your notes and write new ones. Your lecture slides sit
beside your notes, every section can end with a quiz, and a study heatmap keeps you honest.

Free and open source (MIT). Your notes stay on your computer.

## Get started

You need [Node.js](https://nodejs.org) 20 or newer (and a Mac for the desktop app).

```bash
git clone https://github.com/M-alk/ocean.git
cd ocean
npm install
npm run app          # opens the Ocean desktop app (macOS)
```

On Windows or Linux, run `npm run dev` and open http://127.0.0.1:5180 in your browser.

To let Claude write your notes, see **Use Ocean with Claude** in the app (it explains the Claude Code setup and the
uploadable skill in `skills/ocean-study-notes`).

## Features

- **Notion-style editor** on Markdown files: slash menu (`/`), `/p` for a sub-page, tables, maths (KaTeX),
  Mermaid diagrams, code, images, checklists. Sub-pages show as Notion page rows.
- **Your notes are files.** Pages are `.md` files; pages inside pages are folders. AI tools edit them directly and
  Ocean updates live. Rules for AI tools live in `CLAUDE.md` / `AGENTS.md` inside your notes folder.
- **Slides beside notes.** Drop a lecture PDF/PowerPoint on a page: one image per slide plus the slide text for
  your AI. The Slides panel follows the section you're reading; double-click for a full-size viewer
  (zoom, full screen, download). Turn slide images in the note on/off with **Images**.
- **Quizzes** (```` ```quiz ```` blocks) after each section — fold one, or hide them all.
- **Interactive explainers**: diagrams and small simulations inside the note, or beside the section you are
  reading; HTML from ChatGPT/Claude embeds too. All sandboxed.
- **Highlights and exam importance:** Notion-style colours, plus *must know / important / good to know* marks.
  The **Exam** button fades everything except what matters, for revision.
- **Three versions of each note:** Detailed, Short read and Recall (separate files).
- **Section by section** reading mode.
- **Home:** GitHub-style study heatmap, streaks, recently visited, favorites.
- **Graph view** like Obsidian: pages and links, filters, display and force settings.
- **Import from Notion** (HTML export), including databases, equations, checkboxes and page icons.
- Notion-style icons (Emoji / Icons / Upload), ⌘K search, lock page, duplicate, export as PDF.

## Desktop app (macOS)

```bash
npm install
npm run app          # build and open the desktop app
npm run app:build    # make release/Ocean-x.y.z.dmg
```

On first launch Ocean shows a short welcome guide and uses `~/Documents/Ocean` for notes. Change it any time with
**File → Choose Notes Folder…** (an existing Obsidian folder works as-is).

## Web version (any OS)

```bash
npm install
npm run dev                     # http://127.0.0.1:5180 — uses the desktop app's notes folder if set, else ./vault
VAULT=~/Notes npm run dev       # use another notes folder
```

## Import

```bash
npm run import:notion -- export.zip --into "My Course"
npm run slides -- lecture.pdf "My Course/Week 3.md"
```

Slide import needs Poppler (`brew install poppler`); PowerPoint files also need LibreOffice.

## How it's built

- `src/` — React app (editor: Milkdown Crepe; graph: d3-force)
- `server/` — notes API on 127.0.0.1 (file tree, pages, slides, search, activity, live updates)
- `electron/` — desktop shell; `templates/starter/` — the welcome notebook for new folders
- `scripts/` — Notion and slide importers

Security: the server only answers on 127.0.0.1, changes need a header other websites can't send, and embedded
HTML runs in a sandbox with no access to your files.

## Credits

Page icon shapes from [Notion Kit](https://github.com/steeeee0223/notion-kit) (MIT). Editor by
[Milkdown](https://milkdown.dev) (MIT). Ocean is not affiliated with Notion Labs or Obsidian.

## License

MIT © 2026 Mohammed Ali Alketbi
