import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty, Modal, Avatar, Stars } from '../components/Common.jsx';
import { PropertyGrid, PropertyCard } from '../components/PropertyCard.jsx';
import { money, fmtDate, timeAgo, mediaUrl, ROLE_LABELS } from '../lib/format.js';

function Page({ title, sub, actions, children }) {
  return <div className="page"><div className="container">
    <div className="page-head"><div><div className="page-title">{title}</div>{sub && <div className="page-sub">{sub}</div>}</div>{actions}</div>
    {children}
  </div></div>;
}
function useAuthGuard() {
  const { user } = useApp(); const nav = useNavigate();
  useEffect(() => { if (!user) nav('/auth'); }, [user]);
  return user;
}

export function FavoritesPage() {
  useAuthGuard();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const load = () => api.favorites().then((d) => setItems(d.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  async function clearAll() { if (confirm('Очистить избранное?')) { await api.clearFavorites(); toast('Избранное очищено', 'ok'); load(); } }
  return (
    <Page title="Избранное" sub="Сохранённые объекты" actions={items && items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearAll}><Icon name="trash" /> Очистить всё</button>}>
      {items === null ? <Spinner /> : items.length ? <PropertyGrid items={items} onFav={() => load()} /> : <Empty icon="heart-outline" title="Избранное пусто" sub="Добавляйте понравившиеся объекты сердечком" action={<Link className="btn btn-primary mt-16" to="/">В каталог</Link>} />}
    </Page>
  );
}

export function HistoryPage() {
  useAuthGuard();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const load = () => api.history({ limit: 50 }).then((d) => setItems(d.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  async function clearAll() { if (confirm('Очистить историю?')) { await api.clearHistory(); toast('История очищена', 'ok'); load(); } }
  return (
    <Page title="История просмотров" sub="Объекты, которые вы недавно открывали" actions={items && items.length > 0 && <button className="btn btn-ghost btn-sm" onClick={clearAll}><Icon name="trash" /> Очистить</button>}>
      {items === null ? <Spinner /> : !items.length ? <Empty icon="clock" title="История пуста" sub="Открывайте объекты, и они появятся здесь" /> : (
        <div className="grid grid-props">{items.map((it) => (
          <div key={it.id}><PropertyCard p={it.property} /><div className="muted center" style={{ fontSize: 12, marginTop: 6 }}><Icon name="eye" /> {timeAgo(it.viewed_at)}</div></div>
        ))}</div>
      )}
    </Page>
  );
}

export function RecommendationsPage() {
  const { user } = useApp(); const nav = useNavigate();
  useEffect(() => { if (!user) nav('/auth'); }, [user]);
  const [ai, setAi] = useState(null);
  const [basic, setBasic] = useState(null);
  const [query, setQuery] = useState('');
  const loadAi = () => { setAi(null); api.aiRecommendations({ limit: 9, query: query.trim() || undefined }).then(setAi).catch(() => setAi({ items: [], ai_used: false })); };
  useEffect(() => { loadAi(); api.recommendations({ limit: 8 }).then((d) => setBasic(d.items)).catch(() => setBasic([])); }, []);
  return (
    <Page title="Подбор для вас" sub="Рекомендации на основе вашей истории и избранного">
      <div className="card card-pad mb-16">
        <div className="row wrap" style={{ gap: 10 }}>
          <input className="input" style={{ maxWidth: 420 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Подсказка ИИ: например «для семьи с детьми»" />
          <button className="btn btn-primary" onClick={loadAi}><Icon name="sparkles" /> Подобрать с ИИ</button>
        </div>
      </div>
      <h2 className="section-title"><Icon name="sparkles" /> С объяснением от ИИ</h2>
      {ai === null ? <Spinner /> : !ai.items.length ? <Empty icon="search" title="Пока нет рекомендаций" sub="Посмотрите несколько объектов, чтобы ИИ понял ваши вкусы" /> : (
        <div className="grid grid-props">{ai.items.map((it) => (
          <div key={it.property.id}><PropertyCard p={it.property} />{it.reason && <div className="card" style={{ padding: '10px 12px', marginTop: 6, background: 'var(--brand-soft)', fontSize: 13, borderColor: 'transparent' }}><Icon name="bulb" /> {it.reason}</div>}</div>
        ))}</div>
      )}
      <h2 className="section-title mt-24">По вашим интересам</h2>
      {basic === null ? <Spinner /> : basic.length ? <PropertyGrid items={basic} /> : <Empty icon="inbox" title="Нет данных" />}
    </Page>
  );
}

export function BookingsPage() {
  useAuthGuard();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [props, setProps] = useState({});
  const load = async () => {
    try {
      const d = await api.bookings({ limit: 50 }); setItems(d.items);
      const ids = [...new Set(d.items.map((b) => b.property_id))];
      const map = {}; await Promise.all(ids.map(async (id) => { try { map[id] = await api.getProperty(id); } catch {} })); setProps(map);
    } catch { setItems([]); }
  };
  useEffect(() => { load(); }, []);
  const S = { pending: ['tag-warn', 'Ожидает оплаты'], confirmed: ['tag-ok', 'Подтверждено'], cancelled: ['tag-danger', 'Отменено'] };
  const PM = { unpaid: ['tag-warn', 'Не оплачено'], paid: ['tag-ok', 'Оплачено'], refunded: ['tag-muted', 'Возврат'] };
  return (
    <Page title="Мои бронирования" sub="Аренда и статусы оплаты">
      {items === null ? <Spinner /> : !items.length ? <Empty icon="calendar" title="Броней пока нет" sub="Забронируйте жильё из каталога аренды" /> : items.map((b) => {
        const prop = props[b.property_id]; const [sc, sl] = S[b.status] || ['tag-muted', b.status]; const [pc, pl] = PM[b.payment_status] || ['tag-muted', b.payment_status];
        return (
          <div key={b.id} className="card card-pad mb-16">
            <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
              {prop?.cover_url ? <img src={mediaUrl(prop.cover_url)} style={{ width: 120, height: 90, borderRadius: 12, objectFit: 'cover' }} /> : <div style={{ width: 120, height: 90, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeContent: 'center' }}><Icon name="home" size={30} /></div>}
              <div style={{ flex: 1 }}>
                <Link to={`/properties/${b.property_id}`} style={{ fontWeight: 700, fontSize: 16 }}>{prop ? prop.title : `Объект #${b.property_id}`}</Link>
                <div className="muted" style={{ fontSize: 14, margin: '4px 0' }}>{fmtDate(b.start_date)} → {fmtDate(b.end_date)}</div>
                <div className="row wrap" style={{ gap: 6 }}><span className={`tag ${sc}`}>{sl}</span><span className={`tag ${pc}`}>{pl}</span></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="prop-price" style={{ fontSize: 22 }}>{money(b.total_price)}</div>
                <div className="row" style={{ gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  {b.status === 'pending' && b.payment_status === 'unpaid' && <button className="btn btn-accent btn-sm" onClick={async () => { try { await api.payTest(b.id); toast('Оплачено!', 'ok'); load(); } catch (e) { toast(e.message, 'err'); } }}>Оплатить (тест)</button>}
                  {b.status !== 'cancelled' && <button className="btn btn-ghost btn-sm" onClick={async () => { if (confirm('Отменить бронь?')) { try { await api.cancelBooking(b.id); toast('Бронь отменена', 'ok'); load(); } catch (e) { toast(e.message, 'err'); } } }}>Отменить</button>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </Page>
  );
}

export function TrackersPage() {
  useAuthGuard();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [props, setProps] = useState({});
  const load = async () => {
    try { const r = await api.trackers(); setRows(r); const map = {}; await Promise.all([...new Set(r.map((t) => t.property_id))].map(async (id) => { try { map[id] = await api.getProperty(id); } catch {} })); setProps(map); } catch { setRows([]); }
  };
  useEffect(() => { load(); }, []);
  return (
    <Page title="Трекеры цен" sub="Уведомим, когда цена упадёт">
      {rows === null ? <Spinner /> : !rows.length ? <Empty icon="trending-down" title="Нет активных трекеров" sub="Добавьте трекер со страницы объекта" /> : rows.map((t) => {
        const prop = props[t.property_id];
        return (
          <div key={t.id} className="card card-pad mb-16"><div className="row-between">
            <div className="row" style={{ gap: 14 }}>
              {prop?.cover_url ? <img src={mediaUrl(prop.cover_url)} style={{ width: 80, height: 60, borderRadius: 10, objectFit: 'cover' }} /> : <div style={{ width: 80, height: 60, borderRadius: 10, background: 'var(--surface-2)', display: 'grid', placeContent: 'center' }}><Icon name="home" /></div>}
              <div><Link to={`/properties/${t.property_id}`} style={{ fontWeight: 700 }}>{prop ? prop.title : `Объект #${t.property_id}`}</Link>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>Текущая: {money(t.last_seen_price)} · Цель: {t.target_price ? money(t.target_price) : 'любое падение'}</div></div>
            </div>
            <button className="btn btn-danger-soft btn-sm" onClick={async () => { try { await api.removeTracker(t.property_id); toast('Трекер удалён', 'ok'); load(); } catch (e) { toast(e.message, 'err'); } }}>Убрать</button>
          </div></div>
        );
      })}
    </Page>
  );
}

export function RequestsPage() {
  useAuthGuard();
  const { isSeller } = useApp();
  const [items, setItems] = useState(null);
  const [props, setProps] = useState({});
  useEffect(() => {
    api.myRequests({ limit: 50 }).then(async (d) => {
      setItems(d.items); const map = {};
      await Promise.all([...new Set(d.items.map((r) => r.property_id))].map(async (id) => { try { map[id] = await api.getProperty(id); } catch {} })); setProps(map);
    }).catch(() => setItems([]));
  }, []);
  return (
    <Page title="Заявки на просмотр" sub={isSeller ? 'Заявки на просмотр ваших объектов' : 'Ваши заявки на просмотр'}>
      {items === null ? <Spinner /> : !items.length ? <Empty icon="mail" title="Заявок нет" /> : items.map((r) => {
        const prop = props[r.property_id];
        return (
          <div key={r.id} className="card card-pad mb-16">
            <div className="row-between mb-8"><Link to={`/properties/${r.property_id}`} style={{ fontWeight: 700, fontSize: 16 }}>{prop ? prop.title : `Объект #${r.property_id}`}</Link><span className="muted" style={{ fontSize: 13 }}>{timeAgo(r.created_at)}</span></div>
            {r.preferred_date && <span className="tag tag-muted"><Icon name="calendar" /> {fmtDate(r.preferred_date)}</span>}
            {r.message && <p style={{ marginTop: 8, marginBottom: 0 }}>{r.message}</p>}
          </div>
        );
      })}
    </Page>
  );
}

export function ProfilePage() {
  const user = useAuthGuard();
  const { setUser, logout, isSeller } = useApp();
  const toast = useToast(); const nav = useNavigate();
  const [f, setF] = useState({ full_name: '', phone: '', company_name: '' });
  const [pwModal, setPwModal] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => { if (user) setF({ full_name: user.full_name || '', phone: user.phone || '', company_name: user.company_name || '' }); }, [user]);
  if (!user) return null;

  async function save() {
    try { const u = await api.updateMe({ full_name: f.full_name.trim(), phone: f.phone.trim() || null, company_name: isSeller ? (f.company_name.trim() || null) : undefined }); setUser(u); toast('Профиль сохранён', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  }
  async function uploadAvatar(file) {
    if (!file) return; const fd = new FormData(); fd.append('file', file);
    try { const u = await api.uploadAvatar(fd); setUser(u); toast('Аватар обновлён', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  async function removeAccount() {
    if (!confirm('Удалить аккаунт? Это необратимо.')) return;
    try { await api.deleteMe(); logout(); toast('Аккаунт удалён', 'ok'); nav('/auth'); } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <Page title="Профиль" sub="Управление аккаунтом">
      <div style={{ maxWidth: 560 }}>
        <div className="card card-pad">
          <div className="row" style={{ gap: 18, marginBottom: 20 }}>
            <Avatar user={user} size={90} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{user.full_name || 'Без имени'}</div>
              <div className="muted">{user.email}</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <span className="tag tag-muted">{ROLE_LABELS[user.role]}</span>
                {user.is_email_verified ? <span className="tag tag-ok">Email подтверждён</span> : <span className="tag tag-warn">Email не подтверждён</span>}
              </div>
              <button className="btn btn-soft btn-sm mt-8" onClick={() => fileRef.current.click()}><Icon name="camera" /> Сменить фото</button>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadAvatar(e.target.files[0])} />
            </div>
          </div>
          <div className="field"><label>Имя</label><input className="input" value={f.full_name} onChange={(e) => setF((s) => ({ ...s, full_name: e.target.value }))} /></div>
          <div className="field"><label>Телефон</label><input className="input" value={f.phone} onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))} /></div>
          {isSeller && <div className="field"><label>Компания / агентство</label><input className="input" value={f.company_name} onChange={(e) => setF((s) => ({ ...s, company_name: e.target.value }))} /></div>}
          <button className="btn btn-primary" onClick={save}>Сохранить</button>
        </div>
        <div className="card card-pad mt-16">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}><Icon name="lock" /> Безопасность</h3>
          <button className="btn btn-ghost" onClick={() => setPwModal(true)}>Сменить пароль</button>
        </div>
        <div className="card card-pad mt-16" style={{ borderColor: 'var(--danger-soft)' }}>
          <h3 style={{ fontSize: 16, marginBottom: 8, color: 'var(--danger)' }}>Опасная зона</h3>
          <p className="muted" style={{ fontSize: 14 }}>Удаление аккаунта необратимо.</p>
          <button className="btn btn-danger-soft mt-8" onClick={removeAccount}>Удалить аккаунт</button>
        </div>
      </div>
      {pwModal && <PasswordModal onClose={() => setPwModal(false)} onDone={() => { logout(); nav('/auth'); }} />}
    </Page>
  );
}

function PasswordModal({ onClose, onDone }) {
  const toast = useToast();
  const [oldp, setOldp] = useState(''); const [newp, setNewp] = useState('');
  async function save() {
    try { await api.changePassword({ old_password: oldp, new_password: newp }); toast('Пароль изменён. Войдите заново.', 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Смена пароля" onClose={onClose} footer={<button className="btn btn-primary" onClick={save}>Сменить</button>}>
      <div className="field"><label>Текущий пароль</label><input className="input" type="password" value={oldp} onChange={(e) => setOldp(e.target.value)} /></div>
      <div className="field"><label>Новый пароль</label><input className="input" type="password" value={newp} onChange={(e) => setNewp(e.target.value)} /></div>
    </Modal>
  );
}
