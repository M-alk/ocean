import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Crepe } from '@milkdown/crepe';
import { CodeMirrorBlock } from '@milkdown/kit/component/code-block';
import { replaceAll, insert } from '@milkdown/kit/utils';
import { remarkStringifyOptionsCtx, commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { Selection } from '@milkdown/kit/prose/state';
import { clearTextInCurrentBlockCommand, addBlockTypeCommand, hrSchema } from '@milkdown/kit/preset/commonmark';
import { api, vaultUrl, resolveLink, embedUrl } from './api.js';
import { quizPlaceholder, hydrateQuizzes, QUIZ_TEMPLATE } from './quiz.js';
import { toEditor, fromEditor } from './markdown-images.js';
import { visualFrame, visualTitle, isHtml } from './visual.js';
import { highlightPlugins, openHighlightMenu, closeHighlightMenu, currentTone, HIGHLIGHT_ICON } from './highlight.js';
import { parseIcon, iconMaskUrl } from './PageIcon.jsx';
import { prepareImage, readClipboardImage, isUnnamed } from './clipboard-image.js';

const svg = (d) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const svgText = (t, size = 11) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-family="-apple-system, Helvetica, sans-serif" font-size="${size}" font-weight="600" fill="currentColor">${t}</text></svg>`;
// Line icons in the style of Notion's slash menu.
const ICONS = {
  page: svg('M7 3.5h7l4 4v13H7z M14 3.5v4h4 M9.5 12h6 M9.5 15.5h6'),
  quiz: svg('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17h.01'),
  html: svg('M5 4.5h11l3 3v12H5z M9.5 11l-2 2 2 2 M14.5 11l2 2-2 2 M12.6 10.5l-1.2 5'),
  text: svgText('Aa', 11),
  h1: svgText('H1'),
  h2: svgText('H2'),
  h3: svgText('H3'),
  h4: svgText('H4'),
  h5: svgText('H5'),
  h6: svgText('H6'),
  quote: svg('M6 6.5v11 M10 8h8 M10 12h8 M10 16h5'),
  divider: svg('M4 12h16'),
  bullet: svg('M5 7h.01 M5 12h.01 M5 17h.01 M9 7h10 M9 12h10 M9 17h10'),
  numbered: svgText('1.', 12),
  todo: svg('M5 5h14v14H5z M8.5 12l2.5 2.5 4.5-5'),
  image: svg('M4 5h16v14H4z M4 16l5-5 4 4 2.5-2.5L20 17 M15.5 9h.01'),
  paste: svg('M9 3.5h6v3H9z M9 5H6v15h12V5h-3 M9 11.5h6 M9 15h4'),
  code: svg('M9 7l-5 5 5 5 M15 7l5 5-5 5'),
  table: svg('M4 5h16v14H4z M4 10h16 M4 14.5h16 M10 5v14'),
  math: svg('M4 12h3l3 7 4-14h6'),
};
const WIDGET_TEMPLATE = [
  'title: Try it',
  'slider a = 2 in 0..10 step 0.5 "a"',
  'slider b = 3 in 0..10 step 0.5 "b"',
  'value "a × b" = a * b',
  'formula: a \\times b = [[a*b]]',
].join('\n');
// Shortcut hints shown on the right of slash-menu items, like Notion.
const SLASH_HINTS = {
  Text: '', 'Heading 1': '#', 'Heading 2': '##', 'Heading 3': '###', 'Heading 4': '####', 'Heading 5': '#####', 'Heading 6': '######',
  Quote: '"', Divider: '---', 'Bulleted list': '-', 'Numbered list': '1.', 'To-do list': '[]', 'Code': '```', 'Math equation': '$$',
};

// ---------- mermaid diagrams ----------
let mermaidReady;
let mermaidSeq = 0;
function renderMermaid(code, apply) {
  mermaidReady ||= import('mermaid').then(({ default: m }) => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    m.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'inherit' });
    return m;
  });
  mermaidReady
    .then((m) => m.render(`mmd-${++mermaidSeq}`, code))
    .then(({ svg }) => {
      const el = document.createElement('div');
      el.className = 'mermaid-preview';
      el.innerHTML = svg;
      apply(el);
    })
    .catch((err) => apply(`<pre class="mermaid-error">${String(err.message || err).replace(/</g, '&lt;')}</pre>`));
}

