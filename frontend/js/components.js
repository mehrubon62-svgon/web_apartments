// ============================================================
// Shared UI components: header shell, property card, etc.
// ============================================================
import { h, esc, money, initials, TYPE_LABELS, DEAL_LABELS, mediaUrl, toast } from './ui.js';
import { api } from './api.js';
import { store } from './store.js';
import { navigate, currentPath } from './router.js';
import { icon } from './icons.js';
import { getLang, setLang, t } from './i18n.js';

// ---- Avatar ----
export function avatar(user, size = 40) {
  const url = user?.avatar_url ? mediaUrl(user.avatar_url) : null;
  if (url) return h('img', { class: 'avatar', src: url, style: { width: size + 'px', height: size + 'px' }, alt: '' });
  return h('div', {
    class: 'avatar',
    style: {
      width: size + 'px', height: size + 'px', display: 'grid', placeContent: 'center',
      fontWeight: '800', color: 'var(--brand)', fontSize: (size * 0.38) + 'px',
    },
    text: initials(user?.full_name, user?.email),
  });
}

// ---- Property Card ----
export function propertyCard(p, { onFav } = {}) {
  const cover = p.cover_url ? mediaUrl(p.cover_url) : null;
  const media = h('div', { class: 'prop-media' }, [
    cover ? h('img', { src: cover, alt: esc(p.title), loading: 'lazy' }) : h('div', { class: 'ph', text: '🏠' }),
    h('div', { class: 'prop-badges' }, [
      h('span', { class: `tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`, text: DEAL_LABELS[p.deal_type] }),
      h('span', { class: 'tag tag-muted', text: TYPE_LABELS[p.type] }),
    ]),
    h('button', {
      class: 'prop-fav',
      title: 'В избранное',
      html: p.is_favorited ? '♥' : '♡',
      onClick: async (e) => {
        e.stopPropagation();
        try {
          if (p.is_favorited) { await api.removeFavorite(p.id); p.is_favorited = false; e.target.innerHTML = '♡'; toast('Удалено из избранного'); }
          else { await api.addFavorite(p.id); p.is_favorited = true; e.target.innerHTML = '♥'; toast('Добавлено в избранное', 'ok'); }
          if (onFav) onFav(p);
        } catch (err) { toast(err.message, 'err'); }
      },
    }),
    p.has_tour ? h('span', { class: 'prop-tour-pill', html: '🌐 360° тур' }) : null,
  ]);

  const priceUnit = p.deal_type === 'rent' ? h('small', { text: ' / ночь' }) : null;

  const body = h('div', { class: 'prop-body' }, [
    h('div', { class: 'prop-price' }, [document.createTextNode(money(p.price)), priceUnit]),
    h('div', { class: 'prop-title', text: p.title }),
    h('div', { class: 'prop-addr', text: p.address || 'Адрес не указан' }),
    h('div', { class: 'prop-meta' }, [
      h('span', { html: `📐 ${p.area} м²` }),
      p.rooms != null ? h('span', { html: `🛏 ${p.rooms} комн.` }) : null,
      p.avg_rating ? h('span', { class: 'prop-rating', html: `★ ${p.avg_rating.toFixed(1)}` }) : null,
    ]),
  ]);

  return h('div', { class: 'prop-card', onClick: () => navigate(`/properties/${p.id}`) }, [media, body]);
}

export function propertyGrid(items, opts) {
  if (!items || !items.length) return null;
  const g = h('div', { class: 'grid grid-props' });
  items.forEach((p) => g.appendChild(propertyCard(p, opts)));
  return g;
}

// ---- App shell (header + nav) ----
let notifDropdownOpen = false;
let userMenuOpen = false;

