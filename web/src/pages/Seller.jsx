import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useToast } from '../lib/toast.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty, Avatar, Stars, Modal } from '../components/Common.jsx';
import { PropertyGrid } from '../components/PropertyCard.jsx';
import { fmtDate, ROLE_LABELS, DEAL_LABELS, money } from '../lib/format.js';

export function SellerPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useApp();
  const { lang } = useI18n();
  const toast = useToast();
  const [profile, setProfile] = useState(undefined);
  const [tab, setTab] = useState('all');           // all | rent | sale
  const [listings, setListings] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [revShown, setRevShown] = useState(6);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => { setProfile(undefined); api.publicProfile(id).then(setProfile).catch(() => setProfile(null)); }, [id]);

  useEffect(() => {
    const dt = tab === 'all' ? undefined : tab;
    setListings(null); setReviews(null); setRevShown(6);
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
      {reviews === null ? <Spinner /> : !reviews.length ? <div className="card card-pad muted center">Отзывов пока нет.</div> : reviews.slice(0, revShown).map((r) => (
        <SellerReviewCard key={r.id} r={r} lang={lang} onChanged={() => {
          const dt = tab === 'all' ? undefined : tab;
          api.sellerReviews(id, { deal_type: dt }).then((d) => setReviews(d.items)).catch(() => {});
        }} />
      ))}
      {reviews && reviews.length > revShown && (
        <div className="center mt-8">
          <button className="btn btn-ghost" onClick={() => setRevShown((n) => n + 6)}>Показать ещё отзывы</button>
        </div>
      )}

      {contactOpen && <ContactModal sellerName={profile.full_name} listings={listings} onClose={() => setContactOpen(false)} />}
    </div></div>
  );
}

function Stat({ v, l }) {
  return <div style={{ textAlign: 'center' }}><div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800 }}>{v}</div><div className="muted" style={{ fontSize: 13 }}>{l}</div></div>;
}

function SellerReviewCard({ r, lang, onChanged }) {
  const toast = useToast();
  const L = (ru, en) => (lang === 'ru' ? ru : en);
  const [tr, setTr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const hasCyrillic = /[\u0400-\u04FF]/.test(r.text || '');
  const reviewLang = (r.text || '').trim() ? (hasCyrillic ? 'ru' : 'en') : null;
  const canTranslate = reviewLang && reviewLang !== lang;

  async function toggleTranslate() {
    if (tr) { setTr(null); return; }
    setBusy(true);
    try {
      const res = await api.translateText(r.text, lang);
      if (res.translated) setTr(res.text); else toast(L('Перевод не требуется', 'No translation needed'), 'info');
    } catch (e) { toast(e.message, 'err'); }
    finally { setBusy(false); }
  }
  async function del() {
    if (!confirm(L('Удалить ваш отзыв?', 'Delete your review?'))) return;
    try { await api.deleteReview(r.property.id, r.id); toast(L('Отзыв удалён', 'Review deleted'), 'ok'); onChanged(); }
    catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="card review-thread mb-16">
      {r.property && (
        <Link className="review-listing" to={`/properties/${r.property.id}`}>
          {r.property.cover_url ? <img src={r.property.cover_url} alt="" /> : <div className="rl-ph"><Icon name="home" /></div>}
          <div className="rl-info">
            <div className="rl-title">{r.property.title}</div>
            <div className="rl-meta">
              <span className={`tag ${r.property.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`}>{DEAL_LABELS[r.property.deal_type]}</span>
              <span className="rl-price">{money(r.property.price)}{r.property.deal_type === 'rent' && <small> / ночь</small>}</span>
            </div>
          </div>
          <Icon name="arrow-right" />
        </Link>
      )}
      <div className="review-reply">
        <div className="review-reply-line" />
        <div className="review-reply-body">
          <div className="row" style={{ gap: 10, marginBottom: 6 }}>
            <Avatar user={r.user} size={36} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.user?.full_name || L('Пользователь', 'User')}</div>
              <Stars rating={r.rating} size={13} />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>{fmtDate(r.created_at)}</span>
          </div>
          {r.text && <p style={{ margin: 0, fontSize: 14.5 }}>{tr || r.text}</p>}
          <div className="row" style={{ gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {canTranslate && <button className="btn btn-ghost btn-sm" onClick={toggleTranslate} disabled={busy}>{busy ? <span className="spinner-sm" /> : <Icon name="globe" />} {tr ? L('Оригинал', 'Original') : L('Перевести', 'Translate')}</button>}
            {r.can_edit && <>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}><Icon name="edit" /> {L('Изменить', 'Edit')}</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={del}><Icon name="trash" /> {L('Удалить', 'Delete')}</button>
            </>}
          </div>
        </div>
      </div>
      {editing && <EditReviewModal r={r} lang={lang} onClose={() => setEditing(false)} onDone={() => { setEditing(false); onChanged(); }} />}
    </div>
  );
}

function EditReviewModal({ r, lang, onClose, onDone }) {
  const toast = useToast();
  const L = (ru, en) => (lang === 'ru' ? ru : en);
  const [rating, setRating] = useState(r.rating);
  const [text, setText] = useState(r.text || '');
  async function save() {
    try { await api.editReview(r.property.id, r.id, { rating, text: text.trim() || null }); toast(L('Отзыв обновлён', 'Review updated'), 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title={L('Изменить отзыв', 'Edit review')} onClose={onClose} footer={<button className="btn btn-primary" onClick={save}>{L('Сохранить', 'Save')}</button>}>
      <div className="field"><label>{L('Оценка', 'Rating')}</label><div className="star-picker"><Stars rating={rating} size={30} interactive onPick={setRating} /></div></div>
      <div className="field"><label>{L('Комментарий', 'Comment')}</label><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} /></div>
    </Modal>
  );
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
