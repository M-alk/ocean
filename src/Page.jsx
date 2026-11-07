import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import Editor from './Editor.jsx';
import IconPicker from './IconPicker.jsx';
import PageIcon from './PageIcon.jsx';
import { Icon } from './icons.jsx';
import SlidePanel from './SlidePanel.jsx';
import PageMenu from './PageMenu.jsx';
import SlideViewer from './SlideViewer.jsx';
import Widget from './widget.jsx';
import { visualFrame, visualTitle, isHtml } from './visual.js';
import { importPdfSlides } from './pdf-import.js';

// How exam-importance highlights (=={!!!}text== …) are shown.
const EXAM_VIEWS = [
  { id: 'show', label: 'Show importance', hint: 'Colour what matters for the exam' },
  { id: 'focus3', label: 'Focus: must know', hint: 'Fade everything except must-know points' },
  { id: 'focus2', label: 'Focus: must know + important', hint: 'Fade the rest of the note' },
  { id: 'focus1', label: 'Focus: everything marked', hint: 'Fade text that isn’t marked' },
  { id: 'hide', label: 'Hide importance', hint: 'Plain note, no exam colours' },
];

function ExamMenu({ view, counts, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => !ref.current?.contains(e.target) && !e.target.closest('.exam-btn') && onClose();
    const esc = (e) => e.key === 'Escape' && onClose();
    addEventListener('mousedown', away);
    addEventListener('keydown', esc);
    return () => { removeEventListener('mousedown', away); removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <div className="popover exam-menu" ref={ref}>
      {EXAM_VIEWS.map((v) => (
        <button key={v.id} className={'pm-item' + (v.id === view ? ' sel' : '')} title={v.hint} onClick={() => { onPick(v.id); onClose(); }}>
          <span className="exam-radio">{v.id === view ? '●' : ''}</span>{v.label}
        </button>
      ))}
      <div className="exam-legend">
        <span><mark className="hl hl-exam" data-tone="!!!">Must know</mark> {counts[3]}</span>
        <span><mark className="hl hl-exam" data-tone="!!">Important</mark> {counts[2]}</span>
        <span><mark className="hl hl-exam" data-tone="!">Good to know</mark> {counts[1]}</span>
      </div>
      <div className="exam-tip">Select text → highlighter in the toolbar to mark it yourself.</div>
    </div>
  );
}

const pref = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

const SLIDE_FILE = /\.(pdf|pptx?|key|odp)$/i;

export default function Page({ pages, childPages = [], path, vaultDir, changeTick, onRenamed, onOpenPage, onTrash, crumbs, sidebarHidden, onShowSidebar, toast, onTreeChanged, isFavorite, onToggleFavorite, onDuplicated }) {
  const [page, setPage] = useState(null);
  const [bodyText, setBodyText] = useState(''); // current text, to see which sub-pages it already links to
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [examMenu, setExamMenu] = useState(false);
  const [examView, setExamViewState] = useState(() => pref.get('ocean.exam', 'show'));
  const setExamView = (v) => { setExamViewState(v); pref.set('ocean.exam', v); };
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState(false);
  const [dragging, setDragging] = useState(false);
  const editor = useRef(null);
  const pending = useRef(null); // markdown waiting to be saved
  const timer = useRef(null);
  const lastBody = useRef(null); // what we believe is on disk
  const titleRef = useRef(null);
  const fileInput = useRef(null);
  const htmlInput = useRef(null);
  const scroller = useRef(null);

  // ---- slides next to the note ----
  const [slides, setSlides] = useState([]);
  const [slideSource, setSlideSource] = useState(null);
  const [slidePending, setSlidePending] = useState(null); // a PDF in slides/ that isn't imported yet
  const [slideImport, setSlideImport] = useState(null); // { done, total } while importing
  const importing = useRef(false);
  const [viewerAt, setViewerAt] = useState(null); // slide number the full-screen viewer is open at
  const [slidesOpen, setSlidesOpen] = useState(() => pref.get('ocean.slidesOpen', true));
  const [inlineHidden, setInlineHidden] = useState(() => pref.get('ocean.slidesCompact', true));
  const [quizzesHidden, setQuizzesHidden] = useState(() => pref.get('ocean.quizzesHidden', false));
  useEffect(() => pref.set('ocean.quizzesHidden', quizzesHidden), [quizzesHidden]);
  // Slide images in the note: on (full pictures) or off (small "▣ Slide N" tags).
  const [slideImgsHidden, setSlideImgsHidden] = useState(() => pref.get('ocean.hideSlideImages', false));
  useEffect(() => pref.set('ocean.hideSlideImages', slideImgsHidden), [slideImgsHidden]);
  const slideImgsRef = useRef(slideImgsHidden);
  slideImgsRef.current = slideImgsHidden;
  const [panelWidth, setPanelWidth] = useState(() => Math.max(300, pref.get('ocean.slidesWidth', 420)));
  const [active, setActive] = useState(null);
  const [follow, setFollow] = useState(true);
  const [usedIn, setUsedIn] = useState(new Map());
  useEffect(() => pref.set('ocean.slidesOpen', slidesOpen), [slidesOpen]);
  useEffect(() => pref.set('ocean.slidesCompact', inlineHidden), [inlineHidden]);
  useEffect(() => pref.set('ocean.slidesWidth', panelWidth), [panelWidth]);
  const loadSlides = useCallback(
    () =>
      api.slideList(path).then(
        (r) => {
          setSlides(r.items);
          setSlideSource(r.source);
          setSlidePending(r.pending || null);
        },
        () => { setSlides([]); setSlidePending(null); },
      ),
    [path],
  );
  useEffect(() => { loadSlides(); }, [loadSlides]);
  // New slide images (imported here, or copied in by an AI) replace their "not added yet" tags straight away.
  useEffect(() => { if (slides.length) editor.current?.retryMissing(); }, [slides]);
  useEffect(() => {
    const dir = path.replace(/\.md$/, '/slides/');
    if (changeTick && [...changeTick.paths].some((p) => p.startsWith(dir))) loadSlides();
  }, [changeTick, path, loadSlides]);
  // ---- interactive widgets (```widget blocks), shown in the side panel for the section being read ----
  const [interactiveOn, setInteractiveOnState] = useState(() => pref.get('ocean.interactive', true));
  const setInteractiveOn = (v) => { pref.set('ocean.interactive', v); setInteractiveOnState(v); };
  const widgets = useMemo(() => {
    const out = [];
    const lines = (bodyText || '').split('\n');
    let heading = '';
    for (let i = 0; i < lines.length; i++) {
      const h = /^#{1,2}\s+(.+?)\s*$/.exec(lines[i]); // sections and sub-sections (### repeats, e.g. "Main intuition")
      if (h) heading = h[1].replace(/[*_`]/g, '').trim();
      if (/^\`\`\`widget\s*$/.test(lines[i])) {
        const body = [];
        for (i++; i < lines.length && !/^\`\`\`\s*$/.test(lines[i]); i++) body.push(lines[i]);
        const source = body.join('\n');
        out.push({ source, heading, title: isHtml(source) ? visualTitle(source) : /^\s*title:\s*(.+)$/m.exec(source)?.[1] || 'Interactive' });
      }
    }
    return out;
  }, [bodyText]);
  // The widget for the section being read (-1 = this section has none), or one pinned by clicking its chip.
  const [sectionWidget, setSectionWidget] = useState(-1);
  const [pinnedWidget, setPinnedWidget] = useState(-1);
  const currentHeading = useRef('');
  const shownWidget = pinnedWidget >= 0 ? pinnedWidget : sectionWidget;
  const showPanel = slidesOpen && (slides.length > 0 || pref.get('ocean.slidesOpenEmpty', false));

  // Which slide is the reader looking at? The last slide reference above the upper third of the screen.
  const lockUntil = useRef(0);
  // While scrolling fast the current slide can change every frame; apply it at most every 150 ms so the page and the
  // slide panel don't redraw on every frame.
  const nextActive = useRef(null);
  const activeTimer = useRef(0);
  const examCounts = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0 };
    for (const m of (bodyText || '').matchAll(/==\{(!{1,3})\}/g)) c[m[1].length]++;
    return c;
  }, [bodyText]);
  const hasExam = examCounts[1] + examCounts[2] + examCounts[3] > 0;
  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;
  const syncFromScroll = useCallback((full = false) => {
    // Interactive: only the section you're reading (its nearest # / ## heading) — sections without a widget show none.
    const ws = widgetsRef.current;
    if (scroller.current) {
      const line = scroller.current.getBoundingClientRect().top + scroller.current.clientHeight * 0.35;
      const heads = [...scroller.current.querySelectorAll('.editor-host .ProseMirror > :is(h1,h2)')].filter((h) => h.offsetParent !== null);
      let here = '';
      for (const h of heads) if (h.getBoundingClientRect().top <= line) here = h.textContent.trim();
      if (here !== currentHeading.current) {
        currentHeading.current = here;
        setPinnedWidget(-1); // moving to another section releases a widget opened from its chip
      }
      setSectionWidget(ws.findIndex((w) => w.heading === here));
    }
    const all = editor.current?.slideRefs() || [];
    const refs = all.filter((r) => r.el.offsetParent !== null); // hidden sections don't count
    if (full) {
      // Which slides the note uses (for the panel's "in note" labels): only on the slow timer, not every scroll frame.
      const counts = new Map();
      for (const r of all) counts.set(r.n, (counts.get(r.n) || 0) + 1);
      setUsedIn((old) => (JSON.stringify([...old]) === JSON.stringify([...counts]) ? old : counts));
    }
    if (!refs.length || !scroller.current) return;
    if (Date.now() < lockUntil.current) return; // a slide was just picked; let the scroll finish
    const line = scroller.current.getBoundingClientRect().top + scroller.current.clientHeight * 0.35;
    let cur = refs[0].n;
    for (const r of refs) if (r.el.getBoundingClientRect().top <= line) cur = r.n;
    // At the very bottom, the last slide on screen wins (it may never reach the reading line).
    const sc = scroller.current;
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) {
      const bottom = sc.getBoundingClientRect().bottom;
      for (const r of refs) if (r.el.getBoundingClientRect().top < bottom) cur = r.n;
    }
    nextActive.current = cur;
    if (full) {
      setFollow(true);
      setActive(cur);
    } else if (!activeTimer.current) {
      activeTimer.current = setTimeout(() => {
        activeTimer.current = 0;
        setFollow(true);
        setActive(nextActive.current);
      }, 150);
    }
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => syncFromScroll());
    };
    el.addEventListener('scroll', on, { passive: true });
    syncFromScroll(true);
    const t = setInterval(() => syncFromScroll(true), 1500); // picks up edits and late-loading images
    return () => {
      el.removeEventListener('scroll', on);
      clearInterval(t);
      clearTimeout(activeTimer.current);
      activeTimer.current = 0;
      cancelAnimationFrame(raf);
    };
  }, [syncFromScroll, page]);
  // Highlight the note's references to the active slide.
  useEffect(() => {
    for (const r of editor.current?.slideRefs() || []) r.el.classList.toggle('slide-current', r.n === active);
  }, [active, usedIn]);
  /** Slide clicked in the panel: jump to where the note uses it. */
  const pickSlide = (n) => {
    setFollow(false);
    setActive(n);
    const ref = (editor.current?.slideRefs() || []).find((r) => r.n === n);
    if (ref) {
      // Put it at the reading line (35% from the top), the same place scrolling uses to pick a slide.
      const sc = scroller.current;
      const top = ref.el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - sc.clientHeight * 0.3;
      lockUntil.current = Date.now() + 1200;
      sc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      ref.el.classList.remove('flash');
      void ref.el.offsetWidth;
      ref.el.classList.add('flash');
    } else toast(`Slide ${n} isn't used in this note yet.`);
  };
  /** Slide reference clicked in the note: show it in the panel. */
  const onSlideClick = useCallback((n) => {
    // With slide images hidden, a slide tag opens the slide full size; otherwise it shows it in the panel.
    if (slideImgsRef.current) return setViewerAt(n);
    setSlidesOpen(true);
    setFollow(true);
    setActive(n);
  }, []);

  // ---- which version: Detailed (Page.md), Short (Page.short.md) or Recall (Page.recall.md) ----
  const [variant, setVariantState] = useState(() => pref.get('ocean.variant', 'detailed'));
  const setVariant = (v) => {
    pref.set('ocean.variant', v);
    setVariantState(v);
  };
  const docPath = variant === 'detailed' ? path : path.replace(/\.md$/, `.${variant}.md`);
  const [docMissing, setDocMissing] = useState(false);

  // ---- reading mode: one section at a time ----
  const [reading, setReadingState] = useState(() => pref.get('ocean.reading', false));
  const setReading = (v) => { pref.set('ocean.reading', v); setReadingState(v); };
  const [sections, setSections] = useState([]); // [{ start, end, title }] over the editor's top-level blocks
  const [sec, setSec] = useState(0);
  useEffect(() => setSec(0), [docPath]);
  useEffect(() => {
    if (!reading) return;
    let mo;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const pm = scroller.current?.querySelector('.editor-host .ProseMirror');
      if (!pm) return;
      const kids = [...pm.children];
      let heads = kids.map((k, i) => (k.tagName === 'H1' ? i : -1)).filter((i) => i >= 0);
      if (heads.length < 2) heads = kids.map((k, i) => (k.tagName === 'H2' ? i : -1)).filter((i) => i >= 0);
      const out = [];
      const intro = heads.length ? heads[0] : kids.length;
      // Content before the first heading (overview) is a section of its own, if it has anything in it.
      if (intro > 0 && kids.slice(0, intro).some((k) => k.textContent.trim() || k.querySelector('img, .milkdown-code-block'))) {
        out.push({ start: 0, end: intro - 1, title: 'Overview' });
      }
      heads.forEach((h, j) => out.push({ start: h, end: (heads[j + 1] ?? kids.length) - 1, title: kids[h].textContent.trim() || `Section ${j + 1}` }));
      setSections((old) => (JSON.stringify(old) === JSON.stringify(out) ? old : out));
    };
    const attach = () => {
      const pm = scroller.current?.querySelector('.editor-host .ProseMirror');
      if (!pm) return setTimeout(attach, 200);
      compute();
      mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(compute); });
      mo.observe(pm, { childList: true });
    };
    attach();
    return () => { mo?.disconnect(); cancelAnimationFrame(raf); };
  }, [reading, docPath, page, docMissing]);
  const current = sections[Math.min(sec, sections.length - 1)];
  // Show only the current section's blocks (CSS by position, so the editor's own elements are never touched).
  useEffect(() => {
    let el = document.getElementById('reader-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'reader-style';
      document.head.append(el);
    }
    el.textContent = reading && current
      ? `.reading-mode .editor-host .ProseMirror > :nth-child(-n+${current.start}) { display: none !important; }
         .reading-mode .editor-host .ProseMirror > :nth-child(n+${current.end + 2}) { display: none !important; }`
      : '';
    return () => { el.textContent = ''; };
  }, [reading, current]);
  const goSection = (i) => {
    if (!sections.length) return;
    setSec(Math.max(0, Math.min(sections.length - 1, i)));
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 0 }));
  };
  useEffect(() => {
    if (!reading) return;
    const key = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); goSection(sec + 1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goSection(sec - 1); }
      if (e.key === 'Escape') setReading(false);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  // ---- load ----
  useEffect(() => {
    let live = true;
    setPage(null);
    setError('');
    setConflict(false);
    setDocMissing(false);
    (async () => {
      try {
        const main = await api.page(path);
        let doc = main;
        if (docPath !== path) {
          doc = await api.page(docPath).catch(() => null);
          if (!doc) {
            if (live) setDocMissing(true);
            doc = { body: '' };
          }
        }
        if (!live) return;
        setPage({ ...main, body: doc.body });
        setBodyText(doc.body);
        setTitle(main.title);
        lastBody.current = doc.body;
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => {
      live = false;
    };
  }, [path, docPath]);

  // ---- save (debounced) ----
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const md = pending.current;
    if (md == null) return;
    pending.current = null;
    setStatus('Saving…');
    try {
      await api.save(docPath, { body: md });
      lastBody.current = md;
      setStatus('Saved');
    } catch (e) {
      setStatus('Save failed: ' + e.message);
    }
  }, [docPath]);
  useEffect(() => () => flush(), [flush]);
  useEffect(() => {
    const beforeUnload = () => pending.current != null && flush();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [flush]);

  const onChange = useCallback(
    (md) => {
      pending.current = md;
      setBodyText(md);
      setStatus('Editing…');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );

  // ---- the file changed on disk (AI, Obsidian, git…) ----
  const reloadFromDisk = useCallback(async () => {
    if (docPath !== path) {
      const meta = await api.page(path).catch(() => null);
      if (meta) setPage((old) => (old ? { ...old, icon: meta.icon } : old));
    }
    const p = await api.page(docPath).catch(() => null);
    if (!p) return;
    if (docMissing) {
      // An AI just wrote this version: show it.
      setDocMissing(false);
      lastBody.current = p.body;
      setBodyText(p.body);
      setPage((old) => (old ? { ...old, body: p.body } : old));
      return;
    }
    if (docPath === path) setPage((old) => (old ? { ...old, icon: p.icon } : old));
    if (p.body === lastBody.current) return;
    if (pending.current != null) return setConflict(true);
    lastBody.current = p.body;
    setBodyText(p.body);
    editor.current?.replace(p.body);
    setStatus('Updated from file');
  }, [path, docPath, docMissing]);
  useEffect(() => {
    if (changeTick?.paths.has(docPath) || (docPath !== path && changeTick?.paths.has(path))) reloadFromDisk();
  }, [changeTick, path, docPath, reloadFromDisk]);

  // ---- title / icon ----
  useLayoutEffect(() => {
    const t = titleRef.current;
    if (t) {
      t.style.height = '0';
      t.style.height = t.scrollHeight + 'px';
    }
  }, [title, page]);
  const commitTitle = async () => {
    const clean = title.trim() || 'Untitled';
    if (!page || clean === page.title) return setTitle(page?.title ?? clean);
    await flush();
    try {
      const next = await api.rename(path, clean);
      onRenamed(path, next.path);
    } catch (e) {
      toast(e.message);
      setTitle(page.title);
    }
  };
  const setIcon = async (icon) => {
    setPicker(false);
    setPage((p) => ({ ...p, icon }));
    await api.save(path, { icon });
    onTreeChanged?.();
  };

  // ---- slides ----
  // PDFs are turned into slide images inside the app (no extra tools needed); PowerPoint goes through the server,
  // which needs LibreOffice.
  const runImport = async (work, label) => {
    if (importing.current) return;
    importing.current = true;
    setSlideImport({ done: 0, total: 0, label });
    try {
      const r = await work((done, total) => setSlideImport({ done, total, label }));
      toast(`Imported ${r.count} slides into ${r.folder}/`);
      await loadSlides();
      setSlidesOpen(true);
      // Re-render images that were waiting for these files.
      editor.current?.replace(lastBody.current ?? '');
    } catch (e) {
      toast('Slide import failed: ' + e.message + (/soffice|libreoffice/i.test(e.message) ? ' — export the slides as PDF and drop the PDF instead.' : ''), 12000);
    } finally {
      importing.current = false;
      setSlideImport(null);
    }
  };
  const importSlides = (file) => {
    if (!file) return;
    if (/\.pdf$/i.test(file.name)) return runImport((onProgress) => importPdfSlides(path, { data: file, name: file.name, onProgress }), file.name);
    return runImport(() => api.slides(path, file), file.name);
  };
  // A PDF placed in this page's slides/ folder (e.g. by an AI) is imported as soon as the page is open.
  useEffect(() => {
    if (!slidePending || importing.current) return;
    const url = '/vault/' + slidePending.path.split('/').map(encodeURIComponent).join('/');
    runImport(async (onProgress) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`couldn't open ${slidePending.name}`);
      return importPdfSlides(path, { data: await res.arrayBuffer(), name: slidePending.name, saveSource: false, onProgress });
    }, slidePending.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slidePending, path]);
  // Slides the note links to that aren't in the folder yet.
  const missingSlides = useMemo(() => {
    const have = new Set(slides.map((x) => x.n));
    const refs = new Set();
    for (const m of (bodyText || '').matchAll(/\/slides\/p(\d+)\.(?:jpe?g|png|webp)/gi)) refs.add(Number(m[1]));
    return [...refs].filter((n) => !have.has(n)).length;
  }, [bodyText, slides]);
  const onDrop = (e) => {
    setDragging(false);
    const f = [...(e.dataTransfer?.files || [])].find((x) => SLIDE_FILE.test(x.name));
    if (!f) return;
    e.preventDefault();
    importSlides(f);
  };

  const addHtml = async (file) => {
    if (!file) return;
    const { link } = await api.upload(path, file);
    editor.current?.insertMarkdown(`\n\`\`\`embed\n${link}\n\`\`\`\n`);
    toast('Interactive HTML added. It is saved in this page\'s embeds/ folder.');
  };
  const pasteHtml = async () => {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return toast('Allow clipboard access, or save the HTML as a file and drop it on the page.');
    }
    if (!/<(html|body|div|svg|script|style|section|main)\b/i.test(text)) return toast('The clipboard does not contain HTML.');
    const name = (/<title>([^<]+)<\/title>/i.exec(text)?.[1] || 'interactive').trim().slice(0, 60);
    await addHtml(new File([text], `${name}.html`, { type: 'text/html' }));
  };

  /** "/page": create a sub-page, link it here, then open it. */
  const newSubpage = useCallback(
    async (insertLink) => {
      await flush();
      const { path: child } = await api.create(path, 'Untitled');
      const rel = child.split('/').slice(-2).join('/'); // "<This page>/Untitled.md", relative to this page
      insertLink(`[${child.split('/').pop().replace(/\.md$/, '')}](<${rel}>)`);
      setTimeout(async () => {
        await flush();
        await onTreeChanged?.();
        onOpenPage(child);
        setTimeout(() => {
          const t = document.querySelector('.page-title');
          t?.focus();
          t?.select();
        }, 200);
      }, 900);
    },
    [path, flush, onOpenPage, onTreeChanged],
  );

  const copyPath = async () => {
    setMenu(false);
    await navigator.clipboard.writeText(`${vaultDir}/${path}`);
    toast('File path copied. Paste it to your AI to read or edit this page.');
  };
  const [locked, setLocked] = useState(() => pref.get('ocean.locked', []).includes(path));
  const toggleLock = () => {
    const list = pref.get('ocean.locked', []).filter((p) => p !== path);
    if (!locked) list.push(path);
    pref.set('ocean.locked', list);
    setLocked(!locked);
  };
  const copy = async (text, msg) => {
    await navigator.clipboard.writeText(text);
    toast(msg);
  };
  const file = `${vaultDir}/${path}`;
  const slidesFile = `${vaultDir}/${path.replace(/\.md$/, '')}/slides/slides.md`;
  const aiPrompts = [
    {
      icon: 'page', label: 'Write notes from the slides',
      text: `Read the lecture slides in "${slidesFile}" (text) and the slide images next to it, then write clear study notes into "${file}". Follow the rules in "${vaultDir}/CLAUDE.md" ("Every lecture note = 4 things"): the detailed note with slides under each section and a quiz per section, exam-importance marks on the key phrases, plus the Short read (.short.md) and the Recall sheet (.recall.md) next to it. Run the checklist before you reply.`,
    },
    {
      icon: 'help', label: 'Add a quiz after each section',
      text: `Open "${file}". After each top-level section, add a \`\`\`quiz block with 3–4 multiple-choice questions about that section, using the quiz format in "${vaultDir}/CLAUDE.md". Base questions only on what the section says, and add a one-line explanation for each answer. Don't change anything else.`,
    },
    {
      icon: 'bolt', label: 'Make an interactive explainer',
      text: `Read "${file}". Pick the concept that is hardest to understand from text and build one self-contained interactive HTML explainer for it (sliders or step-through, small quiz at the end, dark-mode support). Save it in "${vaultDir}/${path.replace(/\.md$/, '')}/embeds/" and add a \`\`\`embed block for it in the right section of the note.`,
    },
    {
      icon: 'edit', label: 'Make an exam summary',
      text: `Read "${file}" and add a final section "Exam summary": must-know definitions, key comparisons as tables, and formulas. Keep it to one screen.`,
    },
  ];
  const versionPrompt = (v) =>
    v === 'short'
      ? `Read the detailed note "${file}" and write its SHORT READ version to "${vaultDir}/${path.replace(/\.md$/, '.short.md')}" (create the file). Follow the rules in "${vaultDir}/CLAUDE.md" (section "Note versions"). Don't change the detailed note.`
      : `Read the detailed note "${file}" and write its RECALL / exam summary version to "${vaultDir}/${path.replace(/\.md$/, '.recall.md')}" (create the file). Follow the rules in "${vaultDir}/CLAUDE.md" (section "Note versions"). Don't change the detailed note.`;
  const menuItems = [
    [
      { icon: 'link', label: 'Copy link', hint: '⌘L', run: () => copy(location.href, 'Link copied.') },
      { icon: 'copy', label: 'Copy page contents', run: () => copy(pending.current ?? lastBody.current ?? '', 'Page copied as Markdown.') },
      { icon: 'copy', label: 'Duplicate', hint: '⌘D', run: async () => onDuplicated((await api.duplicate(path)).path) },
    ],
    [
      ...(slides.length ? [{ icon: 'expand', label: 'Open slides', hint: '⌘⇧O', run: () => setViewerAt(active ?? slides[0].n) }] : []),
      { icon: 'slides', label: 'Import slides (PDF / PowerPoint)', run: () => fileInput.current.click() },
      { icon: 'bolt', label: 'Add HTML file', run: () => htmlInput.current.click() },
      { icon: 'bolt', label: 'Paste HTML from ChatGPT', run: pasteHtml },
    ],
    [
      {
        icon: 'bolt', label: 'Use with AI',
        children: [
          { icon: 'copy', label: 'Copy file path', run: copyPath },
          { icon: 'help', label: 'Set up Claude for Ocean…', run: () => onOpenPage('Use Ocean with Claude.md') },
          ...aiPrompts.map((p) => ({ icon: p.icon, label: `Prompt: ${p.label}`, run: () => copy(p.text, 'Prompt copied. Paste it into Claude or ChatGPT.') })),
          { icon: 'bolt', label: 'Prompt: Add interactive widgets', run: () => copy(`Read "${file}". For the 1–4 ideas that are hardest to get from text (equations with parameters, algorithms, worked examples), add a \`\`\`widget block at the end of that sub-section, following "Interactive widgets" in "${vaultDir}/CLAUDE.md". Ocean shows each one beside its section while the student reads it. Don't change the rest of the note.`, 'Prompt copied. Paste it into Claude (with access to your notes folder).') },
          { icon: 'edit', label: 'Prompt: Mark what matters for the exam', run: () => copy(`Read "${file}" (and the slides in its folder if there are any). Mark exam importance with highlights, following "Highlights and exam importance" in "${vaultDir}/CLAUDE.md": =={!!!}…== for must-know points, =={!!}…== for important ones, =={!}…== for good-to-know details. Mark short phrases (a term, a key sentence, a formula's meaning), not whole paragraphs, and be selective. Don't change any other text.`, 'Prompt copied. Paste it into Claude (with access to your notes folder).') },
          { icon: 'page', label: 'Prompt: Write the short read', run: () => copy(versionPrompt('short'), 'Prompt copied.') },
          { icon: 'page', label: 'Prompt: Write the recall summary', run: () => copy(versionPrompt('recall'), 'Prompt copied.') },
        ],
      },
      { icon: 'page', label: 'Export as PDF', hint: '⌘P', run: () => setTimeout(() => window.print(), 50) },
    ],
    [
      { icon: 'image', label: 'Show slide images', toggle: !slideImgsHidden, run: () => setSlideImgsHidden((v) => !v) },
      { icon: 'help', label: 'Show quizzes', toggle: !quizzesHidden, run: () => setQuizzesHidden((v) => !v) },
      { icon: 'lock', label: 'Lock page', toggle: locked, run: toggleLock },
      { icon: 'trash', label: 'Move to Trash', danger: true, run: () => onTrash() },
    ],
  ];
  useEffect(() => {
    const key = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'l' && !e.shiftKey) { e.preventDefault(); copy(location.href, 'Link copied.'); }
      if (k === 'o' && e.shiftKey && slides.length) { e.preventDefault(); setViewerAt(active ?? slides[0].n); }
      if (k === 'd' && !e.shiftKey) { e.preventDefault(); api.duplicate(path).then((r) => onDuplicated(r.path)); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  return (
    <main
      className={'main' + (dragging ? ' dragging' : '')}
      onDragOver={(e) => {
        if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file' && /pdf|presentation|powerpoint|keynote/i.test(i.type))) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
    >
      <header className="topbar">
        {sidebarHidden && (
          <button className="icon-btn" onClick={onShowSidebar} title="Show sidebar"><Icon name="sidebar" /></button>
        )}
        <nav className="crumbs">
          {crumbs.map((c, i) => (
            <span key={c.path} className="crumb-wrap">
              {i > 0 && <span className="crumb-sep">/</span>}
              <button className="crumb" onClick={() => c.type === 'page' && onOpenPage(c.path)}>
                {c.type === 'page' && <span className="crumb-icon"><PageIcon icon={c.icon} pagePath={c.path} size={16} /></span>}
                <span>{c.name}</span>
              </button>
            </span>
          ))}
        </nav>
        <span className="status">{status}</span>
        <button className={'top-btn' + (reading ? ' on' : '')} onClick={() => setReading(!reading)} title="Read one section at a time (← → to move, Esc to exit)">
          <Icon name="book" /> Sections
        </button>
        <button className={'top-btn' + (slideImgsHidden ? '' : ' on')} onClick={() => setSlideImgsHidden((v) => !v)} title={slideImgsHidden ? 'Show slide images in the note' : 'Hide slide images (keep small slide tags)'}>
          <Icon name={slideImgsHidden ? 'imageOff' : 'image'} /> {slideImgsHidden ? 'Images off' : 'Images'}
        </button>
        <button className={'top-btn' + (quizzesHidden ? '' : ' on')} onClick={() => setQuizzesHidden((v) => !v)} title="Show or hide every quiz on this page">
          {quizzesHidden ? 'Quizzes hidden' : 'Quizzes'}
        </button>
        {widgets.length > 0 && (
          <button className={'top-btn' + (interactiveOn ? ' on' : '')} onClick={() => setInteractiveOn(!interactiveOn)} title="Show the interactive widget for the section you're reading">
            <Icon name="bolt" /> Interactive
          </button>
        )}
        {hasExam && (
          <div className="menu-wrap">
            <button className={'top-btn exam-btn' + (examView !== 'hide' ? ' on' : '')} onClick={() => setExamMenu((m) => !m)} title="What matters for the exam: show, focus or hide">
              <span className="exam-dot" /> Exam
            </button>
            {examMenu && <ExamMenu view={examView} counts={examCounts} onPick={setExamView} onClose={() => setExamMenu(false)} />}
          </div>
        )}
        <button className={'top-btn' + (showPanel ? ' on' : '')} onClick={() => { pref.set('ocean.slidesOpenEmpty', !showPanel); setSlidesOpen(!showPanel); }} title="Show the lecture slides next to the note">
          <Icon name="slides" /> Slides
        </button>
        {locked && <span className="lock-chip"><Icon name="lock" /> Locked</span>}
        <button className="icon-btn" title="Copy link" onClick={() => copy(location.href, 'Link copied.')}><Icon name="link" /></button>
        <button className={'icon-btn' + (isFavorite ? ' fav' : '')} title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'} onClick={onToggleFavorite}>
          <Icon name={isFavorite ? 'starFill' : 'star'} />
        </button>
        <div className="menu-wrap">
          <button className={'icon-btn' + (menu ? ' pressed' : '')} onClick={() => setMenu((m) => !m)} title="Style, export, and more"><Icon name="menu" /></button>
          {menu && <PageMenu items={menuItems} onClose={() => setMenu(false)} />}
        </div>
        <input ref={htmlInput} type="file" accept=".html,.htm" hidden onChange={(e) => { addHtml(e.target.files[0]); e.target.value = ''; }} />
        <input ref={fileInput} type="file" accept=".pdf,.ppt,.pptx,.key,.odp" hidden onChange={(e) => { importSlides(e.target.files[0]); e.target.value = ''; }} />
      </header>

      {conflict && (
        <div className="banner">
          This page changed on disk while you were typing.
          <button onClick={async () => { pending.current = null; setConflict(false); lastBody.current = null; await reloadFromDisk(); }}>Load file version</button>
          <button onClick={async () => { setConflict(false); pending.current ??= lastBody.current; await flush(); }}>Keep mine</button>
        </div>
      )}

      <div className="body-row">
      <div onClick={(e) => {
            // Click anywhere around the text (margins, below the last line) to start typing there, like Notion.
            if (e.target.closest('.ProseMirror, button, a, input, textarea, select, label, .page-head, .subpages, .embed-wrap, .quiz, .popover, .milkdown-slash-menu, .milkdown-block-handle, .milkdown-toolbar')) return;
            if (!e.target.closest('.page')) return;
            editor.current?.focusAt(e.clientX, e.clientY);
          }} className={'scroller' + (slideImgsHidden && !showPanel ? ' no-slide-refs' : slideImgsHidden || (showPanel && inlineHidden) ? ' compact-slides' : '') + (quizzesHidden ? ' hide-quizzes' : '') + (reading ? ' reading-mode' : '') + (hasExam ? ' exam-' + examView : '') + (slideImport ? ' slides-importing' : '')} ref={scroller}>
        {error && <div className="page-error">{error}</div>}
        {slideImport ? (
          <div className="slide-bar">
            <Icon name="slides" />
            <span>Importing slides from <b>{slideImport.label}</b>{slideImport.total ? ` — ${slideImport.done} of ${slideImport.total}` : '…'}</span>
            <span className="slide-bar-track"><span style={{ width: slideImport.total ? (100 * slideImport.done) / slideImport.total + '%' : '4%' }} /></span>
          </div>
        ) : missingSlides > 0 && !slidePending ? (
          <div className="slide-bar">
            <Icon name="slides" />
            <span>This note uses {missingSlides} slide{missingSlides === 1 ? '' : 's'} that {missingSlides === 1 ? "isn't" : "aren't"} here yet. {slides.length ? 'Add the full lecture PDF to fill them in.' : 'Add the lecture PDF to show them.'}</span>
            <button className="slide-bar-btn" onClick={() => fileInput.current.click()}>Add lecture PDF</button>
          </div>
        ) : null}
        {page && (
          <article className="page">
            <div className={'page-head' + (page.icon ? ' has-icon' : '')}>
              <div className="icon-anchor">
                {page.icon && (
                  <button className="page-icon" onClick={() => setPicker(true)}><PageIcon icon={page.icon} pagePath={path} size={72} /></button>
                )}
                <div className="page-controls">
                  {!page.icon && <button onClick={() => setPicker(true)}><Icon name="smile" /> Add icon</button>}
                </div>
                {picker && <IconPicker pagePath={path} onPick={setIcon} onClose={() => setPicker(false)} />}
              </div>
              <textarea
                ref={titleRef}
                className="page-title"
                readOnly={locked}
                rows={1}
                value={title}
                placeholder="Untitled"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                    editor.current?.focus();
                  }
                }}
              />
            </div>
            <VariantSwitch value={variant} onChange={(v) => { flush(); setVariant(v); }} />
            {reading && current && !docMissing && (
              <div className="reader-bar">
                <div className="reader-progress"><span style={{ width: `${((sec + 1) / sections.length) * 100}%` }} /></div>
                <div className="reader-head">
                  <select value={Math.min(sec, sections.length - 1)} onChange={(e) => goSection(Number(e.target.value))} aria-label="Go to section">
                    {sections.map((x, i) => <option key={i} value={i}>{x.title}</option>)}
                  </select>
                  <span className="reader-count">{Math.min(sec, sections.length - 1) + 1} / {sections.length}</span>
                </div>
              </div>
            )}
            {docMissing ? (
              <VersionEmpty
                variant={variant}
                onWrite={() => setDocMissing(false)}
                onCopyPrompt={() => copy(versionPrompt(variant), 'Prompt copied. Paste it into Claude (with access to your notes folder).')}
                onShowDetailed={() => setVariant('detailed')}
              />
            ) : (
            <Editor ref={editor} key={docPath} pagePath={docPath} body={page.body} onChange={onChange} onOpenPage={onOpenPage} onSlideClick={onSlideClick} onSlideOpen={(n) => slides.length && setViewerAt(n)} onWidgetClick={(src) => {
              const i = widgetsRef.current.findIndex((w) => w.source.trim() === String(src).trim());
              if (i >= 0) { setInteractiveOn(true); setPinnedWidget(i); }
            }} pages={pages} onNewSubpage={newSubpage} onPickHtml={() => htmlInput.current.click()} readOnly={locked || reading} />
            )}
            {reading && current && !docMissing && (
              <div className="reader-nav">
                <button disabled={sec <= 0} onClick={() => goSection(sec - 1)}>
                  <span className="reader-nav-k">← Previous</span>
                  <span className="reader-nav-t">{sections[sec - 1]?.title || ' '}</span>
                </button>
                <button className="next" disabled={sec >= sections.length - 1} onClick={() => goSection(sec + 1)}>
                  <span className="reader-nav-k">Next →</span>
                  <span className="reader-nav-t">{sections[sec + 1]?.title || 'Done'}</span>
                </button>
              </div>
            )}
            {/* Like Notion: every sub-page shows in its parent, even if the text doesn't link to it yet. */}
            {(() => {
              let text = bodyText;
              try { text += decodeURIComponent(bodyText); } catch { /* keep raw */ }
              const unlinked = variant !== 'detailed' ? [] : childPages.filter((c) => !text.includes(`${c.name}.md`));
              return unlinked.length ? (
                <div className="subpages">
                  {unlinked.map((c) => (
                    <button key={c.path} className="subpage-row" onClick={() => onOpenPage(c.path)} title={c.path}>
                      <PageIcon icon={c.icon} pagePath={c.path} size={22} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </article>
        )}
      </div>
      {interactiveOn && shownWidget >= 0 && widgets[shownWidget] && (
        <InteractivePanel widget={widgets[shownWidget]} pinned={pinnedWidget >= 0} onClose={() => (pinnedWidget >= 0 ? setPinnedWidget(-1) : setInteractiveOn(false))} />
      )}
      {showPanel && (
        <SlidePanel
          slides={slides}
          active={active}
          follow={follow}
          usedIn={usedIn}
          inlineHidden={inlineHidden}
          onToggleInline={() => setInlineHidden((v) => !v)}
          onPick={pickSlide}
          onImport={() => fileInput.current.click()}
          onOpenViewer={(n) => setViewerAt(n ?? active ?? slides[0]?.n)}
          onClose={() => { pref.set('ocean.slidesOpenEmpty', false); setSlidesOpen(false); }}
          width={panelWidth}
          onResize={setPanelWidth}
        />
      )}
      </div>
      {viewerAt != null && slides.length > 0 && (
        <SlideViewer title={page?.title || ''} slides={slides} source={slideSource} start={viewerAt} onClose={() => setViewerAt(null)} />
      )}
      {dragging && <div className="drop-hint">Drop a PDF or PowerPoint to import its slides into this page's folder</div>}
    </main>
  );
}

const VARIANTS = [
  ['detailed', 'Detailed'],
  ['short', 'Short'],
  ['recall', 'Recall'],
];
/** Detailed · Short · Recall — three independent versions of the same page. */
function VariantSwitch({ value, onChange }) {
  return (
    <div className="variant-switch" role="tablist" aria-label="Note version">
      {VARIANTS.map(([v, label]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => value !== v && onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}
function VersionEmpty({ variant, onWrite, onCopyPrompt, onShowDetailed }) {
  const what = variant === 'short' ? 'a short read — the key ideas in a few minutes' : 'a recall sheet — what to remember for the exam';
  return (
    <div className="version-empty">
      <p className="version-empty-title">No {variant === 'short' ? 'short read' : 'recall summary'} yet</p>
      <p className="muted">This version is {what}. It's a separate text, so it never changes your detailed note.</p>
      <div className="version-empty-actions">
        <button className="primary" onClick={onCopyPrompt}>Copy prompt for your AI</button>
        <button onClick={onWrite}>Write it myself</button>
        <button onClick={onShowDetailed}>Show detailed</button>
      </div>
    </div>
  );
}

/** The interactive widget for the section you're reading — its own column, only when that section has one. */
function InteractivePanel({ widget, pinned, onClose }) {
  return (
    <aside className="interactive-col" aria-label="Interactive">
      <div className="ic-head">
        <Icon name="bolt" />
        <span className="ic-for" title={widget.heading}>{widget.heading || 'Interactive'}</span>
        <button className="icon-btn" onClick={onClose} title={pinned ? 'Close' : 'Turn interactive off'}><Icon name="close" /></button>
      </div>
      <div className="ic-body">
        {isHtml(widget.source) ? <VisualFrame key={widget.source} html={widget.source} /> : <Widget key={widget.source} source={widget.source} />}
      </div>
    </aside>
  );
}

/** A free-form HTML visual in its sandboxed frame. */
function VisualFrame({ html }) {
  const box = useRef(null);
  useEffect(() => {
    box.current?.replaceChildren(visualFrame(html));
  }, [html]);
  return <div className="visual-mount" ref={box} />;
}
