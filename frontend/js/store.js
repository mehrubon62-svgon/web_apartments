// ============================================================
// Global app store — current user, notifications, theme, events
// ============================================================
import { api } from './api.js';

const listeners = new Map();

export const store = {
  user: null,
  notifications: [],
  unread: 0,
  favoritesCount: 0,
  theme: localStorage.getItem('nestora_theme') || 'light',

  on(event, cb) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(cb);
    return () => listeners.get(event)?.delete(cb);
  },
  emit(event, payload) {
    (listeners.get(event) || []).forEach((cb) => {
      try { cb(payload); } catch (e) { console.error(e); }
    });
  },

  async loadUser() {
    if (!api.isAuthed()) { this.user = null; return null; }
    try {
      this.user = await api.me();
      this.emit('user', this.user);
      return this.user;
    } catch {
      this.user = null;
      api.tokens.clear();
      return null;
    }
  },

  setUser(u) { this.user = u; this.emit('user', u); },

  isSeller() { return this.user && (this.user.role === 'seller' || this.user.role === 'admin'); },
  isAdmin() { return this.user && this.user.role === 'admin'; },

  async refreshNotifications() {
    if (!api.isAuthed()) return;
    try {
      const data = await api.notifications({ limit: 30 });
      this.notifications = data.items;
      this.unread = data.unread;
      this.emit('notifications', data);
    } catch {}
  },

  addNotification(n) {
    this.notifications.unshift(n);
    this.unread += 1;
    this.emit('notifications', { items: this.notifications, unread: this.unread });
  },

  setTheme(theme) {
    this.theme = theme;
    localStorage.setItem('nestora_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    this.emit('theme', theme);
  },

  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
  },

  logout() {
    api.logout();
    api.tokens.clear();
    this.user = null;
    this.notifications = [];
    this.unread = 0;
  },
};

window.__store = store;
