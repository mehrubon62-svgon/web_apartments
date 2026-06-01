// ============================================================
// Map view — Mapbox GL with property + infrastructure markers
// ============================================================
import { h, esc, money, toast, TYPE_LABELS, DEAL_LABELS, mediaUrl } from '../ui.js';
import { api } from '../api.js';
import { navigate } from '../router.js';
import { mountContent } from '../components.js';
import { icon } from '../icons.js';

let map = null;
let markers = [];
let poiMarkers = [];
let activePopup = null;

export async function renderMap(_params, query) {
  let markerObjs = [];
  const filters = {
    deal_type: query.deal_type || '',
    type: query.type || '',
    max_price: query.max_price || '',
  };
  const poiOn = { metro: true, school: true, shop: true };

  const panelBody = h('div', { class: 'map-panel-body' });
  const panel = h('div', { class: 'map-panel' }, [
    h('div', { class: 'map-panel-head' }, [
      h('div', { class: 'row-between mb-8' }, [
        h('strong', { text: 'Объекты на карте' }),
        h('span', { class: 'muted', id: 'map-count', text: '' }),
      ]),
      buildMapFilters(filters, () => loadMarkers()),
    ]),
    panelBody,
  ]);

  const controls = h('div', { class: 'map-overlay-controls' }, [
    h('div', { class: 'map-legend-title', text: 'Слои на карте' }),
    poiToggle('train', 'metro', poiOn, 'Метро'),
    poiToggle('book', 'school', poiOn, 'Школы'),
    poiToggle('cart', 'shop', poiOn, 'Магазины'),
  ]);

  const mapEl = h('div', { id: 'map' });
  const shell = h('div', { class: 'map-shell' }, [mapEl, panel, controls]);
  mountContent(shell);

  const token = api.config.mapboxToken;
  if (!token || !window.mapboxgl) {
    mapEl.innerHTML = `<div style="display:grid;place-content:center;height:100%;background:var(--surface-2);text-align:center;padding:40px">
      <div style="font-size:50px">🗺️</div>
      <h3 style="margin:12px 0 6px">Карта недоступна</h3>
      <p class="muted">Mapbox-токен не настроен. Маркеры отображаются списком слева.</p></div>`;
    await loadMarkers();
    return cleanup;
  }

  mapboxgl.accessToken = token;
  map = new mapboxgl.Map({
    container: mapEl,
    style: 'mapbox://styles/mapbox/light-v11',
    center: [-73.98, 40.74],
    zoom: 11,
  });
  map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
  map.on('load', () => {
    initClusterLayers();
    loadMarkers();
    loadPOIs();
  });

  // ---- Cluster source + layers ----
  function initClusterLayers() {
    if (map.getSource('properties')) return;
    map.addSource('properties', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });

    // Cluster bubble (filled circle with count)
    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'properties',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#c2502e',
        'circle-radius': ['step', ['get', 'point_count'], 20, 10, 26, 50, 32],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.95,
      },
    });

    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'properties',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 14,
      },
      paint: { 'text-color': '#ffffff' },
    });

    // Single property — price pill (rendered as a styled DOM marker on demand)
    map.addLayer({
      id: 'unclustered-point',
      type: 'circle',
      source: 'properties',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['match', ['get', 'deal_type'], 'rent', '#1f5c4d', '#c2502e'],
        'circle-radius': 8,
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });

    map.addLayer({
      id: 'unclustered-price',
      type: 'symbol',
      source: 'properties',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'text-field': ['get', 'price_label'],
        'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        'text-size': 11,
        'text-offset': [0, -1.4],
        'text-anchor': 'bottom',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#211c16',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2,
      },
    });

    // Click on cluster -> zoom in
    map.on('click', 'clusters', (e) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
      const clusterId = features[0].properties.cluster_id;
      map.getSource('properties').getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        map.easeTo({ center: features[0].geometry.coordinates, zoom });
      });
    });

    // Click on a single property -> show popup
    map.on('click', 'unclustered-point', (e) => {
      const f = e.features[0];
      const id = f.properties.id;
      const p = markerObjs.find((x) => x.id === id);
      if (p) showPopup(p);
    });

    // Cursor feedback
    ['clusters', 'unclustered-point', 'unclustered-price'].forEach((id) => {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  async function loadMarkers() {
    panelBody.innerHTML = '<div class="loading-row"><div class="boot-spinner"></div></div>';
    const params = {};
    Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
    try {
      const data = await api.mapMarkers(params);
      markerObjs = data;
      document.getElementById('map-count').textContent = `${data.length}`;
      panelBody.innerHTML = '';
      if (activePopup) { try { activePopup.remove(); } catch {} activePopup = null; }

      if (!data.length) {
        panelBody.appendChild(h('div', { class: 'empty', style: { padding: '40px 16px' } }, [
          h('div', { class: 'emoji', text: '📍' }), h('p', { text: 'Нет объектов по фильтрам' }),
        ]));
      } else {
        data.forEach((p) => panelBody.appendChild(miniCard(p)));
      }

      // Push GeoJSON to the cluster source
      const features = data
        .filter((p) => p.lat != null && p.lng != null)
        .map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
          properties: {
            id: p.id,
            deal_type: p.deal_type,
            price_label: shortPrice(p.price),
          },
        }));
      const source = map && map.getSource('properties');
      if (source) source.setData({ type: 'FeatureCollection', features });

      // Fit bounds
      if (map && features.length) {
        const bounds = new mapboxgl.LngLatBounds();
        features.forEach((f) => bounds.extend(f.geometry.coordinates));
        if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 });
      }
    } catch (e) {
      panelBody.innerHTML = '';
      panelBody.appendChild(h('div', { class: 'muted center', style: { padding: '20px' }, text: e.message }));
    }
  }

  async function loadPOIs() {
    clearPOIs();
    try {
      const pois = await api.infrastructure();
      const icons = { metro: 'train', school: 'book', shop: 'cart' };
      const kindLabels = { metro: 'Метро', school: 'Школа', shop: 'Магазин' };
      pois.forEach((poi) => {
        if (!poiOn[poi.kind]) return;
        const el = h('div', { class: `marker-poi poi-${poi.kind}`, title: poi.name }, icon(icons[poi.kind] || 'pin'));
        const html = `<div class="poi-popup">
          <div class="poi-popup-kind">${kindLabels[poi.kind] || poi.kind}</div>
          <div class="poi-popup-name">${(poi.name || '').replace(/[<>&]/g,'')}</div>
        </div>`;
        const mk = new mapboxgl.Marker({ element: el }).setLngLat([poi.lng, poi.lat])
          .setPopup(new mapboxgl.Popup({ offset: 18, closeButton: false, className: 'nstr-popup' }).setHTML(html)).addTo(map);
        poiMarkers.push({ mk, kind: poi.kind });
      });
    } catch {}
  }

  function showPopup(p) {
    if (!map) return;
    const cover = p.cover_url ? p.cover_url : null;
    const dealLabel = p.deal_type === 'rent' ? 'Аренда' : 'Продажа';
    const typeLabel = ({ apartment: 'Квартира', house: 'Дом', commercial: 'Коммерция' }[p.type] || p.type);
    const priceUnit = p.deal_type === 'rent' ? ' / ночь' : '';
    const priceStr = '$' + Number(p.price).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const safeTitle = String(p.title || '').replace(/[<>&]/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]));
    const html = `<div class="prop-popup">
        ${cover ? `<div class="prop-popup-img" style="background-image:url('${cover}')"></div>` : ''}
        <div class="prop-popup-body">
          <div class="prop-popup-tags"><span class="tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}">${dealLabel}</span><span class="tag tag-muted">${typeLabel}</span></div>
          <div class="prop-popup-price">${priceStr}<small>${priceUnit}</small></div>
          <div class="prop-popup-title">${safeTitle}</div>
          <a class="btn btn-primary btn-sm prop-popup-cta" href="#/properties/${p.id}">Подробнее</a>
        </div>
      </div>`;
    if (activePopup) { try { activePopup.remove(); } catch {} activePopup = null; }
    activePopup = new mapboxgl.Popup({ offset: 22, maxWidth: '280px', closeButton: true, className: 'nstr-popup' })
      .setLngLat([p.lng, p.lat]).setHTML(html).addTo(map);
  }

  // expose POI toggle handler
  controls.querySelectorAll('[data-poi]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.dataset.poi;
      poiOn[kind] = !poiOn[kind];
      btn.classList.toggle('active', poiOn[kind]);
      if (map) loadPOIs();
    });
  });

  return cleanup;
}