export function renderShell(contentNode) {
  const app = document.getElementById('app');
  // Reuse the static shell from index.html if present (no flash on first paint).
  let header = app.querySelector('.header');
  let main = app.querySelector('#main-content');
  let footer = app.querySelector('.footer');
  let tabbar = app.querySelector('.mobile-tabbar');

  // Replace static header with the JS one (in place, no flicker).
  const newHeader = buildHeader();
  if (header) header.replaceWith(newHeader);
  else app.prepend(newHeader);

  if (!main) { main = h('main', { id: 'main-content' }); app.appendChild(main); }
  if (contentNode) { main.innerHTML = ''; main.appendChild(contentNode); }

  if (!footer) app.appendChild(buildFooter());
  if (!tabbar) app.appendChild(buildMobileTabbar());
  return main;
}

export function mountContent(node) {
  const main = document.getElementById('main-content');
  if (main) { main.innerHTML = ''; main.appendChild(node); }
  else renderShell(node);
  highlightNav();
}

function navLink(path, label) {
  return h('a', { href: '#' + path, text: label, dataset: { path } });
}

function buildHeader() {
  const u = store.user;
  const navItems = [
    navLink('/', 'Каталог'),
    navLink('/map', 'Карта'),
    navLink('/agent', 'ИИ-агент'),
    navLink('/recommendations', 'Подбор'),
    u ? navLink('/favorites', 'Избранное') : null,
    u ? navLink('/messages', 'Сообщения') : null,
    store.isSeller() ? navLink('/dashboard', 'Кабинет') : null,
    store.isAdmin() ? navLink('/admin', 'Модерация') : null,
  ].filter(Boolean);

  const actions = h('div', { class: 'header-actions' });

  if (u) {
    // Notifications
    const notifBtn = h('button', { class: 'icon-btn', title: 'Уведомления', html: '🔔' });
    const badge = h('span', { class: 'badge', text: store.unread || '' });
    if (store.unread > 0) notifBtn.appendChild(badge);
    notifBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleNotifications(notifBtn); });
    store.on('notifications', () => {
      const b = notifBtn.querySelector('.badge');
      if (store.unread > 0) {
        if (b) b.textContent = store.unread > 99 ? '99+' : store.unread;
        else notifBtn.appendChild(h('span', { class: 'badge', text: store.unread > 99 ? '99+' : store.unread }));
      } else if (b) b.remove();
    });
    actions.appendChild(notifBtn);

    // User avatar menu
    const avBtn = h('button', { class: 'avatar-btn', title: u.full_name || u.email }, avatar(u, 40));
    avBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleUserMenu(); });
    actions.appendChild(avBtn);
  } else {
    actions.appendChild(h('a', { class: 'btn btn-ghost btn-sm', href: '#/auth', text: 'Войти' }));
    actions.appendChild(h('a', { class: 'btn btn-primary btn-sm', href: '#/auth?mode=register', text: 'Регистрация' }));
  }

  // Language switch
  const langSwitch = h('div', { class: 'lang-switch' }, [
    h('button', { class: getLang() === 'ru' ? 'active' : '', text: 'RU', onClick: () => switchLang('ru') }),
    h('button', { class: getLang() === 'en' ? 'active' : '', text: 'EN', onClick: () => switchLang('en') }),
  ]);
  actions.appendChild(langSwitch);

  // Theme toggle
  const themeBtn = h('button', { class: 'icon-btn', title: t('Тема') }, icon(store.theme === 'dark' ? 'sun' : 'moon'));
  themeBtn.addEventListener('click', () => {
    store.setTheme(store.theme === 'dark' ? 'light' : 'dark');
    themeBtn.innerHTML = '';
    themeBtn.appendChild(icon(store.theme === 'dark' ? 'sun' : 'moon'));
  });
  actions.appendChild(themeBtn);

  const inner = h('div', { class: 'container header-inner' }, [
    h('a', { class: 'logo', href: '#/' }, [
      h('span', { class: 'dot' }, icon('logo')),
      h('span', { class: 'wm' }, [
        h('b', { text: 'Nest' }),
        h('i', { text: 'o' }),
        h('b', { text: 'ra' }),
      ]),
    ]),
    h('nav', { class: 'nav' }, navItems),
    h('div', { class: 'header-spacer' }),
    actions,
  ]);

  return h('header', { class: 'header' }, inner);
}