// ---------- interactive HTML embeds ----------
// A note embeds interactive HTML with a code block:
//   ```embed
//   Week 3 Word Embeddings/embeds/gradient_descent.html
//   ```
// The file runs in a sandboxed frame (no access to the app or other files) that grows to fit its content.
addEventListener('message', (e) => {
  const h = e.data?.leafEmbedHeight;
  if (typeof h !== 'number') return;
  for (const f of document.querySelectorAll('iframe.embed-frame, iframe.visual-frame')) {
    if (f.contentWindow === e.source) f.style.height = Math.min(Math.max(h, 24), 20000) + 'px';
  }
});
function renderEmbed(pagePath, content) {
  const link = content.trim().split('\n')[0].trim().replace(/^<|>$/g, '');
  const wrap = document.createElement('div');
  wrap.className = 'embed-wrap';
  const bar = document.createElement('div');
  bar.className = 'embed-bar';
  bar.textContent = '⚡ ' + decodeURIComponent(link.split('/').pop());
  const open = document.createElement('a');
  open.href = embedUrl(pagePath, link);
  open.target = '_blank';
  open.rel = 'noopener';
  open.textContent = 'Open full screen ↗';
  bar.append(open);
  wrap.append(bar); // the sandboxed <iframe> is added by the editor once this is on the page
  return wrap;
}

