// ============================================================
// Nestora frontend entry point
// ============================================================
import { api } from './api.js';
import { store } from './store.js';
import { route, setNotFound, startRouter, navigate, currentPath } from './router.js';
import { renderShell, mountContent } from './components.js';
import { connectRealtime } from './realtime.js';
import { startEnhancer } from './enhance.js';
import { setLang, getLang } from './i18n.js';
import { h, empty } from './ui.js';

import { renderAuth } from './views/auth.js';
import { renderCatalog, renderSearch } from './views/catalog.js';
import { renderProperty } from './views/property.js';
import { renderMap } from './views/map.js';
import { renderTour } from './views/tour.js';
import { renderMessages } from './views/messages.js';
import { renderAgent } from './views/agent.js';
import {
  renderFavorites, renderHistory, renderRecommendations, renderBookings,
  renderTrackers, renderRequests, renderProfile,
} from './views/personal.js';
import { renderDashboard } from './views/dashboard.js';
import { renderAdmin } from './views/admin.js';

// Pages that render their own full screen (no standard shell pre-render needed,
// but we still ensure the shell exists for in-app pages).
function withShell(fn) {
  return async (params, query) => {
    if (!document.getElementById('main-content')) renderShell(h('div'));
    return fn(params, query);
  };
}

function defineRoutes() {
  route('/', withShell(renderCatalog));
  route('/search', withShell(renderSearch));
  route('/map', withShell(renderMap));
  route('/agent', withShell(renderAgent));
  route('/recommendations', withShell(renderRecommendations));
  route('/properties/:id/tour', withShell(renderTour));
  route('/properties/:id', withShell(renderProperty));
  route('/favorites', withShell(renderFavorites));
  route('/history', withShell(renderHistory));
  route('/bookings', withShell(renderBookings));
  route('/trackers', withShell(renderTrackers));
  route('/requests', withShell(renderRequests));
  route('/messages', withShell(renderMessages));
  route('/profile', withShell(renderProfile));
  route('/dashboard', withShell(renderDashboard));
  route('/admin', withShell(renderAdmin));

  // Auth renders its own full-screen layout
  route('/auth', renderAuth);

  setNotFound(() => {
    if (!document.getElementById('main-content')) renderShell(h('div'));
    mountContent(h('div', { class: 'page' }, h('div', { class: 'container' },
      empty('🧭', 'Страница не найдена', 'Возможно, ссылка устарела',
        h('a', { class: 'btn btn-primary mt-16', href: '#/', text: 'На главную' })))));
  });
}

async function boot() {
  setLang(getLang());        // sync <html lang> + persisted choice
  store.applyTheme();
  startEnhancer();           // emoji -> SVG + RU/EN translation, live
  defineRoutes();

  // Load user (if token present), then render shell so header reflects auth state.
  if (api.isAuthed()) {
    await store.loadUser();
    if (store.user) {
      connectRealtime();
      store.refreshNotifications();
    }
  }

  // Render initial shell (header). Auth page bypasses it.
  if (currentPath() !== '/auth') renderShell(h('div'));

  startRouter();
}

boot().catch((err) => {
  console.error('Nestora boot failed:', err);
  const main = document.getElementById('main-content') || document.body;
  main.innerHTML =
    '<div style="padding:60px;text-align:center;font-family:sans-serif">' +
    '<h2 style="color:#b23b2e">Ошибка загрузки интерфейса</h2>' +
    '<pre style="white-space:pre-wrap;color:#666;max-width:700px;margin:16px auto;text-align:left">' +
    (err && (err.stack || err.message) ? String(err.stack || err.message) : String(err)) +
    '</pre></div>';
});

window.addEventListener('error', (e) => {
  console.error('Global error:', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
});
