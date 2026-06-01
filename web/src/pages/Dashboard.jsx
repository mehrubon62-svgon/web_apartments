import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty, Modal } from '../components/Common.jsx';
import { money, mediaUrl, TYPE_LABELS, DEAL_LABELS, STATUS_LABELS } from '../lib/format.js';

export function DashboardPage() {
  const { isSeller } = useApp();
  const nav = useNavigate();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [editor, setEditor] = useState(null);
  const [tourEditor, setTourEditor] = useState(null);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => { if (!isSeller) { nav('/'); return; } load(); }, [isSeller]);
  const load = () => api.myListings().then((d) => setItems(d.items)).catch(() => setItems([]));

  if (!isSeller) return null;
  const stats = items ? {
    total: items.length, active: items.filter((p) => p.status === 'active').length,
    views: items.reduce((s, p) => s + (p.views_count || 0), 0), tours: items.filter((p) => p.has_tour).length,
  } : null;

  return (
    <div className="page"><div className="container">
      <div className="page-head">
        <div><div className="page-title"><Icon name="chart" /> Кабинет продавца</div><div className="page-sub">Ваши объекты и аналитика</div></div>
        <button className="btn btn-primary" onClick={() => setEditor({})}><Icon name="plus" /> Новый объект</button>
      </div>
      {stats && <div className="stat-grid">
        <Stat icon="home" v={stats.total} l="Объектов" /><Stat icon="check" v={stats.active} l="Активных" />
        <Stat icon="eye" v={stats.views} l="Просмотров" /><Stat icon="globe" v={stats.tours} l="С 360°-туром" />
      </div>}
      {items === null ? <Spinner /> : !items.length ? <Empty icon="construction" title="Объектов пока нет" sub="Создайте первое объявление" action={<button className="btn btn-primary mt-16" onClick={() => setEditor({})}>Новый объект</button>} /> : items.map((p) => (
        <ListingRow key={p.id} p={p} onChange={load} onEdit={() => setEditor(p)} onTour={() => setTourEditor(p)} onAnalytics={() => setAnalytics(p)} />
      ))}
      {editor && <PropertyEditor existing={editor.id ? editor : null} onClose={() => setEditor(null)} onDone={() => { setEditor(null); load(); }} />}
      {tourEditor && <TourEditor p={tourEditor} onClose={() => setTourEditor(null)} />}
      {analytics && <AnalyticsModal p={analytics} onClose={() => setAnalytics(null)} />}
    </div></div>
  );
}
function Stat({ icon, v, l }) { return <div className="stat"><div className="si"><Icon name={icon} size={22} /></div><div className="sv">{v}</div><div className="sl">{l}</div></div>; }

