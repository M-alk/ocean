// Notion-style "•••" page menu: a search box, then actions. Only what a student needs.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

export default function PageMenu({ items, onClose }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [sub, setSub] = useState(null);
  const ref = useRef(null);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const away = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const t = setTimeout(() => document.addEventListener('mousedown', away));
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', away);
    };
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  // When searching, sub-menu items are listed directly.
  const flat = needle
    ? items.flatMap((g) => g.flatMap((i) => (i.children ? i.children.map((c) => ({ ...c, label: `${i.label}: ${c.label}` })) : [i]))).filter((i) => i.label.toLowerCase().includes(needle))
    : null;
  const visible = flat || items.flat();
  const run = (item) => {
    if (item.children) return setSub(sub === item.label ? null : item.label);
    if (item.toggle !== undefined) return item.run();
    onClose();
    item.run();
  };
  const key = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, visible.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && visible[sel]) run(visible[sel]);
  };

  let idx = -1;
  const row = (item) => {
    idx += 1;
    const i = idx;
    return (
      <div key={item.label}>
        <button className={'pm-item' + (i === sel ? ' sel' : '') + (item.danger ? ' danger' : '')} onMouseEnter={() => setSel(i)} onClick={() => run(item)}>
          <Icon name={item.icon} />
          <span className="pm-label">{item.label}</span>
          {item.hint && <span className="pm-hint">{item.hint}</span>}
          {item.toggle !== undefined && <span className={'switch' + (item.toggle ? ' on' : '')} />}
          {item.children && <Icon name={sub === item.label ? 'down' : 'arrowRight'} />}
        </button>
        {sub === item.label && item.children && (
          <div className="pm-sub">
            {item.children.map((c) => (
              <button key={c.label} className="pm-item" onClick={() => { onClose(); c.run(); }}>
                <Icon name={c.icon} />
                <span className="pm-label">{c.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="popover page-menu" ref={ref}>
      <label className="ip-search pm-search">
        <Icon name="search" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={key} placeholder="Search actions…" />
      </label>
      {flat
        ? flat.length
          ? flat.map(row)
          : <p className="ip-empty">No actions match.</p>
        : items.map((group, gi) => (
            <div key={gi} className="pm-group">
              {group.map(row)}
            </div>
          ))}
    </div>
  );
}
