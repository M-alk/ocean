// GitHub-style study heatmap: one square per day for the last year, darker = more minutes studied.
import { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { today } from './activity.js';

const key = (d) => d.toLocaleDateString('en-CA');
const LEVELS = [0, 1, 15, 45, 90]; // minutes for levels 0–4
const level = (m) => (m >= 90 ? 4 : m >= 45 ? 3 : m >= 15 ? 2 : m >= 1 ? 1 : 0);
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

export default function Heatmap({ pages, onOpen }) {
  const [data, setData] = useState(null);
  const [tip, setTip] = useState(null);
  useEffect(() => {
    let live = true;
    const load = () => api.activity().then((d) => live && setData(d)).catch(() => live && setData({}));
    load();
    const t = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  const { weeks, months, stats } = useMemo(() => {
    const d = data || {};
    const end = new Date();
    end.setHours(12, 0, 0, 0);
    // Start on the Sunday 52 weeks ago, like GitHub.
    const start = new Date(end);
    start.setDate(start.getDate() - 7 * 52 - start.getDay());
    const weeks = [];
    const months = [];
    for (let day = new Date(start), w = -1; day <= end; day.setDate(day.getDate() + 1)) {
      if (day.getDay() === 0) {
        weeks.push([]);
        w++;
        if (day.getDate() <= 7) months.push({ w, label: day.toLocaleDateString(undefined, { month: 'short' }) });
      }
      const k = key(day);
      weeks[weeks.length - 1].push({ k, date: new Date(day), minutes: d[k]?.minutes || 0, edits: d[k]?.edits || 0, pages: d[k]?.pages || {} });
    }
    // Streaks count days with at least one minute (today doesn't break a streak until it's over).
    const studied = (k) => (d[k]?.minutes || 0) > 0 || (d[k]?.edits || 0) > 0;
    let current = 0;
    const cur = new Date(end);
    if (!studied(key(cur))) cur.setDate(cur.getDate() - 1);
    while (studied(key(cur))) {
      current++;
      cur.setDate(cur.getDate() - 1);
    }
    let longest = 0;
    let run = 0;
    for (const k of Object.keys(d).sort()) {
      const prev = new Date(k + 'T12:00');
      prev.setDate(prev.getDate() - 1);
      run = studied(k) ? (studied(key(prev)) ? run + 1 : 1) : 0;
      longest = Math.max(longest, run);
    }
    const yearAgo = key(start);
    const total = Object.entries(d).filter(([k]) => k >= yearAgo).reduce((s, [, v]) => s + (v.minutes || 0), 0);
    const days = Object.entries(d).filter(([k, v]) => k >= yearAgo && (v.minutes || v.edits)).length;
    return { weeks, months, stats: { current, longest, total, days, today: d[today()]?.minutes || 0 } };
  }, [data]);

  const names = new Map((pages || []).map((p) => [p.path, p.name]));
  const show = (e, c) => {
    const r = e.currentTarget.getBoundingClientRect();
    const top = Object.entries(c.pages).sort((a, b) => b[1] - a[1]).slice(0, 3);
    setTip({ x: r.left + r.width / 2, y: r.top, c, top });
  };

  return (
    <div className="heatmap">
      <div className="heat-stats">
        <div><b>{fmtMin(stats.today)}</b><span>today</span></div>
        <div><b>{stats.current} day{stats.current === 1 ? '' : 's'}</b><span>current streak</span></div>
        <div><b>{stats.longest} day{stats.longest === 1 ? '' : 's'}</b><span>longest streak</span></div>
        <div><b>{fmtMin(stats.total)}</b><span>in the last year · {stats.days} days</span></div>
      </div>
      <div className="heat-scroll">
        <div className="heat-grid" style={{ gridTemplateColumns: `28px repeat(${weeks.length}, 12px)` }}>
          <span />
          {weeks.map((_, w) => (
            <span key={w} className="heat-month">{months.find((m) => m.w === w)?.label || ''}</span>
          ))}
          {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
            <div key={dow} style={{ display: 'contents' }}>
              <span className="heat-dow">{dow % 2 ? new Date(2024, 0, 7 + dow).toLocaleDateString(undefined, { weekday: 'short' }) : ''}</span>
              {weeks.map((wk, w) => {
                const c = wk.find((x) => x.date.getDay() === dow);
                return c ? (
                  <button
                    key={w}
                    className={`heat-cell l${level(c.minutes || (c.edits ? 1 : 0))}${c.k === today() ? ' is-today' : ''}`}
                    onMouseEnter={(e) => show(e, c)}
                    onMouseLeave={() => setTip(null)}
                    onClick={() => {
                      const top = Object.entries(c.pages).sort((a, b) => b[1] - a[1])[0];
                      if (top) onOpen(top[0]);
                    }}
                    aria-label={`${c.k}: ${c.minutes} minutes`}
                  />
                ) : (
                  <span key={w} />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="heat-legend">
        Less {LEVELS.map((_, i) => <span key={i} className={`heat-cell l${i}`} />)} More
      </div>
      {tip && (
        <div className="heat-tip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.c.minutes ? fmtMin(tip.c.minutes) : 'No study'}</b>
          {tip.c.edits ? ` · ${tip.c.edits} edit${tip.c.edits === 1 ? '' : 's'}` : ''} on{' '}
          {tip.c.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {tip.top.map(([p, m]) => (
            <div key={p} className="heat-tip-page">{names.get(p) || p.split('/').pop().replace(/\.md$/, '')} · {m} min</div>
          ))}
        </div>
      )}
    </div>
  );
}
