#!/usr/bin/env node
// Import a Notion export (HTML or Markdown, .zip or unzipped folder) into the notes folder.
//
//   npm run import:notion -- <export.zip|folder> [--into "Folder/Sub page"]
//
// Each Notion page becomes "<Title>.md". Its sub-pages and images go in a folder "<Title>/" next to it:
//   Week 3 Word Embeddings.md
//   Week 3 Word Embeddings/slides/p04.jpg     (slide images named pNN)
//   Week 3 Word Embeddings/assets/diagram.png (any other image)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { VAULT, safeName, addPageLink } from '../server/vault.js';

const args = process.argv.slice(2);
const src = args.find((a) => !a.startsWith('--'));
const intoIdx = args.indexOf('--into');
const into = intoIdx >= 0 ? args[intoIdx + 1] : '';
if (!src) {
  console.log('Usage: npm run import:notion -- <export.zip|folder> [--into "Folder/Sub page"]');
  process.exit(1);
}

const NOTION_ID = /\s+[0-9a-f]{32}$/i;
const stripId = (name) => name.replace(NOTION_ID, '');
const SLIDE_IMG = /^p\d{1,3}\.(jpe?g|png|webp)$/i;
// Notion's built-in icons ("…/icons/graduate_gray.svg") map to the same icon in Ocean's set.
const ICON_IDS = new Set(JSON.parse(fs.readFileSync(new URL('../src/notion-icons.json', import.meta.url), 'utf8')).map((i) => i[0]));
const ICON_COLORS = new Set(['gray', 'lightgray', 'brown', 'yellow', 'orange', 'green', 'blue', 'purple', 'pink', 'red']);

const linkPath = (p) => (/[\s()<>]/.test(p) ? `<${p}>` : p);
const rel = (fromFile, toFile) => path.relative(path.dirname(fromFile), toFile).split(path.sep).join('/');

// ---------- unzip (Notion nests zips inside zips for big exports) ----------
function extract(zip, dir) {
  // ditto keeps non-ASCII names ("–", "’") intact; plain unzip on macOS mangles them.
  try {
    execFileSync('ditto', ['-x', '-k', zip, dir]);
  } catch {
    execFileSync('unzip', ['-oq', zip, '-d', dir]);
  }
}
async function unpack(input) {
  let dir = input;
  if (input.toLowerCase().endsWith('.zip')) {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'notion-import-'));
    extract(input, dir);
  }
  for (const f of await fsp.readdir(dir)) if (f.toLowerCase().endsWith('.zip')) extract(path.join(dir, f), dir);
  return dir;
}

async function* files(dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else yield p;
  }
}

// ---------- HTML → Markdown ----------
// Notion keeps the TeX source of equations in data-notion-equation (older exports: a MathML annotation).
const tex = (n) =>
  (n.getAttribute('data-notion-equation') || n.getAttribute('data-notion-inline-equation') || n.querySelector('annotation')?.textContent || '').trim();

