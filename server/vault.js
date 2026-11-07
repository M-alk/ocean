// Everything the app knows about notes lives in a plain folder of Markdown files.
// This module is the only place that touches that folder.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

// Notes folder: $VAULT, else the folder the desktop app uses (so the app and `npm run dev` share one set of
// notes), else ./vault next to the code.
function desktopVault() {
  const cfg = path.join(os.homedir(), 'Library', 'Application Support', 'Ocean', 'config.json');
  try {
    const v = JSON.parse(fs.readFileSync(cfg, 'utf8')).vault;
    return v && fs.existsSync(v) ? v : null;
  } catch {
    return null;
  }
}
export const VAULT = path.resolve(process.env.VAULT || desktopVault() || path.join(process.cwd(), 'vault'));

// Folders that hold files for a page rather than sub-pages. Hidden in the sidebar.
export const MEDIA_DIRS = new Set(['assets', 'slides', 'attachments', 'embeds']);
// Files at the vault root meant for AI tools, not for reading as notes.
const HIDDEN_ROOT_FILES = new Set(['CLAUDE.md', 'AGENTS.md']);

/** Resolve a vault-relative path and refuse anything that escapes the vault. */
export function abs(rel = '') {
  const p = path.resolve(VAULT, rel.replace(/^\/+/, ''));
  if (p !== VAULT && !p.startsWith(VAULT + path.sep)) throw httpError(400, 'Path outside vault');
  return p;
}
export const relOf = (p) => path.relative(VAULT, p).split(path.sep).join('/');

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// ---------- front matter (only the bits we use: icon) ----------

export function splitFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { fm: '', body: text };
  return { fm: m[1], body: text.slice(m[0].length).replace(/^\r?\n/, '') };
}
export function readIcon(fm) {
  const m = /^icon:\s*["']?(.+?)["']?\s*$/m.exec(fm);
  return m ? m[1] : '';
}
function setIcon(fm, icon) {
  const line = icon ? `icon: "${icon}"` : '';
  if (/^icon:.*$/m.test(fm)) fm = fm.replace(/^icon:.*$/m, line);
  else if (line) fm = fm ? `${line}\n${fm}` : line;
  return fm.split('\n').filter((l, i, a) => l.trim() || i < a.length - 1).join('\n').trim();
}
const joinFrontmatter = (fm, body) => (fm ? `---\n${fm}\n---\n\n${body}` : body);

// ---------- names ----------

/** Turn a page title into a safe file name (same rules as Obsidian). */
export function safeName(title) {
  return (title || 'Untitled').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';
}
function uniquePath(dir, base, ext) {
  let p = path.join(dir, base + ext);
  for (let i = 2; fs.existsSync(p); i++) p = path.join(dir, `${base} ${i}${ext}`);
  return p;
}
/** Folder that holds a page's sub-pages, slides and assets: "A/B.md" -> "A/B". */
export const pageDir = (rel) => rel.replace(/(\.(short|recall))?\.md$/i, '');

// ---------- note versions: "Page.md" (detailed) + "Page.short.md" + "Page.recall.md" ----------
// Separate files next to the page, so each version's text is independent. Hidden from the sidebar.
export const VERSIONS = ['short', 'recall'];
export const VERSION_FILE = /\.(short|recall)\.md$/i;
/** Existing version files of a page (absolute paths), as [suffix, path]. */
function versionsOf(fileAbs) {
  const base = fileAbs.replace(/\.md$/i, '');
  return VERSIONS.map((v) => [v, `${base}.${v}.md`]).filter(([, f]) => fs.existsSync(f));
}

// ---------- tree ----------

async function iconOf(file) {
  try {
    const fh = await fsp.open(file);
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(400), 0, 400, 0);
    await fh.close();
    return readIcon(splitFrontmatter(buffer.subarray(0, bytesRead).toString('utf8')).fm);
  } catch {
    return '';
  }
}

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

