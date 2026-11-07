// Small JSON API + live file watching, mounted inside the Vite server (dev and preview).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import chokidar from 'chokidar';
import { execFileSync } from 'node:child_process';
import * as vault from './vault.js';

let cachedName;
/** The computer account's display name (e.g. "Mohammed Alkitbe"), or the login name. */
function fullName() {
  if (cachedName) return cachedName;
  try {
    cachedName = execFileSync('id', ['-F'], { encoding: 'utf8' }).trim();
  } catch {
    /* not macOS */
  }
  return (cachedName ||= os.userInfo().username);
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4',
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
const json = (res, status, data) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
};

// Ocean's look for HTML embedded in a note. Loaded last, so it wins over the file's own page styles,
// while the file keeps its widgets, colours for charts, buttons and so on.
const EMBED_THEME = `<meta name="color-scheme" content="light dark"><style id="ocean-embed-theme">
:root { color-scheme: light dark; --o-text: #37352f; --o-text-2: #787774; --o-border: rgba(55,53,47,.12); --o-hover: rgba(55,53,47,.06); --o-accent: #2383e2; }
@media (prefers-color-scheme: dark) { :root { --o-text: rgba(255,255,255,.86); --o-text-2: #9b9b9b; --o-border: rgba(255,255,255,.12); --o-hover: rgba(255,255,255,.055); --o-accent: #529cca; } }
html, body { background: transparent !important; color: var(--o-text) !important; margin: 0 !important; }
html { font-size: 16px !important; }
body { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif !important; line-height: 1.5 !important; padding: 0 2px 4px !important; -webkit-font-smoothing: antialiased; }
body :where(h1,h2,h3,h4,h5,h6,p,li,td,th,label,button,input,select,textarea,figcaption,blockquote,span,div,a,strong,em,small,caption,summary) { font-family: inherit !important; letter-spacing: normal !important; }
body :where(code,pre,kbd,samp) { font-family: "SFMono-Regular", Menlo, Consolas, monospace !important; }
/* the page's own wrapper becomes the note column */
body > :where(main, article, section, .page, .container, .wrapper, .content, #root, #app) { max-width: none !important; margin: 0 !important; padding-left: 0 !important; padding-right: 0 !important; padding-top: 0 !important; }
/* Ocean's text sizes */
h1 { font-size: 1.875em !important; font-weight: 600 !important; line-height: 1.3 !important; margin: .8em 0 .3em !important; }
h2 { font-size: 1.5em !important; font-weight: 600 !important; line-height: 1.3 !important; margin: 1em 0 .3em !important; }
h3 { font-size: 1.25em !important; font-weight: 600 !important; line-height: 1.3 !important; margin: .9em 0 .25em !important; }
body > :first-child h1:first-child, body > h1:first-child { margin-top: .2em !important; }
p, li { font-size: 1em !important; line-height: 1.5 !important; }
p { margin: .35em 0 !important; }
a { color: inherit !important; text-decoration-color: color-mix(in srgb, currentColor 35%, transparent) !important; }
table { border-collapse: collapse; } th, td { border-color: var(--o-border) !important; }
th { background: var(--o-hover) !important; }
hr { border: 0 !important; border-top: 1px solid var(--o-border) !important; }
:where(.muted, .caption, small, figcaption) { color: var(--o-text-2) !important; }
</style>`;