function ListingRow({ p, onChange, onEdit, onTour, onAnalytics }) {
  const toast = useToast();
  const st = { active: 'tag-ok', paused: 'tag-warn', deleted: 'tag-danger' }[p.status] || 'tag-muted';
  return (
    <div className="card card-pad mb-16"><div className="row" style={{ gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {p.cover_url ? <img src={mediaUrl(p.cover_url)} style={{ width: 130, height: 95, borderRadius: 12, objectFit: 'cover' }} /> : <div style={{ width: 130, height: 95, borderRadius: 12, background: 'var(--surface-2)', display: 'grid', placeContent: 'center' }}><Icon name="home" size={32} /></div>}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="row wrap" style={{ gap: 6, marginBottom: 6 }}>
          <span className={`tag ${st}`}>{STATUS_LABELS[p.status]}</span>
          <span className={`tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`}>{DEAL_LABELS[p.deal_type]}</span>
          {p.has_tour && <span className="tag tag-muted"><Icon name="globe" /> 360°</span>}
        </div>
        <Link to={`/properties/${p.id}`} style={{ fontWeight: 700, fontSize: 16 }}>{p.title}</Link>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{money(p.price)} · {p.area} м² · <Icon name="eye" /> {p.views_count}</div>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-soft btn-sm" onClick={onAnalytics}><Icon name="chart" /> Аналитика</button>
        <button className="btn btn-soft btn-sm" onClick={onTour}><Icon name="globe" /> Тур</button>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}><Icon name="edit" /></button>
        {p.status === 'active'
          ? <button className="btn btn-ghost btn-sm" onClick={async () => { await api.pauseListing(p.id); toast('На паузе', 'ok'); onChange(); }}><Icon name="pause" /> Пауза</button>
          : <button className="btn btn-ghost btn-sm" onClick={async () => { await api.activateListing(p.id); toast('Активно', 'ok'); onChange(); }}><Icon name="play" /> Активировать</button>}
        <button className="btn btn-danger-soft btn-sm" onClick={async () => { if (confirm('Удалить объект?')) { await api.deleteProperty(p.id); toast('Удалено', 'ok'); onChange(); } }}><Icon name="trash" /></button>
      </div>
    </div></div>
  );
}

function AnalyticsModal({ p, onClose }) {
  const [a, setA] = useState(null);
  useEffect(() => { api.listingAnalytics(p.id).then(setA).catch(() => setA(null)); }, [p.id]);
  return (
    <Modal title={`Аналитика — ${p.title}`} onClose={onClose} large>
      {!a ? <Spinner /> : <>
        <div className="stat-grid">
          <Stat icon="eye" v={a.total_views} l="Просмотров" /><Stat icon="search" v={a.spatial_questions} l="Spatial Q&A" />
          <Stat icon="calendar" v={a.booking_requests} l="Броней" /><Stat icon="mail" v={a.purchase_requests} l="Заявок" />
        </div>
        {a.top_zones?.length > 0 && <><h3 style={{ fontSize: 16, margin: '8px 0 12px' }}><Icon name="fire" /> Самые обсуждаемые зоны</h3>
          {a.top_zones.map((z, i) => <div key={i} className="fact-row"><span className="k">{z.room_id || 'Без комнаты'}</span><span className="v">{z.count} вопросов</span></div>)}</>}
      </>}
    </Modal>
  );
}

function PropertyEditor({ existing, onClose, onDone }) {
  const toast = useToast();
  const isEdit = !!existing;
  const [f, setF] = useState({
    title: existing?.title || '', description: existing?.description || '', type: existing?.type || 'apartment',
    deal_type: existing?.deal_type || 'rent', rent_term: existing?.rent_term || 'short', price: existing?.price || '',
    area: existing?.area || '', rooms: existing?.rooms ?? '', address: existing?.address || '',
    lat: existing?.lat ?? '', lng: existing?.lng ?? '', house_rules: existing?.house_rules || '',
  });
  const [media, setMedia] = useState(existing ? (existing.media || []).map((m) => ({ url: m.url, type: m.type, order: m.order })) : []);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));

  async function upload(file, kind) {
    if (!file) return; const fd = new FormData(); fd.append('file', file);
    try { toast('Загрузка...', 'info'); const r = await api.upload(fd); setMedia((m) => [...m, { url: r.url, type: kind, order: m.length }]); } catch (e) { toast(e.message, 'err'); }
  }
  async function save() {
    const payload = {
      title: f.title.trim(), description: f.description.trim() || null, type: f.type, deal_type: f.deal_type,
      rent_term: f.deal_type === 'rent' ? f.rent_term : null, price: Number(f.price), area: Number(f.area),
      rooms: f.rooms ? Number(f.rooms) : null, address: f.address.trim() || null,
      lat: f.lat ? Number(f.lat) : null, lng: f.lng ? Number(f.lng) : null, house_rules: f.house_rules.trim() || null,
    };
    if (!payload.title || payload.title.length < 3) return toast('Введите заголовок (мин. 3)', 'err');
    if (!payload.price || payload.price <= 0) return toast('Укажите цену', 'err');
    if (!payload.area || payload.area <= 0) return toast('Укажите площадь', 'err');
    try {
      if (isEdit) { await api.updateProperty(existing.id, payload); toast('Объект обновлён', 'ok'); }
      else { payload.media = media; await api.createProperty(payload); toast('Объект опубликован', 'ok'); }
      onDone();
    } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <Modal title={isEdit ? 'Редактировать объект' : 'Новый объект'} onClose={onClose} large footer={<button className="btn btn-primary" onClick={save}>{isEdit ? 'Сохранить' : 'Опубликовать'}</button>}>
      <div className="field"><label>Заголовок</label><input className="input" value={f.title} onChange={(e) => set('title', e.target.value)} /></div>
      <div className="field"><label>Описание</label><textarea className="textarea" value={f.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field"><label>Тип</label><select className="select" value={f.type} onChange={(e) => set('type', e.target.value)}>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        <div className="field"><label>Сделка</label><select className="select" value={f.deal_type} onChange={(e) => set('deal_type', e.target.value)}>{Object.entries(DEAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      </div>
      {f.deal_type === 'rent' && <div className="field"><label>Срок аренды</label><select className="select" value={f.rent_term} onChange={(e) => set('rent_term', e.target.value)}><option value="short">Краткосрочно</option><option value="long">Долгосрочно</option></select></div>}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div className="field"><label>{f.deal_type === 'rent' ? 'Цена/ночь, $' : 'Цена, $'}</label><input className="input" type="number" value={f.price} onChange={(e) => set('price', e.target.value)} /></div>
        <div className="field"><label>Площадь, м²</label><input className="input" type="number" value={f.area} onChange={(e) => set('area', e.target.value)} /></div>
        <div className="field"><label>Комнат</label><input className="input" type="number" value={f.rooms} onChange={(e) => set('rooms', e.target.value)} /></div>
      </div>
      <div className="field"><label>Адрес</label><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
      <p className="hint">Координаты можно не указывать — определим по адресу (Mapbox).</p>
      <div className="field"><label>Правила дома</label><textarea className="textarea" value={f.house_rules} onChange={(e) => set('house_rules', e.target.value)} /></div>
      <div className="field">
        <label>Фото и 360°-панорамы</label>
        <div className="row" style={{ gap: 8 }}>
          <label className="btn btn-soft btn-sm"><Icon name="image" /> Добавить фото<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files[0], 'photo')} /></label>
          <label className="btn btn-soft btn-sm"><Icon name="globe" /> Добавить 360°<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => upload(e.target.files[0], '360')} /></label>
        </div>
        <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
          {media.map((m, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img src={mediaUrl(m.url)} style={{ width: 84, height: 64, objectFit: 'cover', borderRadius: 10, border: m.type === '360' ? '2px solid var(--brand)' : '1px solid var(--line)' }} />
              <button className="prop-fav" style={{ width: 22, height: 22, top: -6, right: -6 }} onClick={() => setMedia((arr) => arr.filter((_, j) => j !== i))}><Icon name="close" /></button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TourEditor({ p, onClose }) {
  const toast = useToast();
  const [rooms, setRooms] = useState([]);
  const [first, setFirst] = useState(null);
  useEffect(() => { api.getTour(p.id).then((t) => { setRooms(t.rooms.map((r) => ({ ...r, links: r.links || [] }))); setFirst(t.first_room_id); }).catch(() => { setRooms([]); }); }, [p.id]);

  function upd(i, patch) { setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); }
  async function uploadPano(i, file) {
    if (!file) return; const fd = new FormData(); fd.append('file', file);
    try { const up = await api.upload(fd); upd(i, { media_url: up.url }); toast('Панорама загружена', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  async function save() {
    if (!rooms.length) return toast('Добавьте хотя бы одну комнату', 'err');
    for (const r of rooms) if (!r.id || !r.media_url) return toast('У каждой комнаты должны быть ID и панорама', 'err');
    try { await api.upsertTour(p.id, { rooms, first_room_id: first || rooms[0].id }); toast('Тур сохранён', 'ok'); onClose(); } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <Modal title={`Редактор 360°-тура — ${p.title}`} onClose={onClose} large footer={<button className="btn btn-primary" onClick={save}>Сохранить тур</button>}>
      <p className="hint mb-8">Каждая комната — панорама. Переходы между комнатами работают как стрелки в Google Street View.</p>
      {rooms.map((r, i) => (
        <div key={i} className="card card-pad mb-16">
          <div className="row-between mb-8">
            <strong>Комната {i + 1}</strong>
            <div className="row" style={{ gap: 6 }}>
              <label className="row" style={{ gap: 4, fontSize: 13 }}><input type="radio" name="firstroom" checked={first === r.id} onChange={() => setFirst(r.id)} /> Стартовая</label>
              <button className="btn btn-danger-soft btn-sm" onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}><Icon name="trash" /></button>
            </div>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div className="field" style={{ margin: 0 }}><label>ID</label><input className="input" value={r.id} onChange={(e) => upd(i, { id: e.target.value.trim() })} /></div>
            <div className="field" style={{ margin: 0 }}><label>Название</label><input className="input" value={r.name || ''} onChange={(e) => upd(i, { name: e.target.value })} /></div>
          </div>
          <div className="field" style={{ margin: '8px 0 0' }}><label>Панорама (URL или загрузка)</label>
            <div className="row" style={{ gap: 6 }}>
              <input className="input" value={r.media_url || ''} onChange={(e) => upd(i, { media_url: e.target.value })} placeholder="URL панорамы" />
              <label className="btn btn-soft btn-sm"><Icon name="upload" /><input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => uploadPano(i, e.target.files[0])} /></label>
            </div>
          </div>
          <RoomLinks room={r} rooms={rooms} onChange={(links) => upd(i, { links })} />
        </div>
      ))}
      <button className="btn btn-soft" onClick={() => setRooms((rs) => [...rs, { id: 'room' + (rs.length + 1), name: '', media_url: '', links: [] }])}><Icon name="plus" /> Добавить комнату</button>
    </Modal>
  );
}
function RoomLinks({ room, rooms, onChange }) {
  const links = room.links || [];
  const upd = (i, patch) => onChange(links.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div style={{ marginTop: 8 }}>
      <label className="muted" style={{ fontSize: 12, fontWeight: 700 }}>Переходы (стрелки в др. комнаты)</label>
      {links.map((l, i) => (
        <div key={i} className="row" style={{ gap: 6, marginBottom: 6 }}>
          <span>→</span>
          <select className="select" style={{ flex: 1 }} value={l.to_room_id || ''} onChange={(e) => upd(i, { to_room_id: e.target.value })}>
            <option value="">—</option>{rooms.filter((x) => x.id !== room.id).map((x) => <option key={x.id} value={x.id}>{x.name || x.id}</option>)}
          </select>
          <input className="input" style={{ width: 90 }} type="number" value={l.yaw ?? 0} onChange={(e) => upd(i, { yaw: Number(e.target.value) })} placeholder="yaw" />
          <input className="input" style={{ width: 120 }} value={l.label || ''} onChange={(e) => upd(i, { label: e.target.value })} placeholder="метка" />
          <button className="btn btn-danger-soft btn-sm" onClick={() => onChange(links.filter((_, j) => j !== i))}><Icon name="close" /></button>
        </div>
      ))}
      <button className="btn btn-ghost btn-sm" onClick={() => onChange([...links, { to_room_id: '', yaw: 0, label: 'Перейти' }])}><Icon name="plus" /> переход</button>
    </div>
  );
}
