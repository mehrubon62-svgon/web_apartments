import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty } from '../components/Common.jsx';
import { fmtDate, timeAgo } from '../lib/format.js';

const DECISION = { unfounded: ['tag-muted', 'Без действий'], warning: ['tag-warn', 'Предупреждение'], ban: ['tag-danger', 'Блокировка'] };

export function AdminPage() {
  const { isAdmin } = useApp();
  const nav = useNavigate();
  const [tab, setTab] = useState('complaints');
  useEffect(() => { if (!isAdmin) nav('/'); }, [isAdmin]);
  if (!isAdmin) return null;
  return (
    <div className="page"><div className="container">
      <div className="page-head"><div><div className="page-title"><Icon name="shield" /> Модерация</div><div className="page-sub">Жалобы на продавцов и автоматические решения ИИ</div></div></div>
      <div className="tabs">
        <button className={tab === 'complaints' ? 'active' : ''} onClick={() => setTab('complaints')}>Жалобы</button>
        <button className={tab === 'moderation' ? 'active' : ''} onClick={() => setTab('moderation')}>Решения ИИ-модерации</button>
      </div>
      {tab === 'complaints' ? <Complaints /> : <Moderation />}
    </div></div>
  );
}

function Complaints() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  const load = () => api.adminComplaints({ limit: 200 }).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (items === null) return <Spinner />;
  if (!items.length) return <Empty icon="shield" title="Жалоб нет" sub="Пока никто не жаловался на продавцов" />;
  const groups = {};
  items.forEach((c) => { (groups[c.seller_id] = groups[c.seller_id] || []).push(c); });
  async function decide(sid, decision) {
    if (!confirm(`Применить решение для продавца #${sid}?`)) return;
    try { await api.adminOverride(Number(sid), { decision }); toast('Решение применено', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  return Object.entries(groups).map(([sid, list]) => (
    <div key={sid} className="card card-pad mb-16">
      <div className="row-between mb-8"><strong>Продавец #{sid}</strong><span className={`tag ${list.length >= 3 ? 'tag-danger' : 'tag-warn'}`}>{list.length} жалоб</span></div>
      {list.map((c) => (
        <div key={c.id} className="fact-row">
          <span>{c.reason}{c.property_id && <Link className="muted" style={{ marginLeft: 8, fontSize: 12 }} to={`/properties/${c.property_id}`}>· объект #{c.property_id}</Link>}</span>
          <span className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{timeAgo(c.created_at)}</span>
        </div>
      ))}
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => decide(sid, 'unfounded')}>Снять обвинения</button>
        <button className="btn btn-soft btn-sm" onClick={() => decide(sid, 'warning')}>Предупредить</button>
        <button className="btn btn-danger-soft btn-sm" onClick={() => decide(sid, 'ban')}>Заблокировать</button>
        <button className="btn btn-ghost btn-sm" onClick={async () => { try { await api.adminUnban(Number(sid)); toast('Разбанен', 'ok'); } catch (e) { toast(e.message, 'err'); } }}>Разбанить</button>
      </div>
    </div>
  ));
}

function Moderation() {
  const toast = useToast();
  const [items, setItems] = useState(null);
  useEffect(() => { api.adminModeration({ limit: 200 }).then(setItems).catch(() => setItems([])); }, []);
  if (items === null) return <Spinner />;
  if (!items.length) return <Empty icon="bot" title="Решений нет" sub="ИИ ещё не выносил решений по модерации" />;
  return (
    <div className="card" style={{ overflow: 'auto' }}>
      <table className="table">
        <thead><tr><th>Продавец</th><th>Решение</th><th>Обоснование ИИ</th><th>Источник</th><th>Дата</th><th /></tr></thead>
        <tbody>{items.map((m) => {
          const [cls, label] = DECISION[m.decision] || ['tag-muted', m.decision];
          return (
            <tr key={m.id}>
              <td>#{m.seller_id}</td>
              <td><span className={`tag ${cls}`}>{label}</span></td>
              <td className="muted" style={{ maxWidth: 360 }}>{m.ai_reasoning || '—'}</td>
              <td>{m.overridden_by_admin ? <span className="tag tag-muted"><Icon name="user" /> админ</span> : <span className="tag tag-muted"><Icon name="bot" /> ИИ</span>}</td>
              <td className="muted" style={{ fontSize: 13 }}>{fmtDate(m.created_at)}</td>
              <td><button className="btn btn-ghost btn-sm" onClick={async () => { try { await api.adminUnban(m.seller_id); toast('Разбанен', 'ok'); } catch (e) { toast(e.message, 'err'); } }}>Разбан</button></td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
