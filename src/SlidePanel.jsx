import { useEffect, useRef } from 'react';
import { Icon } from './icons.jsx';

/**
 * The lecture slides, shown next to the note. The highlighted slide follows the section you're reading;
 * clicking a slide jumps to the part of the note that uses it.
 */
export default function SlidePanel({ slides, active, follow, usedIn, inlineHidden, onToggleInline, onPick, onImport, onOpenViewer, onClose, width, onResize}) {
  const list = useRef(null);

  // Keep the active slide in view when the note drives the selection.
  useEffect(() => {
    if (!follow || active == null) return;
    list.current?.querySelector(`[data-n="${active}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [active, follow]);

  const startResize = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev) => onResize(Math.min(Math.max(startW + (startX - ev.clientX), 280), window.innerWidth * 0.7));
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    document.body.classList.add('resizing');
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  return (
    <aside className="slide-panel" style={{ width }}>
      <div className="slide-resizer" onPointerDown={startResize} title="Drag to resize" />
      <div className="slide-head">
        <Icon name="slides" />
        <span className="slide-head-title">Slides{slides.length ? ` · ${slides.length}` : ''}</span>
        {slides.length > 0 && (
          <button className={'chip' + (inlineHidden ? ' on' : '')} onClick={onToggleInline} title="Show slides only here, as small tags in the note">
            Compact note
          </button>
        )}
        {slides.length > 0 && (
          <button className="icon-btn" onClick={() => onOpenViewer()} title="Open slides full size"><Icon name="expand" /></button>
        )}
        <button className="icon-btn" onClick={onClose} title="Close slides"><Icon name="collapse" /></button>
      </div>
      {slides.length === 0 ? (
        <div className="slide-empty">
          <p>No slides for this page yet.</p>
          <p className="muted">Drop the lecture PDF or PowerPoint anywhere on this page, or:</p>
          <button className="primary" onClick={onImport}>Import slides…</button>
        </div>
      ) : (
        <div className="slide-list" ref={list}>
          {slides.map((s) => {
            const uses = usedIn.get(s.n) || 0;
            return (
              <button key={s.file} data-n={s.n} className={'slide-card' + (s.n === active ? ' active' : '')} onClick={() => onPick(s.n)} onDoubleClick={() => onOpenViewer(s.n)} title="Click: jump to it in the note · Double-click: open full size">
                <img src={'/vault/' + s.path.split('/').map(encodeURIComponent).join('/')} alt={`Slide ${s.n}`} loading="lazy" />
                <span className="slide-meta">
                  <span>Slide {s.n}</span>
                  <span className={uses ? 'used' : 'unused'}>{uses ? `in note${uses > 1 ? ` ×${uses}` : ''}` : 'not in note'}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}
