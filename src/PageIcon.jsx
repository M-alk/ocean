// Page icons, stored in a page's front matter as one of:
//   icon: "🍃"                                   an emoji
//   icon: "icon:battery-lightning-bolt:gray"     a Notion-style icon + colour
//   icon: "My page/assets/logo.png"              an uploaded image (relative to the page)
//
// Icon shapes come from Notion Kit (MIT, github.com/steeeee0223/notion-kit), bundled locally so they work offline.
import RAW from './notion-icons.json';
import { vaultUrl } from './api.js';

export const NOTION_ICONS = RAW.map(([id, name, d, tags]) => ({ id, name: name.replace(/-/g, ' '), d, tags }));
const BY_ID = new Map(NOTION_ICONS.map((i) => [i.id, i]));
export const ICON_COLORS = ['gray', 'lightgray', 'brown', 'yellow', 'orange', 'green', 'blue', 'purple', 'pink', 'red'];

export function parseIcon(icon) {
  if (!icon) return null;
  const m = /^icon:([\w-]+)(?::(\w+))?$/.exec(icon);
  if (m) return { kind: 'icon', id: m[1], color: m[2] || 'gray' };
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(icon) || /^https?:/i.test(icon)) return { kind: 'image', src: icon };
  return { kind: 'emoji', text: icon };
}

/** A Notion icon as a CSS-usable data URL (for masks, where React can't render). */
export function iconMaskUrl(id) {
  const item = BY_ID.get(id);
  if (!item) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="${item.d}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function NotionSvg({ id, color = 'gray', size = 20 }) {
  const item = BY_ID.get(id);
  if (!item) return null;
  return (
    <svg className="notion-icon" width={size} height={size} viewBox="0 0 20 20" style={{ color: `var(--icon-${color})` }} aria-hidden="true">
      <path d={item.d} fill="currentColor" />
    </svg>
  );
}

/** Notion's default "page" glyph for pages without an icon. */
function DefaultPage({ size }) {
  return (
    <svg className="notion-icon default-page" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5.5 2.5h5.79c.4 0 .78.16 1.06.44l3.21 3.2c.28.29.44.67.44 1.07v8.29c0 1.38-.74 2-2 2h-8.5c-1.26 0-2-.62-2-2v-11c0-1.38.74-2 2-2Zm0 1.25c-.5 0-.75.25-.75.75v11c0 .5.25.75.75.75h8.5c.5 0 .75-.25.75-.75V8h-3.5c-.83 0-1.5-.67-1.5-1.5V3.75Zm5.5.6V6.5c0 .14.11.25.25.25h2.15ZM6.75 10h6v1.25h-6Zm0 2.75h6V14h-6Z"
      />
    </svg>
  );
}

export default function PageIcon({ icon, pagePath = '', size = 18, fallback = true }) {
  const p = parseIcon(icon);
  if (!p) return fallback ? <DefaultPage size={size} /> : null;
  if (p.kind === 'icon') return <NotionSvg id={p.id} color={p.color} size={size} />;
  if (p.kind === 'image') return <img className="page-icon-img" src={vaultUrl(pagePath, p.src)} width={size} height={size} alt="" />;
  return (
    <span className="page-emoji" style={{ fontSize: size * 0.95, lineHeight: 1 }}>
      {p.text}
    </span>
  );
}
