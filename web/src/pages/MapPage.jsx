import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon } from '../lib/icons.jsx';
import { money, shortPrice, mediaUrl, TYPE_LABELS, DEAL_LABELS } from '../lib/format.js';

export function MapPage() {
  const nav = useNavigate();
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const dataRef = useRef([]);
  const [list, setList] = useState([]);
  const [count, setCount] = useState(0);
  const [filters, setFilters] = useState({ deal_type: '', type: '' });
  const [poi, setPoi] = useState({ metro: true, school: true, shop: true });
  const poiMarkers = useRef([]);
  const [hasMap, setHasMap] = useState(true);

  // init map once
  useEffect(() => {
    const token = api.config.mapboxToken;
    if (!token || !window.mapboxgl) { setHasMap(false); loadList(); return; }
    window.mapboxgl.accessToken = token;
    const map = new window.mapboxgl.Map({ container: mapEl.current, style: 'mapbox://styles/mapbox/light-v11', center: [-73.98, 40.74], zoom: 11 });
    mapRef.current = map;
    map.addControl(new window.mapboxgl.NavigationControl(), 'bottom-right');
    map.on('load', () => { initLayers(map); loadMarkers(); loadPOIs(); });
    return () => { try { map.remove(); } catch {} mapRef.current = null; };
  }, []);

  useEffect(() => { if (mapRef.current && mapRef.current.getSource('properties')) loadMarkers(); else loadList(); }, [filters]);
  useEffect(() => { if (mapRef.current) loadPOIs(); }, [poi]);

  function initLayers(map) {
    map.addSource('properties', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 50 });
    map.addLayer({ id: 'clusters', type: 'circle', source: 'properties', filter: ['has', 'point_count'], paint: { 'circle-color': '#c2502e', 'circle-radius': ['step', ['get', 'point_count'], 20, 10, 26, 50, 32], 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
    map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'properties', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 14 }, paint: { 'text-color': '#fff' } });
    map.addLayer({ id: 'unclustered-point', type: 'circle', source: 'properties', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['match', ['get', 'deal_type'], 'rent', '#1f5c4d', '#c2502e'], 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
    map.addLayer({ id: 'unclustered-price', type: 'symbol', source: 'properties', filter: ['!', ['has', 'point_count']], layout: { 'text-field': ['get', 'price_label'], 'text-size': 11, 'text-offset': [0, -1.4], 'text-anchor': 'bottom' }, paint: { 'text-color': '#211c16', 'text-halo-color': '#fff', 'text-halo-width': 2 } });
    map.on('click', 'clusters', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      map.getSource('properties').getClusterExpansionZoom(f[0].properties.cluster_id, (err, z) => { if (!err) map.easeTo({ center: f[0].geometry.coordinates, zoom: z }); });
    });
    map.on('click', 'unclustered-point', (e) => { const p = dataRef.current.find((x) => x.id === e.features[0].properties.id); if (p) showPopup(p); });
    ['clusters', 'unclustered-point', 'unclustered-price'].forEach((id) => {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  async function loadList() {
    const params = {}; Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    try { const data = await api.mapMarkers(params); dataRef.current = data; setList(data); setCount(data.length); } catch {}
  }

  async function loadMarkers() {
    const params = {}; Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    try {
      const data = await api.mapMarkers(params);
      dataRef.current = data; setList(data); setCount(data.length);
      const features = data.filter((p) => p.lat != null && p.lng != null).map((p) => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: { id: p.id, deal_type: p.deal_type, price_label: shortPrice(p.price) },
      }));
      const src = mapRef.current.getSource('properties');
      if (src) src.setData({ type: 'FeatureCollection', features });
      if (features.length) {
        const b = new window.mapboxgl.LngLatBounds();
        features.forEach((f) => b.extend(f.geometry.coordinates));
        if (!b.isEmpty()) mapRef.current.fitBounds(b, { padding: 80, maxZoom: 14, duration: 600 });
      }
    } catch {}
  }

  async function loadPOIs() {
    poiMarkers.current.forEach((o) => o.remove()); poiMarkers.current = [];
    try {
      const pois = await api.infrastructure();
      const icons = { metro: 'train', school: 'book', shop: 'cart' };
      const labels = { metro: 'Метро', school: 'Школа', shop: 'Магазин' };
      const svg = { train: '<rect x="6" y="4" width="12" height="13" rx="3"/><path d="M6 11h12M9 21l-2 2M15 21l2 2"/>', book: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 16h13"/>', cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.5 12h10l2-8H6"/>' };
      pois.forEach((p) => {
        if (!poi[p.kind]) return;
        const el = document.createElement('div');
        el.className = `marker-poi poi-${p.kind}`;
        el.innerHTML = `<span class="icn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg[icons[p.kind]] || ''}</svg></span>`;
        const mk = new window.mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat])
          .setPopup(new window.mapboxgl.Popup({ offset: 18, closeButton: false, className: 'nstr-popup' }).setHTML(`<div class="poi-popup"><div class="poi-popup-kind">${labels[p.kind]}</div><div class="poi-popup-name">${(p.name || '').replace(/[<>&]/g, '')}</div></div>`))
          .addTo(mapRef.current);
        poiMarkers.current.push(mk);
      });
    } catch {}
  }

  function showPopup(p) {
    const map = mapRef.current;
    if (popupRef.current) { try { popupRef.current.remove(); } catch {} }
    const cover = p.cover_url || null;
    const safe = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const html = `<div class="prop-popup">
      ${cover ? `<div class="prop-popup-img" style="background-image:url('${cover}')"></div>` : ''}
      <div class="prop-popup-body">
        <div class="prop-popup-tags"><span class="tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}">${DEAL_LABELS[p.deal_type]}</span><span class="tag tag-muted">${TYPE_LABELS[p.type]}</span></div>
        <div class="prop-popup-price">${money(p.price)}${p.deal_type === 'rent' ? '<small> / ночь</small>' : ''}</div>
        <div class="prop-popup-title">${safe(p.title)}</div>
        <a class="btn btn-primary btn-sm prop-popup-cta" href="#/properties/${p.id}">Подробнее</a>
      </div></div>`;
    popupRef.current = new window.mapboxgl.Popup({ offset: 22, maxWidth: '280px', className: 'nstr-popup' }).setLngLat([p.lng, p.lat]).setHTML(html).addTo(map);
  }

  return (
    <div className="map-shell">
      {hasMap ? <div id="map" ref={mapEl} /> : (
        <div style={{ display: 'grid', placeContent: 'center', height: '100%', background: 'var(--surface-2)', textAlign: 'center', padding: 40 }}>
          <Icon name="map" size={50} /><h3 style={{ margin: '12px 0 6px' }}>Карта недоступна</h3>
          <p className="muted">Mapbox-токен не настроен. Объекты — в списке слева.</p>
        </div>
      )}
      <div className="map-panel">
        <div className="map-panel-head">
          <div className="row-between mb-8"><strong>Объекты на карте</strong><span className="muted">{count}</span></div>
          <div className="row" style={{ gap: 8 }}>
            <select className="select" style={{ flex: 1 }} value={filters.deal_type} onChange={(e) => setFilters((f) => ({ ...f, deal_type: e.target.value }))}>
              <option value="">Все сделки</option><option value="rent">Аренда</option><option value="sale">Продажа</option>
            </select>
            <select className="select" style={{ flex: 1 }} value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
              <option value="">Все типы</option>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <div className="map-panel-body">
          {!list.length ? <div className="empty" style={{ padding: '40px 16px' }}><div className="emoji"><Icon name="pin" size={40} /></div><p>Нет объектов по фильтрам</p></div>
            : list.map((p) => (
              <div key={p.id} className="map-mini" onClick={() => nav(`/properties/${p.id}`)}>
                {p.cover_url ? <img src={mediaUrl(p.cover_url)} /> : <div className="ph"><Icon name="home" /></div>}
                <div style={{ minWidth: 0 }}>
                  <div className="mm-price">{money(p.price)}</div>
                  <div className="mm-title">{p.title}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}><span className={`tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`} style={{ fontSize: 10 }}>{DEAL_LABELS[p.deal_type]}</span></div>
                </div>
              </div>
            ))}
        </div>
      </div>
      <div className="map-overlay-controls">
        <div className="map-legend-title">Слои на карте</div>
        {[['metro', 'train', 'Метро'], ['school', 'book', 'Школы'], ['shop', 'cart', 'Магазины']].map(([k, ic, lbl]) => (
          <button key={k} className={`poi-toggle ${poi[k] ? 'active' : ''}`} onClick={() => setPoi((s) => ({ ...s, [k]: !s[k] }))}><Icon name={ic} /><span>{lbl}</span></button>
        ))}
      </div>
    </div>
  );
}
