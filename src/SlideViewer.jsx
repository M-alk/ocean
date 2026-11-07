// Full-screen slide viewer in the style of Notion's PDF viewer:
// file name, zoom, full screen, close, download — slides stacked, with a tick navigator on the left.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';

const ZOOMS = [0.25, 0.39, 0.5, 0.75, 1, 1.25, 1.5, 2];
const url = (p) => '/vault/' + p.split('/').map(encodeURIComponent).join('/');

export default function SlideViewer({ title, slides, source, start, onClose }) {
  const [zoom, setZoom] = useState(null); // null = fit width
  const [natural, setNatural] = useState(1467);
  const [width, setWidth] = useState(1000);
  const [current, setCurrent] = useState(start ?? slides[0]?.n);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [full, setFull] = useState(false);
  const root = useRef(null);
  const scroller = useRef(null);
  const didJump = useRef(false);

  // Fit-to-width measures the viewer, leaving room for the navigator.
  useLayoutEffect(() => {
    const measure = () => setWidth(Math.max(200, (scroller.current?.clientWidth || 1000) - 140));
    measure();
    addEventListener('resize', measure);
    return () => removeEventListener('resize', measure);
  }, []);
  const fit = Math.min(1, width / natural);
  const scale = zoom ?? fit;
  const slideWidth = Math.round(natural * scale);

  const jump = useCallback((n, smooth = true) => {
    const el = scroller.current?.querySelector(`[data-n="${n}"]`);
    if (!el) return;
    scroller.current.scrollTo({ top: el.offsetTop - 80, behavior: smooth ? 'smooth' : 'auto' });
    setCurrent(n);
  }, []);

  // Open at the requested slide.
  useEffect(() => {
    if (didJump.current || start == null) return;
    didJump.current = true;
    requestAnimationFrame(() => jump(start, false));
  }, [start, jump, slideWidth]);

  // Track the slide in view.
  useEffect(() => {
    const sc = scroller.current;
    const on = () => {
      const mid = sc.scrollTop + sc.clientHeight * 0.4;
      let cur = slides[0]?.n;
      for (const el of sc.querySelectorAll('[data-n]')) if (el.offsetTop <= mid) cur = Number(el.dataset.n);
      setCurrent(cur);
    };
    sc.addEventListener('scroll', on, { passive: true });
    return () => sc.removeEventListener('scroll', on);
  }, [slides]);

  // Keyboard: Esc closes, arrows move, +/- zoom.
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
      const i = slides.findIndex((s) => s.n === current);
      if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); if (slides[i + 1]) jump(slides[i + 1].n); }
      if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); if (slides[i - 1]) jump(slides[i - 1].n); }
      if (e.key === '+' || e.key === '=') setZoom((z) => ZOOMS.find((v) => v > (z ?? fit) + 0.001) ?? ZOOMS.at(-1));
      if (e.key === '-') setZoom((z) => [...ZOOMS].reverse().find((v) => v < (z ?? fit) - 0.001) ?? ZOOMS[0]);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [slides, current, jump, onClose, fit]);

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen?.());

  // Keep the current slide in place when zooming.
  const setZoomKeep = (z) => {
    setZoom(z);
    setZoomOpen(false);
    requestAnimationFrame(() => jump(current, false));
  };

  return (
    <div className="viewer" ref={root} role="dialog" aria-label={`${title} slides`}>
      <div className="viewer-bar">
        <div className="viewer-pill viewer-title">
          <span className="viewer-file"><Icon name="slides" />{source && <small>{source.name.split('.').pop().toUpperCase()}</small>}</span>
          <span className="viewer-name">{source ? source.name.replace(/\.[^.]+$/, '') : title}</span>
          <span className="viewer-count">{slides.findIndex((s) => s.n === current) + 1} / {slides.length}</span>
        </div>
        <span className="ip-spacer" />
        <div className="viewer-pill zoom-pill">
          <button onClick={() => setZoomOpen((o) => !o)}>{Math.round(scale * 100)}% <Icon name="down" /></button>
          {zoomOpen && (
            <div className="popover viewer-zooms">
              <button onClick={() => setZoomKeep(null)} className={zoom == null ? 'on' : ''}>Fit width</button>
              {ZOOMS.map((z) => (
                <button key={z} onClick={() => setZoomKeep(z)} className={zoom === z ? 'on' : ''}>{Math.round(z * 100)}%</button>
              ))}
            </div>
          )}
        </div>
        <div className="viewer-pill">
          <button title={full ? 'Exit full screen' : 'Full screen'} onClick={toggleFull}><Icon name={full ? 'collapse' : 'expand'} /></button>
          <button title="Close (Esc)" onClick={() => (document.fullscreenElement ? document.exitFullscreen().then(onClose) : onClose())}><Icon name="close" /></button>
        </div>
        {source && (
          <div className="viewer-pill">
            <a title={`Download ${source.name}`} href={url(source.path)} download={source.name}><Icon name="download" /></a>
          </div>
        )}
      </div>

      <div className="viewer-body" ref={scroller}>
        <nav className="viewer-ticks" aria-label="Slides">
          {slides.map((s) => (
            <button key={s.n} className={'tick' + (s.n === current ? ' on' : '')} title={`Slide ${s.n}`} onClick={() => jump(s.n)} />
          ))}
        </nav>
        <div className="viewer-pages">
          {slides.map((s) => (
            <figure key={s.n} data-n={s.n} className="viewer-page" style={{ width: slideWidth }}>
              <img src={url(s.path)} alt={`Slide ${s.n}`} loading="lazy" onLoad={(e) => s.n === slides[0].n && setNatural(e.currentTarget.naturalWidth || 1467)} />
              <figcaption>{s.n}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