// ---------- order (Notion-style: a page's sub-pages follow the order of its page links) ----------
const LINK_RE = /\]\(\s*(<[^>\n]+>|[^\s)]+)\s*\)/g;
const LINE_LINK_RE = /^\s*\[[^\]]*\]\(\s*(<[^>\n]+>|[^\s)]+)\s*\)\s*$/;
/** Resolve a link written in fileAbs to an absolute path (or null for web links / anchors). */
function resolveHref(fileAbs, href) {
  let h = href.replace(/^<|>$/g, '').replace(/#.*$/, '');
  if (!h || /^[a-z][a-z0-9+.-]*:/i.test(h)) return null;
  try { h = decodeURIComponent(h); } catch { /* keep */ }
  return path.resolve(path.dirname(fileAbs), h);
}
const hrefFor = (fromFile, toAbs) => {
  const r = path.relative(path.dirname(fromFile), toAbs).split(path.sep).join('/');
  return /[\s()<>]/.test(r) ? `<${r}>` : r;
};
const orderFile = () => abs('.ocean/order.json');
function readOrder() {
  try { return JSON.parse(fs.readFileSync(orderFile(), 'utf8')); } catch { return {}; }
}
function writeOrder(o) {
  fs.mkdirSync(path.dirname(orderFile()), { recursive: true });
  fs.writeFileSync(orderFile(), JSON.stringify(o, null, 2));
}
const defaultSort = (a, b) => (a.type === b.type ? byName(a, b) : a.type === 'folder' ? -1 : 1);
/** Sort nodes by a list of ranks (absolute paths or names), then folders first, then A–Z. */
function sortByRank(nodes, rankOf) {
  return nodes.sort((a, b) => {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra !== rb) return (ra < 0 ? Infinity : ra) - (rb < 0 ? Infinity : rb);
    return defaultSort(a, b);
  });
}

async function walk(dir, isRoot, parentPage = null) {
  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names = new Set(entries.map((e) => e.name));
  const nodes = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      if (VERSION_FILE.test(e.name)) continue; // a page's short/recall version, not a page of its own
      if (isRoot && HIDDEN_ROOT_FILES.has(e.name)) continue;
      const base = e.name.slice(0, -3);
      const childDir = path.join(dir, base);
      nodes.push({
        type: 'page',
        name: base,
        path: relOf(full),
        icon: await iconOf(full),
        children: names.has(base) ? await walk(childDir, false, full) : [],
      });
    } else if (e.isDirectory()) {
      if (MEDIA_DIRS.has(e.name.toLowerCase())) continue;
      if (names.has(e.name + '.md')) continue; // already shown as that page's children
      nodes.push({ type: 'folder', name: e.name, path: relOf(full), icon: '', children: await walk(full, false) });
    }
  }
  if (parentPage) {
    // Order of the page links in the parent page.
    const text = await fsp.readFile(parentPage, 'utf8').catch(() => '');
    const order = [];
    for (const m of text.matchAll(LINK_RE)) {
      const t = resolveHref(parentPage, m[1]);
      if (t && !order.includes(t)) order.push(t);
    }
    return sortByRank(nodes, (n) => order.indexOf(abs(n.path)));
  }
  const saved = readOrder()[relOf(dir)] || [];
  return sortByRank(nodes, (n) => saved.indexOf(path.basename(n.path)));
}
export const tree = () => walk(VAULT, true);

// ---------- pages ----------

export async function readPage(rel) {
  const file = abs(rel);
  const text = await fsp.readFile(file, 'utf8').catch(() => {
    throw httpError(404, 'Page not found');
  });
  const { fm, body } = splitFrontmatter(text);
  const stat = await fsp.stat(file);
  return { path: rel, title: path.basename(rel, '.md'), icon: readIcon(fm), body, mtime: stat.mtimeMs };
}

export async function writePage(rel, { body, icon }) {
  const file = abs(rel);
  let fm = '';
  let oldBody = '';
  if (fs.existsSync(file)) ({ fm, body: oldBody } = splitFrontmatter(await fsp.readFile(file, 'utf8')));
  if (icon !== undefined) fm = setIcon(fm, icon);
  const text = joinFrontmatter(fm, body ?? oldBody);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text);
  return text;
}

/** parent: '' (vault root), a page "A/B.md" (new page goes in "A/B/") or a folder "A/C". */
export async function createPage(parent, title, icon = '', linkInParent = false) {
  const dir = abs(parent ? pageDir(parent) : '');
  await fsp.mkdir(dir, { recursive: true });
  const file = uniquePath(dir, safeName(title), '.md');
  await fsp.writeFile(file, icon ? joinFrontmatter(`icon: "${icon}"`, '') : '');
  // Like Notion, a new sub-page also appears as a link at the end of its parent page.
  if (linkInParent && parent.endsWith('.md') && fs.existsSync(abs(parent))) await addPageLink(parent, relOf(file));
  return relOf(file);
}

