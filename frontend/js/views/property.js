// ============================================================
// Property detail view
// ============================================================
import { h, esc, money, fmtDate, toast, modal, confirmDialog, loadingBlock,
  TYPE_LABELS, DEAL_LABELS, TERM_LABELS, VERDICT, mediaUrl } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent, propertyGrid, avatar } from '../components.js';

export async function renderProperty(params) {
  const id = Number(params.id);
  const content = h('div', { class: 'page' }, [h('div', { class: 'container' }, loadingBlock())]);
  mountContent(content);

  let p;
  try {
    p = await api.getProperty(id);
  } catch (e) {
    mountContent(h('div', { class: 'page' }, h('div', { class: 'container' }, [
      h('div', { class: 'empty' }, [h('div', { class: 'emoji', text: '🏚' }), h('h3', { text: 'Объект не найден' }),
        h('a', { class: 'btn btn-primary mt-16', href: '#/', text: 'В каталог' })]),
    ])));
    return;
  }

  const photos = (p.media || []).filter((m) => m.type === 'photo');
  const cover = p.cover_url ? mediaUrl(p.cover_url) : (photos[0] ? mediaUrl(photos[0].url) : null);

  const page = h('div', { class: 'page' }, [
    h('div', { class: 'container' }, [
      h('div', { class: 'row', style: { marginBottom: '14px' } }, [
        h('a', { class: 'btn btn-ghost btn-sm', href: '#/', text: '← Назад' }),
      ]),
      h('div', { class: 'detail-grid' }, [
        h('div', {}, [
          gallery(p, photos, cover),
          h('div', { style: { marginTop: '24px' } }, [
            h('div', { class: 'row wrap', style: { gap: '8px', marginBottom: '14px' } }, [
              h('span', { class: `tag ${p.deal_type === 'rent' ? 'tag-rent' : 'tag-sale'}`, text: DEAL_LABELS[p.deal_type] }),
              h('span', { class: 'tag tag-muted', text: TYPE_LABELS[p.type] }),
              p.rent_term ? h('span', { class: 'tag tag-muted', text: TERM_LABELS[p.rent_term] }) : null,
              p.has_tour ? h('span', { class: 'tag tag-ok', html: '🌐 360° тур' }) : null,
            ]),
            h('h1', { class: 'page-title', style: { fontSize: '28px' }, text: p.title }),
            h('p', { class: 'page-sub', text: p.address || 'Адрес не указан' }),
            detailTabs(p),
          ]),
        ]),
        sidebar(p),
      ]),
    ]),
  ]);

  mountContent(page);
}

function gallery(p, photos, cover) {
  const main = h('div', { class: 'gallery-main' });
  const mainImg = cover ? h('img', { src: cover, alt: esc(p.title) }) : h('div', { class: 'ph', text: '🏠' });
  main.appendChild(mainImg);

  if (p.has_tour) {
    main.appendChild(h('button', { class: 'gallery-tour-btn', html: '🌐 Открыть 360° тур',
      onClick: () => navigate(`/properties/${p.id}/tour`) }));
  }

  const thumbs = h('div', { class: 'gallery-thumbs' });
  if (photos.length > 1) {
    photos.forEach((m, i) => {
      const t = h('img', { src: mediaUrl(m.url), class: i === 0 ? 'active' : '', onClick: () => {
        if (mainImg.tagName === 'IMG') mainImg.src = mediaUrl(m.url);
        thumbs.querySelectorAll('img').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      } });
      thumbs.appendChild(t);
    });
  }

  return h('div', { class: 'gallery' }, [main, photos.length > 1 ? thumbs : null]);
}