function makeTurndown() {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', hr: '---', emDelimiter: '*' });
  td.use(gfm);
  // Same as the GFM table cell rule, but escapes "|" so text like |V| doesn't split the cell.
  td.addRule('tableCellSafe', {
    filter: ['th', 'td'],
    replacement: (content, node) => {
      const first = Array.prototype.indexOf.call(node.parentNode.childNodes, node) === 0;
      return (first ? '| ' : ' ') + content.replace(/\n+/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim() + ' |';
    },
  });
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentNode;
      let prefix = '- ';
      if (parent.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start') || 1);
        prefix = `${start + Array.prototype.filter.call(parent.childNodes, (n) => n.nodeName === 'LI').indexOf(node)}. `;
      } else if (parent.classList?.contains('to-do-list')) {
        prefix = node.querySelector('input[type=checkbox]')?.hasAttribute('checked') ? '- [x] ' : '- [ ] ';
      }
      const pad = ' '.repeat(Math.min(prefix.length, 4));
      content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, `\n${pad}`);
      return prefix + content.trimEnd() + (node.nextSibling ? '\n' : '');
    },
  });
  td.addRule('checkboxInput', { filter: (n) => n.nodeName === 'INPUT', replacement: () => '' });
  td.addRule('mathBlock', {
    filter: (n) => n.nodeName === 'FIGURE' && n.classList.contains('equation'),
    replacement: (_c, n) => `\n\n$$\n${tex(n)}\n$$\n\n`,
  });
  td.addRule('mathInline', {
    filter: (n) => n.nodeName === 'SPAN' && n.classList.contains('notion-text-equation-token'),
    replacement: (_c, n) => `$${tex(n)}$`,
  });
  td.addRule('callout', {
    filter: (n) => n.nodeName === 'FIGURE' && n.classList.contains('callout'),
    replacement: (content, n) => {
      const icon = n.querySelector('.icon')?.textContent?.trim() || '💡';
      const text = td.turndown(n.querySelector('div:last-child')?.innerHTML || content).trim();
      return '\n\n' + `${icon} ${text}`.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    },
  });
  td.addRule('linkToPage', {
    filter: (n) => n.nodeName === 'FIGURE' && n.classList.contains('link-to-page'),
    replacement: (_c, n) => {
      const a = n.querySelector('a');
      return a ? `\n\n[${a.textContent.trim()}](${linkPath(a.getAttribute('href'))})\n\n` : '';
    },
  });
  td.addRule('toggle', {
    filter: 'details',
    replacement: (_c, n) => {
      const summary = n.querySelector('summary');
      const head = summary ? td.turndown(summary.innerHTML).trim() : '';
      summary?.remove();
      return `\n\n**${head}**\n\n${td.turndown(n.innerHTML).trim()}\n\n`;
    },
  });
  td.addRule('image', {
    filter: 'img',
    replacement: (_c, n) => {
      const s = n.getAttribute('data-leaf-src') || n.getAttribute('src') || '';
      return s ? `![${n.getAttribute('alt') || ''}](${linkPath(s)})` : '';
    },
  });
  td.addRule('figure', {
    filter: (n) => n.nodeName === 'FIGURE' && n.classList.contains('image'),
    replacement: (_c, n) => {
      const img = n.querySelector('img');
      const s = img?.getAttribute('data-leaf-src') || '';
      const slide = /\/slides\/p(\d+)\.\w+$/.exec(s);
      const cap = n.querySelector('figcaption')?.textContent.trim() || img?.getAttribute('alt') || (slide ? `Slide ${Number(slide[1])}` : '');
      return s ? `\n\n![${cap}](${linkPath(s)})\n\n` : '';
    },
  });
  return td;
}

function readIcon(document, file, outMd, copies) {
  const box = document.querySelector('.page-header-icon');
  if (!box) return '';
  const text = box.querySelector('.icon')?.textContent?.trim();
  if (text) return text;
  const srcAttr = box.querySelector('img')?.getAttribute('src') || '';
  const m = /\/icons\/([a-z0-9-]+?)(?:_([a-z]+))?\.svg/i.exec(srcAttr);
  if (m && ICON_IDS.has(m[1])) return `icon:${m[1]}:${ICON_COLORS.has(m[2]) ? m[2] : 'gray'}`;
  if (srcAttr && !/^https?:/i.test(srcAttr)) {
    // A custom uploaded icon: keep it with the page.
    const from = path.join(path.dirname(file), decodeURIComponent(srcAttr));
    const name = path.basename(from);
    copies.push([from, path.join(outMd.slice(0, -3), 'assets', name)]);
    return `${path.basename(outMd, '.md')}/assets/${name}`;
  }
  return '';
}

