// Ocean widgets: interactive explainers described in a few lines of text and drawn by Ocean itself, so they always
// match the notes' style and can't run arbitrary code. (The same idea as OpenUI: the AI picks from a fixed set of
// components instead of writing free-form HTML.)
//
//   ```widget
//   title: Cosine similarity
//   slider v1 = 3 in 0..5 step 0.5 "v₁"
//   let dot = v1*w1 + v2*w2
//   value "cos(v, w)" = dot / (sqrt(v1^2+v2^2) * sqrt(w1^2+w2^2))
//   formula: \cos\theta = \frac{[[dot]]}{[[nv]] \cdot [[nw]]}
//   plot -1..6 y -1..6
//     vector (v1, v2) "v"
//   ```
import { useMemo, useState } from 'react';
import katex from 'katex';
import { compile, fmt } from './expr.js';

const COLORS = ['#529cca', '#e0913f', '#4dab9a', '#c97bd4', '#d65c5c', '#a0a0a0'];

/** Turn widget text into a list of components. Lines it can't read become visible errors, not crashes. */
export function parseWidget(src) {
  const items = [];
  let title = '';
  let plot = null;
  for (const raw of String(src).split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indented = /^\s+/.test(raw);
    const line = raw.trim();
    let m;
    try {
      if (indented && plot) {
        if ((m = /^curve\s+(.+?)(?:\s+"([^"]*)")?$/.exec(line))) plot.layers.push({ kind: 'curve', expr: compile(m[1]), label: m[2] || '' });
        else if ((m = /^points\s+([A-Za-z_]\w*)(?:\s+y\s*=\s*(.+?))?(?:\s+"([^"]*)")?$/.exec(line))) plot.layers.push({ kind: 'points', seq: m[1], y: m[2] ? compile(m[2]) : null, label: m[3] || '' });
        else if ((m = /^vector\s+\((.+),(.+)\)(?:\s+"([^"]*)")?$/.exec(line))) plot.layers.push({ kind: 'vector', x: compile(m[1]), y: compile(m[2]), label: m[3] || '' });
        else if ((m = /^point\s+\((.+),(.+)\)(?:\s+"([^"]*)")?$/.exec(line))) plot.layers.push({ kind: 'point', x: compile(m[1]), y: compile(m[2]), label: m[3] || '' });
        else throw new Error('Inside a plot use: curve, points, vector or point');
        continue;
      }
      plot = null;
      if ((m = /^title:\s*(.*)$/.exec(line))) title = m[1];
      else if ((m = /^(text|note):\s*(.*)$/.exec(line))) items.push({ kind: m[1], text: m[2] });
      else if ((m = /^slider\s+([A-Za-z_]\w*)\s*=\s*(-?[\d.]+)\s+in\s+(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(?:\s+step\s+([\d.]+))?(?:\s+"([^"]*)")?$/.exec(line)))
        items.push({ kind: 'slider', name: m[1], value: +m[2], min: +m[3], max: +m[4], step: m[5] ? +m[5] : (+m[4] - +m[3]) / 100, label: m[6] || m[1] });
      else if ((m = /^let\s+([A-Za-z_]\w*)\s*=\s*(.+)$/.exec(line))) items.push({ kind: 'let', name: m[1], expr: compile(m[2]) });
      else if ((m = /^value\s+"([^"]*)"\s*=\s*(.+?)(?:\s+unit\s+"([^"]*)")?$/.exec(line))) items.push({ kind: 'value', label: m[1], expr: compile(m[2]), unit: m[3] || '' });
      else if ((m = /^formula:\s*(.+)$/.exec(line))) {
        const parts = [];
        for (const piece of m[1].split(/(\[\[[^\]]+\]\])/)) parts.push(piece.startsWith('[[') ? { expr: compile(piece.slice(2, -2)) } : { tex: piece });
        items.push({ kind: 'formula', parts });
      } else if ((m = /^sequence\s+([A-Za-z_]\w*)\s+from\s+(.+?)\s+next\s+(.+?)\s+steps\s+(\d+)$/.exec(line)))
        items.push({ kind: 'sequence', name: m[1], from: compile(m[2]), next: compile(m[3]), steps: Math.min(+m[4], 500) });
      else if ((m = /^plot\s+(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)(?:\s+y\s+(-?[\d.]+)\s*\.\.\s*(-?[\d.]+))?(?:\s+"([^"]*)")?$/.exec(line))) {
        plot = { kind: 'plot', x0: +m[1], x1: +m[2], y0: m[3] != null ? +m[3] : null, y1: m[4] != null ? +m[4] : null, label: m[5] || '', layers: [] };
        items.push(plot);
      } else if ((m = /^bars(?:\s+"([^"]*)")?:\s*(.+)$/.exec(line)))
        items.push({ kind: 'bars', label: m[1] || '', bars: m[2].split(';').map((b) => b.split('=')).map(([k, v]) => ({ label: k.trim(), expr: compile(v) })) });
      else if ((m = /^check\s+"([^"]*)"\s*=\s*(.+?)(?:\s+within\s+([\d.]+))?$/.exec(line))) items.push({ kind: 'check', label: m[1], expr: compile(m[2]), tol: m[3] ? +m[3] : null });
      else throw new Error('Unknown line');
    } catch (err) {
      items.push({ kind: 'error', text: `${line} — ${err.message}` });
    }
  }
  return { title, items };
}

/** Values of every name (sliders, lets, sequences) for the current slider positions. */
function computeScope(items, sliders) {
  const scope = { ...sliders };
  const seqs = {};
  for (const it of items) {
    try {
      if (it.kind === 'let') scope[it.name] = it.expr(scope);
      if (it.kind === 'sequence') {
        const vals = [it.from(scope)];
        for (let i = 0; i < it.steps; i++) vals.push(it.next({ ...scope, [it.name]: vals[vals.length - 1], i }));
        seqs[it.name] = vals;
        scope[it.name] = vals[vals.length - 1];
        scope[`${it.name}_steps`] = it.steps;
      }
    } catch {
      /* shown as — */
    }
  }
  return { scope, seqs };
}

const safe = (f, s) => {
  try {
    return f(s);
  } catch {
    return NaN;
  }
};

/** Text with **bold** and $maths$. */
function RichText({ text }) {
  const html = text
    .split(/(\$[^$]+\$)/)
    .map((p) => (p.startsWith('$') && p.endsWith('$') ? katex.renderToString(p.slice(1, -1), { throwOnError: false }) : p.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')))
    .join('');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Plot({ item, scope, seqs }) {
  const W = 320, H = 200, P = 26;
  const { x0, x1 } = item;
  // Collect everything to draw, then pick a y range if none was given.
  const layers = item.layers.map((l, i) => {
    const color = COLORS[i % COLORS.length];
    if (l.kind === 'curve') {
      const pts = [];
      for (let k = 0; k <= 120; k++) {
        const x = x0 + ((x1 - x0) * k) / 120;
        pts.push([x, safe(l.expr, { ...scope, x })]);
      }
      return { ...l, color, pts };
    }
    if (l.kind === 'points') {
      const vals = seqs[l.seq] || [];
      return { ...l, color, pts: vals.map((v, i2) => [v, l.y ? safe(l.y, { ...scope, x: v, i: i2 }) : 0]) };
    }
    return { ...l, color, pts: [[safe(l.x, scope), safe(l.y, scope)]] };
  });
  const ys = layers.flatMap((l) => l.pts.map((p) => p[1])).filter(Number.isFinite);
  const xsAll = layers.filter((l) => l.kind === 'vector').flatMap((l) => l.pts.map((p) => p[1]));
  let y0 = item.y0 ?? Math.min(0, ...ys, ...xsAll);
  let y1 = item.y1 ?? Math.max(1, ...ys);
  if (y1 - y0 < 1e-9) y1 = y0 + 1;
  const sx = (x) => P + ((x - x0) / (x1 - x0)) * (W - 2 * P);
  const sy = (y) => H - P - ((y - y0) / (y1 - y0)) * (H - 2 * P);
  const inY = (y) => Number.isFinite(y) && y >= y0 - (y1 - y0) && y <= y1 + (y1 - y0);
  return (
    <figure className="wg-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={item.label || 'plot'}>
        <defs>
          {layers.map((l, i) => (
            <marker key={i} id={`arrow-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill={l.color} />
            </marker>
          ))}
        </defs>
        {x0 < 0 && x1 > 0 && <line x1={sx(0)} x2={sx(0)} y1={P / 2} y2={H - P / 2} className="wg-axis" />}
        {y0 < 0 && y1 > 0 && <line x1={P / 2} x2={W - P / 2} y1={sy(0)} y2={sy(0)} className="wg-axis" />}
        <rect x={P} y={P} width={W - 2 * P} height={H - 2 * P} className="wg-frame" />
        <text x={P} y={H - 8} className="wg-tick">{fmt(x0, 2)}</text>
        <text x={W - P} y={H - 8} className="wg-tick" textAnchor="end">{fmt(x1, 2)}</text>
        <text x={4} y={P + 4} className="wg-tick">{fmt(y1, 2)}</text>
        <text x={4} y={H - P} className="wg-tick">{fmt(y0, 2)}</text>
        {layers.map((l, i) => {
          if (l.kind === 'curve') {
            const d = l.pts.filter((p) => inY(p[1])).map((p, k) => `${k ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
            return <path key={i} d={d} fill="none" stroke={l.color} strokeWidth="2.2" />;
          }
          if (l.kind === 'points') {
            return (
              <g key={i}>
                <path d={l.pts.filter((p) => inY(p[1])).map((p, k) => `${k ? 'L' : 'M'}${sx(p[0])},${sy(p[1])}`).join('')} fill="none" stroke={l.color} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
                {l.pts.filter((p) => inY(p[1])).map((p, k) => <circle key={k} cx={sx(p[0])} cy={sy(p[1])} r={k === 0 ? 4.5 : 3.2} fill={l.color} opacity={Math.max(0.35, 1 - k * 0.05)} />)}
              </g>
            );
          }
          const [x, y] = l.pts[0];
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          if (l.kind === 'vector') {
            return (
              <g key={i}>
                <line x1={sx(0)} y1={sy(0)} x2={sx(x)} y2={sy(y)} stroke={l.color} strokeWidth="2.4" markerEnd={`url(#arrow-${i})`} />
                {l.label && <text x={sx(x) + 6} y={sy(y) - 6} fill={l.color} className="wg-label">{l.label}</text>}
              </g>
            );
          }
          return (
            <g key={i}>
              <circle cx={sx(x)} cy={sy(y)} r="5" fill={l.color} />
              {l.label && <text x={sx(x) + 8} y={sy(y) - 6} fill={l.color} className="wg-label">{l.label}</text>}
            </g>
          );
        })}
      </svg>
      {(item.label || layers.some((l) => l.label && l.kind !== 'vector' && l.kind !== 'point')) && (
        <figcaption>
          {item.label && <span>{item.label}</span>}
          {layers.filter((l) => l.label && (l.kind === 'curve' || l.kind === 'points')).map((l, i) => (
            <span key={i} className="wg-legend"><i style={{ background: l.color }} />{l.label}</span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

function Check({ item, scope }) {
  const [answer, setAnswer] = useState('');
  const [shown, setShown] = useState(false);
  const want = safe(item.expr, scope);
  const got = parseFloat(answer);
  const tol = item.tol ?? Math.max(0.01, Math.abs(want) * 0.02);
  const right = Number.isFinite(got) && Math.abs(got - want) <= tol;
  return (
    <div className="wg-check">
      <label><RichText text={item.label} /></label>
      <div className="wg-check-row">
        <input value={answer} onChange={(e) => { setAnswer(e.target.value); setShown(false); }} onKeyDown={(e) => e.key === 'Enter' && setShown(true)} placeholder="Your answer" inputMode="decimal" />
        <button onClick={() => setShown(true)}>Check</button>
      </div>
      {shown && <p className={'wg-check-result ' + (right ? 'right' : 'wrong')}>{right ? 'Correct ✓' : `Not quite — it's ${fmt(want)}`}</p>}
    </div>
  );
}

export default function Widget({ source }) {
  const spec = useMemo(() => parseWidget(source), [source]);
  const initial = useMemo(() => Object.fromEntries(spec.items.filter((i) => i.kind === 'slider').map((i) => [i.name, i.value])), [spec]);
  const [sliders, setSliders] = useState(initial);
  const values = { ...initial, ...sliders };
  const { scope, seqs } = computeScope(spec.items, values);

  return (
    <div className="widget">
      {spec.title && <div className="wg-title">{spec.title}</div>}
      {spec.items.map((it, i) => {
        switch (it.kind) {
          case 'text':
            return <p key={i} className="wg-text"><RichText text={it.text} /></p>;
          case 'note':
            return <p key={i} className="wg-note"><RichText text={it.text} /></p>;
          case 'slider':
            return (
              <label key={i} className="wg-slider">
                <span className="wg-slider-head"><RichText text={it.label} /><b>{fmt(values[it.name])}</b></span>
                <input type="range" min={it.min} max={it.max} step={it.step} value={values[it.name]} onChange={(e) => setSliders((s) => ({ ...s, [it.name]: +e.target.value }))} />
              </label>
            );
          case 'value':
            return (
              <div key={i} className="wg-value">
                <span><RichText text={it.label} /></span>
                <b>{fmt(safe(it.expr, scope))}{it.unit ? ` ${it.unit}` : ''}</b>
              </div>
            );
          case 'formula': {
            const tex = it.parts.map((p) => (p.tex != null ? p.tex : `\\mathbf{${fmt(safe(p.expr, scope))}}`)).join('');
            return <div key={i} className="wg-formula" dangerouslySetInnerHTML={{ __html: katex.renderToString(tex, { throwOnError: false, displayMode: true }) }} />;
          }
          case 'plot':
            return <Plot key={i} item={it} scope={scope} seqs={seqs} />;
          case 'bars': {
            const vals = it.bars.map((b) => safe(b.expr, scope));
            const max = Math.max(1e-9, ...vals.map((v) => Math.abs(v)).filter(Number.isFinite));
            return (
              <div key={i} className="wg-bars">
                {it.label && <div className="wg-bars-title">{it.label}</div>}
                {it.bars.map((b, k) => (
                  <div key={k} className="wg-bar">
                    <span className="wg-bar-label">{b.label}</span>
                    <span className="wg-bar-track"><span style={{ width: `${(Math.abs(vals[k]) / max) * 100}%`, background: COLORS[k % COLORS.length] }} /></span>
                    <b>{fmt(vals[k])}</b>
                  </div>
                ))}
              </div>
            );
          }
          case 'check':
            return <Check key={i} item={it} scope={scope} />;
          case 'error':
            return <p key={i} className="wg-error">⚠ {it.text}</p>;
          default:
            return null;
        }
      })}
      {Object.keys(initial).length > 0 && (
        <button className="wg-reset" onClick={() => setSliders(initial)}>Reset</button>
      )}
    </div>
  );
}