function detailTabs(p) {
  const wrap = h('div', { style: { marginTop: '22px' } });
  const tabNames = [
    ['desc', 'Описание'],
    ['ai', '🤖 AI-оценка'],
    p.deal_type === 'sale' ? ['price', '📈 История цен'] : null,
    p.deal_type === 'sale' ? ['mortgage', '🏦 Ипотека'] : null,
    p.deal_type === 'rent' ? ['reviews', '⭐ Отзывы'] : null,
    p.deal_type === 'rent' ? ['availability', '🗓 Доступность'] : null,
    ['similar', '🔁 Похожие'],
  ].filter(Boolean);

  const tabsBar = h('div', { class: 'tabs' });
  const panel = h('div', {});

  tabNames.forEach(([key, label], i) => {
    const btn = h('button', { class: i === 0 ? 'active' : '', text: label, onClick: () => {
      tabsBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderTab(key, p, panel);
    } });
    tabsBar.appendChild(btn);
  });

  wrap.appendChild(tabsBar);
  wrap.appendChild(panel);
  renderTab(tabNames[0][0], p, panel);
  return wrap;
}

async function renderTab(key, p, panel) {
  panel.innerHTML = '';
  if (key === 'desc') {
    panel.appendChild(h('div', { class: 'card card-pad' }, [
      h('p', { style: { whiteSpace: 'pre-wrap', lineHeight: '1.7' }, text: p.description || 'Описание отсутствует.' }),
      p.house_rules ? h('div', { class: 'mt-16' }, [h('h3', { style: { fontSize: '16px', marginBottom: '8px' }, text: 'Правила дома' }),
        h('p', { class: 'muted', style: { whiteSpace: 'pre-wrap' }, text: p.house_rules })]) : null,
    ]));
  } else if (key === 'ai') {
    panel.appendChild(loadingBlock());
    try {
      const r = await api.aiReview(p.id);
      panel.innerHTML = ''; panel.appendChild(aiReviewCard(r));
    } catch (e) { panel.innerHTML = ''; panel.appendChild(h('div', { class: 'card card-pad muted', text: e.message })); }
  } else if (key === 'price') {
    panel.appendChild(loadingBlock());
    try {
      const points = await api.priceHistory(p.id);
      panel.innerHTML = ''; panel.appendChild(priceChart(points, p));
    } catch (e) { panel.innerHTML = ''; panel.appendChild(h('div', { class: 'card card-pad muted', text: e.message })); }
  } else if (key === 'mortgage') {
    panel.appendChild(mortgageCalc(p));
  } else if (key === 'reviews') {
    panel.appendChild(loadingBlock());
    try {
      const reviews = await api.reviews(p.id);
      panel.innerHTML = ''; panel.appendChild(reviewsBlock(p, reviews));
    } catch (e) { panel.innerHTML = ''; panel.appendChild(h('div', { class: 'card card-pad muted', text: e.message })); }
  } else if (key === 'availability') {
    panel.appendChild(loadingBlock());
    try {
      const rows = await api.availability(p.id);
      panel.innerHTML = ''; panel.appendChild(availabilityBlock(rows));
    } catch (e) { panel.innerHTML = ''; panel.appendChild(h('div', { class: 'card card-pad muted', text: e.message })); }
  } else if (key === 'similar') {
    panel.appendChild(loadingBlock());
    try {
      const data = await api.similar(p.id, 6);
      panel.innerHTML = '';
      const grid = propertyGrid(data.items);
      panel.appendChild(grid || h('p', { class: 'muted', text: 'Похожих объектов пока нет.' }));
    } catch (e) { panel.innerHTML = ''; panel.appendChild(h('div', { class: 'card card-pad muted', text: e.message })); }
  }
}

