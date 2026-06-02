import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApp } from '../lib/store.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty, Modal, Avatar, Stars } from '../components/Common.jsx';
import { PropertyGrid } from '../components/PropertyCard.jsx';
import { money, fmtDate, mediaUrl, TYPE_LABELS, DEAL_LABELS, TERM_LABELS, VERDICT, ROLE_LABELS } from '../lib/format.js';

export function PropertyPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useApp();
  const { lang, t } = useI18n();
  const toast = useToast();
  const [p, setP] = useState(undefined);
  const [tab, setTab] = useState('desc');
  const [modal, setModal] = useState(null);
  const [aiPrefetch, setAiPrefetch] = useState(null);
  const [translation, setTranslation] = useState(null);   // {title, description, translated}
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    setP(undefined); setTab('desc'); setAiPrefetch(null); setTranslation(null);
    api.getProperty(id).then(setP).catch(() => setP(null));
    // Warm the AI review in the background so the tab is instant when opened.
    api.aiReview(id, lang).then(setAiPrefetch).catch(() => {});
  }, [id, lang]);

  if (p === undefined) return <div className="page"><div className="container"><Spinner big /></div></div>;
  if (p === null) return <div className="page"><div className="container"><Empty icon="home" title="Объект не найден" action={<Link className="btn btn-primary mt-16" to="/">В каталог</Link>} /></div></div>;

  const photos = (p.media || []).filter((m) => m.type === 'photo');
  const isOwner = user && p.seller && p.seller.id === user.id;

  const tabs = [
    ['desc', 'Описание'],
    ['ai', 'AI-оценка'],
    p.deal_type === 'sale' && ['price', 'История цен'],
    p.deal_type === 'sale' && ['mortgage', 'Ипотека'],
    p.deal_type === 'rent' && ['reviews', 'Отзывы'],
    p.deal_type === 'rent' && ['availability', 'Доступность'],
    ['similar', 'Похожие'],
  ].filter(Boolean);

  async function toggleTranslate() {
    if (translation) { setTranslation(null); return; }  // show original again
    setTranslating(true);
    try {
      const r = await api.translateListing(id, lang);
      if (r.translated) setTranslation(r);
      else toast(lang === 'ru' ? 'Уже на русском' : 'Already in English', 'info');
    } catch (e) { toast(e.message, 'err'); }
    finally { setTranslating(false); }
  }

  const shownTitle = translation ? translation.title : p.title;
  const shownDesc = translation ? translation.description : p.description;

  return (
    <div className="page">
      <div className="container">
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}><Icon name="arrow-left" /> Назад</button>
        </div>
        <div className="detail-grid">
          <div>
            <Gallery p={p} photos={photos} />
            <div style={{ marginTop: 24 }}>
              <div className="row wrap" style={{ gap: 8, marginBottom: 14 }}>
                <span className={`tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`}>{DEAL_LABELS[p.deal_type]}</span>
                <span className="tag tag-muted">{TYPE_LABELS[p.type]}</span>
                {p.rent_term && <span className="tag tag-muted">{TERM_LABELS[p.rent_term]}</span>}
                {p.has_tour && <span className="tag tag-ok"><Icon name="globe" /> 360° тур</span>}
              </div>
              <div className="row-between wrap" style={{ gap: 10 }}>
                <h1 className="page-title" style={{ fontSize: 28 }}>{shownTitle}</h1>
                <button className="btn btn-ghost btn-sm" onClick={toggleTranslate} disabled={translating}>
                  {translating ? <span className="spinner-sm" /> : <Icon name="globe" />}
                  {translation ? (lang === 'ru' ? ' Оригинал' : ' Original') : (lang === 'ru' ? ' Перевести' : ' Translate')}
                </button>
              </div>
              <p className="page-sub">{p.address || 'Адрес не указан'}</p>

              <div className="tabs" style={{ marginTop: 22 }}>
                {tabs.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
              </div>
              <TabContent tab={tab} p={p} desc={shownDesc} aiPrefetch={aiPrefetch} onChanged={() => api.getProperty(id).then(setP)} />
            </div>
          </div>
          <Sidebar p={p} isOwner={isOwner} user={user} setModal={setModal} />
        </div>
      </div>
      {modal}
    </div>
  );
}

