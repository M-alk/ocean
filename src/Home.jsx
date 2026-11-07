import PageIcon from './PageIcon.jsx';
import { Icon } from './icons.jsx';
import Heatmap from './Heatmap.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function Cards({ list, onOpen }) {
  return (
    <div className="home-cards">
      {list.map((p) => (
        <button key={p.path} className="home-card" onClick={() => onOpen(p.path)} title={p.path}>
          <span className="home-card-top" />
          <span className="home-card-icon"><PageIcon icon={p.icon} pagePath={p.path} size={28} /></span>
          <span className="home-card-name">{p.name}</span>
          <span className="home-card-path">{p.path.split('/').slice(0, -1).join(' / ') || 'Pages'}</span>
        </button>
      ))}
    </div>
  );
}

export default function Home({ info, pages, recents, favorites, onOpen, onNew, sidebarHidden, onShowSidebar }) {
  const byPath = new Map(pages.map((p) => [p.path, p]));
  const recent = recents.map((p) => byPath.get(p)).filter(Boolean).slice(0, 8);
  const favs = favorites.map((p) => byPath.get(p)).filter(Boolean);
  const name = info?.user ? info.user.split(' ')[0].replace(/\d+$/, '').replace(/^./, (c) => c.toUpperCase()) : '';
  return (
    <main className="main">
      <header className="topbar">
        {sidebarHidden && <button className="icon-btn" onClick={onShowSidebar} title="Show sidebar"><Icon name="sidebar" /></button>}
        <nav className="crumbs"><span className="crumb"><Icon name="home" /> Home</span></nav>
      </header>
      <div className="scroller">
        <div className="home">
          <h1 className="home-hello">{greeting()}{name ? `, ${name}` : ''}</h1>
          <section>
            <h2><Icon name="graph" /> Study activity</h2>
            <Heatmap pages={pages} onOpen={onOpen} />
          </section>
          <section>
            <h2><Icon name="clock" /> Recently visited</h2>
            {recent.length ? <Cards list={recent} onOpen={onOpen} /> : <p className="muted">Pages you open show up here.</p>}
          </section>
          {favs.length > 0 && (
            <section>
              <h2><Icon name="starFill" /> Favorites</h2>
              <Cards list={favs} onOpen={onOpen} />
            </section>
          )}
          <section>
            <h2><Icon name="edit" /> Start something</h2>
            <div className="home-actions">
              <button onClick={onNew}><Icon name="page" /> New page</button>
              <button onClick={() => onOpen('Start here.md')}><Icon name="help" /> How Ocean works</button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
