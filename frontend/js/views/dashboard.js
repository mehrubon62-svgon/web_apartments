// ============================================================
// Seller dashboard — listings, create/edit, tour editor, analytics
// ============================================================
import { h, esc, money, toast, modal, confirmDialog, empty, loadingBlock,
  TYPE_LABELS, DEAL_LABELS, STATUS_LABELS, mediaUrl } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent } from '../components.js';

function requireSeller() {
  if (!store.isSeller()) { toast('Доступ только для продавцов', 'err'); navigate('/'); return false; }
  return true;
}

export async function renderDashboard() {
  if (!requireSeller()) return;
  const stats = h('div', { class: 'stat-grid' });
  const grid = h('div', {}, loadingBlock());
  const addBtn = h('button', { class: 'btn btn-primary', html: '＋ Новый объект', onClick: () => openPropertyEditor() });

  mountContent(h('div', { class: 'page' }, h('div', { class: 'container' }, [
    h('div', { class: 'page-head' }, [
      h('div', {}, [h('div', { class: 'page-title', text: '📊 Кабинет продавца' }), h('div', { class: 'page-sub', text: 'Ваши объекты и аналитика' })]),
      addBtn,
    ]),
    stats,
    grid,
  ])));

  try {
    const data = await api.myListings();
    const items = data.items;
    const totalViews = items.reduce((s, p) => s + (p.views_count || 0), 0);
    const active = items.filter((p) => p.status === 'active').length;
    const withTour = items.filter((p) => p.has_tour).length;
    stats.append(
      stat('🏠', items.length, 'Объектов'),
      stat('✅', active, 'Активных'),
      stat('👁', totalViews, 'Просмотров'),
      stat('🌐', withTour, 'С 360°-туром'),
    );

    grid.innerHTML = '';
    if (!items.length) { grid.appendChild(empty('🏗', 'Объектов пока нет', 'Создайте первое объявление', h('button', { class: 'btn btn-primary mt-16', text: '＋ Новый объект', onClick: () => openPropertyEditor() }))); return; }
    items.forEach((p) => grid.appendChild(listingRow(p)));
  } catch (e) { grid.innerHTML = ''; grid.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

function stat(icon, value, label) {
  return h('div', { class: 'stat' }, [h('div', { class: 'si', text: icon }), h('div', { class: 'sv', text: String(value) }), h('div', { class: 'sl', text: label })]);
}

function listingRow(p) {
  const statusTag = { active: 'tag-ok', paused: 'tag-warn', deleted: 'tag-danger' }[p.status] || 'tag-muted';
  const toggleBtn = p.status === 'active'
    ? h('button', { class: 'btn btn-ghost btn-sm', text: '⏸ Пауза', onClick: async () => { await api.pauseListing(p.id); toast('На паузе', 'ok'); renderDashboard(); } })
    : h('button', { class: 'btn btn-ghost btn-sm', text: '▶ Активировать', onClick: async () => { await api.activateListing(p.id); toast('Активно', 'ok'); renderDashboard(); } });

  return h('div', { class: 'card card-pad mb-16' }, [
    h('div', { class: 'row', style: { gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } }, [
      p.cover_url ? h('img', { src: mediaUrl(p.cover_url), style: { width: '130px', height: '95px', borderRadius: '12px', objectFit: 'cover' } }) : h('div', { style: { width: '130px', height: '95px', borderRadius: '12px', background: 'var(--surface-2)', display: 'grid', placeContent: 'center', fontSize: '32px' }, text: '🏠' }),
      h('div', { style: { flex: '1', minWidth: '200px' } }, [
        h('div', { class: 'row wrap', style: { gap: '6px', marginBottom: '6px' } }, [
          h('span', { class: `tag ${statusTag}`, text: STATUS_LABELS[p.status] }),
          h('span', { class: `tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`, text: DEAL_LABELS[p.deal_type] }),
          p.has_tour ? h('span', { class: 'tag tag-muted', text: '🌐 360°' }) : null,
        ]),
        h('a', { href: `#/properties/${p.id}`, style: { fontWeight: '700', fontSize: '16px' }, text: p.title }),
        h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' }, text: `${money(p.price)} · ${p.area} м² · 👁 ${p.views_count}` }),
      ]),
      h('div', { class: 'row wrap', style: { gap: '8px' } }, [
        h('button', { class: 'btn btn-soft btn-sm', html: '📈 Аналитика', onClick: () => showAnalytics(p) }),
        h('button', { class: 'btn btn-soft btn-sm', html: '🌐 Тур', onClick: () => openTourEditor(p) }),
        h('button', { class: 'btn btn-ghost btn-sm', html: '✏️', onClick: () => openPropertyEditor(p) }),
        toggleBtn,
        h('button', { class: 'btn btn-danger-soft btn-sm', html: '🗑', onClick: async () => {
          if (await confirmDialog({ title: 'Удалить объект?', message: p.title, danger: true })) { await api.deleteProperty(p.id); toast('Удалено', 'ok'); renderDashboard(); }
        } }),
      ]),
    ]),
  ]);
}

async function showAnalytics(p) {
  const body = h('div', {}, loadingBlock());
  const m = modal({ title: `📈 Аналитика — ${p.title}`, large: true, body });
  try {
    const a = await api.listingAnalytics(p.id);
    body.innerHTML = '';
    body.appendChild(h('div', { class: 'stat-grid' }, [
      stat('👁', a.total_views, 'Просмотров'),
      stat('🔍', a.spatial_questions, 'Spatial Q&A'),
      stat('🗓', a.booking_requests, 'Броней'),
      stat('📨', a.purchase_requests, 'Заявок'),
    ]));
    if (a.top_zones && a.top_zones.length) {
      body.appendChild(h('h3', { style: { fontSize: '16px', margin: '8px 0 12px' }, text: '🔥 Самые обсуждаемые зоны (Spatial Q&A)' }));
      a.top_zones.forEach((z) => body.appendChild(h('div', { class: 'fact-row' }, [
        h('span', { class: 'k', text: z.room_id || 'Без комнаты' }),
        h('span', { class: 'v', text: `${z.count} вопросов` }),
      ])));
    }
  } catch (e) { body.innerHTML = ''; body.appendChild(h('p', { class: 'muted', text: e.message })); }
}

// ---- Property create/edit ----
async function openPropertyEditor(existing) {
  const isEdit = !!existing;
  const f = {
    title: existing?.title || '', description: existing?.description || '',
    type: existing?.type || 'apartment', deal_type: existing?.deal_type || 'rent',
    rent_term: existing?.rent_term || 'short', price: existing?.price || '', area: existing?.area || '',
    rooms: existing?.rooms ?? '', address: existing?.address || '',
    lat: existing?.lat ?? '', lng: existing?.lng ?? '', house_rules: existing?.house_rules || '',
  };
  let media = existing ? (existing.media || []).map((m) => ({ url: m.url, type: m.type, order: m.order })) : [];

  const title = inp('text', f.title);
  const desc = h('textarea', { class: 'textarea', text: f.description }); desc.value = f.description;
  const type = sel(TYPE_LABELS, f.type);
  const deal = sel(DEAL_LABELS, f.deal_type);
  const term = sel({ short: 'Краткосрочно', long: 'Долгосрочно' }, f.rent_term);
  const termField = h('div', { class: 'field', style: { display: f.deal_type === 'rent' ? 'block' : 'none' } }, [h('label', { text: 'Срок аренды' }), term]);
  deal.addEventListener('change', () => { termField.style.display = deal.value === 'rent' ? 'block' : 'none'; });
  const price = inp('number', f.price);
  const area = inp('number', f.area);
  const rooms = inp('number', f.rooms);
  const address = inp('text', f.address);
  const lat = inp('number', f.lat); const lng = inp('number', f.lng);
  const rules = h('textarea', { class: 'textarea', text: f.house_rules }); rules.value = f.house_rules;

  // Media uploader
  const mediaList = h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '8px' } });
  const renderMedia = () => {
    mediaList.innerHTML = '';
    media.forEach((m, i) => {
      mediaList.appendChild(h('div', { style: { position: 'relative' } }, [
        h('img', { src: mediaUrl(m.url), style: { width: '84px', height: '64px', objectFit: 'cover', borderRadius: '10px', border: m.type === '360' ? '2px solid var(--brand)' : '1px solid var(--line)' } }),
        m.type === '360' ? h('span', { style: { position: 'absolute', bottom: '2px', left: '2px', fontSize: '9px', background: 'var(--brand)', color: '#fff', padding: '1px 4px', borderRadius: '4px' }, text: '360' }) : null,
        h('button', { class: 'prop-fav', style: { width: '22px', height: '22px', top: '-6px', right: '-6px', fontSize: '12px' }, html: '✕', onClick: () => { media.splice(i, 1); renderMedia(); } }),
      ]));
    });
  };
  renderMedia();
  const photoInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (e) => uploadMedia(e.target.files[0], 'photo') });
  const panoInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (e) => uploadMedia(e.target.files[0], '360') });
  async function uploadMedia(file, kind) {
    if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { toast('Загрузка...', 'info'); const r = await api.upload(fd); media.push({ url: r.url, type: kind, order: media.length }); renderMedia(); }
    catch (e) { toast(e.message, 'err'); }
  }

  const save = h('button', { class: 'btn btn-primary', text: isEdit ? 'Сохранить' : 'Опубликовать' });

  const m = modal({
    title: isEdit ? 'Редактировать объект' : 'Новый объект',
    large: true,
    body: h('div', {}, [
      field('Заголовок', title),
      field('Описание', desc),
      h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '12px' } }, [
        field('Тип', type), field('Сделка', deal),
      ]),
      termField,
      h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' } }, [
        field(deal.value === 'rent' ? 'Цена/ночь, $' : 'Цена, $', price), field('Площадь, м²', area), field('Комнат', rooms),
      ]),
      field('Адрес', address),
      h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '12px' } }, [
        field('Широта (необязательно)', lat), field('Долгота (необязательно)', lng),
      ]),
      h('p', { class: 'hint', text: 'Координаты можно не указывать — мы определим их по адресу (Mapbox).' }),
      field('Правила дома (для аренды)', rules),
      h('div', { class: 'field' }, [
        h('label', { text: 'Фото и 360°-панорамы' }),
        h('div', { class: 'row', style: { gap: '8px' } }, [
          h('button', { class: 'btn btn-soft btn-sm', html: '🖼 Добавить фото', onClick: () => photoInput.click() }),
          h('button', { class: 'btn btn-soft btn-sm', html: '🌐 Добавить 360°', onClick: () => panoInput.click() }),
          photoInput, panoInput,
        ]),
        mediaList,
      ]),
    ]),
    footer: [save],
  });

  save.addEventListener('click', async () => {
    const payload = {
      title: title.value.trim(), description: desc.value.trim() || null,
      type: type.value, deal_type: deal.value,
      rent_term: deal.value === 'rent' ? term.value : null,
      price: Number(price.value), area: Number(area.value),
      rooms: rooms.value ? Number(rooms.value) : null,
      address: address.value.trim() || null,
      lat: lat.value ? Number(lat.value) : null, lng: lng.value ? Number(lng.value) : null,
      house_rules: rules.value.trim() || null,
    };
    if (!payload.title || payload.title.length < 3) return toast('Введите заголовок (мин. 3 символа)', 'err');
    if (!payload.price || payload.price <= 0) return toast('Укажите цену', 'err');
    if (!payload.area || payload.area <= 0) return toast('Укажите площадь', 'err');

    save.disabled = true;
    try {
      if (isEdit) {
        await api.updateProperty(existing.id, payload);
        // sync media via tour? media only settable on create; for edit we skip media diff (API has no media endpoint)
        toast('Объект обновлён', 'ok');
      } else {
        payload.media = media;
        await api.createProperty(payload);
        toast('Объект опубликован', 'ok');
      }
      m.close(); renderDashboard();
    } catch (e) { toast(e.message, 'err'); save.disabled = false; }
  });

  function inp(type, value) { const e = h('input', { class: 'input', type }); e.value = value; return e; }
  function sel(map, value) { const e = h('select', { class: 'select' }, Object.entries(map).map(([v, l]) => h('option', { value: v, text: l }))); e.value = value; return e; }
  function field(label, el) { return h('div', { class: 'field' }, [h('label', { text: label }), el]); }
}

