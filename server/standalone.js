// Ocean without Vite: serves the built app (dist/) plus the notes API on 127.0.0.1.
// Used by the desktop app, and by `npm run serve` for a light local server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHandler } from './plugin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ico': 'image/x-icon',
};

export function startServer({ port = 0, distDir = path.join(here, '..', 'dist') } = {}) {
  const api = makeHandler();
  const server = http.createServer((req, res) => {
    api(req, res, () => {
      // Static files from the built app; anything else falls back to index.html (the app routes with #/).
      const url = new URL(req.url, 'http://x');
      let file = path.join(distDir, decodeURIComponent(url.pathname));
      if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(distDir, 'index.html');
      res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// `node server/standalone.js` → run directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { port } = await startServer({ port: Number(process.env.PORT) || 5181 });
  console.log(`Ocean is running at http://127.0.0.1:${port}`);
}