function switchLang(lang) {
  if (getLang() === lang) return;
  setLang(lang);
  location.reload();
}

function highlightNav() {
  const path = currentPath();
  document.querySelectorAll('.nav a').forEach((a) => {
    const p = a.dataset.path;
    const active = p === '/' ? path === '/' : path.startsWith(p);
    a.classList.toggle('active', active);
  });
  document.querySelectorAll('.mobile-tabbar a').forEach((a) => {
    const p = a.dataset.path;
    const active = p === '/' ? path === '/' : path.startsWith(p);
    a.classList.toggle('active', active);
  });
}

function closeAllPopups() {
  document.querySelectorAll('.dropdown, .menu').forEach((el) => el.remove());
  notifDropdownOpen = false;
  userMenuOpen = false;
}
document.addEventListener('click', () => closeAllPopups());

async function toggleNotifications(anchor) {
  if (notifDropdownOpen) return closeAllPopups();
  closeAllPopups();
  notifDropdownOpen = true;
  await store.refreshNotifications();

  const list = h('div', { class: 'dropdown-body' });
  if (!store.notifications.length) {
    list.appendChild(h('div', { class: 'empty', style: { padding: '40px 20px' } }, [
      h('div', { class: 'emoji', text: '🔔' }), h('p', { text: 'Уведомлений пока нет' }),
    ]));
  } else {
    store.notifications.forEach((n) => list.appendChild(notifItem(n)));
  }

  const dd = h('div', { class: 'dropdown', onClick: (e) => e.stopPropagation() }, [
    h('div', { class: 'dropdown-head' }, [
      h('strong', { text: 'Уведомления' }),
      h('button', {
        class: 'btn btn-soft btn-sm', text: 'Прочитать все',
        onClick: async () => { await api.readAllNotifications(); await store.refreshNotifications(); closeAllPopups(); },
      }),
    ]),
    list,
  ]);
  document.body.appendChild(dd);
}

const NOTIF_ICON = {
  price_drop: '💸', new_message: '💬', booking_confirmed: '✅', recommendation: '✨',
  warning: '⚠️', ban: '🚫', complaint_decision: '🛡️',
};

function notifItem(n) {
  const c = n.content || {};
  const item = h('div', { class: `notif-item ${n.read ? '' : 'unread'}` }, [
    h('div', { class: 'notif-ic', text: NOTIF_ICON[n.type] || '🔔' }),
    h('div', { style: { flex: '1' } }, [
      h('div', { class: 'nt', text: c.title || n.type }),
      c.body ? h('div', { class: 'nb', text: c.body }) : null,
      h('div', { class: 'nd', text: timeMini(n.created_at) }),
    ]),
  ]);
  item.addEventListener('click', async () => {
    if (!n.read) { await api.readNotification(n.id); await store.refreshNotifications(); }
    if (c.property_id) { closeAllPopups(); navigate(`/properties/${c.property_id}`); }
    else if (c.conversation_id) { closeAllPopups(); navigate('/messages'); }
  });
  return item;
}

function timeMini(iso) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function toggleUserMenu() {
  if (userMenuOpen) return closeAllPopups();
  closeAllPopups();
  userMenuOpen = true;
  const u = store.user;
  const menu = h('div', { class: 'menu', onClick: (e) => e.stopPropagation() }, [
    h('div', { class: 'menu-user' }, [
      h('div', { class: 'mu-name', text: u.full_name || 'Без имени' }),
      h('div', { class: 'mu-email', text: u.email }),
    ]),
    h('a', { href: '#/profile', html: '👤 Профиль', onClick: closeAllPopups }),
    h('a', { href: '#/favorites', html: '♥ Избранное', onClick: closeAllPopups }),
    h('a', { href: '#/history', html: '🕘 История просмотров', onClick: closeAllPopups }),
    h('a', { href: '#/bookings', html: '🗓 Мои брони', onClick: closeAllPopups }),
    h('a', { href: '#/trackers', html: '📉 Трекеры цен', onClick: closeAllPopups }),
    h('a', { href: '#/requests', html: '📨 Заявки', onClick: closeAllPopups }),
    store.isSeller() ? h('a', { href: '#/dashboard', html: '📊 Кабинет продавца', onClick: closeAllPopups }) : null,
    store.isAdmin() ? h('a', { href: '#/admin', html: '🛡 Модерация', onClick: closeAllPopups }) : null,
    h('div', { class: 'sep' }),
    h('button', {
      html: '🚪 Выйти',
      onClick: () => { closeAllPopups(); store.logout(); navigate('/auth'); location.reload(); },
    }),
  ].filter(Boolean));
  document.body.appendChild(menu);
}

