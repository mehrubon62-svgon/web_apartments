// ============================================================
// UI utilities: DOM helpers, toasts, modals, formatters
// ============================================================

// --- DOM ---
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }

export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- Toast ---
export function toast(message, type = 'info', ms = 3200) {
  const root = $('#toast-root');
  const icons = { ok: '✅', err: '⚠️', info: 'ℹ️' };
  const el = h('div', { class: `toast ${type}` }, [
    h('span', { text: icons[type] || icons.info }),
    h('span', { text: message }),
  ]);
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s, transform .3s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// --- Modal ---
export function modal({ title, body, footer, large = false, onClose }) {
  const root = $('#modal-root');
  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => { overlay.remove(); if (onClose) onClose(); }, 180);
  };
  const content = typeof body === 'string' ? h('div', { html: body }) : body;
  const box = h('div', { class: `modal ${large ? 'modal-lg' : ''}` }, [
    h('div', { class: 'modal-head' }, [
      h('h3', { text: title || '' }),
      h('button', { class: 'icon-btn', onClick: close, html: '&times;' }),
    ]),
    h('div', { class: 'modal-body' }, content),
    footer ? h('div', { class: 'modal-foot' }, footer) : null,
  ]);
  const overlay = h('div', { class: 'modal-overlay', onClick: (e) => { if (e.target === overlay) close(); } }, [box]);
  root.appendChild(overlay);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  return { close, box };
}

export function confirmDialog({ title = 'Подтвердите', message, confirmText = 'Подтвердить', danger = false }) {
  return new Promise((resolve) => {
    let m;
    const yes = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: confirmText, onClick: () => { m.close(); resolve(true); } });
    const no = h('button', { class: 'btn btn-ghost', text: 'Отмена', onClick: () => { m.close(); resolve(false); } });
    m = modal({ title, body: h('p', { class: 'muted', text: message }), footer: [no, yes], onClose: () => resolve(false) });
  });
}

// --- Formatters ---
export function money(value, opts = {}) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  const s = n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `$${s}`;
}

export function fmtDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString('ru-RU', opts);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн назад`;
  return fmtDate(iso);
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || src[0].toUpperCase();
}

// --- Labels ---
export const TYPE_LABELS = { apartment: 'Квартира', house: 'Дом', commercial: 'Коммерция' };
export const DEAL_LABELS = { rent: 'Аренда', sale: 'Продажа' };
export const TERM_LABELS = { short: 'Краткосрочно', long: 'Долгосрочно' };
export const STATUS_LABELS = { active: 'Активно', paused: 'На паузе', deleted: 'Удалено' };
export const ROLE_LABELS = { buyer: 'Покупатель', seller: 'Продавец', admin: 'Администратор' };

export const VERDICT = {
  great_deal: { label: 'Выгодно', cls: 'tag-ok', color: '#16a34a' },
  fair: { label: 'Справедливо', cls: 'tag-muted', color: '#5b50f0' },
  overpriced: { label: 'Завышено', cls: 'tag-warn', color: '#d97706' },
  suspicious: { label: 'Подозрительно', cls: 'tag-warn', color: '#d97706' },
  likely_scam: { label: 'Вероятно скам', cls: 'tag-danger', color: '#dc2626' },
  insufficient_data: { label: 'Мало данных', cls: 'tag-muted', color: '#6b6f86' },
};

export function mediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return url; // served from same origin (/media-files/...)
}

// --- Spinner block ---
export function loadingBlock() {
  return h('div', { class: 'loading-row' }, h('div', { class: 'boot-spinner' }));
}

export function skeletonGrid(n = 8) {
  const g = h('div', { class: 'grid grid-props' });
  for (let i = 0; i < n; i++) g.appendChild(h('div', { class: 'skel skel-card' }));
  return g;
}

export function empty(emoji, title, sub, action) {
  return h('div', { class: 'empty' }, [
    h('div', { class: 'emoji', text: emoji }),
    h('h3', { text: title }),
    sub ? h('p', { text: sub }) : null,
    action || null,
  ]);
}