const SLIDE_SRC = /\/slides\/p(\d+)\.(?:jpe?g|png|webp)(?:[?#].*)?$/i;
/** Slide number a link/image points at, e.g. ".../slides/p19.jpg" → 19. */
// Code blocks (maths, diagrams, quizzes…) are built when they scroll into view. The editor normally throws them away
// 5 s after they leave the screen and rebuilds them on the way back, which made scrolling stutter and diagrams reload.
// Keep them for 30 minutes instead.
CodeMirrorBlock.TEARDOWN_DELAY = 30 * 60 * 1000;

export const slideOf = (url) => {
  try {
    const m = SLIDE_SRC.exec(decodeURIComponent(url || ''));
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
};

/**
 * Notion-like block editor whose source of truth is Markdown.
 * It only reports a change when the user actually edited something, so opening a page never rewrites the file.
 */
const Editor = forwardRef(function Editor({ pagePath, body, onChange, onOpenPage, onSlideClick, onSlideOpen, onNewSubpage, onPickHtml, onToast, readOnly, pages, onWidgetClick }, ref) {
  const onWidgetClickRef = useRef(onWidgetClick);
  onWidgetClickRef.current = onWidgetClick;
  const pagesRef = useRef(new Map());
  pagesRef.current = new Map((pages || []).map((p) => [p.path, p]));
  const onSlideOpenRef = useRef(onSlideOpen);
  onSlideOpenRef.current = onSlideOpen;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;
  const host = useRef(null);
  const crepeRef = useRef(null);
  const baseline = useRef(null);
  const edited = useRef(false);
  const silent = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSlideClickRef = useRef(onSlideClick);
  onSlideClickRef.current = onSlideClick;
  const actions = useRef({});
  actions.current = { onNewSubpage, onPickHtml, onToast };
  // Save pasted or dropped files next to the page and put them where the cursor is:
  // images (screenshots, copied pictures) go to the page's assets/ folder, HTML files to embeds/.
  const addFiles = useRef(null);
  addFiles.current = async (list) => {
    for (const f of list) {
      try {
        const html = /\.html?$/i.test(f.name);
        const { link } = await api.upload(pagePath, html ? f : await prepareImage(f));
        const alt = isUnnamed(f) ? 'Pasted image' : f.name.replace(/\.[^.]+$/, '');
        const md = html ? `\n\`\`\`embed\n${link}\n\`\`\`\n` : `\n![${alt}](<${link}>)\n`;
        crepeRef.current?.editor.action(insert(toEditor(md)));
      } catch (e) {
        actions.current.onToast?.(`Couldn't add ${f.name || 'the image'}: ${e.message}`);
      }
    }
  };

  useImperativeHandle(ref, () => ({
    /** Replace content after the file changed on disk (e.g. an AI edited it). */
    replace(md) {
      const c = crepeRef.current;
      if (!c) return;
      silent.current = true;
      c.editor.action(replaceAll(toEditor(md), true));
      baseline.current = c.getMarkdown();
      edited.current = false; // now matches the file on disk
      silent.current = false;
    },
    insertMarkdown(md) {
      crepeRef.current?.editor.action(insert(toEditor(md)));
    },
    focus() {
      host.current?.querySelector('.ProseMirror')?.focus();
    },
    /** Put the cursor at the line nearest a click (used for clicks in the page margins and below the text). */
    focusAt(x, y) {
      crepeRef.current?.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (!view.editable) return;
        const r = view.dom.getBoundingClientRect();
        let sel;
        if (y >= r.bottom - 6) sel = Selection.atEnd(view.state.doc);
        else {
          const hit = view.posAtCoords({ left: Math.min(Math.max(x, r.left + 4), r.right - 4), top: Math.max(y, r.top + 2) });
          sel = hit ? Selection.near(view.state.doc.resolve(hit.pos)) : Selection.atEnd(view.state.doc);
        }
        view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
        view.focus();
      });
    },
    /** Try images that failed to load again (e.g. slides that have just been added to the folder). */
    retryMissing() {
      for (const img of host.current?.querySelectorAll('[data-missing] img') || []) {
        const src = img.getAttribute('src');
        if (!src) continue;
        // A fresh query string makes the browser ask again instead of reusing the failed result.
        img.src = src.replace(/([?&])_r=\d+/, '').replace(/[?&]$/, '') + (src.includes('?') ? '&' : '?') + '_r=' + Date.now();
      }
    },
    /** Every place in the note that refers to a slide, top to bottom. */
    slideRefs() {
      // Slide images carry data-slide; slide links are recognised by their address. Kept in page order.
      const els = [...(host.current?.querySelectorAll('[data-slide], a[href*="slides/p"]') || [])];
      return els.map((el) => ({ el, n: Number(el.dataset.slide) || slideOf(el.getAttribute('href')) })).filter((r) => r.n);
    },
  }));

  useEffect(() => {
    let destroyed = false;
    const upload = async (file) => (await api.upload(pagePath, await prepareImage(file))).link;
    const crepe = new Crepe({
      root: host.current,
      defaultValue: toEditor(body),
      featureConfigs: {
        [Crepe.Feature.BlockEdit]: {
          // Notion's names and line icons for the built-in blocks.
          textGroup: {
            label: 'Basic blocks',
            text: { label: 'Text', icon: ICONS.text },
            h1: { label: 'Heading 1', icon: ICONS.h1 },
            h2: { label: 'Heading 2', icon: ICONS.h2 },
            h3: { label: 'Heading 3', icon: ICONS.h3 },
            h4: null,
            h5: null,
            h6: null,
            quote: { label: 'Quote', icon: ICONS.quote },
            divider: null, // shown under Suggested instead
          },
          listGroup: {
            label: 'Lists',
            bulletList: { label: 'Bulleted list', icon: ICONS.bullet },
            orderedList: { label: 'Numbered list', icon: ICONS.numbered },
            taskList: { label: 'To-do list', icon: ICONS.todo },
          },
          advancedGroup: {
            label: 'Media & more',
            image: { label: 'Image', icon: ICONS.image },
            codeBlock: { label: 'Code', icon: ICONS.code },
            table: { label: 'Table', icon: ICONS.table },
            math: { label: 'Math equation', icon: ICONS.math },
          },
          // Extra slash commands: "/p" or "/page", "/quiz", "/html".
          buildMenu: (builder) => {
            const clear = (ctx) => ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
            // Show our group first, like Notion's "Suggested".
            const build = builder.build;
            builder.build = () => {
              const groups = build();
              return [...groups.filter((g) => g.key === 'suggested'), ...groups.filter((g) => g.key !== 'suggested')];
            };
            builder
              .addGroup('suggested', 'Suggested')
              .addItem('page', {
                label: 'Page',
                icon: ICONS.page,
                onRun: (ctx) => {
                  clear(ctx);
                  actions.current.onNewSubpage?.((md) => crepeRef.current?.editor.action(insert(md)));
                },
              })
              .addItem('clipboard', {
                label: 'Paste image · Screenshot',
                icon: ICONS.paste,
                onRun: async (ctx) => {
                  clear(ctx);
                  try {
                    const file = await readClipboardImage();
                    if (file) return addFiles.current([file]);
                    actions.current.onToast?.('No image on the clipboard. Press ⌃⇧⌘4 to copy a screenshot (or copy a picture), then try again.', 6000);
                  } catch (e) {
                    actions.current.onToast?.(e.message, 6000);
                  }
                },
              })
              .addItem('html', {
                label: 'HTML · Embeds',
                icon: ICONS.html,
                onRun: (ctx) => {
                  clear(ctx);
                  actions.current.onPickHtml?.();
                },
              })
              .addItem('divider', {
                label: 'Divider',
                icon: ICONS.divider,
                onRun: (ctx) => {
                  clear(ctx);
                  ctx.get(commandsCtx).call(addBlockTypeCommand.key, { nodeType: hrSchema.type(ctx) });
                },
              })
              .addItem('widget', {
                label: 'Interactive · Side panel',
                icon: ICONS.html,
                onRun: (ctx) => {
                  clear(ctx);
                  crepeRef.current?.editor.action(insert(`\n\`\`\`widget\n${WIDGET_TEMPLATE}\n\`\`\`\n`));
                },
              })
              .addItem('quiz', {
                label: 'Quiz · Multiple choice',
                icon: ICONS.quiz,
                onRun: (ctx) => {
                  clear(ctx);
                  crepeRef.current?.editor.action(insert(`\n\`\`\`quiz\n${QUIZ_TEMPLATE}\n\`\`\`\n`));
                },
              });
          },
        },
        [Crepe.Feature.Toolbar]: {
          // A highlighter next to bold/italic: colours, plus exam importance (must know / important / good to know).
          buildToolbar: (builder) => {
            builder.getGroup('formatting').addItem('highlight', {
              icon: HIGHLIGHT_ICON,
              label: 'Highlight / exam importance (⌘⇧H)',
              active: (ctx) => !!currentTone(ctx.get(editorViewCtx).state),
              onRun: (ctx) => openHighlightMenu(ctx.get(editorViewCtx)),
            });
          },
        },
        [Crepe.Feature.Placeholder]: { text: 'Press / to insert blocks', mode: 'block' },
        [Crepe.Feature.ImageBlock]: {
          proxyDomURL: (url) => vaultUrl(pagePath, url),
          onUpload: upload,
          inlineOnUpload: upload,
          blockOnUpload: upload,
          blockCaptionPlaceholderText: 'Add a caption…',
        },
        [Crepe.Feature.CodeMirror]: {
          renderPreview: (language, content, apply) => {
            const lang = language?.toLowerCase();
            if (!content.trim()) return null;
            if (lang === 'embed') return renderEmbed(pagePath, content);
            if (lang === 'quiz') return quizPlaceholder(content);
            if (lang === 'visual') {
              // Free-form HTML/SVG shown in the note; the live frame is added after the preview is on the page.
              const mount = document.createElement('div');
              mount.className = 'visual-mount';
              // Encoded: the preview sanitiser drops attribute values that contain HTML tags.
              mount.setAttribute('data-visual', encodeURIComponent(content));
              return mount;
            }
            if (lang === 'widget') {
              // Interactive widgets live beside their section; the note shows a small chip that opens it.
              const chip = document.createElement('div');
              chip.className = 'widget-chip';
              chip.setAttribute('data-widget', encodeURIComponent(content));
              const title = isHtml(content) ? visualTitle(content) : /^\s*title:\s*(.+)$/m.exec(content)?.[1] || 'Interactive';
              chip.textContent = '▶ ' + title;
              return chip;
            }
            if (lang === 'mermaid') {
              renderMermaid(content, apply);
              return undefined;
            }
            return null;
          },
          previewOnlyByDefault: true,
        },
      },
    });
    crepe.editor.use(highlightPlugins);
    // Write Markdown the way Obsidian and most AIs do ("- item", "*italic*").
    crepe.editor.config((ctx) =>
      ctx.update(remarkStringifyOptionsCtx, (prev) => ({ ...prev, bullet: '-', emphasis: '*', rule: '-' })),
    );
    crepe.on((l) =>
      l.markdownUpdated((_ctx, md) => {
        if (silent.current || baseline.current === null) return;
        // Ignore the editor's own tidy-up right after opening, but once you've edited, every change is saved
        // (including undoing back to how the page started).
        if (md === baseline.current && !edited.current) return;
        edited.current = true;
        onChangeRef.current(fromEditor(md));
      }),
    );
    crepe.create().then(() => {
      if (destroyed) return;
      crepeRef.current = crepe;
      baseline.current = crepe.getMarkdown();
      if (readOnlyRef.current) crepe.setReadonly(true);
    });
    return () => {
      destroyed = true;
      crepeRef.current = null;
      baseline.current = null;
      closeHighlightMenu();
      crepe.destroy();
    };
    // A new editor per page; later content changes come through replace().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagePath]);

  useEffect(() => {
    const el = host.current;

    // Tag every slide image / slide link with its number, so the slide panel can follow along.
    const tag = () => {
      for (const img of el.querySelectorAll('img')) {
        const n = slideOf(img.getAttribute('src'));
        const box = img.closest('.milkdown-image-block, .milkdown-image-inline') || img.parentElement;
        // Only touch the attribute when it changes: every write makes the browser restyle the page.
        if (n) { if (box.dataset.slide !== String(n)) box.dataset.slide = n; }
        else if (box.dataset.slide) delete box.dataset.slide;
      }
      // Quizzes and embeds come out of the editor's preview sanitiser without their behaviour; bring them to life here.
      hydrateQuizzes(el);
      for (const mount of el.querySelectorAll('.visual-mount')) {
        const src = decodeURIComponent(mount.getAttribute('data-visual') || '');
        if (mount._live === src) continue;
        mount._live = src;
        mount.replaceChildren(visualFrame(src));
      }
      // The preview sanitizer strips <iframe>, so embeds get their frame added here, after rendering.
      for (const wrap of el.querySelectorAll('.embed-wrap')) {
        const link = wrap.querySelector('.embed-bar a');
        if (!link) continue;
        link.target = '_blank';
        if (wrap.querySelector('iframe')) continue;
        const frame = document.createElement('iframe');
        frame.className = 'embed-frame';
        frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals');
        frame.src = link.getAttribute('href') + '?inline'; // inline = styled like the note
        frame.setAttribute('allowtransparency', 'true');
        wrap.append(frame);
      }
      // Links are left untouched: the editor redraws them whenever they change, which would wipe
      // anything added here. They're styled by address in CSS instead (see the page-icon stylesheet below).
    };
    let t;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(tag, 120);
    });
    mo.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href'] });
    tag();

    // Images that point at files not in the vault yet (e.g. a slide before its PDF is added) get a placeholder.
    const mark = (e) => {
      if (e.target.tagName !== 'IMG') return;
      const box = e.target.closest('.milkdown-image-block, .milkdown-image-inline') || e.target.parentElement;
      if (e.type === 'error') {
        const src = e.target.getAttribute('src') || '';
        const n = slideOf(src);
        let web = null;
        try { web = /^https?:/i.test(src) ? new URL(src).host : null; } catch { /* not a web address */ }
        // slide = waiting for the lecture PDF · web = a picture on another site (e.g. left behind by a Notion import)
        box.dataset.missingKind = n ? 'slide' : web ? 'web' : 'file';
        box.dataset.missing = n ? `Slide ${n}` : web || decodeURIComponent(src.split(/[?#]/)[0].split('/').pop() || 'image');
      } else {
        delete box.dataset.missing;
        delete box.dataset.missingKind;
      }
    };
    const click = (e) => {
      // Clicking anything that refers to a slide shows that slide in the panel.
      const chip = e.target.closest('.widget-chip');
      if (chip) {
        e.preventDefault();
        e.stopPropagation();
        onWidgetClickRef.current?.(decodeURIComponent(chip.getAttribute('data-widget') || ''));
        return;
      }
      const ref = e.target.closest('[data-slide]') || e.target.closest('a[href*="slides/p"]');
      const slideN = ref && (Number(ref.dataset.slide) || slideOf(ref.getAttribute('href')));
      if (slideN) onSlideClickRef.current?.(slideN);
      // Double-click a slide in the note to open it full size.
      if (slideN && e.detail === 2) onSlideOpenRef.current?.(slideN);
      // Page links (and lines that are only a page link) open with one click, like Notion.
      const isPage = (x) => x && /\.md(#.*)?$/i.test(x.getAttribute('href') || '') && !/^[a-z]+:/i.test(x.getAttribute('href'));
      let pageLink = e.target.closest('a[href]');
      if (!isPage(pageLink)) {
        const p = e.target.closest('p');
        const only = p?.querySelector('a[href]');
        pageLink = isPage(only) && p.textContent.trim() === only.textContent.trim() ? only : null;
      }
      if (pageLink && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        onOpenPage(resolveLink(pagePath, pageLink.getAttribute('href').replace(/#.*$/, '')));
        return;
      }
      // Other links: ⌘/Ctrl-click to follow (plain click places the cursor).
      const a = e.target.closest('a[href]');
      if (!a || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      const href = a.getAttribute('href');
      if (/^[a-z]+:/i.test(href)) window.open(href, '_blank', 'noopener');
      else if (/\.md(#.*)?$/i.test(href)) onOpenPage(resolveLink(pagePath, href.replace(/#.*$/, '')));
    };
    // Pasted or dropped images and HTML files (see addFiles).
    const files = (e, list) => {
      if (readOnlyRef.current) return;
      const picked = [...(list || [])].filter((f) => f.type.startsWith('image/') || /\.html?$/i.test(f.name));
      if (!picked.length) return;
      e.preventDefault();
      e.stopPropagation();
      addFiles.current(picked);
    };
    const paste = (e) => {
      const data = e.clipboardData;
      // Word, Keynote and Numbers put a picture of copied text on the clipboard too: paste the text then.
      const text = data?.getData('text/plain')?.trim();
      const names = [...(data?.files || [])].map((f) => f.name);
      if (text && !names.includes(text)) return;
      files(e, data?.files);
    };
    const drop = (e) => files(e, e.dataTransfer?.files);
    el.addEventListener('error', mark, true);
    el.addEventListener('load', mark, true);
    el.addEventListener('click', click, true);
    el.addEventListener('paste', paste, true);
    el.addEventListener('drop', drop, true);
    return () => {
      mo.disconnect();
      clearTimeout(t);
      el.removeEventListener('error', mark, true);
      el.removeEventListener('load', mark, true);
      el.removeEventListener('click', click, true);
      el.removeEventListener('paste', paste, true);
      el.removeEventListener('drop', drop, true);
    };
  }, [pagePath, onOpenPage]);

  useEffect(() => {
    crepeRef.current?.setReadonly(!!readOnly);
  }, [readOnly]);

  // Give each page link its page's icon. Links are matched by address (relative to this page), so the
  // editor's own link elements are never modified.
  useEffect(() => {
    const dir = pagePath.split('/').slice(0, -1);
    const relTo = (target) => {
      const t = target.split('/');
      let i = 0;
      while (i < dir.length && i < t.length - 1 && dir[i] === t[i]) i++;
      return [...dir.slice(i).map(() => '..'), ...t.slice(i)].join('/');
    };
    const q = (s) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
    const rules = [];
    for (const pg of pages || []) {
      const icon = parseIcon(pg.icon);
      if (!icon) continue;
      const rel = relTo(pg.path);
      const sel = [rel, encodeURI(rel)].map((h) => `.editor-host .ProseMirror a[href=${q(h)}]::before`).join(',');
      if (icon.kind === 'emoji') rules.push(`${sel}{content:${q(icon.text)};background:none;-webkit-mask:none;mask:none;width:auto;height:auto;vertical-align:0}`);
      else if (icon.kind === 'icon') {
        const m = iconMaskUrl(icon.id);
        if (m) rules.push(`${sel}{-webkit-mask-image:${m};mask-image:${m};background:var(--icon-${icon.color})}`);
      }
    }
    let tagEl = document.getElementById('page-link-icons');
    if (!tagEl) {
      tagEl = document.createElement('style');
      tagEl.id = 'page-link-icons';
      document.head.append(tagEl);
    }
    tagEl.textContent = rules.join('\n');
  }, [pages, pagePath]);

  useEffect(() => {
    let raf = 0;
    const decorate = () => {
      raf = 0;
      for (const li of document.querySelectorAll('.milkdown-slash-menu .menu-group li[data-index]')) {
        const spans = li.querySelectorAll(':scope > span');
        const label = spans[spans.length - 1]?.textContent?.trim() || '';
        const hint = SLASH_HINTS[label] ?? '';
        if (li.dataset.hint !== hint) li.dataset.hint = hint;
        const badge = label.startsWith('HTML') ? 'New' : '';
        if ((li.dataset.badge || '') !== badge) badge ? (li.dataset.badge = badge) : delete li.dataset.badge;
      }
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(decorate); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  return <div className={'editor-host' + (readOnly ? ' locked' : '')} ref={host} />;
});

export default Editor;
