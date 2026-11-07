// Turn a lecture PDF into slide images + text inside the app (PDF.js), so it works on any computer
// without extra tools. Writes "<page folder>/slides/pNN.jpg" and "slides.md" through the notes server.
import { api } from './api.js';

const WIDTH = 1440; // pixels per slide image: sharp on a Retina screen, ~80–150 KB each
const QUALITY = 0.82;

let pdfjs;
async function loadPdfJs() {
  if (!pdfjs) {
    const [lib, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    pdfjs = lib;
  }
  return pdfjs;
}

/** The text of one page, line by line. */
async function pageText(page) {
  const { items } = await page.getTextContent();
  let out = '';
  let lastX = null;
  for (const it of items) {
    if (!('str' in it)) continue;
    // PDF.js gives pieces of text; add a space between pieces that sit apart on the same line.
    const x = it.transform?.[4];
    if (lastX !== null && out && !/\s$/.test(out) && it.str && !/^\s/.test(it.str) && x > lastX + 1) out += ' ';
    out += it.str;
    lastX = x + (it.width || 0);
    if (it.hasEOL) {
      out += '\n';
      lastX = null;
    }
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Import a PDF (a File, Blob or ArrayBuffer) as the slides of a page.
 * @param {string} pagePath  the page, e.g. "Course/Week 3.md"
 * @param {{data: ArrayBuffer|Blob, name: string, saveSource?: boolean, onProgress?: (done:number,total:number)=>void}} opts
 */
export async function importPdfSlides(pagePath, { data, name, saveSource = true, onProgress }) {
  const lib = await loadPdfJs();
  const bytes = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  if (saveSource) await api.slideSource(pagePath, new File([bytes], name, { type: 'application/pdf' }));
  // PDF.js takes ownership of the buffer it reads, so give it a copy.
  const doc = await lib.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
  const total = doc.numPages;
  const pad = Math.max(2, String(total).length);
  const texts = [];
  let upload = Promise.resolve(); // the previous slide uploads while the next one is drawn
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  try {
    for (let n = 1; n <= total; n++) {
      onProgress?.(n - 1, total);
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, WIDTH / base.width) });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 'print' draws without the animation timer, so it keeps going while the window is in the background.
      await page.render({ canvasContext: ctx, viewport, intent: 'print' }).promise;
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
      await upload;
      upload = api.slideImage(pagePath, `p${String(n).padStart(pad, '0')}.jpg`, blob);
      texts.push(await pageText(page).catch(() => ''));
      page.cleanup();
    }
    await upload;
  } finally {
    await doc.destroy();
  }
  onProgress?.(total, total);
  return api.slidesDone(pagePath, { name, texts });
}