async function convertHtml(file, outMd, srcToOut) {
  const html = await fsp.readFile(file, 'utf8');
  const { document } = parseHTML(html);
  const pageFolderName = path.basename(outMd, '.md');
  const copies = [];
  const icon = readIcon(document, file, outMd, copies);

  const body = document.querySelector('.page-body') || document.body;

  // Database row pages keep their fields in a header table; show them as a short list at the top.
  const props = [...document.querySelectorAll('table.properties tr')].map((tr) => {
    const k = tr.querySelector('th')?.textContent.trim();
    const v = [...(tr.querySelector('td')?.querySelectorAll('.selected-value') || [])].map((s) => s.textContent.trim()).join(', ') || tr.querySelector('td')?.textContent.trim();
    return k && v ? `- **${k}:** ${v}` : '';
  }).filter(Boolean);

  // Icons inside the content (database column icons, link icons) are decoration, not images.
  for (const img of [...body.querySelectorAll('img')]) if (img.closest('.icon') || img.classList.contains('icon')) img.remove();
  // Emoji icons inside page links ("🎓 Final Year"): Ocean shows the page's own icon, so drop the copy.
  for (const span of [...body.querySelectorAll('a .icon')]) span.remove();
  // Multi-select tags in database tables: "a, b".
  for (const cell of body.querySelectorAll('td')) {
    const tags = [...cell.querySelectorAll('.selected-value')];
    if (tags.length > 1) cell.textContent = tags.map((t) => t.textContent.trim()).join(', ');
  }

  // Notion writes every list item as its own <ul>/<ol>; merge neighbours back into one list.
  for (const sel of ['ul', 'ol']) {
    for (const list of [...body.querySelectorAll(sel)]) {
      let next = list.nextElementSibling;
      while (next && next.tagName === list.tagName && next.className === list.className) {
        list.append(...next.childNodes);
        const dead = next;
        next = next.nextElementSibling;
        dead.remove();
      }
    }
  }
  // Tables without a header row: promote the first row so they stay real Markdown tables.
  for (const table of body.querySelectorAll('table')) {
    if (!table.querySelector('th')) {
      const first = table.querySelector('tr');
      for (const td of first ? [...first.querySelectorAll('td')] : []) {
        const th = document.createElement('th');
        th.innerHTML = td.innerHTML;
        td.replaceWith(th);
      }
    }
  }
  // Notion wraps each image in a link to the same file; keep just the image.
  for (const a of [...body.querySelectorAll('a')]) if (a.querySelector('img')) a.replaceWith(...a.childNodes);
  // Images: copy next to the new page, slides into slides/, others into assets/.
  const seenSlides = new Set();
  for (const img of body.querySelectorAll('img')) {
    const raw = img.getAttribute('src') || '';
    if (/^(https?:|data:)/i.test(raw)) {
      img.setAttribute('data-leaf-src', raw);
      continue;
    }
    const from = path.join(path.dirname(file), decodeURIComponent(raw));
    const name = path.basename(from);
    const sub = SLIDE_IMG.test(name) ? 'slides' : 'assets';
    if (sub === 'slides') seenSlides.add(name.replace(/\.\w+$/, '').toLowerCase());
    copies.push([from, path.join(outMd.slice(0, -3), sub, name)]);
    img.setAttribute('data-leaf-src', `${pageFolderName}/${sub}/${name}`);
  }
  // "IMGMARK p08" placeholders (slide numbers someone meant to insert) → real slide image links.
  for (const p of body.querySelectorAll('p')) {
    const m = /^\s*IMGMARK\s+(p\d+)\s*$/i.exec(p.textContent);
    if (!m) continue;
    const id = m[1].toLowerCase();
    if (seenSlides.has(id)) {
      p.remove();
      continue;
    }
    const fig = document.createElement('figure');
    fig.className = 'image';
    fig.innerHTML = `<img data-leaf-src="${pageFolderName}/slides/${id}.jpg" alt="Slide ${Number(id.slice(1))}">`;
    p.replaceWith(fig);
  }
  // Links to other exported pages → links to the imported files.
  for (const a of body.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^(https?:|mailto:|#)/i.test(href)) continue;
    let target = null;
    try {
      target = srcToOut.get(path.resolve(path.dirname(file), decodeURIComponent(href.replace(/#.*$/, ''))));
    } catch { /* bad escape */ }
    // (Turndown adds <…> around paths with spaces itself.)
    if (target) a.setAttribute('href', rel(outMd, target));
    else if (/\.html$/i.test(href)) a.setAttribute('href', '#');
    else {
      // A file attachment (pdf, csv…): copy it into assets/.
      const from = path.join(path.dirname(file), decodeURIComponent(href));
      if (fs.existsSync(from) && fs.statSync(from).isFile()) {
        const name = path.basename(from);
        copies.push([from, path.join(outMd.slice(0, -3), 'assets', name)]);
        a.setAttribute('href', `${pageFolderName}/assets/${name}`);
      }
    }
  }

  let md = makeTurndown().turndown(body.innerHTML);
  if (props.length) md = props.join('\n') + '\n\n' + md;
  md = md
    .replace(/^(#{1,6} \d+)\\\./gm, '$1.') // "# 0\. Intro" -> "# 0. Intro"
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n';
  return { icon, md, copies };
}

// ---------- Markdown exports ----------
async function convertMd(file, outMd) {
  let md = await fsp.readFile(file, 'utf8');
  md = md.replace(/^#\s+.+\n+/, '');
  const pageFolderName = path.basename(outMd, '.md');
  const copies = [];
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (all, alt, href) => {
    if (/^https?:/i.test(href)) return all;
    const from = path.join(path.dirname(file), decodeURIComponent(href));
    const name = path.basename(from);
    const sub = SLIDE_IMG.test(name) ? 'slides' : 'assets';
    copies.push([from, path.join(outMd.slice(0, -3), sub, name)]);
    return `![${alt}](${linkPath(`${pageFolderName}/${sub}/${name}`)})`;
  });
  return { icon: '', md: md.trim() + '\n', copies };
}

// ---------- main ----------
const root = await unpack(path.resolve(src));
const pages = [];
for await (const f of files(root)) if (/\.(html|md)$/i.test(f) && !path.basename(f).startsWith('index.')) pages.push(f);
if (!pages.length) {
  console.error('No Notion pages (.html or .md) found in', src);
  process.exit(1);
}

const baseOut = path.join(VAULT, ...into.split('/').filter(Boolean).map(safeName));
// Make sure every parent in --into exists as a page, so it shows like Notion's nesting.
{
  let dir = VAULT;
  await fsp.mkdir(dir, { recursive: true });
  for (const part of into.split('/').filter(Boolean).map(safeName)) {
    const md = path.join(dir, part + '.md');
    if (!fs.existsSync(md)) await fsp.writeFile(md, '');
    dir = path.join(dir, part);
    await fsp.mkdir(dir, { recursive: true });
  }
}

// Notion cuts file names at ~50 characters; use each page's real title instead.
// A page "X <id>.html" keeps its children in a folder "X/" next to it.
const titleOf = (f) => {
  if (!f.endsWith('.html')) return (/^#\s+(.+)$/m.exec(fs.readFileSync(f, 'utf8'))?.[1] || '').trim();
  const h = fs.readFileSync(f, 'utf8');
  const t = /<title>([^<]*)<\/title>/i.exec(h)?.[1] || '';
  return parseHTML(`<p>${t}</p>`).document.querySelector('p').textContent.trim();
};
const keyOf = (f) => path.join(path.dirname(f), stripId(path.basename(f).replace(/\.(html|md)$/i, '')));
const nameOfKey = new Map();
const used = new Map(); // parent key -> names already taken there
for (const f of pages) {
  const parent = path.dirname(f);
  const taken = used.get(parent) || new Set();
  let name = safeName(titleOf(f) || stripId(path.basename(f).replace(/\.(html|md)$/i, '')));
  for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${safeName(titleOf(f))} ${i}`;
  taken.add(name.toLowerCase());
  used.set(parent, taken);
  nameOfKey.set(keyOf(f), name);
}
const mapDir = (dir) => {
  if (dir === root) return baseOut;
  const parent = mapDir(path.dirname(dir));
  return path.join(parent, nameOfKey.get(dir) || safeName(stripId(path.basename(dir))));
};
const srcToOut = new Map(pages.map((f) => [f, path.join(mapDir(path.dirname(f)), nameOfKey.get(keyOf(f)) + '.md')]));

let total = 0;
for (const [f, out] of srcToOut) {
  const conv = f.endsWith('.html') ? await convertHtml(f, out, srcToOut) : await convertMd(f, out);
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const fm = `---\n${conv.icon ? `icon: "${conv.icon}"\n` : ''}imported_from: notion\n---\n\n`;
  await fsp.writeFile(out, fm + conv.md);
  let copied = 0;
  for (const [from, to] of conv.copies) {
    if (!fs.existsSync(from)) continue;
    await fsp.mkdir(path.dirname(to), { recursive: true });
    await fsp.copyFile(from, to);
    copied++;
  }
  total++;
  const missing = (conv.md.match(/\/slides\/p\d+\.jpg/g) || []).filter((s) => !fs.existsSync(path.join(out.slice(0, -3), s.slice(s.indexOf('slides')))));
  console.log(`✓ ${path.relative(VAULT, out)}${copied ? `  (${copied} file${copied === 1 ? '' : 's'})` : ''}${missing.length ? `  [${missing.length} slide images waiting for the lecture PDF]` : ''}`);
}
// Like Notion, the page you imported into links to the new top-level pages.
if (into) {
  const parentRel = path.relative(VAULT, baseOut + '.md').split(path.sep).join('/');
  for (const out of srcToOut.values()) {
    if (path.dirname(out) === baseOut) await addPageLink(parentRel, path.relative(VAULT, out).split(path.sep).join('/'));
  }
}
console.log(`\nImported ${total} pages into ${path.relative(process.cwd(), baseOut) || baseOut}`);
