// Notion-style icon picker: Emoji / Icons / Upload, with filter, shuffle, colour and "Recent".
import { useEffect, useMemo, useRef, useState } from 'react';
import { NOTION_ICONS, ICON_COLORS, NotionSvg } from './PageIcon.jsx';
import { api } from './api.js';

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const pushRecent = (key, v) => store.set(key, [v, ...store.get(key, []).filter((x) => x !== v)].slice(0, 24));

let emojiData; // loaded on first open (≈400 KB)
const loadEmoji = () =>
  (emojiData ||= import('@emoji-mart/data/sets/15/native.json').then((m) => {
    const d = m.default;
    const label = { people: 'People', nature: 'Animals & nature', foods: 'Food & drink', activity: 'Activity', places: 'Travel & places', objects: 'Objects', symbols: 'Symbols', flags: 'Flags' };
    return d.categories.map((c) => ({
      id: c.id,
      label: label[c.id] || c.id,
      items: c.emojis.map((id) => d.emojis[id]).filter(Boolean).map((e) => ({ native: e.skins[0].native, name: e.name, keys: `${e.name} ${e.keywords.join(' ')}`.toLowerCase() })),
    }));
  }));

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <path d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10zM10.6 10.6L14 14" />
    </svg>
  );
}
function ShuffleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5h2.5c1.5 0 2.3.6 3 1.8l1 1.7c.7 1.2 1.5 1.8 3 1.8H14M12 7.5l2 2.3-2 2.2M2 11.5h2.5c1 0 1.7-.3 2.2-.9M9.3 5.4c.5-.6 1.2-.9 2.2-.9H14M12 2.5l2 2-2 2" />
    </svg>
  );
}