export function makeHandler() {
  vault.ensureVault();
  const clients = new Set();
  // Paths we just wrote ourselves, so the watcher doesn't echo them back as "changed by someone else".
  const ownWrites = new Map();

  const watcher = chokidar.watch(vault.VAULT, {
    ignoreInitial: true,
    ignored: (p) => p.includes(`${path.sep}.trash`) || p.includes(`${path.sep}.git`) || p.includes(`${path.sep}.ocean`),
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
  });
  let pending = new Set();
  let timer = null;
  watcher.on('all', (event, p) => {
    const rel = vault.relOf(p);
    const own = ownWrites.get(rel);
    if (own && Date.now() - own < 1500 && event === 'change') return;
    pending.add(JSON.stringify({ event, path: rel }));
    clearTimeout(timer);
    timer = setTimeout(() => {
      const changes = [...pending].map((s) => JSON.parse(s));
      pending = new Set();
      const msg = `data: ${JSON.stringify({ changes })}\n\n`;
      for (const c of clients) c.write(msg);
    }, 150);
  });

  return async function handler(req, res, next) {
    const url = new URL(req.url, 'http://x');
    const q = Object.fromEntries(url.searchParams);
    const ours = /^\/(api|vault|embed)\//.test(url.pathname);
    if (!ours) return next();
    // Only answer requests addressed to this machine (blocks DNS-rebinding tricks).
    const host = (req.headers.host || '').replace(/:\d+$/, '');
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) return json(res, 403, { error: 'Forbidden host' });
    // Changes need a custom header, which other websites (and embedded HTML) can't send without permission.
    if (req.method !== 'GET' && req.headers['x-leaf'] !== '1') return json(res, 403, { error: 'Missing x-leaf header' });
    try {
      // Interactive HTML, served sandboxed: it runs, but can't touch the app or your files.
      if (url.pathname.startsWith('/embed/')) {
        const file = vault.abs(decodeURIComponent(url.pathname.slice('/embed/'.length)));
        if (!/\.html?$/i.test(file)) return json(res, 400, { error: 'Not an HTML file' });
        const html = await fsp.readFile(file, 'utf8').catch(() => null);
        if (html == null) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.end(`<p style="font:14px system-ui;color:#888;padding:16px">Embed not found: ${path.basename(file).replace(/</g, '&lt;')}</p>`);
        }
        // Tell the note how tall the content is, so the frame grows to fit.
        // It measures where the content ends (not the page box), so pages styled "height: 100vh" can't make the frame grow forever.
        const sizer = `<script>(()=>{let last=0;const h=()=>{const b=document.body;if(!b)return 0;let m=0;for(const el of b.children){const r=el.getBoundingClientRect();if(r.height)m=Math.max(m,r.bottom+parseFloat(getComputedStyle(el).marginBottom||0))}return Math.ceil(m+scrollY+parseFloat(getComputedStyle(b).paddingBottom||0))};const s=()=>{const v=h();if(v&&Math.abs(v-last)>2){last=v;parent.postMessage({leafEmbedHeight:v},'*')}};new ResizeObserver(s).observe(document.body||document.documentElement);addEventListener('load',s);setTimeout(s,300);s()})()</script>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals');
        res.setHeader('Cache-Control', 'no-cache');
        // Inside a note (?inline), the HTML takes Ocean's look — transparent background, Ocean's font, colours and
        // heading sizes — so it reads as part of the page. "Open full screen" shows it as the author made it.
        const inline = url.searchParams.has('inline');
        let out = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${sizer}</body>`) : html + sizer;
        if (inline) out = /<\/head>/i.test(out) ? out.replace(/<\/head>/i, `${EMBED_THEME}</head>`) : EMBED_THEME + out;
        return res.end(out);
      }
      // Raw files from the vault (images, slides…)
      if (url.pathname.startsWith('/vault/')) {
        const file = vault.abs(decodeURIComponent(url.pathname.slice('/vault/'.length)));
        const stat = await fsp.stat(file).catch(() => null);
        if (!stat?.isFile()) return json(res, 404, { error: 'Not found' });
        res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');
        // Never run HTML/SVG from the notes folder with the app's permissions.
        res.setHeader('Content-Security-Policy', 'sandbox');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return fs.createReadStream(file).pipe(res);
      }
      const route = `${req.method} ${url.pathname}`;

      switch (route) {
        case 'GET /api/info':
          return json(res, 200, { vault: vault.VAULT, name: path.basename(vault.VAULT), user: process.env.OCEAN_USER || fullName() });
        case 'GET /api/tree':
          return json(res, 200, await vault.tree());
        case 'GET /api/page':
          return json(res, 200, await vault.readPage(q.path));
        case 'PUT /api/page': {
          const data = JSON.parse((await readBody(req)).toString('utf8'));
          ownWrites.set(q.path, Date.now());
          await vault.writePage(q.path, data);
          if (data.body !== undefined) vault.addActivity({ day: new Date().toLocaleDateString('en-CA'), edits: 1 }).catch(() => {});
          const stat = await fsp.stat(vault.abs(q.path));
          return json(res, 200, { ok: true, mtime: stat.mtimeMs });
        }
        case 'POST /api/page': {
          const { parent = '', title = 'Untitled', icon = '', link = false } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          return json(res, 200, { path: await vault.createPage(parent, title, icon, link) });
        }
        case 'POST /api/folder': {
          const { parent = '', name = 'New folder' } = JSON.parse((await readBody(req)).toString('utf8') || '{}');
          return json(res, 200, { path: await vault.createFolder(parent, name) });
        }
        case 'POST /api/rename': {
          const { path: p, title } = JSON.parse((await readBody(req)).toString('utf8'));
          return json(res, 200, { path: await vault.renamePage(p, title) });
        }
        case 'POST /api/move': {
          const { path: p, parent = '', before = null } = JSON.parse((await readBody(req)).toString('utf8'));
          return json(res, 200, { path: await vault.movePage(p, parent, before) });
        }
        case 'POST /api/duplicate': {
          const { path: p } = JSON.parse((await readBody(req)).toString('utf8'));
          return json(res, 200, { path: await vault.duplicatePage(p) });
        }
        case 'POST /api/trash': {
          const { path: p } = JSON.parse((await readBody(req)).toString('utf8'));
          await vault.trashPage(p);
          return json(res, 200, { ok: true });
        }
        case 'POST /api/upload': {
          const link = await vault.saveAsset(q.page, q.name || 'image.png', await readBody(req));
          return json(res, 200, { link });
        }
        case 'POST /api/slides': {
          const tmp = path.join(os.tmpdir(), `ocean-upload-${Date.now()}-${path.basename(q.name || 'slides.pdf')}`);
          await fsp.writeFile(tmp, await readBody(req));
          try {
            return json(res, 200, await vault.importSlides(q.page, tmp, q.name));
          } finally {
            await fsp.rm(tmp, { force: true });
          }
        }
        case 'POST /api/slides/source':
          return json(res, 200, await vault.saveSlideSource(q.page, q.name || 'slides.pdf', await readBody(req)));
        case 'PUT /api/slides/image':
          await vault.saveSlideImage(q.page, q.name || '', await readBody(req));
          return json(res, 200, { ok: true });
        case 'POST /api/slides/finish':
          return json(res, 200, await vault.finishSlides(q.page, JSON.parse((await readBody(req)).toString('utf8'))));
        case 'GET /api/slides':
          return json(res, 200, await vault.listSlides(q.page));
        case 'GET /api/activity':
          return json(res, 200, await vault.readActivity());
        case 'POST /api/activity': {
          await vault.addActivity(JSON.parse((await readBody(req)).toString('utf8')));
          return json(res, 200, { ok: true });
        }
        case 'GET /api/graph':
          return json(res, 200, await vault.graph());
        case 'GET /api/search':
          return json(res, 200, await vault.search(q.q || ''));
        case 'GET /api/events': {
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
          res.write(': connected\n\n');
          clients.add(res);
          const ping = setInterval(() => res.write(': ping\n\n'), 25000);
          req.on('close', () => {
            clearInterval(ping);
            clients.delete(res);
          });
          return;
        }
        default:
          return json(res, 404, { error: `No route ${route}` });
      }
    } catch (err) {
      return json(res, err.status || 500, { error: err.message });
    }
  };
}

export default function vaultPlugin() {
  let handler;
  const mount = (server) => {
    handler ||= makeHandler();
    server.middlewares.use(handler);
  };
  return { name: 'ocean-vault', configureServer: mount, configurePreviewServer: mount };
}
