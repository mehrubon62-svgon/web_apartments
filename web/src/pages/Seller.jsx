import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty, Avatar, Stars, Modal } from '../components/Common.jsx';
import { PropertyGrid } from '../components/PropertyCard.jsx';
import { fmtDate, ROLE_LABELS } from '../lib/format.js';

export function SellerPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useApp();
  const toast = useToast();
  const [profile, setProfile] = useState(undefined);
  const [tab, setTab] = useState('all');           // all | rent | sale
  const [listings, setListings] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => { setProfile(undefined); api.publicProfile(id).then(setProfile).catch(() => setProfile(null)); window.scrollTo(0, 0); }, [id]);

  useEffect(() => {
    const dt = tab === 'all' ? undefined : tab;
    setListings(null); setReviews(null);
    api.sellerListings(id, { deal_type: dt }).then((d) => setListings(d.items)).catch(() => setListings([]));
    api.sellerReviews(id, { deal_type: dt }).then((d) => setReviews(d.items)).catch(() => setReviews([]));
  }, [id, tab]);

  if (profile === undefined) return <div className="page"><div className="container"><Spinner big /></div></div>;
  if (profile === null) return <div className="page"><div className="container"><Empty icon="user" title="Профиль не найден" /></div></div>;

  const isSelf = user && user.id === profile.id;

  return (
    <div className="page"><div className="container">
      <button className="btn btn-ghost btn-sm mb-16" onClick={() => nav(-1)}><Icon name="arrow-left" /> Назад</button>

      <div className="card card-pad" style={{ marginBottom: 24 }}>
        <div className="row" style={{ gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Avatar user={profile} size={88} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <h1 className="page-title" style={{ fontSize: 26 }}>{profile.full_name || profile.company_name || 'Продавец'}</h1>
            <div className="row wrap" style={{ gap: 8, margin: '8px 0' }}>
              <span className="tag tag-soft tag-muted">{ROLE_LABELS[profile.role] || profile.role}</span>
              {profile.company_name && <span className="tag tag-muted"><Icon name="building" /> {profile.company_name}</span>}
              {profile.is_email_verified && <span className="tag tag-ok"><Icon name="check" /> Подтверждён</span>}
            </div>
            {profile.created_at && <div className="muted" style={{ fontSize: 13 }}>На Nestora с {fmtDate(profile.created_at)}</div>}
          </div>
          <div className="row" style={{ gap: 24, alignItems: 'center' }}>
            <Stat v={profile.listings_count} l="Объектов" />
            <Stat v={profile.reviews_count} l="Отзывов" />
            <div style={{ textAlign: 'center' }}>
              <div className="sv" style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800 }}>{profile.avg_rating ? profile.avg_rating.toFixed(1) : '—'}</div>
              <div className="muted" style={{ fontSize: 13 }}>{profile.avg_rating ? <Stars rating={Math.round(profile.avg_rating)} size={13} /> : 'Рейтинг'}</div>
            </div>
          </div>
        </div>
        {!isSelf && user && (
          <div className="mt-16"><button className="btn btn-primary" onClick={() => setContactOpen(true)}><Icon name="chat" /> Написать продавцу</button></div>
        )}
      </div>

      <div className="tabs">
        {[['all', 'Все объекты'], ['rent', 'Аренда'], ['sale', 'Продажа']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <h2 className="section-title">Объявления</h2>
      {listings === null ? <Spinner /> : listings.length ? <PropertyGrid items={listings} /> : <Empty icon="home" title="Нет объявлений" sub="У продавца нет активных объектов в этой категории" />}

      <h2 className="section-title mt-24">
        Отзывы {tab !== 'all' && <span className="muted" style={{ fontSize: 15, fontWeight: 400 }}>({tab === 'rent' ? 'аренда' : 'продажа'})</span>}
      </h2>
      {reviews === null ? <Spinner /> : !reviews.length ? <div className="card card-pad muted center">Отзывов пока нет.</div> : reviews.map((r) => (
        <div key={r.id} className="card card-pad mb-16">
          <div className="row" style={{ gap: 12, marginBottom: 8 }}>
            <Avatar user={r.user} size={40} />
            <div>
              <div style={{ fontWeight: 700 }}>{r.user?.full_name || 'Пользователь'}</div>
              <Stars rating={r.rating} />
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div className="muted">{fmtDate(r.created_at)}</div>
              {r.property && <a className="muted" style={{ fontSize: 12 }} href={`#/properties/${r.property.id}`}>{r.property.title}</a>}
            </div>
          </div>
          {r.text && <p style={{ margin: 0 }}>{r.text}</p>}
        </div>
      ))}

      {contactOpen && <ContactModal sellerName={profile.full_name} listings={listings} onClose={() => setContactOpen(false)} />}
    </div></div>
  );
}

function Stat({ v, l }) {
  return <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800 }}>{v}</div><div className="muted" style={{ fontSize: 13 }}>{l}</div></div>;
}

function ContactModal({ sellerName, listings, onClose }) {
  const toast = useToast();
  const nav = useNavigate();
  const [text, setText] = useState('');
  const first = listings && listings[0];
  async function send() {
    if (!first) return toast('У продавца нет объектов для начала диалога', 'err');
    try { await api.startConversation({ property_id: first.id, text: text.trim() || 'Здравствуйте!' }); toast('Диалог создан', 'ok'); onClose(); nav('/messages'); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title={`Написать: ${sellerName || 'продавец'}`} onClose={onClose} footer={<button className="btn btn-primary" onClick={send}>Начать диалог</button>}>
      <p className="muted mb-8">Диалог откроется по одному из объектов продавца.</p>
      <div className="field"><label>Сообщение</label><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Здравствуйте! Интересуют ваши объекты..." /></div>
    </Modal>
  );
}