function Gallery({ p, photos }) {
  const nav = useNavigate();
  const [active, setActive] = useState(p.cover_url || (photos[0] && photos[0].url) || null);
  return (
    <div className="gallery">
      <div className="gallery-main">
        {active ? <img src={mediaUrl(active)} alt={p.title} /> : <div className="ph"><Icon name="home" size={60} /></div>}
        {p.has_tour && <button className="gallery-tour-btn" onClick={() => nav(`/properties/${p.id}/tour`)}><Icon name="globe" /> Открыть 360° тур</button>}
      </div>
      {photos.length > 1 && (
        <div className="gallery-thumbs">
          {photos.map((m) => <img key={m.id} src={mediaUrl(m.url)} className={active === m.url ? 'active' : ''} onClick={() => setActive(m.url)} />)}
        </div>
      )}
    </div>
  );
}

function TabContent({ tab, p, desc, aiPrefetch, onChanged }) {
  if (tab === 'desc') return (
    <div className="card card-pad">
      <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{(desc ?? p.description) || 'Описание отсутствует.'}</p>
      {p.house_rules && <div className="mt-16"><h3 style={{ fontSize: 16, marginBottom: 8 }}>Правила дома</h3><p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.house_rules}</p></div>}
    </div>
  );
  if (tab === 'ai') return <AiReview id={p.id} prefetch={aiPrefetch} />;
  if (tab === 'price') return <PriceHistory id={p.id} />;
  if (tab === 'mortgage') return <Mortgage p={p} />;
  if (tab === 'reviews') return <Reviews p={p} onChanged={onChanged} />;
  if (tab === 'availability') return <Availability id={p.id} />;
  if (tab === 'similar') return <Similar id={p.id} />;
  return null;
}

function AiReview({ id, prefetch }) {
  const { lang, t } = useI18n();
  const [r, setR] = useState(prefetch || undefined);
  useEffect(() => {
    if (prefetch) { setR(prefetch); return; }
    setR(undefined);
    api.aiReview(id, lang).then(setR).catch(() => setR(null));
  }, [id, lang, prefetch]);
  if (r === undefined) return <Spinner />;
  if (!r) return <div className="card card-pad muted">{t('Не удалось получить оценку.') || 'Не удалось получить оценку.'}</div>;
  const v = VERDICT[r.verdict] || VERDICT.insufficient_data;
  const riskLabel = { low: 'низкий', medium: 'средний', high: 'высокий', unknown: 'неизвестно' }[r.scam_risk] || r.scam_risk;
  const m = r.market || {};
  const facts = [];
  if (m.market_median_price != null) facts.push([t('Медиана рынка'), money(m.market_median_price)]);
  if (m.market_avg_price != null) facts.push([t('Средняя по рынку'), money(m.market_avg_price)]);
  if (m.this_price_per_sqm != null) facts.push([t('Цена за м²'), money(m.this_price_per_sqm)]);
  if (m.comparables_count != null) facts.push([t('Похожих объектов'), m.comparables_count]);
  return (
    <div className="ai-review">
      <div className="deal-score">
        <div className="score-ring" style={{ background: `conic-gradient(${v.color} ${r.deal_score}%, var(--line) 0)` }}><span>{r.deal_score}</span></div>
        <div>
          <div className="verdict-pill" style={{ background: v.color + '22', color: v.color }}>{t(v.label)}</div>
          <p style={{ marginTop: 8, fontWeight: 600 }}>{r.summary}</p>
          <div className="row wrap mt-8" style={{ gap: 8 }}>
            <span className="tag tag-muted">{t('Риск скама')}: {t(riskLabel)}</span>
            <span className={`tag ${r.ai_used ? 'tag-ok' : 'tag-muted'}`}>{r.ai_used ? t('Оценка ИИ') : t('Эвристика')}</span>
          </div>
        </div>
      </div>
      <div className="grid mt-16" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px,1fr))' }}>
        {r.pros?.length > 0 && <ListBox title={t('Плюсы')} items={r.pros} color="var(--ok)" />}
        {r.cons?.length > 0 && <ListBox title={t('Минусы')} items={r.cons} color="var(--warn)" />}
        {r.red_flags?.length > 0 && <ListBox title={t('Красные флаги')} items={r.red_flags} color="var(--danger)" />}
      </div>
      {facts.length > 0 && (
        <div className="card card-pad mt-16">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>{t('Рыночный контекст')}</h3>
          {facts.map(([k, val]) => <div key={k} className="fact-row"><span className="k">{k}</span><span className="v">{String(val)}</span></div>)}
        </div>
      )}
    </div>
  );
}
function ListBox({ title, items, color }) {
  return <div className="card card-pad"><h3 style={{ fontSize: 15, marginBottom: 10, color }}>{title}</h3><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul></div>;
}