function buildMapFilters(filters, onChange) {
  const deal = h('select', { class: 'select', style: { width: 'auto', flex: '1' }, onChange: (e) => { filters.deal_type = e.target.value; onChange(); } }, [
    h('option', { value: '', text: 'Все сделки' }),
    h('option', { value: 'rent', text: 'Аренда' }),
    h('option', { value: 'sale', text: 'Продажа' }),
  ]);
  const type = h('select', { class: 'select', style: { width: 'auto', flex: '1' }, onChange: (e) => { filters.type = e.target.value; onChange(); } }, [
    h('option', { value: '', text: 'Все типы' }),
    ...Object.entries(TYPE_LABELS).map(([v, l]) => h('option', { value: v, text: l })),
  ]);
  deal.value = filters.deal_type; type.value = filters.type;
  return h('div', { class: 'row', style: { gap: '8px' } }, [deal, type]);
}

function poiToggle(iconName, kind, poiOn, label) {
  const btn = h('button', { class: `poi-toggle ${poiOn[kind] ? 'active' : ''}`, dataset: { poi: kind } }, [
    icon(iconName),
    h('span', { text: label }),
  ]);
  return btn;
}

function miniCard(p) {
  const cover = p.cover_url ? mediaUrl(p.cover_url) : null;
  return h('div', { class: 'map-mini', onClick: () => navigate(`/properties/${p.id}`) }, [
    cover ? h('img', { src: cover }) : h('div', { class: 'ph', text: '🏠' }),
    h('div', { style: { minWidth: 0 } }, [
      h('div', { class: 'mm-price', text: money(p.price) }),
      h('div', { class: 'mm-title', text: p.title }),
      h('div', { class: 'row', style: { gap: '6px', marginTop: '4px' } }, [
        h('span', { class: `tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`, style: { fontSize: '10px' }, text: DEAL_LABELS[p.deal_type] }),
      ]),
    ]),
  ]);
}

function shortPrice(price) {
  if (price >= 1000000) return '$' + (price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1) + 'M';
  if (price >= 1000) return '$' + Math.round(price / 1000) + 'K';
  return '$' + price;
}

function clearMarkers() { markers.forEach((m) => m.remove()); markers = []; }
function clearPOIs() { poiMarkers.forEach((o) => o.mk.remove()); poiMarkers = []; }

function cleanup() {
  clearMarkers(); clearPOIs();
  if (map) { try { map.remove(); } catch {} map = null; }
}
