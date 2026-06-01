// ============================================================
// Catalog / Home view — hero, filters, property grid
// ============================================================
import { h, toast, skeletonGrid, empty, TYPE_LABELS } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent, propertyGrid } from '../components.js';

const state = {
  filters: { deal_type: '', type: '', min_price: '', max_price: '', min_area: '', max_area: '', rooms: '' },
  q: '',
  offset: 0,
  limit: 20,
  total: 0,
  items: [],
  loading: false,
};

export async function renderCatalog() {
  const grid = h('div', { id: 'catalog-grid' });
  const filtersBar = buildFilters(grid);

  const content = h('div', { class: 'page' }, [
    h('div', { class: 'container' }, [
      hero(),
      h('div', { class: 'page-head' }, [
        h('div', {}, [
          h('div', { class: 'page-title', text: 'Каталог недвижимости' }),
          h('div', { class: 'page-sub', id: 'catalog-count', text: 'Загрузка...' }),
        ]),
      ]),
      filtersBar,
      grid,
      h('div', { id: 'catalog-more', class: 'center mt-24' }),
    ]),
  ]);

  mountContent(content);
  state.offset = 0; state.items = [];
  await load(grid, true);
}

function hero() {
  const search = h('input', { placeholder: 'Поиск: «двушка у метро», адрес, район...', onKeyDown: (e) => { if (e.key === 'Enter') doSearch(e.target.value); } });
  return h('div', { class: 'hero' }, [
    h('h1', { text: 'Найдите дом, в который захочется вернуться' }),
    h('p', { text: 'Иммерсивные 360°-туры, ответы ИИ про любую зону квартиры и честные сделки онлайн.' }),
    h('div', { class: 'hero-search' }, [
      search,
      h('button', { class: 'btn btn-primary', text: 'Искать', onClick: () => doSearch(search.value) }),
    ]),
    h('div', { class: 'hero-stats' }, [
      heroStat('360°', 'Виртуальные туры'),
      heroStat('AI', 'Spatial Q&A'),
      heroStat('0%', 'Комиссия за просмотр'),
    ]),
  ]);
}
function heroStat(b, s) { return h('div', {}, [h('b', { text: b }), h('span', { text: s })]); }

function doSearch(q) {
  q = (q || '').trim();
  if (!q) return;
  navigate('/search?q=' + encodeURIComponent(q));
}

function buildFilters(grid) {
  const f = state.filters;
  const dealSeg = h('div', { class: 'seg' }, [
    segBtn('Все', '', f.deal_type, (v) => setDeal(v)),
    segBtn('Аренда', 'rent', f.deal_type, (v) => setDeal(v)),
    segBtn('Продажа', 'sale', f.deal_type, (v) => setDeal(v)),
  ]);
  function setDeal(v) { f.deal_type = v; reloadFresh(grid); refreshSeg(dealSeg, v); }

  const typeSel = h('select', { class: 'select', onChange: (e) => { f.type = e.target.value; reloadFresh(grid); } }, [
    h('option', { value: '', text: 'Любой тип' }),
    ...Object.entries(TYPE_LABELS).map(([v, l]) => h('option', { value: v, text: l })),
  ]);
  const minP = numInput('Цена от', (v) => (f.min_price = v), grid);
  const maxP = numInput('до', (v) => (f.max_price = v), grid);
  const minA = numInput('Площадь от', (v) => (f.min_area = v), grid);
  const rooms = h('select', { class: 'select', onChange: (e) => { f.rooms = e.target.value; reloadFresh(grid); } }, [
    h('option', { value: '', text: 'Комнаты' }),
    ...[1, 2, 3, 4, 5].map((n) => h('option', { value: n, text: n + (n === 5 ? '+' : '') })),
  ]);
  const reset = h('button', { class: 'chip', html: '✕ Сбросить', onClick: () => {
    Object.keys(f).forEach((k) => (f[k] = ''));
    typeSel.value = ''; rooms.value = ''; minP.value = ''; maxP.value = ''; minA.value = '';
    refreshSeg(dealSeg, ''); reloadFresh(grid);
  } });

  return h('div', { class: 'filters' }, [dealSeg, typeSel, minP, maxP, minA, rooms, h('div', { class: 'grow' }), reset]);
}

function segBtn(label, value, current, onClick) {
  return h('button', { class: value === current ? 'active' : '', text: label, dataset: { value }, onClick: () => onClick(value) });
}
function refreshSeg(seg, value) {
  seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
}
function numInput(ph, onChange, grid) {
  let t;
  return h('input', { class: 'input', type: 'number', placeholder: ph, min: 0, style: { width: '120px' },
    onInput: (e) => { clearTimeout(t); const v = e.target.value; t = setTimeout(() => { onChange(v); reloadFresh(grid); }, 450); } });
}

function reloadFresh(grid) { state.offset = 0; state.items = []; load(grid, true); }

async function load(grid, fresh) {
  if (state.loading) return;
  state.loading = true;
  if (fresh) { grid.innerHTML = ''; grid.appendChild(skeletonGrid(8)); }

  const params = { limit: state.limit, offset: state.offset };
  Object.entries(state.filters).forEach(([k, v]) => { if (v !== '') params[k] = v; });

  try {
    const data = await api.listProperties(params);
    state.total = data.total;
    if (fresh) { state.items = data.items; grid.innerHTML = ''; }
    else state.items.push(...data.items);

    const node = propertyGrid(state.items, { onFav: () => {} });
    grid.innerHTML = '';
    if (node) grid.appendChild(node);
    else grid.appendChild(empty('🏚', 'Ничего не найдено', 'Попробуйте изменить фильтры', null));

    const count = document.getElementById('catalog-count');
    if (count) count.textContent = `Найдено объектов: ${state.total}`;

    renderMore(grid);
  } catch (e) {
    toast(e.message, 'err');
    grid.innerHTML = '';
    grid.appendChild(empty('⚠️', 'Не удалось загрузить', e.message));
  } finally {
    state.loading = false;
  }
}

function renderMore(grid) {
  const more = document.getElementById('catalog-more');
  if (!more) return;
  more.innerHTML = '';
  if (state.items.length < state.total) {
    more.appendChild(h('button', { class: 'btn btn-ghost btn-lg', text: 'Показать ещё', onClick: () => { state.offset += state.limit; load(grid, false); } }));
  }
}

// ---- Search results view ----
export async function renderSearch(_params, query) {
  const q = query.q || '';
  const grid = h('div', {});
  const content = h('div', { class: 'page' }, [
    h('div', { class: 'container' }, [
      h('div', { class: 'page-head' }, [
        h('div', {}, [
          h('div', { class: 'page-title', text: 'Результаты поиска' }),
          h('div', { class: 'page-sub', text: `По запросу: «${q}»` }),
        ]),
        h('a', { class: 'btn btn-ghost', href: '#/', text: '← В каталог' }),
      ]),
      grid,
    ]),
  ]);
  mountContent(content);
  grid.appendChild(skeletonGrid(6));
  try {
    const data = await api.searchProperties({ q, limit: 50 });
    grid.innerHTML = '';
    const node = propertyGrid(data.items);
    if (node) grid.appendChild(node);
    else grid.appendChild(empty('🔍', 'Ничего не найдено', `По запросу «${q}» нет объектов`));
  } catch (e) {
    grid.innerHTML = '';
    grid.appendChild(empty('⚠️', 'Ошибка поиска', e.message));
  }
}