export default function IconPicker({ pagePath, onPick, onClose }) {
  const [tab, setTab] = useState(() => store.get('leaf.iconTab', 'emoji'));
  const [q, setQ] = useState('');
  const [color, setColor] = useState(() => store.get('leaf.iconColor', 'gray'));
  const [colorsOpen, setColorsOpen] = useState(false);
  const [emoji, setEmoji] = useState(null);
  const [tip, setTip] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const ref = useRef(null);
  const input = useRef(null);
  const fileInput = useRef(null);

  useEffect(() => {
    loadEmoji().then(setEmoji);
  }, []);
  useEffect(() => store.set('leaf.iconTab', tab), [tab]);
  useEffect(() => store.set('leaf.iconColor', color), [color]);
  useEffect(() => {
    input.current?.focus();
    setQ('');
  }, [tab]);
  useEffect(() => {
    const away = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const esc = (e) => e.key === 'Escape' && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', away));
    document.addEventListener('keydown', esc);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const pickEmoji = (e) => {
    pushRecent('leaf.recentEmoji', e);
    onPick(e);
  };
  const pickIcon = (id) => {
    pushRecent('leaf.recentIcons', id);
    onPick(`icon:${id}:${color}`);
  };
  const upload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    const { link } = await api.upload(pagePath, file);
    onPick(link);
  };

  const needle = q.trim().toLowerCase();
  const iconResults = useMemo(
    () => (needle ? NOTION_ICONS.filter((i) => i.id.includes(needle) || i.name.includes(needle) || i.tags.includes(needle)) : NOTION_ICONS),
    [needle],
  );
  const emojiSections = useMemo(() => {
    if (!emoji) return [];
    if (!needle) return emoji;
    return [{ id: 'results', label: 'Results', items: emoji.flatMap((c) => c.items).filter((e) => e.keys.includes(needle)).slice(0, 200) }];
  }, [emoji, needle]);
  const emojiByNative = useMemo(() => new Map((emoji || []).flatMap((c) => c.items.map((e) => [e.native, e]))), [emoji]);

  const shuffle = () => {
    if (tab === 'icons') pickIcon(NOTION_ICONS[Math.floor(Math.random() * NOTION_ICONS.length)].id);
    else if (emoji) {
      const all = emoji.filter((c) => c.id !== 'flags').flatMap((c) => c.items);
      pickEmoji(all[Math.floor(Math.random() * all.length)].native);
    }
  };
  const showTip = (e, name) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ name, x: r.left + r.width / 2, y: r.top });
  };
  const cell = (key, name, content, onClick) => (
    <button key={key} className="ip-cell" onClick={onClick} onMouseEnter={(e) => showTip(e, name)} onMouseLeave={() => setTip(null)}>
      {content}
    </button>
  );

  const recentIcons = store.get('leaf.recentIcons', []).filter((id) => NOTION_ICONS.some((i) => i.id === id));
  const recentEmoji = store.get('leaf.recentEmoji', []);

  return (
    <div className="popover icon-picker" ref={ref} onMouseLeave={() => setTip(null)}>
      <div className="ip-tabs">
        {[['emoji', 'Emoji'], ['icons', 'Icons'], ['upload', 'Upload']].map(([id, label]) => (
          <button key={id} className={'ip-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>{label}</button>
        ))}
        <span className="ip-spacer" />
        <button className="ip-tab" onClick={() => onPick('')}>Remove</button>
      </div>

      {tab !== 'upload' && (
        <div className="ip-toolbar">
          <label className="ip-search">
            <SearchIcon />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter…" />
          </label>
          <button className="ip-tool" title="Random" onClick={shuffle}><ShuffleIcon /></button>
          {tab === 'icons' && (
            <div className="ip-color-wrap">
              <button className="ip-tool" title="Icon colour" onClick={() => setColorsOpen((o) => !o)}>
                <span className="ip-dot" style={{ background: `var(--icon-${color})` }} />
              </button>
              {colorsOpen && (
                <div className="popover ip-colors">
                  {ICON_COLORS.map((c) => (
                    <button key={c} title={c} className={'ip-swatch' + (c === color ? ' on' : '')} onClick={() => { setColor(c); setColorsOpen(false); }}>
                      <span className="ip-dot" style={{ background: `var(--icon-${c})` }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="ip-body">
        {tab === 'icons' && (
          <>
            {!needle && recentIcons.length > 0 && (
              <section>
                <h6>Recent</h6>
                <div className="ip-grid">{recentIcons.map((id) => cell('r' + id, NOTION_ICONS.find((i) => i.id === id).name, <NotionSvg id={id} color={color} size={24} />, () => pickIcon(id)))}</div>
              </section>
            )}
            <section>
              <h6>{needle ? 'Results' : 'Icons'}</h6>
              <div className="ip-grid">{iconResults.map((i) => cell(i.id, i.name, <NotionSvg id={i.id} color={color} size={24} />, () => pickIcon(i.id)))}</div>
              {!iconResults.length && <p className="ip-empty">No icons match “{q}”.</p>}
            </section>
          </>
        )}
        {tab === 'emoji' && (
          <>
            {!emoji && <p className="ip-empty">Loading…</p>}
            {!needle && recentEmoji.length > 0 && emoji && (
              <section>
                <h6>Recent</h6>
                <div className="ip-grid">{recentEmoji.map((n) => cell('r' + n, emojiByNative.get(n)?.name || n, <span className="ip-emoji">{n}</span>, () => pickEmoji(n)))}</div>
              </section>
            )}
            {emojiSections.map((s) => (
              <section key={s.id}>
                <h6>{s.label}</h6>
                <div className="ip-grid">{s.items.map((e) => cell(s.id + e.native, e.name, <span className="ip-emoji">{e.native}</span>, () => pickEmoji(e.native)))}</div>
              </section>
            ))}
            {emoji && needle && !emojiSections[0]?.items.length && <p className="ip-empty">No emoji match “{q}”.</p>}
          </>
        )}
        {tab === 'upload' && (
          <div
            className={'ip-upload' + (dragOver ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files[0]); }}
            onPaste={(e) => upload(e.clipboardData.files[0])}
          >
            <button className="ip-upload-btn" onClick={() => fileInput.current.click()}>Upload an image</button>
            <p>or drop / paste an image here. Recommended size is 280 × 280 pixels.</p>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
          </div>
        )}
      </div>
      {tip && (
        <div className="ip-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.name}
        </div>
      )}
    </div>
  );
}