function PriceHistory({ id }) {
  const [pts, setPts] = useState(undefined);
  useEffect(() => { setPts(undefined); api.priceHistory(id).then(setPts).catch(() => setPts([])); }, [id]);
  if (pts === undefined) return <Spinner />;
  if (!pts.length) return <div className="card card-pad muted">История цен пока недоступна.</div>;
  const w = 640, ht = 220, pad = 30;
  const prices = pts.map((x) => x.price);
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const stepX = pts.length > 1 ? (w - pad * 2) / (pts.length - 1) : 0;
  const coords = pts.map((pt, i) => [pad + i * stepX, ht - pad - ((pt.price - min) / range) * (ht - pad * 2)]);
  const path = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const area = path + ` L${coords[coords.length - 1][0].toFixed(1)} ${ht - pad} L${coords[0][0].toFixed(1)} ${ht - pad} Z`;
  const change = pts[pts.length - 1].price - pts[0].price;
  return (
    <div className="card card-pad">
      <div className="row-between mb-16">
        <h3 style={{ fontSize: 16 }}>Динамика цены</h3>
        <span className={`tag ${change <= 0 ? 'tag-ok' : 'tag-warn'}`}>{change <= 0 ? '↓' : '↑'} {money(Math.abs(change))}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${ht}`} style={{ width: '100%', height: 'auto' }}>
        <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" /><stop offset="100%" stopColor="var(--brand)" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#pg)" />
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" />
        {coords.map((c, i) => <circle key={i} cx={c[0].toFixed(1)} cy={c[1].toFixed(1)} r="3.5" fill="var(--brand)" />)}
      </svg>
      <div className="row-between mt-8 muted" style={{ fontSize: 12 }}><span>{fmtDate(pts[0].recorded_at)}</span><span>{fmtDate(pts[pts.length - 1].recorded_at)}</span></div>
    </div>
  );
}

function Mortgage({ p }) {
  const toast = useToast();
  const [down, setDown] = useState(Math.round(p.price * 0.2));
  const [rate, setRate] = useState(7.5);
  const [years, setYears] = useState(20);
  const [res, setRes] = useState(null);
  async function calc() {
    try { setRes(await api.mortgage(p.id, { down_payment: Number(down), annual_rate: Number(rate), years: Number(years) })); }
    catch (e) { toast(e.message, 'err'); }
  }
  useEffect(() => { calc(); }, []);
  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 16, marginBottom: 14 }}>Ипотечный калькулятор</h3>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
        <div className="field" style={{ margin: 0 }}><label>Первый взнос, $</label><input className="input" type="number" value={down} onChange={(e) => setDown(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Ставка, %</label><input className="input" type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
        <div className="field" style={{ margin: 0 }}><label>Срок, лет</label><input className="input" type="number" value={years} onChange={(e) => setYears(e.target.value)} /></div>
      </div>
      <button className="btn btn-primary mt-8" onClick={calc}>Рассчитать</button>
      {res && <div className="stat-grid mt-16" style={{ marginBottom: 0 }}>
        <MiniStat label="Сумма кредита" value={money(res.principal)} />
        <MiniStat label="Платёж / мес" value={money(res.monthly_payment)} />
        <MiniStat label="Всего выплат" value={money(res.total_paid)} />
        <MiniStat label="Переплата" value={money(res.total_interest)} />
      </div>}
    </div>
  );
}
function MiniStat({ label, value }) { return <div className="stat"><div className="sv" style={{ fontSize: 22 }}>{value}</div><div className="sl">{label}</div></div>; }

function Reviews({ p, onChanged }) {
  const { user } = useApp();
  const [list, setList] = useState(undefined);
  const [open, setOpen] = useState(false);
  // Reviews scoped to the seller, filtered by this listing's deal type:
  // rentals show rental reviews, sales show this seller's sale reviews.
  const reload = () => api.sellerReviews(p.seller.id, { deal_type: p.deal_type })
    .then((d) => setList(d.items)).catch(() => setList([]));
  useEffect(() => { setList(undefined); reload(); }, [p.id]);
  if (list === undefined) return <Spinner />;
  const scope = p.deal_type === 'rent' ? 'по арендам этого продавца' : 'по объектам этого продавца';
  return (
    <div>
      <div className="row-between mb-16">
        <div>
          <h3 style={{ fontSize: 17 }}>Отзывы ({list.length})</h3>
          <div className="muted" style={{ fontSize: 13 }}>{scope}</div>
        </div>
        {user && <button className="btn btn-soft" onClick={() => setOpen(true)}><Icon name="edit" /> Оставить отзыв</button>}
      </div>
      {!list.length ? <div className="card card-pad muted center">Отзывов пока нет. Будьте первым!</div> : list.map((r) => (
        <div key={r.id} className="card card-pad mb-16">
          <div className="row" style={{ gap: 12, marginBottom: 8 }}>
            <Avatar user={r.user} size={40} />
            <div>
              <div style={{ fontWeight: 700 }}>{r.user?.full_name || 'Пользователь'}</div>
              <Stars rating={r.rating} />
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div className="muted">{fmtDate(r.created_at)}</div>
              {r.property && r.property.id !== p.id && <Link className="muted" style={{ fontSize: 12 }} to={`/properties/${r.property.id}`}>{r.property.title}</Link>}
            </div>
          </div>
          {r.text && <p style={{ margin: 0 }}>{r.text}</p>}
        </div>
      ))}
      {open && <ReviewModal p={p} onClose={() => setOpen(false)} onDone={() => { setOpen(false); reload(); onChanged && onChanged(); }} />}
    </div>
  );
}
function ReviewModal({ p, onClose, onDone }) {
  const toast = useToast();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  async function save() {
    try { await api.addReview(p.id, { rating, text: text.trim() || null }); toast('Спасибо за отзыв!', 'ok'); onDone(); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Ваш отзыв" onClose={onClose} footer={<button className="btn btn-primary" onClick={save}>Опубликовать</button>}>
      <div className="field"><label>Оценка</label><div className="star-picker"><Stars rating={rating} size={30} interactive onPick={setRating} /></div></div>
      <div className="field"><label>Комментарий</label><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Поделитесь впечатлениями..." /></div>
    </Modal>
  );
}

function Availability({ id }) {
  const [rows, setRows] = useState(undefined);
  useEffect(() => { setRows(undefined); api.availability(id).then(setRows).catch(() => setRows([])); }, [id]);
  if (rows === undefined) return <Spinner />;
  if (!rows.length) return <div className="card card-pad muted">Владелец пока не указал доступные даты.</div>;
  return <div className="card card-pad"><h3 style={{ fontSize: 16, marginBottom: 12 }}>Доступные периоды</h3>
    <div className="row wrap" style={{ gap: 8 }}>{rows.map((r) => <span key={r.id} className="tag tag-ok">{fmtDate(r.start_date)} — {fmtDate(r.end_date)}</span>)}</div></div>;
}

function Similar({ id }) {
  const [items, setItems] = useState(undefined);
  useEffect(() => { setItems(undefined); api.similar(id, 6).then((d) => setItems(d.items)).catch(() => setItems([])); }, [id]);
  if (items === undefined) return <Spinner />;
  if (!items.length) return <p className="muted">Похожих объектов пока нет.</p>;
  return <PropertyGrid items={items} />;
}

function Sidebar({ p, isOwner, user, setModal }) {
  const nav = useNavigate();
  const toast = useToast();
  const [fav, setFav] = useState(!!p.is_favorited);
  // For sale listings the sidebar shows the SELLER's overall rating, not the
  // property's. Fetch it from the seller's public profile.
  const [sellerRating, setSellerRating] = useState(undefined);
  useEffect(() => {
    if (p.deal_type === 'sale' && p.seller) {
      api.publicProfile(p.seller.id)
        .then((pr) => setSellerRating({ avg: pr.avg_rating, count: pr.reviews_count }))
        .catch(() => setSellerRating({ avg: null, count: 0 }));
    }
  }, [p.id]);
  const requireAuth = () => { if (!user) { toast('Войдите, чтобы продолжить', 'info'); nav('/auth'); return false; } return true; };

  async function toggleFav() {
    if (!requireAuth()) return;
    try {
      if (fav) { await api.removeFavorite(p.id); setFav(false); } else { await api.addFavorite(p.id); setFav(true); }
    } catch (e) { toast(e.message, 'err'); }
  }

  return (
    <div className="detail-side">
      <div className="card card-pad">
        <div className="prop-price" style={{ fontSize: 32 }}>{money(p.price)}{p.deal_type === 'rent' && <small> / ночь</small>}</div>
        <div className="mt-16">
          <Fact k="Тип сделки" v={DEAL_LABELS[p.deal_type]} />
          <Fact k="Тип" v={TYPE_LABELS[p.type]} />
          <Fact k="Площадь" v={`${p.area} м²`} />
          {p.rooms != null && <Fact k="Комнат" v={p.rooms} />}
          <Fact k="Цена за м²" v={money(p.area ? p.price / p.area : 0)} />
          <Fact k="Просмотров" v={p.views_count} />
          {p.deal_type === 'sale'
            ? <RatingRow label="Рейтинг продавца" rating={sellerRating === undefined ? undefined : sellerRating.avg} count={sellerRating?.count} />
            : (p.avg_rating ? <RatingRow label="Рейтинг" rating={p.avg_rating} />
              : <div className="fact-row"><span className="k">Рейтинг</span><span className="v muted">Нет отзывов</span></div>)}
        </div>
      </div>

      <div className="card card-pad">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {p.has_tour && <button className="btn btn-primary btn-block btn-lg" onClick={() => nav(`/properties/${p.id}/tour`)}><Icon name="globe" /> Открыть 360° тур</button>}
          {!isOwner ? <>
            {p.deal_type === 'rent'
              ? <button className="btn btn-accent btn-block" onClick={() => requireAuth() && setModal(<BookingModal p={p} onClose={() => setModal(null)} />)}><Icon name="calendar" /> Забронировать</button>
              : <button className="btn btn-accent btn-block" onClick={() => requireAuth() && setModal(<RequestModal p={p} onClose={() => setModal(null)} />)}><Icon name="mail" /> Заявка на просмотр</button>}
            <button className="btn btn-ghost btn-block" onClick={() => requireAuth() && setModal(<ContactModal p={p} onClose={() => setModal(null)} />)}><Icon name="chat" /> Связаться с риелтором</button>
            <button className="btn btn-ghost btn-block" onClick={toggleFav}><Icon name={fav ? 'heart' : 'heart-outline'} /> {fav ? 'В избранном' : 'В избранное'}</button>
            <button className="btn btn-ghost btn-block" onClick={() => requireAuth() && setModal(<TrackModal p={p} onClose={() => setModal(null)} />)}><Icon name="trending-down" /> Отслеживать цену</button>
            <button className="btn btn-block" style={{ color: 'var(--ink-3)' }} onClick={() => requireAuth() && setModal(<ComplaintModal p={p} onClose={() => setModal(null)} />)}><Icon name="flag" /> Пожаловаться на продавца</button>
          </> : <Link className="btn btn-soft btn-block" to="/dashboard"><Icon name="chart" /> Управлять (в кабинете)</Link>}
        </div>
      </div>

      {p.seller && (
        <div className="card card-pad">
          <Link className="seller-box" to={`/sellers/${p.seller.id}`} style={{ cursor: 'pointer' }}>
            <Avatar user={p.seller} size={48} />
            <div>
              <div style={{ fontWeight: 700 }}>{p.seller.full_name || 'Продавец'}</div>
              <div className="muted" style={{ fontSize: 13 }}>{p.seller.company_name || ROLE_LABELS[p.seller.role]}</div>
            </div>
            <Icon name="arrow-right" className="" />
          </Link>
        </div>
      )}

      {p.lat != null && p.lng != null && <MiniMap p={p} />}
    </div>
  );
}
function Fact({ k, v }) { return <div className="fact-row"><span className="k">{k}</span><span className="v">{String(v)}</span></div>; }
function RatingRow({ label, rating, count }) {
  return (
    <div className="fact-row">
      <span className="k">{label}</span>
      {rating === undefined
        ? <span className="v muted">…</span>
        : rating == null
          ? <span className="v muted">Нет отзывов</span>
          : <span className="v" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <Stars rating={Math.round(rating)} size={14} /> {rating.toFixed(1)}{count != null && <span className="muted" style={{ fontWeight: 400 }}>({count})</span>}
            </span>}
    </div>
  );
}

function MiniMap({ p }) {
  useEffect(() => {
    const token = api.config.mapboxToken;
    const el = document.getElementById('mini-map');
    if (!el) return;
    if (!token || !window.mapboxgl) { el.innerHTML = `<div style="display:grid;place-content:center;height:100%;color:var(--ink-4)">📍 ${p.address || ''}</div>`; return; }
    window.mapboxgl.accessToken = token;
    const map = new window.mapboxgl.Map({ container: el, style: 'mapbox://styles/mapbox/light-v11', center: [p.lng, p.lat], zoom: 14 });
    new window.mapboxgl.Marker({ color: '#c2502e' }).setLngLat([p.lng, p.lat]).addTo(map);
    return () => { try { map.remove(); } catch {} };
  }, [p.id]);
  return <div className="card" style={{ overflow: 'hidden', height: 200 }}><div id="mini-map" style={{ width: '100%', height: '100%' }} /></div>;
}

// ---- Action modals ----
function BookingModal({ p, onClose }) {
  const toast = useToast();
  const nav = useNavigate();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const nights = start && end ? Math.max((new Date(end) - new Date(start)) / 86400000, 0) : 0;
  async function pay() {
    if (!start || !end) return toast('Выберите даты', 'err');
    try {
      const res = await api.createBooking({ property_id: p.id, start_date: start, end_date: end });
      onClose();
      window.__checkout = res;
      nav('/bookings');
      setTimeout(() => window.open(res.checkout_url, '_blank'), 100);
      toast('Бронь создана — оплатите в открывшемся окне', 'info', 5000);
    } catch (e) { toast(e.message, 'err'); }
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Modal title={`Бронирование — ${p.title}`} onClose={onClose} footer={<button className="btn btn-accent" onClick={pay}>Перейти к оплате</button>}>
      <div className="input-group">
        <div className="field" style={{ flex: 1 }}><label>Заезд</label><input className="input" type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field" style={{ flex: 1 }}><label>Выезд</label><input className="input" type="date" min={today} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      {nights > 0 && <p className="muted">{nights} ноч. × {money(p.price)} = {money(nights * p.price)}</p>}
    </Modal>
  );
}
function RequestModal({ p, onClose }) {
  const toast = useToast();
  const [msg, setMsg] = useState(''); const [date, setDate] = useState('');
  async function send() {
    try { await api.submitRequest({ property_id: p.id, message: msg.trim() || null, preferred_date: date || null }); toast('Заявка отправлена!', 'ok'); onClose(); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Заявка на просмотр" onClose={onClose} footer={<button className="btn btn-primary" onClick={send}>Отправить заявку</button>}>
      <div className="field"><label>Сообщение</label><textarea className="textarea" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Здравствуйте! Хочу посмотреть объект..." /></div>
      <div className="field"><label>Желаемая дата</label><input className="input" type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} /></div>
    </Modal>
  );
}
function ContactModal({ p, onClose }) {
  const toast = useToast();
  const nav = useNavigate();
  const [text, setText] = useState('');
  async function send() {
    try { await api.startConversation({ property_id: p.id, text: text.trim() || 'Здравствуйте!' }); toast('Диалог создан', 'ok'); onClose(); nav('/messages'); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Связаться с риелтором" onClose={onClose} footer={<button className="btn btn-primary" onClick={send}>Начать диалог</button>}>
      <p className="muted mb-8">{p.title}</p>
      <div className="field"><label>Сообщение</label><textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Здравствуйте! Интересует ваш объект..." /></div>
    </Modal>
  );
}
function TrackModal({ p, onClose }) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  async function save() {
    try { await api.addTracker({ property_id: p.id, target_price: target ? Number(target) : null }); toast('Трекер добавлен', 'ok'); onClose(); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Трекер цены" onClose={onClose} footer={<button className="btn btn-primary" onClick={save}>Отслеживать</button>}>
      <p className="muted mb-8">Уведомим, когда цена упадёт. Можно указать целевую цену.</p>
      <div className="field"><label>Целевая цена, $</label><input className="input" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={`Например ${Math.round(p.price * 0.9)}`} /></div>
    </Modal>
  );
}
function ComplaintModal({ p, onClose }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  async function send() {
    if (reason.trim().length < 3) return toast('Опишите причину', 'err');
    try { await api.submitComplaint({ seller_id: p.seller.id, property_id: p.id, reason: reason.trim() }); toast('Жалоба отправлена', 'ok'); onClose(); }
    catch (e) { toast(e.message, 'err'); }
  }
  return (
    <Modal title="Жалоба на продавца" onClose={onClose} footer={<button className="btn btn-danger" onClick={send}>Отправить жалобу</button>}>
      <div className="field"><label>Причина</label><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Опишите проблему..." /></div>
    </Modal>
  );
}