function buildFooter() {
  const year = new Date().getFullYear();
  const col = (title, links) => h('div', { class: 'footer-col' }, [
    h('h4', { text: t(title) }),
    ...links.map(([label, href, ext]) => h('a', { href, target: ext ? '_blank' : null, text: t(label) })),
  ]);
  return h('footer', { class: 'footer' }, [
    h('div', { class: 'footer-inner' }, [
      h('div', { class: 'footer-brand' }, [
        h('a', { class: 'logo', href: '#/' }, [
          h('span', { class: 'dot' }, icon('logo')),
          h('span', {}, [h('b', { text: 'Nest' }), h('span', { text: 'ora' })]),
        ]),
        h('p', { text: t('Иммерсивный AI-маркетплейс недвижимости') + ' — ' + t('Ходите по квартире в 360°, спрашивайте ИИ прямо про зону на панораме, бронируйте онлайн и доверяйте честным отзывам.') }),
        h('div', { class: 'footer-social' }, [
          h('a', { href: '#/', title: 'X' }, icon('chat')),
          h('a', { href: '#/', title: 'Map' }, icon('map')),
          h('a', { href: '#/agent', title: 'AI' }, icon('bot')),
        ]),
      ]),
      col('Продукт', [['Каталог', '#/'], ['Карта', '#/map'], ['ИИ-агент', '#/agent'], ['Подбор', '#/recommendations']]),
      col('Компания', [['О проекте', '#/'], ['Документация API', '/docs', true]]),
      col('Поддержка', [['Связаться', '#/messages'], ['Профиль', '#/profile']]),
    ]),
    h('div', { class: 'footer-bottom' }, [
      h('span', { text: `© ${year} Nestora. ` + t('Все права защищены') + '.' }),
      h('div', { class: 'row' }, [
        h('a', { href: '/docs', target: '_blank', text: 'API' }),
        h('a', { href: '#/', text: t('Каталог') }),
        h('a', { href: '#/map', text: t('Карта') }),
      ]),
    ]),
  ]);
}

function buildMobileTabbar() {
  const u = store.user;
  const item = (path, icon, label) => h('a', { href: '#' + path, dataset: { path } }, [
    h('span', { class: 'mi', text: icon }), h('span', { text: label }),
  ]);
  return h('nav', { class: 'mobile-tabbar' }, [
    item('/', '🏠', 'Каталог'),
    item('/map', '🗺', 'Карта'),
    item('/agent', '🤖', 'Агент'),
    u ? item('/favorites', '♥', 'Избранное') : item('/auth', '👤', 'Вход'),
  ]);
}

// ---- Google Sign-In button ----
export function renderGoogleButton(container, role, onSuccess) {
  const cid = api.config.googleClientId;
  if (!cid) return;
  const cb = (response) => {
    api.google({ id_token: response.credential, role })
      .then((tokens) => { api.tokens.set(tokens); onSuccess(); })
      .catch((e) => toast(e.message, 'err'));
  };
  function init() {
    if (!window.google || !window.google.accounts) return false;
    window.google.accounts.id.initialize({ client_id: cid, callback: cb });
    window.google.accounts.id.renderButton(container, { theme: store.theme === 'dark' ? 'filled_black' : 'outline', size: 'large', width: 360, text: 'continue_with' });
    return true;
  }
  if (!init()) {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true;
    s.onload = init;
    document.head.appendChild(s);
  }
}
