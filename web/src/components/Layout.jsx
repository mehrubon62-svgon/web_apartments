import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate, Outlet } from 'react-router-dom';
import { Icon } from '../lib/icons.jsx';
import { useApp } from '../lib/store.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { api } from '../lib/api.js';
import { Avatar } from './Common.jsx';
import { AgentWidget } from './AgentWidget.jsx';
import { timeAgo } from '../lib/format.js';

const NOTIF_ICON = {
  price_drop: 'trending-down', new_message: 'chat', booking_confirmed: 'check',
  recommendation: 'sparkles', warning: 'alert', ban: 'ban', complaint_decision: 'shield',
};

function Logo() {
  return (
    <Link className="logo" to="/">
      <span className="dot"><Icon name="logo" size={26} /></span>
      <span className="wm"><b>Nest</b><i>o</i><b>ra</b></span>
    </Link>
  );
}

export function Layout() {
  const { user, isSeller, isAdmin, theme, setTheme, unread } = useApp();
  const { lang, setLang, t } = useI18n();
  const nav = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    ['/', t('Каталог'), true],
    ['/map', t('Карта')],
    ['/recommendations', t('Подбор')],
    user && ['/favorites', t('Избранное')],
    user && ['/messages', t('Сообщения')],
    isSeller && ['/dashboard', t('Кабинет')],
    isAdmin && ['/admin', t('Модерация')],
  ].filter(Boolean);

  return (
    <div className="app-shell">
      <header className="header">
        <div className="container header-inner">
          <Logo />
          <nav className="nav">
            {links.map(([to, label, end]) => (
              <NavLink key={to} to={to} end={!!end} className={({ isActive }) => (isActive ? 'active' : '')}>{label}</NavLink>
            ))}
          </nav>
          <div className="header-spacer" />
          <div className="header-actions">
            <div className="lang-switch">
              <button className={lang === 'ru' ? 'active' : ''} onClick={() => setLang('ru')}>RU</button>
              <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
            {user && <NotifBell open={notifOpen} setOpen={(v) => { setNotifOpen(v); if (v) setMenuOpen(false); }} unread={unread} />}
            {user
              ? <UserMenu open={menuOpen} setOpen={(v) => { setMenuOpen(v); if (v) setNotifOpen(false); }} />
              : <>
                  <Link className="btn btn-ghost btn-sm" to="/auth">{t('Войти')}</Link>
                  <Link className="btn btn-primary btn-sm" to="/auth?mode=register">{t('Регистрация')}</Link>
                </>}
            <button className="icon-btn" title={t('Тема')} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content"><Outlet /></main>

      <Footer />

      <AgentWidget />

      <nav className="mobile-tabbar">
        <NavLink to="/" end><span className="mi"><Icon name="home" /></span>{t('Каталог')}</NavLink>
        <NavLink to="/map"><span className="mi"><Icon name="map" /></span>{t('Карта')}</NavLink>
        <NavLink to="/recommendations"><span className="mi"><Icon name="sparkles" /></span>{t('Подбор')}</NavLink>
        {user
          ? <NavLink to="/favorites"><span className="mi"><Icon name="heart-outline" /></span>{t('Избранное')}</NavLink>
          : <NavLink to="/auth"><span className="mi"><Icon name="user" /></span>{t('Войти')}</NavLink>}
      </nav>
    </div>
  );
}

function NotifBell({ open, setOpen, unread }) {
  const { notifications, refreshNotifications, setNotifications, setUnread } = useApp();
  const ref = useRef(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    refreshNotifications();
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  async function readAll() { await api.readAllNotifications(); await refreshNotifications(); }
  async function openNotif(n) {
    if (!n.read) { await api.readNotification(n.id); await refreshNotifications(); }
    const c = n.content || {};
    setOpen(false);
    if (c.property_id) nav(`/properties/${c.property_id}`);
    else if (c.conversation_id) nav('/messages');
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" title="Уведомления" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <Icon name="bell" />
        {unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="dropdown-head">
            <strong>Уведомления</strong>
            <button className="btn btn-soft btn-sm" onClick={readAll}>Прочитать все</button>
          </div>
          <div className="dropdown-body">
            {!notifications.length
              ? <div className="empty" style={{ padding: '40px 20px' }}><div className="emoji"><Icon name="bell" size={40} /></div><p>Уведомлений пока нет</p></div>
              : notifications.map((n) => (
                <div key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => openNotif(n)}>
                  <div className="notif-ic"><Icon name={NOTIF_ICON[n.type] || 'bell'} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="nt">{(n.content && n.content.title) || n.type}</div>
                    {n.content && n.content.body && <div className="nb">{n.content.body}</div>}
                    <div className="nd">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ open, setOpen }) {
  const { user, logout, isSeller, isAdmin } = useApp();
  const ref = useRef(null);
  const nav = useNavigate();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);
  const go = (to) => { setOpen(false); nav(to); };
  const item = (to, icon, label) => <button onClick={() => go(to)}><Icon name={icon} /> {label}</button>;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="avatar-btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}><Avatar user={user} size={40} /></button>
      {open && (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          <div className="menu-user">
            <div className="mu-name">{user.full_name || 'Без имени'}</div>
            <div className="mu-email">{user.email}</div>
          </div>
          {item('/profile', 'user', 'Профиль')}
          {item('/favorites', 'heart-outline', 'Избранное')}
          {item('/history', 'clock', 'История просмотров')}
          {item('/bookings', 'calendar', 'Мои брони')}
          {item('/trackers', 'trending-down', 'Трекеры цен')}
          {item('/requests', 'mail', 'Заявки')}
          {isSeller && item('/dashboard', 'chart', 'Кабинет продавца')}
          {isAdmin && item('/admin', 'shield', 'Модерация')}
          <div className="sep" />
          <button onClick={() => { setOpen(false); logout(); nav('/auth'); }}><Icon name="logout" /> Выйти</button>
        </div>
      )}
    </div>
  );
}

function Footer() {
  const { t } = useI18n();
  const col = (title, links) => (
    <div className="footer-col">
      <h4>{t(title)}</h4>
      {links.map(([label, to, ext]) => ext
        ? <a key={label} href={to} target="_blank" rel="noreferrer">{t(label)}</a>
        : <Link key={label} to={to}>{t(label)}</Link>)}
    </div>
  );
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>{t('Иммерсивный AI-маркетплейс недвижимости')}.</p>
          <div className="footer-social">
            <a href="/" title="Map"><Icon name="map" /></a>
            <a href="/agent" title="AI"><Icon name="bot" /></a>
            <a href="/docs" target="_blank" rel="noreferrer" title="API"><Icon name="info" /></a>
          </div>
        </div>
        {col('Продукт', [['Каталог', '/'], ['Карта', '/map'], ['ИИ-агент', '/agent'], ['Подбор', '/recommendations']])}
        {col('Компания', [['О проекте', '/'], ['Документация API', '/docs', true]])}
        {col('Поддержка', [['Связаться', '/messages'], ['Профиль', '/profile']])}
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} Nestora. {t('Все права защищены')}.</span>
        <div className="row">
          <a href="/docs" target="_blank" rel="noreferrer">API</a>
          <Link to="/">{t('Каталог')}</Link>
          <Link to="/map">{t('Карта')}</Link>
        </div>
      </div>
    </footer>
  );
}
