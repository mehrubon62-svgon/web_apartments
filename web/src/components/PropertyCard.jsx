import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../lib/icons.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { money, mediaUrl, TYPE_LABELS, DEAL_LABELS } from '../lib/format.js';

export function PropertyCard({ p, onFav }) {
  const nav = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const [fav, setFav] = useState(!!p.is_favorited);
  const cover = p.cover_url ? mediaUrl(p.cover_url) : null;

  async function toggleFav(e) {
    e.stopPropagation();
    try {
      if (fav) { await api.removeFavorite(p.id); setFav(false); }
      else { await api.addFavorite(p.id); setFav(true); }
      onFav && onFav(p, !fav);
    } catch (err) { toast(err.message, 'err'); }
  }

  return (
    <div className="prop-card" onClick={() => nav(`/properties/${p.id}`)}>
      <div className="prop-media">
        {cover ? <img src={cover} alt={p.title} loading="lazy" /> : <div className="ph"><Icon name="home" size={40} /></div>}
        <div className="prop-badges">
          <span className={`tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`}>{t(DEAL_LABELS[p.deal_type])}</span>
          <span className="tag tag-muted">{t(TYPE_LABELS[p.type])}</span>
        </div>
        <button className={`prop-fav ${fav ? 'is-fav' : ''}`} title={t('В избранное')} onClick={toggleFav}>
          <Icon name={fav ? 'heart' : 'heart-outline'} />
        </button>
        {p.has_tour && <span className="prop-tour-pill"><Icon name="globe" /> {t('360° тур')}</span>}
      </div>
      <div className="prop-body">
        <div className="prop-price">{money(p.price)}{p.deal_type === 'rent' && <small> {t('/ ночь')}</small>}</div>
        <div className="prop-title">{p.title}</div>
        <div className="prop-addr">{p.address || t('Адрес не указан')}</div>
        <div className="prop-meta">
          <span><Icon name="ruler" /> {p.area} {t('м²')}</span>
          {p.rooms != null && <span><Icon name="bed" /> {p.rooms} {t('комн.')}</span>}
          {p.deal_type === 'sale'
            ? (p.seller_rating
                ? <span className="prop-rating" title="Рейтинг продавца"><Icon name="star" /> {p.seller_rating.toFixed(1)}</span>
                : <span className="prop-rating muted" style={{ color: 'var(--ink-4)' }} title="Рейтинг продавца"><Icon name="star-outline" /> —</span>)
            : (p.avg_rating ? <span className="prop-rating"><Icon name="star" /> {p.avg_rating.toFixed(1)}</span> : null)}
        </div>
      </div>
    </div>
  );
}

export function PropertyGrid({ items, onFav }) {
  if (!items || !items.length) return null;
  return <div className="grid grid-props">{items.map((p) => <PropertyCard key={p.id} p={p} onFav={onFav} />)}</div>;
}
