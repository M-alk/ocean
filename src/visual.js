// Free-form visuals written by an AI (HTML / SVG / JS) for one idea in a note: a diagram, a clickable example, an
// animation… They run in a sandboxed frame (no access to the app or files) with Ocean's colours and font available
// as CSS variables, so they fit the notes without being forced into one look.

const BASE = `
:root {
  color-scheme: light dark;
  --font: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif;
  --mono: "SFMono-Regular", Menlo, Consolas, monospace;
  --text: #37352f; --text-2: #787774; --text-3: #a5a29a;
  --surface: rgba(55,53,47,.05); --surface-2: rgba(55,53,47,.09); --border: rgba(55,53,47,.14);
  --accent: #2383e2;
  --blue: #337ea9; --green: #448361; --orange: #d9730d; --purple: #9065b0; --red: #d44c47; --yellow: #cb912f; --pink: #c14c8a; --gray: #787774;
  --blue-bg: #e7f3f8; --green-bg: #edf3ec; --orange-bg: #fbecdd; --purple-bg: #f4f0f7; --red-bg: #fdebec; --yellow-bg: #fbf3db;
}
@media (prefers-color-scheme: dark) {
  :root {
    --text: rgba(255,255,255,.86); --text-2: #9b9b9b; --text-3: #6f6f6f;
    --surface: rgba(255,255,255,.055); --surface-2: rgba(255,255,255,.09); --border: rgba(255,255,255,.12);
    --accent: #529cca;
    --blue: #529cca; --green: #4dab9a; --orange: #ffa344; --purple: #9a6dd7; --red: #ff7369; --yellow: #ffdc49; --pink: #e255a1; --gray: #9b9b9b;
    --blue-bg: #1f2d38; --green-bg: #1f2e29; --orange-bg: #3a2a1b; --purple-bg: #2b2335; --red-bg: #3a2324; --yellow-bg: #3a331d;
  }
}
html, body { margin: 0; background: transparent; color: var(--text); font: 16px/1.5 var(--font); -webkit-font-smoothing: antialiased; }
body { padding: 2px; }
*, *::before, *::after { box-sizing: border-box; }
button, input, select, textarea { font: inherit; color: inherit; }
`;

// Reports the content height to the note, so the frame grows to fit (measures content, so 100vh pages can't loop).
const SIZER = `(()=>{let last=0;const h=()=>{const b=document.body;if(!b)return 0;let m=0;for(const el of b.children){const r=el.getBoundingClientRect();if(r.height)m=Math.max(m,r.bottom+parseFloat(getComputedStyle(el).marginBottom||0))}return Math.ceil(m+scrollY+parseFloat(getComputedStyle(b).paddingBottom||0))};const s=()=>{const v=h();if(v&&Math.abs(v-last)>2){last=v;parent.postMessage({leafEmbedHeight:v},'*')}};new ResizeObserver(s).observe(document.body||document.documentElement);addEventListener('load',s);setTimeout(s,300);s()})()`;

/** A complete, sandbox-ready document for a visual's HTML (a full page or just a fragment). */
export function visualDocument(html) {
  const head = `<meta charset="utf-8"><meta name="color-scheme" content="light dark"><style>${BASE}</style>`;
  const tail = `<script>${SIZER}<\/script>`;
  if (/<html[\s>]/i.test(html)) {
    let doc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + head) : html.replace(/<html[^>]*>/i, (m) => m + '<head>' + head + '</head>');
    return /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, tail + '</body>') : doc + tail;
  }
  return `<!doctype html><html><head>${head}</head><body>${html}${tail}</body></html>`;
}

/** A sandboxed frame showing a visual. */
export function visualFrame(html) {
  const frame = document.createElement('iframe');
  frame.className = 'visual-frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('allowtransparency', 'true');
  frame.srcdoc = visualDocument(html);
  return frame;
}

/** A short name for a visual: <title>, data-title, or its first heading. */
export function visualTitle(html, fallback = 'Interactive') {
  return (
    /<title>([^<]+)<\/title>/i.exec(html)?.[1] ||
    /data-title="([^"]+)"/i.exec(html)?.[1] ||
    /<h[1-4][^>]*>([^<]+)<\/h[1-4]>/i.exec(html)?.[1] ||
    fallback
  ).trim();
}

export const isHtml = (src) => /^\s*</.test(src);
