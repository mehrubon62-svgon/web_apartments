import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast.jsx';
import { PropertyGrid } from '../components/PropertyCard.jsx';
import { SkeletonGrid, Empty } from '../components/Common.jsx';
import { Icon } from '../lib/icons.jsx';
import { TYPE_LABELS } from '../lib/format.js';

export function CatalogPage() {
  const { t } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [filters, setFilters] = useState({ deal_type: '', type: '', min_price: '', max_price: '', min_area: '', rooms: '' });
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const LIMIT = 20;

  const load = useCallback(async (fresh) => {
    setLoading(true);
    const params = { limit: LIMIT, offset: fresh ? 0 : offset };
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
    try {
      const data = await api.listProperties(params);
      setTotal(data.total);
      setItems((prev) => (fresh ? data.items : [...prev, ...data.items]));
    } catch (e) { toast(e.message, 'err'); }
    finally { setLoading(false); }
  }, [filters, offset]);

  useEffect(() => { setOffset(0); load(true); }, [filters]);
  useEffect(() => { if (offset > 0) load(false); }, [offset]);

  function setF(k, v) { setFilters((f) => ({ ...f, [k]: v })); }
  function doSearch() { if (q.trim()) nav('/search?q=' + encodeURIComponent(q.trim())); }

  return (
    <div className="page">
      <div className="container">
        <div className="hero">
          <h1>{t('Найдите дом, в который захочется вернуться')}</h1>
          <p>{t('Иммерсивные 360°-туры, ответы ИИ про любую зону квартиры и честные сделки онлайн.')}</p>
          <div className="hero-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder={t('Поиск: «двушка у метро», адрес, район...')} />
            <button className="btn btn-primary" onClick={doSearch}>{t('Искать')}</button>
          </div>
          <div className="hero-stats">
            <div><b>360°</b><span>{t('Виртуальные туры')}</span></div>
            <div><b>AI</b><span>{t('Spatial Q&A')}</span></div>
            <div><b>0%</b><span>{t('Комиссия за просмотр')}</span></div>
          </div>
        </div>

        <div className="page-head">
          <div>
            <div className="page-title">{t('Каталог недвижимости')}</div>
            <div className="page-sub">{t('Найдено объектов')}: {total}</div>
          </div>
        </div>

        <div className="filters">
          <div className="seg">
            {[['', t('Все')], ['rent', t('Аренда')], ['sale', t('Продажа')]].map(([v, l]) => (
              <button key={v} className={filters.deal_type === v ? 'active' : ''} onClick={() => setF('deal_type', v)}>{l}</button>
            ))}
          </div>
          <select className="select" value={filters.type} onChange={(e) => setF('type', e.target.value)}>
            <option value="">{t('Любой тип')}</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
          </select>
          <input className="input" type="number" placeholder={t('Цена от')} style={{ width: 120 }} value={filters.min_price} onChange={(e) => setF('min_price', e.target.value)} />
          <input className="input" type="number" placeholder={t('до')} style={{ width: 120 }} value={filters.max_price} onChange={(e) => setF('max_price', e.target.value)} />
          <input className="input" type="number" placeholder={t('Площадь от')} style={{ width: 120 }} value={filters.min_area} onChange={(e) => setF('min_area', e.target.value)} />
          <select className="select" value={filters.rooms} onChange={(e) => setF('rooms', e.target.value)}>
            <option value="">{t('Комнаты')}</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? '+' : ''}</option>)}
          </select>
          <div className="grow" />
          <button className="chip" onClick={() => setFilters({ deal_type: '', type: '', min_price: '', max_price: '', min_area: '', rooms: '' })}>
            <Icon name="close" /> {t('Сбросить')}
          </button>
        </div>

        {loading && items.length === 0 ? <SkeletonGrid n={8} /> : (
          items.length ? <PropertyGrid items={items} /> : <Empty icon="home" title={t('Ничего не найдено')} sub={t('Попробуйте изменить фильтры')} />
        )}

        {items.length < total && (
          <div className="center mt-24">
            <button className="btn btn-ghost btn-lg" onClick={() => setOffset((o) => o + LIMIT)}>{t('Показать ещё')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function SearchPage() {
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const q = sp.get('q') || '';
  const [items, setItems] = useState(null);
  useEffect(() => {
    setItems(null);
    api.searchProperties({ q, limit: 50 }).then((d) => setItems(d.items)).catch(() => setItems([]));
  }, [q]);
  return (
    <div className="page">
      <div className="container">
        <div className="page-head">
          <div>
            <div className="page-title">{t('Результаты поиска') || 'Результаты поиска'}</div>
            <div className="page-sub">«{q}»</div>
          </div>
          <Link className="btn btn-ghost" to="/"><Icon name="arrow-left" /> {t('В каталог')}</Link>
        </div>
        {items === null ? <SkeletonGrid n={6} /> : (items.length ? <PropertyGrid items={items} /> : <Empty icon="search" title={t('Ничего не найдено')} />)}
      </div>
    </div>
  );
}
