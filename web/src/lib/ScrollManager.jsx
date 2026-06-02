import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Persists scroll position per URL in sessionStorage.
//  - reload / back / forward  -> restore saved position (stay where you were)
//  - new navigation (PUSH)     -> scroll to top
export function ScrollManager() {
  const location = useLocation();
  const navType = useNavigationType(); // 'POP' | 'PUSH' | 'REPLACE'
  const key = location.pathname + location.search;
  const lastKey = useRef(key);

  // Save current scroll before leaving a route.
  useEffect(() => {
    const save = () => { try { sessionStorage.setItem('scroll:' + lastKey.current, String(window.scrollY)); } catch {} };
    window.addEventListener('beforeunload', save);
    return () => { save(); window.removeEventListener('beforeunload', save); };
  }, []);

  useEffect(() => {
    // Save the position of the page we are leaving.
    return () => { try { sessionStorage.setItem('scroll:' + key, String(window.scrollY)); } catch {} };
  }, [key]);

  useEffect(() => {
    lastKey.current = key;
    let saved = null;
    try { saved = sessionStorage.getItem('scroll:' + key); } catch {}

    if (navType === 'PUSH') { window.scrollTo(0, 0); return; }
    if (saved == null) return;

    // Restore — but content loads async, so retry until the page is tall enough
    // to honor the target offset (or we run out of attempts).
    const target = parseInt(saved, 10) || 0;
    if (target === 0) return;
    let tries = 0;
    let raf;
    const tryRestore = () => {
      tries += 1;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(target, Math.max(maxScroll, 0)));
      if (maxScroll < target && tries < 40) raf = requestAnimationFrame(tryRestore);
    };
    raf = requestAnimationFrame(tryRestore);
    return () => cancelAnimationFrame(raf);
  }, [key, navType]);

  return null;
}
