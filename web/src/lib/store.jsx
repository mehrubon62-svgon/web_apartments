import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [theme, setThemeState] = useState(localStorage.getItem('nestora_theme') || 'light');
  const wsRef = useRef(null);

  const setTheme = useCallback((t) => {
    localStorage.setItem('nestora_theme', t);
    document.documentElement.setAttribute('data-theme', t);
    setThemeState(t);
  }, []);

  const loadUser = useCallback(async () => {
    if (!api.isAuthed()) { setUser(null); return null; }
    try { const u = await api.me(); setUser(u); return u; }
    catch { api.tokens.clear(); setUser(null); return null; }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!api.isAuthed()) return;
    try { const d = await api.notifications({ limit: 30 }); setNotifications(d.items); setUnread(d.unread); } catch {}
  }, []);

  const logout = useCallback(() => {
    api.logout(); api.tokens.clear(); setUser(null); setNotifications([]); setUnread(0);
    if (wsRef.current) { try { wsRef.current.close(); } catch {} }
  }, []);

  // Initial boot
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    (async () => { await loadUser(); setReady(true); })();
  }, []);

  // Realtime WS
  useEffect(() => {
    if (!user || !api.isAuthed()) return;
    let alive = true;
    let pingTimer = null;
    function connect() {
      const token = api.tokens.access;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;
      ws.onopen = () => { pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ event: 'ping' })), 25000); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.event === 'notification:new') { setNotifications((n) => [m.data, ...n]); setUnread((u) => u + 1); }
        window.dispatchEvent(new CustomEvent('nestora:rt', { detail: m }));
      };
      ws.onclose = () => { clearInterval(pingTimer); if (alive) setTimeout(connect, 4000); };
      ws.onerror = () => { try { ws.close(); } catch {} };
    }
    connect();
    refreshNotifications();
    return () => { alive = false; clearInterval(pingTimer); if (wsRef.current) { try { wsRef.current.close(); } catch {} } };
  }, [user]);

  const isSeller = user && (user.role === 'seller' || user.role === 'admin');
  const isAdmin = user && user.role === 'admin';

  return (
    <AppContext.Provider value={{
      user, setUser, ready, loadUser, logout,
      notifications, unread, refreshNotifications, setNotifications, setUnread,
      theme, setTheme, isSeller, isAdmin,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
