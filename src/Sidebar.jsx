import { useState } from 'react';
import { Icon } from './icons.jsx';
import PageIcon from './PageIcon.jsx';

const pref = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};

// Drag a page to reorder it, or drop it onto another page to move it inside.
const ownDir = (p) => p.replace(/\.md$/, '');
function Node({ node, depth, current, expanded, toggle, onOpen, onNew, onTrash, parentPath = '', nextPath = null, drag }) {
  const isOpen = expanded.has(node.path);
  const active = node.path === current;
  const isPage = node.type === 'page';
  const hint = drag.over?.path === node.path ? drag.over.zone : null;
  const canDrop = () => drag.dragging && drag.dragging !== node.path && !(node.path + '/').startsWith(ownDir(drag.dragging) + '/');
  return (
    <>
      <div
        className={'tree-row' + (active ? ' active' : '') + (hint ? ` drop-${hint}` : '') + (drag.dragging === node.path ? ' dragging-row' : '')}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (isPage ? onOpen(node.path) : toggle(node.path))}
        title={node.path}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', node.name);
          drag.start(node.path);
        }}
        onDragEnd={drag.end}
        onDragOver={(e) => {
          if (!canDrop()) return;
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          const y = (e.clientY - r.top) / r.height;
          drag.hover(node.path, y < 0.28 ? 'before' : y > 0.72 ? 'after' : 'inside');
        }}
        onDrop={(e) => {
          if (!canDrop()) return;
          e.preventDefault();
          const zone = drag.over?.zone || 'inside';
          if (zone === 'inside') drag.drop(node.path, null);
          else if (zone === 'before') drag.drop(parentPath, node.path);
          else drag.drop(parentPath, nextPath);
        }}
      >
        <span className="tree-lead">
          <span className="tree-emoji">{isPage ? <PageIcon icon={node.icon} pagePath={node.path} size={18} /> : <Icon name="folder" />}</span>
          <button
            className={'tree-chevron' + (isOpen ? ' open' : '')}
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.path);
            }}
            aria-label="Expand"
          >
            <Icon name="chevron" />
          </button>
        </span>
        <span className="tree-name">{node.name}</span>
        <span className="tree-actions">
          {isPage && (
            <button title="Move to trash" onClick={(e) => { e.stopPropagation(); onTrash(node); }}>
              <Icon name="trash" />
            </button>
          )}
          <button title="Add a page inside" onClick={(e) => { e.stopPropagation(); onNew(node.path); }}>
            <Icon name="plus" />
          </button>
        </span>
      </div>
      {isOpen &&
        (node.children.length ? (
          node.children.map((c, i) => <Node key={c.path} node={c} depth={depth + 1} parentPath={node.path} nextPath={node.children[i + 1]?.path || null} {...{ current, expanded, toggle, onOpen, onNew, onTrash, drag }} />)
        ) : (
          <div className="tree-empty" style={{ paddingLeft: 36 + depth * 14 }}>No pages inside</div>
        ))}
    </>
  );
}

/** A flat row (Recents, Favorites). */
function Row({ page, active, onOpen }) {
  return (
    <div className={'tree-row' + (active ? ' active' : '')} style={{ paddingLeft: 8 }} onClick={() => onOpen(page.path)} title={page.path}>
      <span className="tree-lead"><span className="tree-emoji"><PageIcon icon={page.icon} pagePath={page.path} size={18} /></span></span>
      <span className="tree-name">{page.name}</span>
    </div>
  );
}

function Section({ id, label, children, action }) {
  const [open, setOpen] = useState(() => pref.get(`ocean.section.${id}`, true));
  const flip = () => { setOpen(!open); pref.set(`ocean.section.${id}`, !open); };
  return (
    <div className="side-section">
      <div className="section-label" onClick={flip}>
        <span>{label}</span>
        <span className="section-tools" onClick={(e) => e.stopPropagation()}>{action}</span>
      </div>
      {open && children}
    </div>
  );
}

export default function Sidebar({ info, tree, pages, current, expanded, toggle, onOpen, onHome, onNew, onNewFolder, onTrash, onSearch, onHide, recents, favorites, view, onGraph, onHelp, onMove }) {
  const [allRecent, setAllRecent] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const drag = {
    dragging,
    over,
    start: (p) => setDragging(p),
    end: () => { setDragging(null); setOver(null); },
    hover: (p, zone) => { if (over?.path !== p || over?.zone !== zone) setOver({ path: p, zone }); },
    drop: (parent, before) => {
      const p = dragging;
      setDragging(null);
      setOver(null);
      if (p) onMove(p, parent, before);
    },
  };
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const recentPages = recents.map((p) => byPath.get(p)).filter(Boolean);
  const favPages = favorites.map((p) => byPath.get(p)).filter(Boolean);
  const name = info?.user ? info.user.split(' ')[0].replace(/\d+$/, '').replace(/^./, (c) => c.toUpperCase()) : 'My';

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="side-titlebar">
          <button className="icon-btn" title="Close sidebar (⌘\)" onClick={onHide}><Icon name="sidebar" /></button>
          <span className="ip-spacer" />
          <button className="icon-btn" title="New page" onClick={() => onNew('')}><Icon name="edit" /></button>
        </div>
        <button className="side-search" onClick={onSearch}>
          <Icon name="search" /> <span>Search</span> <kbd>⌘K</kbd>
        </button>
        <div className="side-tabs">
          <button className={'side-tab' + (view === 'home' ? ' on' : '')} onClick={onHome}>
            <Icon name="home" /> Home
          </button>
          <button className={'side-tab' + (view === 'graph' ? ' on' : '')} onClick={onGraph}>
            <Icon name="graph" /> Graph
          </button>
        </div>
      </div>

      <div className="sidebar-scroll">
        {recentPages.length > 0 && (
          <Section id="recents" label="Recents">
            {(allRecent ? recentPages : recentPages.slice(0, 6)).map((p) => (
              <Row key={p.path} page={p} active={p.path === current} onOpen={onOpen} />
            ))}
            {recentPages.length > 6 && (
              <button className="side-item muted-item" onClick={() => setAllRecent(!allRecent)}>
                <Icon name="menu" /> <span>{allRecent ? 'Show less' : 'View all'}</span>
              </button>
            )}
          </Section>
        )}

        {favPages.length > 0 && (
          <Section id="favorites" label="Favorites">
            {favPages.map((p) => <Row key={p.path} page={p} active={p.path === current} onOpen={onOpen} />)}
          </Section>
        )}

        <Section
          id="pages"
          label="Pages"
          action={
            <>
              <button className="icon-btn small" title="New folder" onClick={() => onNewFolder('')}><Icon name="folder" /></button>
              <button className="icon-btn small" title="New page" onClick={() => onNew('')}><Icon name="plus" /></button>
            </>
          }
        >
          {tree.map((n, i) => <Node key={n.path} node={n} depth={0} parentPath="" nextPath={tree[i + 1]?.path || null} {...{ current, expanded, toggle, onOpen, onNew, onTrash, drag }} />)}
          <button className="side-item muted-item" onClick={() => onNew('')}>
            <Icon name="plus" /> <span>Add a page</span>
          </button>
        </Section>
      </div>

      <div className="sidebar-foot">
        <div className="account" title={`Notes folder: ${info?.vault || ''}`}>
          <span className="avatar">{name[0]}</span>
          <span className="account-name">{name}'s Ocean</span>
        </div>
        <button className="icon-btn" title="Welcome guide" onClick={onHelp}><Icon name="help" /></button>
      </div>
    </aside>
  );
}
