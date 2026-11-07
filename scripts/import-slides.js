#!/usr/bin/env node
// Turn a lecture PDF/PowerPoint into one image per slide, stored next to a page.
//
//   npm run slides -- <lecture.pdf|.pptx> "<page path inside the notes folder>.md"
//
// Result: "<page folder>/slides/p01.jpg, p02.jpg …" and "slides.md" with the text of every slide.
import fs from 'node:fs';
import path from 'node:path';
import { VAULT, importSlides } from '../server/vault.js';

const [src, page] = process.argv.slice(2);
if (!src || !page) {
  console.log('Usage: npm run slides -- <lecture.pdf|.pptx> "<Folder/Page.md>"');
  process.exit(1);
}
const rel = page.endsWith('.md') ? page : `${page}.md`;
if (!fs.existsSync(path.join(VAULT, rel))) {
  console.error(`No page at ${path.join(VAULT, rel)}`);
  process.exit(1);
}
const r = await importSlides(rel, path.resolve(src));
console.log(`✓ ${r.count} slides → ${r.folder}/ (images p01.jpg… and slides.md with the slide text)`);