function aiReviewCard(r) {
  const v = VERDICT[r.verdict] || VERDICT.insufficient_data;
  const card = h('div', { class: 'ai-review' }, [
    h('div', { class: 'deal-score' }, [
      h('div', { class: 'score-ring', style: { '--val': r.deal_score, background: `conic-gradient(${v.color} ${r.deal_score}%, var(--line) 0)` } }, h('span', { text: r.deal_score })),
      h('div', {}, [
        h('div', { class: 'verdict-pill', style: { background: v.color + '22', color: v.color }, text: v.label }),
        h('p', { style: { marginTop: '8px', fontWeight: '600' }, text: r.summary }),
        h('div', { class: 'row wrap mt-8', style: { gap: '8px' } }, [
          h('span', { class: 'tag tag-muted', text: `Риск скама: ${riskLabel(r.scam_risk)}` }),
          r.ai_used ? h('span', { class: 'tag tag-ok', text: '✦ Оценка ИИ' }) : h('span', { class: 'tag tag-muted', text: 'Эвристика' }),
        ]),
      ]),
    ]),
  ]);

  const cols = h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: '18px' } });
  if (r.pros && r.pros.length) cols.appendChild(listBox('✅ Плюсы', r.pros, 'var(--ok)'));
  if (r.cons && r.cons.length) cols.appendChild(listBox('⚖️ Минусы', r.cons, 'var(--warn)'));
  if (r.red_flags && r.red_flags.length) cols.appendChild(listBox('🚩 Красные флаги', r.red_flags, 'var(--danger)'));
  if (cols.children.length) card.appendChild(cols);

  if (r.market && Object.keys(r.market).length) {
    const m = r.market;
    const facts = [];
    if (m.market_median_price != null) facts.push(['Медиана рынка', money(m.market_median_price)]);
    if (m.market_avg_price != null) facts.push(['Средняя по рынку', money(m.market_avg_price)]);
    if (m.this_price_per_sqm != null) facts.push(['Цена за м² (этот)', money(m.this_price_per_sqm)]);
    if (m.market_avg_price_per_sqm != null) facts.push(['Средняя за м²', money(m.market_avg_price_per_sqm)]);
    if (m.comparables_count != null) facts.push(['Похожих объектов', m.comparables_count]);
    if (facts.length) {
      const box = h('div', { class: 'card card-pad mt-16' }, [h('h3', { style: { fontSize: '15px', marginBottom: '10px' }, text: '📊 Рыночный контекст' })]);
      facts.forEach(([k, val]) => box.appendChild(h('div', { class: 'fact-row' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: String(val) })])));
      card.appendChild(box);
    }
  }
  return card;
}

function listBox(title, items, color) {
  return h('div', { class: 'card card-pad' }, [
    h('h3', { style: { fontSize: '15px', marginBottom: '10px', color }, text: title }),
    h('ul', { style: { margin: 0, paddingLeft: '18px', lineHeight: '1.8' } }, items.map((t) => h('li', { text: t }))),
  ]);
}
function riskLabel(r) { return { low: 'низкий', medium: 'средний', high: 'высокий', unknown: 'неизвестно' }[r] || r; }

function priceChart(points, p) {
  if (!points || points.length < 1) return h('div', { class: 'card card-pad muted', text: 'История цен пока недоступна.' });
  const w = 640, ht = 220, pad = 30;
  const prices = points.map((x) => x.price);
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((pt, i) => {
    const x = pad + i * stepX;
    const y = ht - pad - ((pt.price - min) / range) * (ht - pad * 2);
    return [x, y];
  });
  const path = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
  const area = path + ` L${coords[coords.length - 1][0].toFixed(1)} ${ht - pad} L${coords[0][0].toFixed(1)} ${ht - pad} Z`;

  const svg = `<svg viewBox="0 0 ${w} ${ht}" style="width:100%;height:auto">
    <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--brand)" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="var(--brand)" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#pg)"/>
    <path d="${path}" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round"/>
    ${coords.map((c) => `<circle cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="3.5" fill="var(--brand)"/>`).join('')}
  </svg>`;

  const first = points[0].price, last = points[points.length - 1].price;
  const change = last - first;
  return h('div', { class: 'card card-pad' }, [
    h('div', { class: 'row-between mb-16' }, [
      h('h3', { style: { fontSize: '16px' }, text: 'Динамика цены' }),
      h('span', { class: `tag ${change <= 0 ? 'tag-ok' : 'tag-warn'}`, text: `${change <= 0 ? '↓' : '↑'} ${money(Math.abs(change))}` }),
    ]),
    h('div', { html: svg }),
    h('div', { class: 'row-between mt-8 muted', style: { fontSize: '12px' } }, [
      h('span', { text: fmtDate(points[0].recorded_at) }),
      h('span', { text: fmtDate(points[points.length - 1].recorded_at) }),
    ]),
  ]);
}

