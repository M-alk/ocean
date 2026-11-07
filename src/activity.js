// Counts study time: one minute for every minute Ocean is open, visible and you've done something
// (typed, scrolled, clicked) in the last two minutes. Stored in the notes folder by the server.
import { useEffect, useRef } from 'react';
import { api } from './api.js';

export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export function useStudyTimer(currentPage) {
  const page = useRef(currentPage);
  page.current = currentPage;
  useEffect(() => {
    let lastActive = Date.now();
    const poke = () => {
      lastActive = Date.now();
    };
    const events = ['keydown', 'pointerdown', 'wheel', 'scroll', 'pointermove'];
    for (const ev of events) addEventListener(ev, poke, { passive: true, capture: true });
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() - lastActive > 120000) return;
      api.logActivity({ day: today(), minutes: 1, page: page.current?.endsWith('.md') ? page.current : '' }).catch(() => {});
    }, 60000);
    return () => {
      clearInterval(tick);
      for (const ev of events) removeEventListener(ev, poke, { capture: true });
    };
  }, []);
}