// ---- Tour editor ----
async function openTourEditor(p) {
  let tour = null;
  try { tour = await api.getTour(p.id); } catch {}
  let rooms = tour ? tour.rooms.map((r) => ({ ...r })) : [];
  let firstRoom = tour ? tour.first_room_id : null;

  const roomsBox = h('div', {});
  const render = () => {
    roomsBox.innerHTML = '';
    if (!rooms.length) roomsBox.appendChild(h('p', { class: 'muted', text: 'Добавьте комнаты с панорамами.' }));
    rooms.forEach((r, i) => roomsBox.appendChild(roomEditor(r, i)));
  };

  function roomEditor(r, i) {
    const idIn = h('input', { class: 'input', value: r.id, placeholder: 'living', onInput: (e) => (r.id = e.target.value.trim()) });
    const nameIn = h('input', { class: 'input', value: r.name || '', placeholder: 'Гостиная', onInput: (e) => (r.name = e.target.value) });
    const urlIn = h('input', { class: 'input', value: r.media_url || '', placeholder: 'URL панорамы', onInput: (e) => (r.media_url = e.target.value) });
    const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => {
      const file = e.target.files[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try { const up = await api.upload(fd); r.media_url = up.url; urlIn.value = up.url; toast('Панорама загружена', 'ok'); } catch (err) { toast(err.message, 'err'); }
    } });

    // links
    const linksBox = h('div', { style: { marginTop: '8px' } });
    const renderLinks = () => {
      linksBox.innerHTML = '';
      (r.links || []).forEach((lnk, li) => {
        const toSel = h('select', { class: 'select', style: { flex: '1' }, onChange: (e) => (lnk.to_room_id = e.target.value) },
          rooms.filter((x) => x.id !== r.id).map((x) => h('option', { value: x.id, text: x.name || x.id })));
        toSel.value = lnk.to_room_id || '';
        const yaw = h('input', { class: 'input', type: 'number', style: { width: '90px' }, value: lnk.yaw ?? 0, placeholder: 'yaw', onInput: (e) => (lnk.yaw = Number(e.target.value)) });
        const label = h('input', { class: 'input', style: { width: '120px' }, value: lnk.label || '', placeholder: 'метка', onInput: (e) => (lnk.label = e.target.value) });
        linksBox.appendChild(h('div', { class: 'row', style: { gap: '6px', marginBottom: '6px' } }, [
          h('span', { text: '→' }), toSel, yaw, label,
          h('button', { class: 'btn btn-danger-soft btn-sm', html: '✕', onClick: () => { r.links.splice(li, 1); renderLinks(); } }),
        ]));
      });
    };
    r.links = r.links || [];
    renderLinks();

    return h('div', { class: 'card card-pad mb-16' }, [
      h('div', { class: 'row-between mb-8' }, [
        h('strong', { text: `Комната ${i + 1}` }),
        h('div', { class: 'row', style: { gap: '6px' } }, [
          h('label', { class: 'row', style: { gap: '4px', fontSize: '13px' } }, [
            h('input', { type: 'radio', name: 'firstroom', checked: firstRoom === r.id, onChange: () => (firstRoom = r.id) }), document.createTextNode('Стартовая'),
          ]),
          h('button', { class: 'btn btn-danger-soft btn-sm', html: '🗑', onClick: () => { rooms.splice(i, 1); render(); } }),
        ]),
      ]),
      h('div', { class: 'grid', style: { gridTemplateColumns: '1fr 1fr', gap: '8px' } }, [
        h('div', { class: 'field', style: { margin: 0 } }, [h('label', { text: 'ID' }), idIn]),
        h('div', { class: 'field', style: { margin: 0 } }, [h('label', { text: 'Название' }), nameIn]),
      ]),
      h('div', { class: 'field', style: { margin: '8px 0 0' } }, [h('label', { text: 'Панорама (URL или загрузка)' }),
        h('div', { class: 'row', style: { gap: '6px' } }, [urlIn, h('button', { class: 'btn btn-soft btn-sm', html: '⬆', onClick: () => fileInput.click() }), fileInput])]),
      h('div', { style: { marginTop: '8px' } }, [h('label', { class: 'muted', style: { fontSize: '12px', fontWeight: '700' }, text: 'Переходы (стрелки в др. комнаты)' }), linksBox,
        h('button', { class: 'btn btn-ghost btn-sm', html: '＋ переход', onClick: () => { r.links.push({ to_room_id: '', yaw: 0, label: 'Перейти' }); renderLinks(); } })]),
    ]);
  }

  render();
  const save = h('button', { class: 'btn btn-primary', text: 'Сохранить тур' });
  const m = modal({
    title: `🌐 Редактор 360°-тура — ${p.title}`, large: true,
    body: h('div', {}, [
      h('p', { class: 'hint mb-8', text: 'Каждая комната — панорама. Переходы между комнатами работают как стрелки в Google Street View.' }),
      roomsBox,
      h('button', { class: 'btn btn-soft', html: '＋ Добавить комнату', onClick: () => { rooms.push({ id: 'room' + (rooms.length + 1), name: '', media_url: '', links: [] }); render(); } }),
    ]),
    footer: [save],
  });

  save.addEventListener('click', async () => {
    if (!rooms.length) return toast('Добавьте хотя бы одну комнату', 'err');
    for (const r of rooms) { if (!r.id || !r.media_url) return toast('У каждой комнаты должны быть ID и панорама', 'err'); }
    try {
      await api.upsertTour(p.id, { rooms, first_room_id: firstRoom || rooms[0].id });
      toast('Тур сохранён', 'ok'); m.close();
    } catch (e) { toast(e.message, 'err'); }
  });
}
