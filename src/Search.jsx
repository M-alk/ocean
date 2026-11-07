import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import PageIcon from './PageIcon.jsx';

export default function Search({ onOpen, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = q.trim() ? await api.search(q) : [];
      if (live) { setResults(r); setSel(0); }
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const key = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[sel]) onOpen(results[sel].path);
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="search-modal" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Search your notes…" />
        <div className="search-results">
          {q && !results.length && <div className="muted pad">No results</div>}
          {results.map((r, i) => (
            <button key={r.path} className={'search-row' + (i === sel ? ' sel' : '')} onMouseEnter={() => setSel(i)} onClick={() => onOpen(r.path)}>
              <span className="row-icon"><PageIcon icon={r.icon} pagePath={r.path} size={20} /></span>
              <span className="search-text">
                <span className="search-title">{r.name}</span>
                <span className="search-path">{r.path.split('/').slice(0, -1).join(' / ')}</span>
                {r.snippet && <span className="search-snippet">{r.snippet}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
