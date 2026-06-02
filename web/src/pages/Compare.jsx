import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { Icon } from '../lib/icons.jsx';
import { Spinner, Empty } from '../components/Common.jsx';
import { money, TYPE_LABELS, DEAL_LABELS } from '../lib/format.js';

/* Side-by-side comparison of 2–4 listings. Reads ?ids=1,2,3 from the URL.
   Uses the existing GET /properties/compare endpoint. */
export function ComparePage() {
  const { lang, t } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  const [data, setData] = useState(undefined);
  const ids = new URLSearchParams(loc.search).get('ids') || '';

  useEffect(() => {
    setData(undefined);
    const list = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length < 2) { setData(null); return; }
    api.compare(list.join(',')).then(setData).catch(() => setData(null));
  }, [ids]);

  const L = (ru, en) => (lang === 'ru' ? ru : en);

  if (data === undefined) return <div className="page"><div className="container"><Spinner big /></div></div>;
  if (!data || !data.items?.length) {
    return (
      <div className="page"><div className="container">
        <Empty icon="scale" title={L('Нечего сравнивать', 'Nothing to compare')}
          action={<Link className="btn btn-primary mt-16" to="/">{L('В каталог', 'To catalog')}</Link>} />
        <p className="muted center" style={{ marginTop: 12 }}>{L('Добавьте 2–4 объекта: /compare?ids=1,2,3', 'Add 2–4 listings: /compare?ids=1,2,3')}</p>
      </div></div>
    );
  }

  const rows = data.items;
  const tLabel = (k) => (lang === 'ru' ? TYPE_LABELS[k] : { apartment: 'Apartment', house: 'House', commercial: 'Commercial' }[k]) || k;
  const dLabel = (k) => (lang === 'ru' ? DEAL_LABELS[k] : { rent: 'Rent', sale: 'Sale' }[k]) || k;

  // metric rows: [label, render(row), highlightId]
  const metrics = [
    [L('Цена', 'Price'), (r) => money(r.price) + (r.deal_type === 'rent' ? L(' / ночь', ' / night') : ''), data.cheapest_id, L('дешевле всех', 'cheapest')],
    [L('Площадь', 'Area'), (r) => `${r.area} ${L('м²', 'm²')}`, data.largest_id, L('просторнее', 'largest')],
    [L('Цена за м²', 'Price / m²'), (r) => money(r.price_per_sqm), data.best_value_id, L('выгоднее', 'best value')],
    [L('Комнат', 'Rooms'), (r) => (r.rooms ?? '—'), null],
    [L('Тип', 'Type'), (r) => tLabel(r.type), null],
    [L('Сделка', 'Deal'), (r) => dLabel(r.deal_type), null],
    [L('Рейтинг', 'Rating'), (r) => (r.avg_rating ? r.avg_rating.toFixed(1) : L('Нет отзывов', 'No reviews')), null],
    [L('360° тур', '360° tour'), (r) => (r.has_tour ? '✓' : '—'), null],
  ];

  return (
    <div className="page">
      <div className="container">
        <div className="row" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}><Icon name="arrow-left" /> {L('Назад', 'Back')}</button>
        </div>
        <h1 className="page-title"><Icon name="scale" /> {L('Сравнение объектов', 'Compare listings')}</h1>
        <p className="page-sub">{L('Лучшие значения подсвечены', 'Best values are highlighted')}</p>

        <div className="compare-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-corner" />
                {rows.map((r) => (
                  <th key={r.id}>
                    <Link to={`/properties/${r.id}`} className="compare-head">
                      <span className="compare-head-title">{r.title}</span>
                      <span className="compare-head-go"><Icon name="arrow-right" size={14} /></span>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map(([label, render, hi, hiLabel], mi) => (
                <tr key={mi}>
                  <td className="compare-label">{label}</td>
                  {rows.map((r) => {
                    const best = hi != null && r.id === hi;
                    return (
                      <td key={r.id} className={best ? 'compare-best' : ''}>
                        {render(r)}
                        {best && <span className="compare-badge">{hiLabel}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
