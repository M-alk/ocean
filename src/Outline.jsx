import { useEffect, useRef, useState } from 'react';

// Notion-style outline on the right edge: one dash per heading (the one you're reading is lit).
// Hover it to see the headings; click one to jump there.
const HEADINGS = '.editor-host .ProseMirror > :is(h1, h2, h3)';

export default function Outline({ scroller }) {
  const [heads, setHeads] = useState([]); // [{ level, text }]
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const els = useRef([]);
  const card = useRef(null);
  const closeTimer = useRef(null);

  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let frame = 0;
    let timer = 0;
    const update = () => {
      frame = 0;
      const line = sc.getBoundingClientRect().top + Math.min(120, sc.clientHeight * 0.25);
      let i = 0;
      els.current.forEach((h, k) => {
        if (h.getBoundingClientRect().top <= line) i = k;
      });
      // At the very bottom, the last heading is the one you're reading even if it can't reach the line.
      if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4 && els.current.length) i = els.current.length - 1;
      setActive(i);
    };
    const collect = () => {
      els.current = [...sc.querySelectorAll(HEADINGS)].filter((h) => h.offsetParent !== null && h.textContent.trim());
      const list = els.current.map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim() }));
      setHeads((old) => (JSON.stringify(old) === JSON.stringify(list) ? old : list));
      update();
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(collect, 300);
    });
    mo.observe(sc, { childList: true, subtree: true, characterData: true });
    sc.addEventListener('scroll', onScroll, { passive: true });
    collect();
    return () => {
      mo.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      sc.removeEventListener('scroll', onScroll);
    };
  }, [scroller]);

  // Show the heading you're reading when the list opens.
  useEffect(() => {
    if (open) card.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  if (heads.length < 2) return null;
  const top = Math.min(...heads.map((h) => h.level));
  const go = (i) => {
    const sc = scroller.current;
    const h = els.current[i];
    if (!sc || !h) return;
    sc.scrollTo({ top: h.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 24, behavior: 'smooth' });
  };
  const show = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <nav className={'outline' + (open ? ' open' : '')} aria-label="Outline" onMouseEnter={show} onMouseLeave={hide}>
      <div className="outline-dashes" aria-hidden="true">
        {heads.map((h, i) => (
          <span key={i} className={`l${Math.min(2, h.level - top)}` + (i === active ? ' on' : '')} />
        ))}
      </div>
      {open && (
        <div className="outline-card" ref={card}>
          {heads.map((h, i) => (
            <button key={i} className={`l${Math.min(2, h.level - top)}` + (i === active ? ' on' : '')} onClick={() => go(i)}>
              {h.text}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
