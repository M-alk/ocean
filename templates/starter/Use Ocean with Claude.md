---
icon: "icon:brain:gray"
---

Ocean has no AI inside it on purpose: your notes are files, so **the AI you already use edits them directly** and you watch the page change. Set it up once, then just send your slides.

> 💡 **The idea:** Claude needs (1) access to your notes folder and (2) Ocean's rules. The rules live in `CLAUDE.md` in your notes folder, and in the **Ocean study notes** skill.

## Option A — the Claude app (easiest)

1. **Give Claude your notes folder.** In the Claude desktop app, add the **Filesystem** connector and allow your Ocean notes folder (usually `~/Documents/Ocean`). In Ocean, ••• → *Use with AI* → *Copy file path* shows the exact path.
2. **Turn on files and skills.** Settings → Capabilities → switch on *Create and edit files* (skills need it).
3. **Add the Ocean skill.** Customize → Skills → **+** → *Upload a skill* → choose `ocean-study-notes.zip` (in your Downloads folder, or `release/` in the Ocean code folder).
4. Start a new chat and try:

```
Here are my slides for NLP Week 4 (attached). Make the Ocean note: new page under
Artificial intelligence / Final Year / Natural Language Processing, my usual style,
slides under each section and a quiz after every section.
```

## Option B — Claude Code (or Codex, Cursor)

Open a terminal in your notes folder and start the agent there:

```bash
cd ~/Documents/Ocean
claude
```

Claude Code reads `CLAUDE.md` automatically (Codex and Cursor read `AGENTS.md`). It can also import slides itself with Ocean's `npm run slides` command.

## The study loop

1. Make the lecture page in Ocean (or let Claude make it).
2. **Drop the lecture PDF onto the page.** Ocean turns it into slide images and saves the slide text for Claude.
3. Ask Claude for the note (prompt above). The page fills in live.
4. Study with **Slides** open beside the note; do each section's quiz; review the Exam summary.

## Prompts that work well

- *"Add a quiz after every section of Week 3 Word Embeddings. Don't change anything else."*
- *"Add the slides to my Week 2 note — put each slide under the section it belongs to."*
- *"Build an interactive explainer for cosine similarity and embed it in section 4 of Week 3."*
- *"Make an exam summary and memory sheet for Formal Verification weeks 1–3."*
- *"Check my Week 3 note against the slides and list anything I missed."*

## No file access?

Plain Claude chat (no Filesystem connector) can still help: ask it to *"write the note as Ocean Markdown"*, then paste the answer into a new page. You'll lose the automatic slide links unless the slides are already imported on that page.
