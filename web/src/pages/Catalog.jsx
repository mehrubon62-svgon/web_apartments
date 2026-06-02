import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';
import { useToast } from '../lib/toast.jsx';
import { PropertyGrid } from '../components/PropertyCard.jsx';
import { SkeletonGrid, Empty } from '../components/Common.jsx';
import { Icon } from '../lib/icons.jsx';
import { TYPE_LABELS } from '../lib/format.js';
import { SEARCH_PHRASES, pickPhrases } from '../lib/suggestions.js';

export function CatalogPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const nav = useNavigate();
  const [filters, setFilters] = useState({ deal_type: '', type: '', min_price: '', max_price: '', min_area: '', rooms: '' });
  const [pageItems, setPageItems] = useState([]);   // items for the current page (up to PAGE_SIZE)
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);              // 1-based page
  const [expand, setExpand] = useState(1);          // page-1 only: 1..3 chunks shown (=Show more clicks +1)
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  // Rotating placeholder phrase inside the search box (bilingual, cycles).
  const [hintIdx, setHintIdx] = useState(0);
  const phrasesRef = useRef(pickPhrases(SEARCH_PHRASES, lang, 40));
  useEffect(() => {
    phrasesRef.current = pickPhrases(SEARCH_PHRASES, lang, 40);
    setHintIdx(0);
    const id = setInterval(() => setHintIdx((i) => (i + 1) % phrasesRef.current.length), 3000);
    return () => clearInterval(id);
  }, [lang]);
  const placeholder = (lang === 'ru' ? 'Поиск: «' : 'Search: "') + (phrasesRef.current[hintIdx] || '') + (lang === 'ru' ? '», адрес, район...' : '", address, area...');
  // New random order on each page-load (kept stable across pagination).
  const seedRef = useRef(Math.floor(Math.random() * 1e9));
  const LIMIT = 20;            // items per "Show more" chunk
  const PAGE_SIZE = 60;        // one full page = initial + 2 "Show more" = 3 * LIMIT

  const load = useCallback(async (pg) => {
    setLoading(true);
    const params = { limit: PAGE_SIZE, offset: (pg - 1) * PAGE_SIZE, seed: seedRef.current };
    Object.entries(filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });
    try {
      const data = await api.listProperties(params);
      setTotal(data.total);
      setPageItems(data.items);
    } catch (e) { toast(e.message, 'err'); }
    finally { setLoading(false); }
  }, [filters]);

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1); setExpand(1); load(1); }, [filters]);
  // Load when page changes (page 1 already loaded by the filter effect on mount).
  useEffect(() => { load(page); setExpand(page === 1 ? 1 : 3); window.scrollTo({ top: 0, behavior: 'smooth' }); }, [page]);

  function setF(k, v) { setFilters((f) => ({ ...f, [k]: v })); }
  function doSearch(text) { const v = (text ?? q).trim(); if (v) nav('/search?q=' + encodeURIComponent(v)); }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // On page 1 we reveal progressively; other pages show the full chunk.
  const visible = page === 1 ? pageItems.slice(0, expand * LIMIT) : pageItems;
  const canShowMore = page === 1 && expand < 3 && expand * LIMIT < pageItems.length;
  const showPager = totalPages > 1 && !canShowMore;

  return (
    <div className="page">
      <div className="container">
        <div className="hero">
          <h1>{t('Найдите дом, в который захочется вернуться')}</h1>
          <p>{t('Иммерсивные 360°-туры, ответы ИИ про любую зону квартиры и честные сделки онлайн.')}</p>
          <div className="hero-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder={placeholder} />
            <button className="btn btn-primary" onClick={() => doSearch()}>{t('Искать')}</button>
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
            <div className="page-sub">{t('Найдено объектов')}: {total}{totalPages > 1 && ` · ${t('Страница')} ${page}/${totalPages}`}</div>
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

        {loading && pageItems.length === 0 ? <SkeletonGrid n={8} /> : (
          visible.length ? <PropertyGrid items={visible} /> : <Empty icon="home" title={t('Ничего не найдено')} sub={t('Попробуйте изменить фильтры')} />
        )}

        {canShowMore && (
          <div className="center mt-24">
            <button className="btn btn-ghost btn-lg" onClick={() => setExpand((e) => e + 1)}>{t('Показать ещё')}</button>
          </div>
        )}

        {showPager && <Pager page={page} totalPages={totalPages} onPage={setPage} t={t} />}
      </div>
    </div>
  );
}

function Pager({ page, totalPages, onPage, t }) {
  // Build a compact page list: 1 … p-1 p p+1 … N
  const pages = [];
  const add = (n) => { if (!pages.includes(n) && n >= 1 && n <= totalPages) pages.push(n); };
  add(1);
  for (let i = page - 1; i <= page + 1; i++) add(i);
  add(totalPages);
  pages.sort((a, b) => a - b);
  const withGaps = [];
  pages.forEach((n, i) => {
    if (i > 0 && n - pages[i - 1] > 1) withGaps.push('…');
    withGaps.push(n);
  });
  return (
    <div className="pager">
      <button className="pager-btn" disabled={page <= 1} onClick={() => onPage(page - 1)}><Icon name="arrow-left" /> {t('Назад')}</button>
      <div className="pager-pages">
        {withGaps.map((n, i) => n === '…'
          ? <span key={'g' + i} className="pager-gap">…</span>
          : <button key={n} className={`pager-num ${n === page ? 'active' : ''}`} onClick={() => onPage(n)}>{n}</button>)}
      </div>
      <button className="pager-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t('Далее')} <Icon name="arrow-right" /></button>
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
