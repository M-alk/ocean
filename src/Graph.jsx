// Obsidian-style graph view: every page is a dot, lines are links between pages (and, optionally, sub-pages).
import { useEffect, useMemo, useRef, useState } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';
import { api } from './api.js';
import { Icon } from './icons.jsx';

const DEFAULTS = {
  search: '', childLinks: true, orphans: true,
  nodeSize: 1, linkWidth: 1, textFade: 0.45,
  center: 0.08, repel: 160, linkForce: 0.6, linkDistance: 60,
};
const pref = {
  get: (k, d) => { try { return { ...d, ...JSON.parse(localStorage.getItem(k)) }; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

function Section({ title, open, onToggle, children }) {
  return (
    <div className="gp-section">
      <button className="gp-head" onClick={onToggle}><Icon name={open ? 'down' : 'chevron'} /> {title}</button>
      {open && <div className="gp-body">{children}</div>}
    </div>
  );
}
const Toggle = ({ label, value, onChange }) => (
  <label className="gp-row"><span>{label}</span><button className={'switch' + (value ? ' on' : '')} onClick={() => onChange(!value)} /></label>
);
const Slider = ({ label, value, min, max, step, onChange }) => (
  <label className="gp-row col"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>
);

export default function Graph({ current, onOpen, sidebarHidden, onShowSidebar, changeTick }) {
  const canvas = useRef(null);
  const wrap = useRef(null);
  const [data, setData] = useState(null);
  const [opts, setOpts] = useState(() => pref.get('ocean.graph.v2', DEFAULTS));
  const [panel, setPanel] = useState(true);
  const [open, setOpen] = useState({ filters: true, display: false, forces: false });
  const view = useRef({ x: 0, y: 0, k: 1 });
  const hover = useRef(null);
  const sim = useRef(null);
  const draw = useRef(() => {});
  const set = (k, v) => setOpts((o) => ({ ...o, [k]: v }));
  const fitted = useRef(false);
  const fit = () => {
    const ns = sim.current?.nodes() || [];
    const c = canvas.current;
    if (!ns.length || !c) return;
    const xs = ns.map((n) => n.x);
    const ys = ns.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = Math.min(2, 0.9 * Math.min(c.clientWidth / (x1 - x0 + 80), c.clientHeight / (y1 - y0 + 80)));
    view.current = { k, x: -((x0 + x1) / 2) * k, y: -((y0 + y1) / 2) * k };
    fitted.current = true;
  };
  useEffect(() => pref.set('ocean.graph.v2', opts), [opts]);

  useEffect(() => { api.graph().then(setData); }, [changeTick]);

  // Filtered nodes/links
  const graph = useMemo(() => {
    if (!data) return null;
    const q = opts.search.trim().toLowerCase();
    let edges = data.edges.filter((e) => opts.childLinks || e.kind === 'link');
    let nodes = data.nodes.filter((n) => !q || n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    const ids = new Set(nodes.map((n) => n.id));
    edges = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const degree = new Map();
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    }
    if (!opts.orphans) nodes = nodes.filter((n) => degree.get(n.id));
    return { nodes: nodes.map((n) => ({ ...n, degree: degree.get(n.id) || 0 })), edges: edges.map((e) => ({ ...e })) };
  }, [data, opts.search, opts.childLinks, opts.orphans]);

  // Simulation
  useEffect(() => {
    if (!graph) return;
    const old = new Map((sim.current?.nodes() || []).map((n) => [n.id, n]));
    for (const n of graph.nodes) {
      const o = old.get(n.id);
      if (o) Object.assign(n, { x: o.x, y: o.y, vx: o.vx, vy: o.vy });
    }
    sim.current?.stop();
    sim.current = forceSimulation(graph.nodes)
      .force('link', forceLink(graph.edges).id((d) => d.id).distance(opts.linkDistance).strength(opts.linkForce))
      .force('charge', forceManyBody().strength(-opts.repel))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(opts.center))
      .force('y', forceY(0).strength(opts.center))
      .force('collide', forceCollide(12))
      .on('tick', () => {
        ticks++;
        // Zoom to fit everything once the layout has mostly settled (first open only).
        if (!fitted.current && ticks === 120) fit();
        draw.current();
      });
    let ticks = 0;
    return () => sim.current?.stop();
  }, [graph, opts.linkDistance, opts.linkForce, opts.repel, opts.center]);

  // Drawing
  useEffect(() => {
    const c = canvas.current;
    const ctx = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const color = (v, fb) => css.getPropertyValue(v).trim() || fb;
    draw.current = () => {
      if (!graph) return;
      const dpr = devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      const { x, y, k } = view.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.translate(w / 2 + x, h / 2 + y);
      ctx.scale(k, k);
      const hov = hover.current;
      const near = new Set();
      if (hov) {
        near.add(hov.id);
        for (const e of graph.edges) {
          if (e.source.id === hov.id) near.add(e.target.id);
          if (e.target.id === hov.id) near.add(e.source.id);
        }
      }
      const text = color('--text', '#ddd');
      const dim = color('--text-3', '#666');
      const accent = color('--accent', '#529cca');
      for (const e of graph.edges) {
        const on = hov && (e.source.id === hov.id || e.target.id === hov.id);
        ctx.strokeStyle = on ? accent : e.kind === 'child' ? 'rgba(128,128,128,.22)' : 'rgba(150,150,150,.45)';
        ctx.globalAlpha = hov && !on ? 0.25 : 1;
        ctx.lineWidth = (on ? 1.6 : 1) * opts.linkWidth / k;
        ctx.setLineDash(e.kind === 'child' ? [3 / k, 3 / k] : []);
        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const n of graph.nodes) {
        const r = (3.5 + Math.sqrt(n.degree) * 1.8) * opts.nodeSize;
        n.r = r;
        const faded = hov && !near.has(n.id);
        ctx.globalAlpha = faded ? 0.25 : 1;
        ctx.fillStyle = n.id === current ? accent : hov?.id === n.id ? accent : color('--text-2', '#aaa');
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        // Labels fade in as you zoom, like Obsidian.
        // Fade threshold 0 = always show labels, 1 = only when zoomed far in.
        const threshold = 0.3 + opts.textFade * 1.6;
        const labelAlpha = hov ? (near.has(n.id) ? 1 : 0.12) : n.id === current ? 1 : Math.min(1, Math.max(0, (k - threshold) / 0.35));
        if (labelAlpha > 0.02) {
          ctx.globalAlpha = labelAlpha;
          ctx.fillStyle = n.id === current ? accent : text;
          ctx.font = `${12 / Math.sqrt(k)}px ${css.getPropertyValue('--font') || 'sans-serif'}`;
          ctx.textAlign = 'center';
          ctx.fillText(n.name.length > 42 ? n.name.slice(0, 40) + '…' : n.name, n.x, n.y + r + 13 / Math.sqrt(k));
        }
      }
      ctx.globalAlpha = 1;
      void dim;
    };
    draw.current();
  }, [graph, current, opts.nodeSize, opts.linkWidth, opts.textFade]);

  // Pan, zoom, hover, drag, click
  useEffect(() => {
    const c = canvas.current;
    const toWorld = (ev) => {
      const r = c.getBoundingClientRect();
      const { x, y, k } = view.current;
      return [(ev.clientX - r.left - r.width / 2 - x) / k, (ev.clientY - r.top - r.height / 2 - y) / k];
    };
    const pick = (ev) => {
      const [wx, wy] = toWorld(ev);
      let best = null;
      for (const n of sim.current?.nodes() || []) {
        const d = Math.hypot(n.x - wx, n.y - wy);
        if (d < (n.r || 6) + 4 && (!best || d < best.d)) best = { n, d };
      }
      return best?.n || null;
    };
    let drag = null;
    let moved = false;
    const down = (ev) => {
      const n = pick(ev);
      moved = false;
      drag = n ? { node: n } : { pan: true, sx: ev.clientX, sy: ev.clientY, ox: view.current.x, oy: view.current.y };
      if (n) {
        n.fx = n.x;
        n.fy = n.y;
        sim.current.alphaTarget(0.25).restart();
      }
      c.setPointerCapture(ev.pointerId);
    };
    const move = (ev) => {
      if (drag?.node) {
        const [wx, wy] = toWorld(ev);
        drag.node.fx = wx;
        drag.node.fy = wy;
        moved = true;
      } else if (drag?.pan) {
        view.current.x = drag.ox + ev.clientX - drag.sx;
        view.current.y = drag.oy + ev.clientY - drag.sy;
        moved = moved || Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 3;
        draw.current();
      } else {
        const n = pick(ev);
        if (n !== hover.current) {
          hover.current = n;
          c.style.cursor = n ? 'pointer' : 'grab';
          draw.current();
        }
      }
    };
    const up = (ev) => {
      if (drag?.node) {
        drag.node.fx = null;
        drag.node.fy = null;
        sim.current.alphaTarget(0);
        if (!moved) onOpen(drag.node.id);
      }
      drag = null;
      c.releasePointerCapture?.(ev.pointerId);
    };
    const wheel = (ev) => {
      ev.preventDefault();
      const r = c.getBoundingClientRect();
      const v = view.current;
      const k2 = Math.min(6, Math.max(0.15, v.k * Math.exp(-ev.deltaY * 0.0015)));
      const mx = ev.clientX - r.left - r.width / 2;
      const my = ev.clientY - r.top - r.height / 2;
      v.x = mx - ((mx - v.x) * k2) / v.k;
      v.y = my - ((my - v.y) * k2) / v.k;
      v.k = k2;
      draw.current();
    };
    const resize = () => draw.current();
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false });
    addEventListener('resize', resize);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('wheel', wheel);
      removeEventListener('resize', resize);
    };
  }, [onOpen]);

  const reset = () => {
    setOpts(DEFAULTS);
    view.current = { x: 0, y: 0, k: 1 };
  };
  const flip = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  return (
    <main className="main">
      <header className="topbar">
        {sidebarHidden && <button className="icon-btn" onClick={onShowSidebar} title="Show sidebar"><Icon name="sidebar" /></button>}
        <nav className="crumbs"><span className="crumb"><Icon name="graph" /> Graph view</span></nav>
        <span className="status">{graph ? `${graph.nodes.length} pages · ${graph.edges.length} links` : ''}</span>
        <button className={'icon-btn' + (panel ? ' pressed' : '')} title="Graph settings" onClick={() => setPanel((p) => !p)}><Icon name="menu" /></button>
      </header>
      <div className="graph-wrap" ref={wrap}>
        <canvas ref={canvas} className="graph-canvas" />
        {panel && (
          <div className="graph-panel">
            <Section title="Filters" open={open.filters} onToggle={() => flip('filters')}>
              <label className="ip-search gp-search"><Icon name="search" /><input value={opts.search} onChange={(e) => set('search', e.target.value)} placeholder="Search pages…" /></label>
              <Toggle label="Sub-page links" value={opts.childLinks} onChange={(v) => set('childLinks', v)} />
              <Toggle label="Orphans" value={opts.orphans} onChange={(v) => set('orphans', v)} />
            </Section>
            <Section title="Display" open={open.display} onToggle={() => flip('display')}>
              <Slider label="Text fade threshold" value={opts.textFade} min={0} max={1} step={0.05} onChange={(v) => set('textFade', v)} />
              <Slider label="Node size" value={opts.nodeSize} min={0.4} max={2.5} step={0.1} onChange={(v) => set('nodeSize', v)} />
              <Slider label="Link thickness" value={opts.linkWidth} min={0.3} max={3} step={0.1} onChange={(v) => set('linkWidth', v)} />
            </Section>
            <Section title="Forces" open={open.forces} onToggle={() => flip('forces')}>
              <Slider label="Center force" value={opts.center} min={0} max={0.4} step={0.01} onChange={(v) => set('center', v)} />
              <Slider label="Repel force" value={opts.repel} min={20} max={600} step={10} onChange={(v) => set('repel', v)} />
              <Slider label="Link force" value={opts.linkForce} min={0} max={1.5} step={0.05} onChange={(v) => set('linkForce', v)} />
              <Slider label="Link distance" value={opts.linkDistance} min={20} max={250} step={5} onChange={(v) => set('linkDistance', v)} />
            </Section>
            <div className="gp-foot">
              <button className="link-btn" onClick={reset}>Reset to defaults</button>
            </div>
          </div>
        )}
        <div className="graph-hint">Scroll to zoom · drag to move · click a dot to open the page · dashed = sub-page</div>
      </div>
    </main>
  );
}