function mortgageCalc(p) {
  const down = h('input', { class: 'input', type: 'number', value: Math.round(p.price * 0.2), min: 0 });
  const rate = h('input', { class: 'input', type: 'number', value: 7.5, step: 0.1, min: 0.1 });
  const years = h('input', { class: 'input', type: 'number', value: 20, min: 1, max: 40 });
  const result = h('div', { class: 'mt-16' });

  const calc = async () => {
    try {
      const r = await api.mortgage(p.id, { down_payment: Number(down.value), annual_rate: Number(rate.value), years: Number(years.value) });
      result.innerHTML = '';
      result.appendChild(h('div', { class: 'stat-grid', style: { marginBottom: 0 } }, [
        miniStat('Сумма кредита', money(r.principal)),
        miniStat('Платёж / мес', money(r.monthly_payment)),
        miniStat('Всего выплат', money(r.total_paid)),
        miniStat('Переплата', money(r.total_interest)),
      ]));
    } catch (e) { toast(e.message, 'err'); }
  };

  const card = h('div', { class: 'card card-pad' }, [
    h('h3', { style: { fontSize: '16px', marginBottom: '14px' }, text: 'Ипотечный калькулятор' }),
    h('div', { class: 'grid', style: { gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' } }, [
      h('div', { class: 'field', style: { margin: 0 } }, [h('label', { text: 'Первый взнос, $' }), down]),
      h('div', { class: 'field', style: { margin: 0 } }, [h('label', { text: 'Ставка, %' }), rate]),
      h('div', { class: 'field', style: { margin: 0 } }, [h('label', { text: 'Срок, лет' }), years]),
    ]),
    h('button', { class: 'btn btn-primary mt-8', text: 'Рассчитать', onClick: calc }),
    result,
  ]);
  setTimeout(calc, 0);
  return card;
}
function miniStat(label, value) {
  return h('div', { class: 'stat' }, [h('div', { class: 'sv', style: { fontSize: '22px' }, text: value }), h('div', { class: 'sl', text: label })]);
}

function reviewsBlock(p, reviews) {
  const wrap = h('div', {});
  const addBtn = h('button', { class: 'btn btn-soft', html: '✍️ Оставить отзыв', onClick: () => openReviewModal(p) });
  wrap.appendChild(h('div', { class: 'row-between mb-16' }, [
    h('h3', { style: { fontSize: '17px' }, text: `Отзывы (${reviews.length})` }),
    store.user ? addBtn : null,
  ]));
  if (!reviews.length) {
    wrap.appendChild(h('div', { class: 'card card-pad muted center', text: 'Отзывов пока нет. Будьте первым!' }));
  } else {
    reviews.forEach((r) => {
      wrap.appendChild(h('div', { class: 'card card-pad mb-16' }, [
        h('div', { class: 'row', style: { gap: '12px', marginBottom: '8px' } }, [
          avatar(r.user, 40),
          h('div', {}, [
            h('div', { style: { fontWeight: '700' }, text: r.user.full_name || 'Пользователь' }),
            h('div', { class: 'prop-rating', text: '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) }),
          ]),
          h('div', { style: { marginLeft: 'auto' }, class: 'muted', text: fmtDate(r.created_at) }),
        ]),
        r.text ? h('p', { style: { margin: 0 }, text: r.text }) : null,
      ]));
    });
  }
  return wrap;
}

function openReviewModal(p) {
  let rating = 5;
  const stars = h('div', { style: { fontSize: '30px', cursor: 'pointer', color: 'var(--gold)' } });
  const drawStars = () => { stars.innerHTML = ''; for (let i = 1; i <= 5; i++) { const s = h('span', { text: i <= rating ? '★' : '☆', onClick: () => { rating = i; drawStars(); } }); stars.appendChild(s); } };
  drawStars();
  const text = h('textarea', { class: 'textarea', placeholder: 'Поделитесь впечатлениями...' });
  const save = h('button', { class: 'btn btn-primary', text: 'Опубликовать' });
  const m = modal({ title: 'Ваш отзыв', body: h('div', {}, [
    h('div', { class: 'field' }, [h('label', { text: 'Оценка' }), stars]),
    h('div', { class: 'field' }, [h('label', { text: 'Комментарий' }), text]),
  ]), footer: [save] });
  save.addEventListener('click', async () => {
    try { await api.addReview(p.id, { rating, text: text.value.trim() || null }); toast('Спасибо за отзыв!', 'ok'); m.close(); renderProperty({ id: p.id }); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function availabilityBlock(rows) {
  if (!rows.length) return h('div', { class: 'card card-pad muted', text: 'Владелец пока не указал доступные даты. Можно попробовать забронировать напрямую.' });
  return h('div', { class: 'card card-pad' }, [
    h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: 'Доступные периоды' }),
    h('div', { class: 'row wrap', style: { gap: '8px' } }, rows.map((r) =>
      h('span', { class: 'tag tag-ok', text: `${fmtDate(r.start_date)} — ${fmtDate(r.end_date)}` }))),
  ]);
}

// ---- Sidebar (price + actions) ----
function sidebar(p) {
  const side = h('div', { class: 'detail-side' });

  const priceCard = h('div', { class: 'card card-pad' }, [
    h('div', { class: 'prop-price', style: { fontSize: '32px' } }, [
      document.createTextNode(money(p.price)),
      p.deal_type === 'rent' ? h('small', { text: ' / ночь' }) : null,
    ]),
    h('div', { class: 'mt-16' }, [
      fact('Тип сделки', DEAL_LABELS[p.deal_type]),
      fact('Тип', TYPE_LABELS[p.type]),
      fact('Площадь', `${p.area} м²`),
      p.rooms != null ? fact('Комнат', p.rooms) : null,
      fact('Цена за м²', money(p.area ? p.price / p.area : 0)),
      fact('Просмотров', p.views_count),
      p.avg_rating ? fact('Рейтинг', `★ ${p.avg_rating.toFixed(1)}`) : null,
    ]),
  ]);
  side.appendChild(priceCard);

  // Actions
  const actions = h('div', { class: 'card card-pad' }, [h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } })]);
  const col = actions.firstChild;

  const isOwner = store.user && p.seller && p.seller.id === store.user.id;

  if (p.has_tour) {
    col.appendChild(h('button', { class: 'btn btn-primary btn-block btn-lg', html: '🌐 Открыть 360° тур',
      onClick: () => navigate(`/properties/${p.id}/tour`) }));
  }

  if (!isOwner) {
    if (p.deal_type === 'rent') {
      col.appendChild(h('button', { class: 'btn btn-accent btn-block', html: '🗓 Забронировать', onClick: () => openBookingModal(p) }));
    } else {
      col.appendChild(h('button', { class: 'btn btn-accent btn-block', html: '📨 Заявка на просмотр', onClick: () => openRequestModal(p) }));
    }
    col.appendChild(h('button', { class: 'btn btn-ghost btn-block', html: '💬 Связаться с риелтором', onClick: () => contactRealtor(p) }));

    const favBtn = h('button', { class: 'btn btn-ghost btn-block', html: p.is_favorited ? '♥ В избранном' : '♡ В избранное' });
    favBtn.addEventListener('click', async () => {
      try {
        if (p.is_favorited) { await api.removeFavorite(p.id); p.is_favorited = false; favBtn.innerHTML = '♡ В избранное'; }
        else { await api.addFavorite(p.id); p.is_favorited = true; favBtn.innerHTML = '♥ В избранном'; }
      } catch (e) { toast(e.message, 'err'); }
    });
    col.appendChild(favBtn);

    col.appendChild(h('button', { class: 'btn btn-ghost btn-block', html: '📉 Отслеживать цену', onClick: () => trackPrice(p) }));
    col.appendChild(h('button', { class: 'btn btn-block', style: { color: 'var(--ink-3)' }, html: '⚑ Пожаловаться на продавца', onClick: () => complain(p) }));
  } else {
    col.appendChild(h('a', { class: 'btn btn-soft btn-block', href: `#/dashboard`, text: '📊 Управлять (в кабинете)' }));
  }
  side.appendChild(actions);

  // Seller
  if (p.seller) {
    side.appendChild(h('div', { class: 'card card-pad' }, [
      h('div', { class: 'seller-box' }, [
        avatar(p.seller, 48),
        h('div', {}, [
          h('div', { style: { fontWeight: '700' }, text: p.seller.full_name || 'Продавец' }),
          h('div', { class: 'muted', style: { fontSize: '13px' }, text: p.seller.company_name || ({ seller: 'Продавец', admin: 'Администратор', buyer: 'Пользователь' }[p.seller.role]) }),
        ]),
      ]),
    ]));
  }

  // Mini-map
  if (p.lat != null && p.lng != null) {
    const mapBox = h('div', { class: 'card', style: { overflow: 'hidden', height: '200px' } }, h('div', { id: 'mini-map', style: { width: '100%', height: '100%' } }));
    side.appendChild(mapBox);
    setTimeout(() => initMiniMap(p), 100);
  }

  return side;
}

function fact(k, v) { return h('div', { class: 'fact-row' }, [h('span', { class: 'k', text: k }), h('span', { class: 'v', text: String(v) })]); }

function initMiniMap(p) {
  const token = api.config.mapboxToken;
  const el = document.getElementById('mini-map');
  if (!el) return;
  if (!token || !window.mapboxgl) {
    el.innerHTML = `<div style="display:grid;place-content:center;height:100%;color:var(--ink-4)">📍 ${esc(p.address || '')}</div>`;
    return;
  }
  mapboxgl.accessToken = token;
  const map = new mapboxgl.Map({ container: el, style: 'mapbox://styles/mapbox/streets-v12', center: [p.lng, p.lat], zoom: 14, interactive: true });
  new mapboxgl.Marker({ color: '#5b50f0' }).setLngLat([p.lng, p.lat]).addTo(map);
}

// ---- Action modals ----
function requireAuth() {
  if (!store.user) { toast('Войдите, чтобы продолжить', 'info'); navigate('/auth'); return false; }
  return true;
}

function openBookingModal(p) {
  if (!requireAuth()) return;
  const start = h('input', { class: 'input', type: 'date', min: new Date().toISOString().slice(0, 10) });
  const end = h('input', { class: 'input', type: 'date', min: new Date().toISOString().slice(0, 10) });
  const totalBox = h('div', { class: 'muted mt-8' });
  const calcTotal = () => {
    if (start.value && end.value) {
      const n = Math.max((new Date(end.value) - new Date(start.value)) / 86400000, 0);
      if (n > 0) totalBox.textContent = `${n} ноч. × ${money(p.price)} = ${money(n * p.price)}`;
      else totalBox.textContent = '';
    }
  };
  start.addEventListener('change', calcTotal); end.addEventListener('change', calcTotal);

  const pay = h('button', { class: 'btn btn-accent', text: 'Перейти к оплате' });
  const m = modal({ title: `Бронирование — ${p.title}`, body: h('div', {}, [
    h('div', { class: 'input-group' }, [
      h('div', { class: 'field', style: { flex: '1' } }, [h('label', { text: 'Заезд' }), start]),
      h('div', { class: 'field', style: { flex: '1' } }, [h('label', { text: 'Выезд' }), end]),
    ]),
    totalBox,
  ]), footer: [pay] });

  pay.addEventListener('click', async () => {
    if (!start.value || !end.value) return toast('Выберите даты', 'err');
    try {
      const res = await api.createBooking({ property_id: p.id, start_date: start.value, end_date: end.value });
      m.close();
      openCheckout(res);
    } catch (e) { toast(e.message, 'err'); }
  });
}

function openCheckout(res) {
  const frame = h('iframe', { src: res.checkout_url, style: { width: '100%', height: '560px', border: 'none', borderRadius: '12px' } });
  const status = h('div', { class: 'muted center mt-8', text: 'Тестовая карта 4242 4242 4242 4242 — оплата пройдёт успешно.' });
  const m = modal({ title: 'Оплата брони', large: true, body: h('div', {}, [frame, status]) });

  let polls = 0;
  const timer = setInterval(async () => {
    polls++;
    try {
      const s = await api.paymentStatus(res.payment_token);
      if (s.status === 'paid') { clearInterval(timer); toast('Оплачено! Бронь подтверждена.', 'ok'); m.close(); navigate('/bookings'); }
      else if (s.status === 'cancelled' || s.status === 'expired') { clearInterval(timer); }
    } catch {}
    if (polls > 150) clearInterval(timer);
  }, 2000);
}

function openRequestModal(p) {
  if (!requireAuth()) return;
  const msg = h('textarea', { class: 'textarea', placeholder: 'Здравствуйте! Хочу посмотреть объект...' });
  const date = h('input', { class: 'input', type: 'date', min: new Date().toISOString().slice(0, 10) });
  const send = h('button', { class: 'btn btn-primary', text: 'Отправить заявку' });
  const m = modal({ title: 'Заявка на просмотр', body: h('div', {}, [
    h('div', { class: 'field' }, [h('label', { text: 'Сообщение' }), msg]),
    h('div', { class: 'field' }, [h('label', { text: 'Желаемая дата' }), date]),
  ]), footer: [send] });
  send.addEventListener('click', async () => {
    try { await api.submitRequest({ property_id: p.id, message: msg.value.trim() || null, preferred_date: date.value || null }); toast('Заявка отправлена!', 'ok'); m.close(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

async function contactRealtor(p) {
  if (!requireAuth()) return;
  const text = h('textarea', { class: 'textarea', placeholder: 'Здравствуйте! Интересует ваш объект...' });
  const send = h('button', { class: 'btn btn-primary', text: 'Начать диалог' });
  const m = modal({ title: '💬 Связаться с риелтором', body: h('div', {}, [
    h('p', { class: 'muted mb-8', text: p.title }),
    h('div', { class: 'field' }, [h('label', { text: 'Сообщение' }), text]),
  ]), footer: [send] });
  send.addEventListener('click', async () => {
    try { await api.startConversation({ property_id: p.id, text: text.value.trim() || 'Здравствуйте!' }); toast('Диалог создан', 'ok'); m.close(); navigate('/messages'); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function trackPrice(p) {
  if (!requireAuth()) return;
  const target = h('input', { class: 'input', type: 'number', placeholder: `Например ${Math.round(p.price * 0.9)}`, min: 0 });
  const save = h('button', { class: 'btn btn-primary', text: 'Отслеживать' });
  const m = modal({ title: '📉 Трекер цены', body: h('div', {}, [
    h('p', { class: 'muted mb-8', text: 'Уведомим, когда цена упадёт. Можно указать целевую цену (необязательно).' }),
    h('div', { class: 'field' }, [h('label', { text: 'Целевая цена, $' }), target]),
  ]), footer: [save] });
  save.addEventListener('click', async () => {
    try { await api.addTracker({ property_id: p.id, target_price: target.value ? Number(target.value) : null }); toast('Трекер добавлен', 'ok'); m.close(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function complain(p) {
  if (!requireAuth()) return;
  const reason = h('textarea', { class: 'textarea', placeholder: 'Опишите проблему: недостоверное описание, не отвечает, и т.д.' });
  const send = h('button', { class: 'btn btn-danger', text: 'Отправить жалобу' });
  const m = modal({ title: '⚑ Жалоба на продавца', body: h('div', {}, [
    h('div', { class: 'field' }, [h('label', { text: 'Причина' }), reason]),
  ]), footer: [send] });
  send.addEventListener('click', async () => {
    if (reason.value.trim().length < 3) return toast('Опишите причину', 'err');
    try { await api.submitComplaint({ seller_id: p.seller.id, property_id: p.id, reason: reason.value.trim() }); toast('Жалоба отправлена на рассмотрение', 'ok'); m.close(); }
    catch (e) { toast(e.message, 'err'); }
  });
}
