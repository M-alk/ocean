import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import Sidebar from './Sidebar.jsx';
import Page from './Page.jsx';
import Search from './Search.jsx';
import Home from './Home.jsx';
import Graph from './Graph.jsx';
import { useStudyTimer } from './activity.js';
import Welcome from './Welcome.jsx';

const readHash = () => decodeURIComponent(location.hash.replace(/^#\/?/, ''));
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

function findChain(nodes, target, chain = []) {
  for (const n of nodes) {
    const next = [...chain, n];
    if (n.path === target) return next;
    const hit = findChain(n.children, target, next);
    if (hit) return hit;
  }
  return null;
}
const flatPages = (nodes, out = []) => {
  for (const n of nodes) {
    if (n.type === 'page') out.push({ path: n.path, name: n.name, icon: n.icon });
    flatPages(n.children, out);
  }
  return out;
};

export default function App() {
  const [info, setInfo] = useState(null);
  const [tree, setTree] = useState([]);
  const [current, setCurrent] = useState(readHash());
  const [expanded, setExpanded] = useState(() => new Set(store.get('ocean.expanded', [])));
  const [searching, setSearching] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => store.get('ocean.sidebarHidden', false));
  const [changeTick, setChangeTick] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  useStudyTimer(current);
  // First-run guide (desktop app: until it's finished once; web: once per browser).
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    if (window.oceanDesktop) {
      document.body.classList.add('is-desktop');
      window.oceanDesktop.info().then((d) => d.firstRun && setWelcome(true));
    } else if (!store.get('ocean.welcomed', false)) setWelcome(true);
    const show = () => setWelcome(true);
    addEventListener('ocean:welcome', show);
    return () => removeEventListener('ocean:welcome', show);
  }, []);
  const closeWelcome = () => {
    store.set('ocean.welcomed', true);
    setWelcome(false);
  };
  const [recents, setRecents] = useState(() => store.get('ocean.recents', []));
  const [favorites, setFavorites] = useState(() => store.get('ocean.favorites', []));
  useEffect(() => store.set('ocean.recents', recents), [recents]);
  useEffect(() => store.set('ocean.favorites', favorites), [favorites]);
  const toggleFavorite = useCallback((p) => setFavorites((f) => (f.includes(p) ? f.filter((x) => x !== p) : [...f, p])), []);

  const toast = useCallback((text, ms = 3500) => {
    const id = Date.now();
    setToastMsg({ text, id });
    setTimeout(() => setToastMsg((t) => (t?.id === id ? null : t)), ms);
  }, []);

  const loadTree = useCallback(() => api.tree().then(setTree), []);
  useEffect(() => {
    api.info().then(setInfo);
    loadTree();
  }, [loadTree]);

  // Live updates: anything that changes the vault folder (you, an AI agent, Obsidian, git) shows up here.
  useEffect(() => {
    const es = new EventSource('/api/events');
    es.onmessage = (e) => {
      const { changes } = JSON.parse(e.data);
      setChangeTick({ paths: new Set(changes.map((c) => c.path)), at: Date.now() });
      loadTree();
    };
    return () => es.close();
  }, [loadTree]);

  // Routing via #/path/to/Page.md
  useEffect(() => {
    const on = () => setCurrent(readHash());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  const open = useCallback((path) => {
    setSearching(false);
    location.hash = '/' + encodeURI(path);
  }, []);
  const pages = useMemo(() => flatPages(tree), [tree]);
  const isPage = !!current && current.endsWith('.md');
  // Remember recently opened pages (newest first).
  useEffect(() => {
    if (isPage) setRecents((r) => [current, ...r.filter((x) => x !== current)].slice(0, 20));
  }, [current, isPage]);
  // Forget pages that no longer exist.
  useEffect(() => {
    if (!tree.length) return;
    const have = new Set(pages.map((p) => p.path));
    setRecents((r) => (r.every((x) => have.has(x)) ? r : r.filter((x) => have.has(x))));
    setFavorites((f) => (f.every((x) => have.has(x)) ? f : f.filter((x) => have.has(x))));
  }, [pages, tree.length]);

  const chain = useMemo(() => findChain(tree, current) || [], [tree, current]);
  // Keep the open page's parents expanded.
  useEffect(() => {
    if (chain.length > 1)
      setExpanded((s) => {
        const missing = chain.slice(0, -1).filter((n) => !s.has(n.path));
        return missing.length ? new Set([...s, ...missing.map((n) => n.path)]) : s;
      });
  }, [chain]);
  useEffect(() => store.set('ocean.expanded', [...expanded]), [expanded]);
  useEffect(() => store.set('ocean.sidebarHidden', sidebarHidden), [sidebarHidden]);

  const toggle = (path) =>
    setExpanded((s) => {
      const n = new Set(s);
      n.has(path) ? n.delete(path) : n.add(path);
      return n;
    });

  const newPage = async (parent) => {
    const { path } = await api.create(parent, 'Untitled', '', true);
    if (parent) setExpanded((s) => new Set([...s, parent]));
    await loadTree();
    open(path);
    setTimeout(() => {
      const t = document.querySelector('.page-title');
      t?.focus();
      t?.select();
    }, 150);
  };
  const newFolder = async (parent) => {
    const name = prompt('Folder name');
    if (!name) return;
    await api.folder(parent, name);
    loadTree();
  };
  const trash = async (node) => {
    const p = node?.path || current;
    if (!confirm(`Move "${p.split('/').pop().replace(/\.md$/, '')}" and its sub-pages to the trash folder (.trash)?`)) return;
    await api.trash(p);
    await loadTree();
    if (p === current || current.startsWith(p.replace(/\.md$/, '/'))) {
      history.replaceState(null, '', '#/');
      setCurrent('');
    }
    toast('Moved to .trash inside your notes folder');
  };
  const renamed = (from, to) => {
    setExpanded((s) => new Set([...s].map((p) => (p === from ? to : p))));
    setRecents((r) => r.map((p) => (p === from ? to : p)));
    setFavorites((f) => f.map((p) => (p === from ? to : p)));
    loadTree();
    history.replaceState(null, '', '#/' + encodeURI(to));
    setCurrent(to);
  };

  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching((s) => !s);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setSidebarHidden((h) => !h);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);

  return (
    <div className={'app' + (sidebarHidden ? ' no-sidebar' : '')}>
      {!sidebarHidden && (
        <Sidebar
          info={info}
          tree={tree}
          current={current}
          expanded={expanded}
          toggle={toggle}
          onOpen={open}
          onNew={newPage}
          onNewFolder={newFolder}
          onTrash={trash}
          onSearch={() => setSearching(true)}
          onHide={() => setSidebarHidden(true)}
          pages={pages}
          recents={recents}
          favorites={favorites}
          view={isPage ? 'page' : current === 'graph' ? 'graph' : 'home'}
          onHome={() => { location.hash = '/'; }}
          onGraph={() => { location.hash = '/graph'; }}
          onHelp={() => setWelcome(true)}
          onMove={async (p, parent, before) => {
            try {
              const r = await api.move(p, parent, before);
              if (parent) setExpanded((s) => new Set([...s, parent]));
              await loadTree();
              // Keep the open page open if it (or its parent) moved.
              const oldDir = p.replace(/\.md$/, '/');
              const newDir = r.path.replace(/\.md$/, '/');
              if (current === p) open(r.path);
              else if (current.startsWith(oldDir)) open(newDir + current.slice(oldDir.length));
            } catch (e) {
              toast(e.message);
            }
          }}
        />
      )}
      {isPage ? (
        <Page
          key={current}
          path={current}
          pages={pages}
          childPages={(chain.at(-1)?.children || []).filter((c) => c.type === 'page')}
          vaultDir={info?.vault}
          changeTick={changeTick}
          crumbs={chain.length ? chain : [{ path: current, name: current.split('/').pop().replace(/\.md$/, ''), type: 'page' }]}
          onRenamed={renamed}
          onOpenPage={open}
          onTrash={() => trash()}
          sidebarHidden={sidebarHidden}
          onShowSidebar={() => setSidebarHidden(false)}
          toast={toast}
          onTreeChanged={loadTree}
          isFavorite={favorites.includes(current)}
          onToggleFavorite={() => toggleFavorite(current)}
          onDuplicated={async (p) => { await loadTree(); open(p); }}
        />
      ) : current === 'graph' ? (
        <Graph current={recents[0]} onOpen={open} sidebarHidden={sidebarHidden} onShowSidebar={() => setSidebarHidden(false)} changeTick={changeTick} />
      ) : (
        <Home
          info={info}
          pages={pages}
          recents={recents}
          favorites={favorites}
          onOpen={open}
          onNew={() => newPage('')}
          sidebarHidden={sidebarHidden}
          onShowSidebar={() => setSidebarHidden(false)}
        />
      )}
      {welcome && (
        <Welcome info={info} onClose={closeWelcome} onOpen={(p) => pages.some((x) => x.path === p) && open(p)} />
      )}
      {searching && <Search onOpen={open} onClose={() => setSearching(false)} />}
      {toastMsg && <div className="toast">{toastMsg.text}</div>}
    </div>
  );
}