/** Append "[Child](<Parent/Child.md>)" to a parent page, unless it already links there. */
export async function addPageLink(parentRel, childRel) {
  const parentFile = abs(parentRel);
  const href = path.relative(path.dirname(parentFile), abs(childRel)).split(path.sep).join('/');
  const text = await fsp.readFile(parentFile, 'utf8');
  if (text.includes(`${href})`) || text.includes(`${href}>)`) || text.includes(encodeLinkPath(href))) return;
  const link = `[${path.basename(childRel, '.md')}](${/[\s()<>]/.test(href) ? `<${href}>` : href})`;
  const trimmed = text.replace(/\s*$/, '');
  await fsp.writeFile(parentFile, (trimmed ? trimmed + '\n\n' : '') + link + '\n');
}

export async function createFolder(parent, name) {
  const dir = uniquePath(abs(parent ? pageDir(parent) : ''), safeName(name), '');
  await fsp.mkdir(dir, { recursive: true });
  return relOf(dir);
}

const encodeLinkPath = (p) => p.split('/').map(encodeURIComponent).join('/');

/** Rename a page (and its folder). Rewrites the page's own links into its folder. */
export async function renamePage(rel, title) {
  const file = abs(rel);
  const oldBase = path.basename(rel, '.md');
  const newBase = safeName(title);
  if (newBase === oldBase) return rel;
  const target = uniquePath(path.dirname(file), newBase, '.md');
  const finalBase = path.basename(target, '.md');
  const oldDir = file.slice(0, -3);
  if (fs.existsSync(oldDir)) await fsp.rename(oldDir, path.join(path.dirname(file), finalBase));
  let text = await fsp.readFile(file, 'utf8');
  for (const [from, to] of [
    [`(<${oldBase}/`, `(<${finalBase}/`],
    [`(${encodeLinkPath(oldBase)}/`, `(${encodeLinkPath(finalBase)}/`],
    [`(${oldBase}/`, `(${finalBase}/`],
  ]) text = text.split(from).join(to);
  await fsp.writeFile(target, text);
  await fsp.unlink(file);
  // The short/recall versions follow the page (their links point into the same folder).
  for (const [v, vf] of versionsOf(file)) {
    let vt = await fsp.readFile(vf, 'utf8');
    for (const [from, to] of [
      [`(<${oldBase}/`, `(<${finalBase}/`],
      [`(${encodeLinkPath(oldBase)}/`, `(${encodeLinkPath(finalBase)}/`],
      [`(${oldBase}/`, `(${finalBase}/`],
    ]) vt = vt.split(from).join(to);
    await fsp.writeFile(target.replace(/\.md$/, `.${v}.md`), vt);
    await fsp.unlink(vf);
  }
  await relinkPages(file, target);
  return relOf(target);
}

async function* mdFiles(dir) {
  for (const e of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* mdFiles(p);
    else if (e.name.endsWith('.md')) yield p;
  }
}

/** After a page moves from `from` to `to`, fix links to it in every other page (like Obsidian does). */
async function relinkPages(from, to) {
  const oldTitle = path.basename(from, '.md');
  const newTitle = path.basename(to, '.md');
  for await (const f of mdFiles(VAULT)) {
    if (f === to) continue;
    const relOld = path.relative(path.dirname(f), from).split(path.sep).join('/');
    const relNew = path.relative(path.dirname(f), to).split(path.sep).join('/');
    let text = await fsp.readFile(f, 'utf8');
    const before = text;
    for (const [a, b] of [
      [`(<${relOld}>)`, `(<${relNew}>)`],
      [`(${encodeLinkPath(relOld)})`, `(${encodeLinkPath(relNew)})`],
      [`(${relOld})`, `(${relNew})`],
    ]) {
      // Also update a link label that is just the old title (e.g. "[📄 Untitled](...)").
      text = text.split(`[📄 ${oldTitle}]${a}`).join(`[📄 ${newTitle}]${b}`).split(`[${oldTitle}]${a}`).join(`[${newTitle}]${b}`).split(a).join(b);
    }
    if (text !== before) await fsp.writeFile(f, text);
  }
}

/** Copy a page (and its folder of sub-pages, slides, files) next to itself as "<Title> copy". */
export async function duplicatePage(rel) {
  const file = abs(rel);
  const base = path.basename(rel, '.md');
  const target = uniquePath(path.dirname(file), `${base} copy`, '.md');
  const newBase = path.basename(target, '.md');
  const dir = file.slice(0, -3);
  if (fs.existsSync(dir)) await fsp.cp(dir, target.slice(0, -3), { recursive: true });
  let text = await fsp.readFile(file, 'utf8');
  for (const [from, to] of [
    [`(<${base}/`, `(<${newBase}/`],
    [`(${encodeLinkPath(base)}/`, `(${encodeLinkPath(newBase)}/`],
    [`(${base}/`, `(${newBase}/`],
  ]) text = text.split(from).join(to);
  // Embed blocks reference files by path on their own line.
  text = text.replace(/^(```embed\n)(.*)$/gm, (m, a, p) => a + (p.startsWith(base + '/') ? newBase + p.slice(base.length) : p));
  await fsp.writeFile(target, text);
  for (const [v, vf] of versionsOf(file)) {
    let vt = await fsp.readFile(vf, 'utf8');
    for (const [from, to] of [[`(<${base}/`, `(<${newBase}/`], [`(${encodeLinkPath(base)}/`, `(${encodeLinkPath(newBase)}/`], [`(${base}/`, `(${newBase}/`]]) vt = vt.split(from).join(to);
    await fsp.writeFile(target.replace(/\.md$/, `.${v}.md`), vt);
  }
  return relOf(target);
}

/** Never hard-delete: move into .trash/ inside the vault. */
export async function trashPage(rel) {
  const file = abs(rel);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const trash = abs(`.trash/${stamp}`);
  await fsp.mkdir(trash, { recursive: true });
  const dir = rel.endsWith('.md') ? file.slice(0, -3) : null;
  for (const [, vf] of versionsOf(file)) await fsp.rename(vf, path.join(trash, path.basename(vf)));
  await fsp.rename(file, path.join(trash, path.basename(file)));
  if (dir && fs.existsSync(dir)) await fsp.rename(dir, path.join(trash, path.basename(dir)));
}

// ---------- files next to a page ----------

/**
 * Save an uploaded file next to a page and return its link, relative to the page.
 * Images go in "<page folder>/assets/", interactive HTML in "<page folder>/embeds/".
 */
export async function saveAsset(pageRel, filename, buf) {
  const isHtml = /\.html?$/i.test(filename);
  const dir = abs(`${pageDir(pageRel)}/${isHtml ? 'embeds' : 'assets'}`);
  await fsp.mkdir(dir, { recursive: true });
  const ext = path.extname(filename) || '.png';
  const base = safeName(path.basename(filename, ext)).replace(/\s+/g, '-') || 'image';
  const file = uniquePath(dir, base, ext.toLowerCase());
  await fsp.writeFile(file, buf);
  return `${path.basename(pageDir(pageRel))}/${path.basename(dir)}/${path.basename(file)}`;
}

/** The slide images stored for a page, in order, plus the original lecture file if we kept it. */
export async function listSlides(pageRel) {
  const dir = abs(`${pageDir(pageRel)}/slides`);
  const files = await fsp.readdir(dir).catch(() => []);
  const items = files
    .filter((f) => /^p\d+\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => ({ n: Number(/\d+/.exec(f)[0]), file: f, path: relOf(path.join(dir, f)) }))
    .sort((a, b) => a.n - b.n);
  const original = files.find((f) => /\.(pdf|pptx?|key|odp)$/i.test(f));
  return { items, source: original ? { name: original, path: relOf(path.join(dir, original)) } : null };
}

/**
 * Turn a PDF or PowerPoint into one image per slide:
 *   "<page folder>/slides/p01.jpg, p02.jpg ..." plus "slides.md" with each slide's text,
 * so an AI can read the text and point at the right picture.
 */
export async function importSlides(pageRel, srcFile, originalName = path.basename(srcFile)) {
  const outDir = abs(`${pageDir(pageRel)}/slides`);
  await fsp.mkdir(outDir, { recursive: true });
  // Keep the original lecture file next to the slide images (for the viewer's download button).
  for (const f of await fsp.readdir(outDir)) if (/\.(pdf|pptx?|key|odp)$/i.test(f)) await fsp.rm(path.join(outDir, f));
  const ext = path.extname(originalName) || '.pdf';
  await fsp.copyFile(srcFile, path.join(outDir, safeName(path.basename(originalName, ext)) + ext.toLowerCase()));
  let pdf = srcFile;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ocean-slides-'));
  try {
    if (/\.(pptx?|key|odp)$/i.test(srcFile)) {
      await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', tmp, srcFile], { timeout: 180000 });
      pdf = path.join(tmp, path.basename(srcFile).replace(/\.[^.]+$/, '.pdf'));
    }
    await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=85', '-r', '110', pdf, path.join(tmp, 'p')], { timeout: 300000 });
    const imgs = (await fsp.readdir(tmp)).filter((f) => /^p-\d+\.jpg$/.test(f));
    const count = imgs.length;
    const pad = Math.max(2, String(count).length);
    for (const f of imgs) {
      const n = Number(/(\d+)/.exec(f)[1]);
      await fsp.copyFile(path.join(tmp, f), path.join(outDir, `p${String(n).padStart(pad, '0')}.jpg`));
    }
    const lines = [`# Slides: ${originalName}`, '', `${count} slides. Image for slide N: \`slides/pNN.jpg\`.`, ''];
    try {
      const { stdout } = await run('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 50 * 1024 * 1024 });
      stdout.split('\f').slice(0, count).forEach((t, i) => {
        lines.push(`## Slide ${i + 1} — p${String(i + 1).padStart(pad, '0')}.jpg`, '', t.replace(/[ \t]+$/gm, '').trim() || '(no text)', '');
      });
    } catch {
      /* no text layer; images still work */
    }
    await fsp.writeFile(path.join(outDir, 'slides.md'), lines.join('\n'));
    return { count, folder: relOf(outDir) };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true });
  }
}

// ---------- search ----------

export async function search(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const out = [];
  async function visit(nodes) {
    for (const n of nodes) {
      if (n.type === 'page') {
        const text = await fsp.readFile(abs(n.path), 'utf8').catch(() => '');
        const body = splitFrontmatter(text).body;
        const inTitle = n.name.toLowerCase().includes(needle);
        const i = body.toLowerCase().indexOf(needle);
        if (inTitle || i >= 0) {
          const snippet = i >= 0 ? body.slice(Math.max(0, i - 60), i + 100).replace(/\s+/g, ' ') : '';
          out.push({ path: n.path, name: n.name, icon: n.icon, snippet, score: inTitle ? 2 : 1 });
        }
      }
      await visit(n.children);
    }
  }
  await visit(await tree());
  return out.sort((a, b) => b.score - a.score).slice(0, 30);
}

// ---------- study activity (for the Home heatmap) ----------
// Stored inside the notes folder so it travels with your notes: .ocean/activity.json
//   { "2026-11-07": { "minutes": 42, "edits": 17, "pages": { "Course/Week 3.md": 30 } } }
const activityFile = () => abs('.ocean/activity.json');
export async function readActivity() {
  try {
    return JSON.parse(await fsp.readFile(activityFile(), 'utf8'));
  } catch {
    return {};
  }
}
let activityQueue = Promise.resolve();
export function addActivity({ day, minutes = 0, edits = 0, page = '' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw httpError(400, 'Bad day');
  // Serialise writes so two quick updates don't overwrite each other.
  activityQueue = activityQueue.then(async () => {
    const data = await readActivity();
    const d = (data[day] ||= { minutes: 0, edits: 0, pages: {} });
    d.minutes += Math.max(0, Math.min(5, Number(minutes) || 0));
    d.edits += Math.max(0, Math.min(5, Number(edits) || 0));
    if (page && minutes) d.pages[page] = (d.pages[page] || 0) + Number(minutes);
    await fsp.mkdir(path.dirname(activityFile()), { recursive: true });
    await fsp.writeFile(activityFile(), JSON.stringify(data));
  });
  return activityQueue;
}

// ---------- graph (pages + links between them) ----------
export async function graph() {
  const nodes = [];
  const edges = [];
  const add = async (list, parent) => {
    for (const n of list) {
      if (n.type === 'page') {
        nodes.push({ id: n.path, name: n.name, icon: n.icon });
        if (parent) edges.push({ source: parent, target: n.path, kind: 'child' });
        await add(n.children, n.path);
      } else await add(n.children, parent);
    }
  };
  await add(await tree(), null);
  const ids = new Set(nodes.map((n) => n.id));
  const linkRe = /\]\(\s*(<[^>\n]+>|[^\s)]+)/g;
  for (const n of nodes) {
    const text = await fsp.readFile(abs(n.id), 'utf8').catch(() => '');
    const seen = new Set();
    for (const m of text.matchAll(linkRe)) {
      let href = m[1].replace(/^<|>$/g, '').replace(/#.*$/, '');
      if (!/\.md$/i.test(href) || /^[a-z]+:/i.test(href)) continue;
      try { href = decodeURIComponent(href); } catch { /* keep */ }
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(n.id), href));
      if (ids.has(target) && target !== n.id && !seen.has(target)) {
        seen.add(target);
        edges.push({ source: n.id, target, kind: 'link' });
      }
    }
  }
  return { nodes, edges };
}

// ---------- first run ----------
/** Create the notes folder, and give an empty one a welcome page and the AI guide. */
export function ensureVault() {
  fs.mkdirSync(VAULT, { recursive: true });
  const hasNotes = fs.readdirSync(VAULT).some((f) => f.endsWith('.md') || (!f.startsWith('.') && fs.statSync(path.join(VAULT, f)).isDirectory()));
  if (hasNotes) return false;
  const starter = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'starter');
  for (const f of fs.existsSync(starter) ? fs.readdirSync(starter) : []) {
    const to = path.join(VAULT, f);
    if (!fs.existsSync(to)) fs.copyFileSync(path.join(starter, f), to);
  }
  return true;
}


// ---------- moving and reordering pages (sidebar drag & drop) ----------
async function listMd(dir) {
  const out = [];
  for await (const f of mdFiles(dir)) out.push(f);
  return out;
}

/** Rewrite relative links in a moved file so they still point at the same (possibly also moved) targets. */
async function rebaseLinks(newFile, oldFile, mapPath) {
  let text = await fsp.readFile(newFile, 'utf8');
  const before = text;
  text = text.replace(LINK_RE, (all, href) => {
    const target = resolveHref(oldFile, href);
    if (!target) return all;
    const next = hrefFor(newFile, mapPath(target));
    return next === href || next.replace(/^<|>$/g, '') === href.replace(/^<|>$/g, '') ? all : `](${next})`;
  });
  // Embed blocks hold a path on the line after ```embed
  text = text.replace(/(^```embed\n)([^\n]+)/gm, (all, head, p) => {
    const target = resolveHref(oldFile, p.trim());
    return target ? head + hrefFor(newFile, mapPath(target)).replace(/^<|>$/g, '') : all;
  });
  if (text !== before) await fsp.writeFile(newFile, text);
}

/** Lines in a parent page that are only a link to one of its direct sub-pages. */
function childLinkSlots(parentPage, lines) {
  const childDir = parentPage.slice(0, -3);
  const slots = [];
  lines.forEach((l, i) => {
    const m = LINE_LINK_RE.exec(l);
    const t = m && resolveHref(parentPage, m[1]);
    if (t && path.dirname(t) === childDir && t.endsWith('.md')) slots.push({ i, t });
  });
  return slots;
}

async function removeChildLink(parentPage, childAbs) {
  const text = await fsp.readFile(parentPage, 'utf8').catch(() => null);
  if (text == null) return;
  const lines = text.split('\n');
  const kept = lines.filter((l) => {
    const m = LINE_LINK_RE.exec(l);
    return !(m && resolveHref(parentPage, m[1]) === childAbs);
  });
  if (kept.length !== lines.length) await fsp.writeFile(parentPage, kept.join('\n').replace(/\n{3,}/g, '\n\n'));
}

/** Put a sub-page's link line at the right place among the parent's sub-page links (adding it if missing). */
async function orderChildLink(parentPage, childAbs, beforeAbs) {
  const text = await fsp.readFile(parentPage, 'utf8');
  const lines = text.replace(/\s*$/, '').split('\n');
  let slots = childLinkSlots(parentPage, lines);
  const line = `[${path.basename(childAbs, '.md')}](${hrefFor(parentPage, childAbs)})`;
  if (!slots.some((s) => s.t === childAbs)) {
    const at = slots.find((s) => s.t === beforeAbs);
    if (at) lines.splice(at.i, 0, line);
    else if (slots.length) lines.splice(slots[slots.length - 1].i + 1, 0, line);
    else lines.push(...(splitFrontmatter(text).body.trim() ? [''] : []), line);
    slots = childLinkSlots(parentPage, lines);
  }
  const lineOf = new Map(slots.map((s) => [s.t, lines[s.i]]));
  const seq = slots.map((s) => s.t).filter((t) => t !== childAbs);
  const idx = beforeAbs && seq.includes(beforeAbs) ? seq.indexOf(beforeAbs) : seq.length;
  seq.splice(idx, 0, childAbs);
  slots.forEach((s, k) => { lines[s.i] = lineOf.get(seq[k]); });
  await fsp.writeFile(parentPage, lines.join('\n') + '\n');
}

function orderInDir(dir, name, beforeName, currentNames) {
  const all = readOrder();
  const key = relOf(dir);
  const list = [...(all[key] || []).filter((n) => currentNames.includes(n)), ...currentNames.filter((n) => !(all[key] || []).includes(n))].filter((n) => n !== name);
  const idx = beforeName && list.includes(beforeName) ? list.indexOf(beforeName) : list.length;
  list.splice(idx, 0, name);
  all[key] = list;
  writeOrder(all);
}

/**
 * Move a page (with its sub-pages and files) or a folder: into `parent` ('' = top level, a page "A/B.md",
 * or a folder), placed before `before` (a sibling's path) or at the end. Returns the new path.
 */
export async function movePage(rel, parent = '', before = null) {
  const file = abs(rel);
  if (!fs.existsSync(file)) throw httpError(404, 'Page not found');
  const isPage = rel.endsWith('.md');
  const ownDir = isPage ? file.slice(0, -3) : file;
  const targetDir = parent ? (parent.endsWith('.md') ? abs(pageDir(parent)) : abs(parent)) : VAULT;
  if (targetDir === ownDir || targetDir.startsWith(ownDir + path.sep)) throw httpError(400, "Can't move a page inside itself");
  const oldParentPage = fs.existsSync(path.dirname(file) + '.md') && path.dirname(file) !== VAULT ? path.dirname(file) + '.md' : null;

  let newFile = file;
  if (path.dirname(file) !== targetDir) {
    await fsp.mkdir(targetDir, { recursive: true });
    newFile = uniquePath(targetDir, path.basename(file, isPage ? '.md' : ''), isPage ? '.md' : '');
    const moves = [[file, newFile], ...versionsOf(file).map(([v, vf]) => [vf, newFile.replace(/\.md$/, `.${v}.md`)])];
    if (isPage && fs.existsSync(ownDir)) moves.push([ownDir, newFile.slice(0, -3)]);
    const oldFiles = [...(isPage ? [file, ...versionsOf(file).map(([, vf]) => vf)] : []), ...(fs.existsSync(ownDir) ? await listMd(ownDir) : [])];
    const mapPath = (p) => {
      for (const [a, b] of moves) {
        if (p === a) return b;
        if (p.startsWith(a + path.sep)) return b + p.slice(a.length);
      }
      return p;
    };
    for (const [a, b] of moves) await fsp.rename(a, b);
    for (const f of oldFiles) await rebaseLinks(mapPath(f), f, mapPath);
    if (isPage) {
      await relinkPages(file, newFile);
      if (oldParentPage) await removeChildLink(oldParentPage, newFile);
    }
  }

  const newParentPage = targetDir !== VAULT && fs.existsSync(targetDir + '.md') ? targetDir + '.md' : null;
  if (newParentPage && isPage) await orderChildLink(newParentPage, newFile, before ? abs(before) : null);
  else {
    // Start from the order you currently see in the sidebar, so nothing else jumps around.
    const names = (await walk(targetDir, targetDir === VAULT)).map((n) => path.basename(n.path));
    if (!names.includes(path.basename(newFile))) names.push(path.basename(newFile));
    orderInDir(targetDir, path.basename(newFile), before ? path.basename(abs(before)) : null, names);
  }
  return relOf(newFile);
}
