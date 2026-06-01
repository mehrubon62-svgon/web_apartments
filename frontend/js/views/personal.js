// ============================================================
// Personal pages: favorites, history, bookings, trackers,
// requests, recommendations, profile
// ============================================================
import { h, esc, money, fmtDate, timeAgo, toast, modal, confirmDialog, empty, loadingBlock,
  skeletonGrid, TYPE_LABELS, DEAL_LABELS, ROLE_LABELS, mediaUrl } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent, propertyGrid, avatar } from '../components.js';

function requireAuth() {
  if (!store.user) { toast('Войдите в аккаунт', 'info'); navigate('/auth'); return false; }
  return true;
}

function pageWrap(title, sub, actions, body) {
  return h('div', { class: 'page' }, h('div', { class: 'container' }, [
    h('div', { class: 'page-head' }, [
      h('div', {}, [h('div', { class: 'page-title', text: title }), sub ? h('div', { class: 'page-sub', text: sub }) : null]),
      actions || null,
    ]),
    body,
  ]));
}

// ---- Favorites ----
export async function renderFavorites() {
  if (!requireAuth()) return;
  const grid = h('div', {}, skeletonGrid(4));
  const clearBtn = h('button', { class: 'btn btn-ghost btn-sm', html: '🧹 Очистить всё', onClick: async () => {
    if (await confirmDialog({ title: 'Очистить избранное?', message: 'Все объекты будут удалены из избранного.', danger: true })) {
      await api.clearFavorites(); toast('Избранное очищено', 'ok'); renderFavorites();
    }
  } });
  mountContent(pageWrap('♥ Избранное', 'Сохранённые объекты', clearBtn, grid));
  try {
    const data = await api.favorites();
    grid.innerHTML = '';
    const node = propertyGrid(data.items, { onFav: () => renderFavorites() });
    grid.appendChild(node || empty('💔', 'Избранное пусто', 'Добавляйте понравившиеся объекты сердечком', h('a', { class: 'btn btn-primary mt-16', href: '#/', text: 'В каталог' })));
  } catch (e) { grid.innerHTML = ''; grid.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

// ---- Viewing history ----
export async function renderHistory() {
  if (!requireAuth()) return;
  const list = h('div', {}, loadingBlock());
  const clearBtn = h('button', { class: 'btn btn-ghost btn-sm', html: '🧹 Очистить', onClick: async () => {
    if (await confirmDialog({ title: 'Очистить историю?', message: 'История просмотров будет удалена.', danger: true })) {
      await api.clearHistory(); toast('История очищена', 'ok'); renderHistory();
    }
  } });
  mountContent(pageWrap('🕘 История просмотров', 'Объекты, которые вы недавно открывали', clearBtn, list));
  try {
    const data = await api.history({ limit: 50 });
    list.innerHTML = '';
    if (!data.items.length) { list.appendChild(empty('📭', 'История пуста', 'Открывайте объекты, и они появятся здесь')); return; }
    const grid = h('div', { class: 'grid grid-props' });
    data.items.forEach((it) => {
      const card = h('div', {});
      const inner = propertyGrid([it.property]);
      card.appendChild(inner);
      card.appendChild(h('div', { class: 'muted center', style: { fontSize: '12px', marginTop: '6px' }, text: '👁 ' + timeAgo(it.viewed_at) }));
      grid.appendChild(card);
    });
    list.appendChild(grid);
  } catch (e) { list.innerHTML = ''; list.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

// ---- Recommendations ----
export async function renderRecommendations() {
  if (!store.user) { navigate('/auth'); return; }
  const aiGrid = h('div', {}, skeletonGrid(3));
  const basicGrid = h('div', {});
  const queryInput = h('input', { class: 'input', placeholder: 'Подсказка ИИ: например «для семьи с детьми»', style: { maxWidth: '420px' } });
  const reBtn = h('button', { class: 'btn btn-primary', text: '✨ Подобрать с ИИ', onClick: () => loadAI() });

  const content = pageWrap('✨ Подбор для вас', 'Рекомендации на основе вашей истории и избранного', null,
    h('div', {}, [
      h('div', { class: 'card card-pad mb-16' }, [
        h('div', { class: 'row wrap', style: { gap: '10px' } }, [queryInput, reBtn]),
        h('div', { class: 'hint', text: 'Контентный алгоритм отбирает кандидатов, а ИИ (DeepSeek) переранжирует и объясняет выбор.' }),
      ]),
      h('h2', { class: 'section-title', html: '🤖 С объяснением от ИИ' }),
      aiGrid,
      h('h2', { class: 'section-title mt-24', text: 'По вашим интересам' }),
      basicGrid,
    ]));
  mountContent(content);

  async function loadAI() {
    aiGrid.innerHTML = ''; aiGrid.appendChild(skeletonGrid(3));
    try {
      const data = await api.aiRecommendations({ limit: 9, query: queryInput.value.trim() || undefined });
      aiGrid.innerHTML = '';
      if (!data.items.length) { aiGrid.appendChild(empty('🔍', 'Пока нет рекомендаций', 'Посмотрите несколько объектов, чтобы ИИ понял ваши вкусы')); return; }
      const grid = h('div', { class: 'grid grid-props' });
      data.items.forEach((it) => {
        const wrap = h('div', {});
        wrap.appendChild(propertyGrid([it.property]));
        if (it.reason) wrap.appendChild(h('div', { class: 'card', style: { padding: '10px 12px', marginTop: '6px', background: 'var(--brand-soft)', fontSize: '13px', borderColor: 'transparent' }, html: '💡 ' + esc(it.reason) }));
        grid.appendChild(wrap);
      });
      aiGrid.appendChild(grid);
      if (!data.ai_used) aiGrid.insertBefore(h('p', { class: 'muted mb-8', text: 'ИИ недоступен — показан алгоритмический порядок.' }), aiGrid.firstChild);
    } catch (e) { aiGrid.innerHTML = ''; aiGrid.appendChild(empty('⚠️', 'Ошибка', e.message)); }
  }

  async function loadBasic() {
    try {
      const data = await api.recommendations({ limit: 8 });
      basicGrid.innerHTML = '';
      basicGrid.appendChild(propertyGrid(data.items) || empty('📭', 'Нет данных', 'Скоро здесь появятся подборки'));
    } catch (e) { basicGrid.appendChild(empty('⚠️', 'Ошибка', e.message)); }
  }

  loadAI(); loadBasic();
}

// ---- Bookings ----
export async function renderBookings() {
  if (!requireAuth()) return;
  const list = h('div', {}, loadingBlock());
  mountContent(pageWrap('🗓 Мои бронирования', 'Аренда и статусы оплаты', null, list));
  try {
    const data = await api.bookings({ limit: 50 });
    list.innerHTML = '';
    if (!data.items.length) { list.appendChild(empty('🗓', 'Броней пока нет', 'Забронируйте жильё из каталога аренды')); return; }
    // fetch property titles
    const props = {};
    await Promise.all([...new Set(data.items.map((b) => b.property_id))].map(async (pid) => {
      try { props[pid] = await api.getProperty(pid); } catch {}
    }));
    data.items.forEach((b) => list.appendChild(bookingCard(b, props[b.property_id])));
  } catch (e) { list.innerHTML = ''; list.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

function bookingCard(b, prop) {
  const statusMap = { pending: ['tag-warn', 'Ожидает оплаты'], confirmed: ['tag-ok', 'Подтверждено'], cancelled: ['tag-danger', 'Отменено'] };
  const payMap = { unpaid: ['tag-warn', 'Не оплачено'], paid: ['tag-ok', 'Оплачено'], refunded: ['tag-muted', 'Возврат'] };
  const [sc, sl] = statusMap[b.status] || ['tag-muted', b.status];
  const [pc, pl] = payMap[b.payment_status] || ['tag-muted', b.payment_status];

  const actions = h('div', { class: 'row', style: { gap: '8px' } });
  if (b.status === 'pending' && b.payment_status === 'unpaid') {
    actions.appendChild(h('button', { class: 'btn btn-accent btn-sm', text: 'Оплатить (тест)', onClick: async () => {
      try { await api.payTest(b.id); toast('Оплачено! Бронь подтверждена.', 'ok'); renderBookings(); } catch (e) { toast(e.message, 'err'); }
    } }));
  }
  if (b.status !== 'cancelled') {
    actions.appendChild(h('button', { class: 'btn btn-ghost btn-sm', text: 'Отменить', onClick: async () => {
      if (await confirmDialog({ title: 'Отменить бронь?', message: 'Действие необратимо.', danger: true })) {
        try { await api.cancelBooking(b.id); toast('Бронь отменена', 'ok'); renderBookings(); } catch (e) { toast(e.message, 'err'); }
      }
    } }));
  }

  return h('div', { class: 'card card-pad mb-16' }, [
    h('div', { class: 'row', style: { gap: '16px', alignItems: 'flex-start' } }, [
      prop && prop.cover_url ? h('img', { src: mediaUrl(prop.cover_url), style: { width: '120px', height: '90px', borderRadius: '12px', objectFit: 'cover' } }) : h('div', { style: { width: '120px', height: '90px', borderRadius: '12px', background: 'var(--surface-2)', display: 'grid', placeContent: 'center', fontSize: '30px' }, text: '🏠' }),
      h('div', { style: { flex: '1' } }, [
        h('a', { href: `#/properties/${b.property_id}`, style: { fontWeight: '700', fontSize: '16px' }, text: prop ? prop.title : `Объект #${b.property_id}` }),
        h('div', { class: 'muted', style: { fontSize: '14px', margin: '4px 0' }, text: `${fmtDate(b.start_date)} → ${fmtDate(b.end_date)}` }),
        h('div', { class: 'row wrap', style: { gap: '6px' } }, [
          h('span', { class: `tag ${sc}`, text: sl }),
          h('span', { class: `tag ${pc}`, text: pl }),
        ]),
      ]),
      h('div', { style: { textAlign: 'right' } }, [
        h('div', { class: 'prop-price', style: { fontSize: '22px' }, text: money(b.total_price) }),
        h('div', { style: { marginTop: '8px' } }, actions),
      ]),
    ]),
  ]);
}

// ---- Price trackers ----
export async function renderTrackers() {
  if (!requireAuth()) return;
  const list = h('div', {}, loadingBlock());
  mountContent(pageWrap('📉 Трекеры цен', 'Уведомим, когда цена упадёт', null, list));
  try {
    const rows = await api.trackers();
    list.innerHTML = '';
    if (!rows.length) { list.appendChild(empty('📉', 'Нет активных трекеров', 'Добавьте трекер со страницы объекта')); return; }
    const props = {};
    await Promise.all([...new Set(rows.map((t) => t.property_id))].map(async (pid) => { try { props[pid] = await api.getProperty(pid); } catch {} }));
    rows.forEach((t) => {
      const prop = props[t.property_id];
      list.appendChild(h('div', { class: 'card card-pad mb-16' }, [
        h('div', { class: 'row-between' }, [
          h('div', { class: 'row', style: { gap: '14px' } }, [
            prop && prop.cover_url ? h('img', { src: mediaUrl(prop.cover_url), style: { width: '80px', height: '60px', borderRadius: '10px', objectFit: 'cover' } }) : h('div', { style: { width: '80px', height: '60px', borderRadius: '10px', background: 'var(--surface-2)', display: 'grid', placeContent: 'center' }, text: '🏠' }),
            h('div', {}, [
              h('a', { href: `#/properties/${t.property_id}`, style: { fontWeight: '700' }, text: prop ? prop.title : `Объект #${t.property_id}` }),
              h('div', { class: 'muted', style: { fontSize: '13px', marginTop: '4px' }, text: `Текущая: ${money(t.last_seen_price)} · Цель: ${t.target_price ? money(t.target_price) : 'любое падение'}` }),
            ]),
          ]),
          h('button', { class: 'btn btn-danger-soft btn-sm', text: 'Убрать', onClick: async () => {
            try { await api.removeTracker(t.property_id); toast('Трекер удалён', 'ok'); renderTrackers(); } catch (e) { toast(e.message, 'err'); }
          } }),
        ]),
      ]));
    });
  } catch (e) { list.innerHTML = ''; list.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

// ---- Purchase requests ----
export async function renderRequests() {
  if (!requireAuth()) return;
  const list = h('div', {}, loadingBlock());
  const sub = store.isSeller() ? 'Заявки на просмотр ваших объектов' : 'Ваши заявки на просмотр';
  mountContent(pageWrap('📨 Заявки на просмотр', sub, null, list));
  try {
    const data = await api.myRequests({ limit: 50 });
    list.innerHTML = '';
    if (!data.items.length) { list.appendChild(empty('📨', 'Заявок нет', store.isSeller() ? 'Покупатели ещё не оставляли заявок' : 'Оставьте заявку на странице объекта продажи')); return; }
    const props = {};
    await Promise.all([...new Set(data.items.map((r) => r.property_id))].map(async (pid) => { try { props[pid] = await api.getProperty(pid); } catch {} }));
    data.items.forEach((r) => {
      const prop = props[r.property_id];
      list.appendChild(h('div', { class: 'card card-pad mb-16' }, [
        h('div', { class: 'row-between mb-8' }, [
          h('a', { href: `#/properties/${r.property_id}`, style: { fontWeight: '700', fontSize: '16px' }, text: prop ? prop.title : `Объект #${r.property_id}` }),
          h('span', { class: 'muted', style: { fontSize: '13px' }, text: timeAgo(r.created_at) }),
        ]),
        r.preferred_date ? h('div', { class: 'tag tag-muted', text: '🗓 ' + fmtDate(r.preferred_date) }) : null,
        r.message ? h('p', { style: { marginTop: '8px', marginBottom: 0 }, text: r.message }) : null,
      ]));
    });
  } catch (e) { list.innerHTML = ''; list.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

// ---- Profile ----
export async function renderProfile() {
  if (!requireAuth()) return;
  const u = store.user;
  const content = h('div', {});
  mountContent(pageWrap('👤 Профиль', 'Управление аккаунтом', null, content));

  const name = h('input', { class: 'input', value: u.full_name || '' });
  const phone = h('input', { class: 'input', value: u.phone || '' });
  const company = h('input', { class: 'input', value: u.company_name || '' });

  const avatarImg = h('div', { id: 'avatar-holder' }, avatar(u, 90));
  const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try { const updated = await api.uploadAvatar(fd); store.setUser(updated); toast('Аватар обновлён', 'ok'); document.getElementById('avatar-holder').replaceChildren(avatar(updated, 90)); }
    catch (err) { toast(err.message, 'err'); }
  } });

  content.appendChild(h('div', { class: 'grid', style: { gridTemplateColumns: 'minmax(0,1fr)', maxWidth: '560px' } }, [
    h('div', { class: 'card card-pad' }, [
      h('div', { class: 'row', style: { gap: '18px', marginBottom: '20px' } }, [
        avatarImg,
        h('div', {}, [
          h('div', { style: { fontWeight: '800', fontSize: '18px' }, text: u.full_name || 'Без имени' }),
          h('div', { class: 'muted', text: u.email }),
          h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, [
            h('span', { class: 'tag tag-soft tag-muted', text: ROLE_LABELS[u.role] }),
            u.is_email_verified ? h('span', { class: 'tag tag-ok', text: '✓ Email подтверждён' }) : h('span', { class: 'tag tag-warn', text: 'Email не подтверждён' }),
          ]),
          h('button', { class: 'btn btn-soft btn-sm mt-8', html: '📷 Сменить фото', onClick: () => fileInput.click() }),
          fileInput,
        ]),
      ]),
      h('div', { class: 'field' }, [h('label', { text: 'Имя' }), name]),
      h('div', { class: 'field' }, [h('label', { text: 'Телефон' }), phone]),
      store.isSeller() ? h('div', { class: 'field' }, [h('label', { text: 'Компания / агентство' }), company]) : null,
      h('button', { class: 'btn btn-primary', text: 'Сохранить', onClick: async () => {
        try {
          const updated = await api.updateMe({ full_name: name.value.trim(), phone: phone.value.trim() || null, company_name: store.isSeller() ? (company.value.trim() || null) : undefined });
          store.setUser(updated); toast('Профиль сохранён', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      } }),
    ]),
    h('div', { class: 'card card-pad mt-16' }, [
      h('h3', { style: { fontSize: '16px', marginBottom: '12px' }, text: '🔒 Безопасность' }),
      h('button', { class: 'btn btn-ghost', text: 'Сменить пароль', onClick: changePasswordModal }),
      !u.is_email_verified ? h('button', { class: 'btn btn-ghost', style: { marginLeft: '8px' }, text: 'Подтвердить email', onClick: verifyEmailModal }) : null,
    ]),
    h('div', { class: 'card card-pad mt-16', style: { borderColor: 'var(--danger-soft)' } }, [
      h('h3', { style: { fontSize: '16px', marginBottom: '8px', color: 'var(--danger)' }, text: '⚠️ Опасная зона' }),
      h('p', { class: 'muted', style: { fontSize: '14px' }, text: 'Удаление аккаунта необратимо — все данные будут стёрты.' }),
      h('button', { class: 'btn btn-danger-soft mt-8', text: 'Удалить аккаунт', onClick: async () => {
        if (await confirmDialog({ title: 'Удалить аккаунт?', message: 'Это действие нельзя отменить.', confirmText: 'Удалить навсегда', danger: true })) {
          try { await api.deleteMe(); store.logout(); toast('Аккаунт удалён', 'ok'); navigate('/auth'); location.reload(); } catch (e) { toast(e.message, 'err'); }
        }
      } }),
    ]),
  ]));
}

function changePasswordModal() {
  const oldp = h('input', { class: 'input', type: 'password', placeholder: 'Текущий пароль' });
  const newp = h('input', { class: 'input', type: 'password', placeholder: 'Новый пароль (мин. 6)' });
  const save = h('button', { class: 'btn btn-primary', text: 'Сменить' });
  const m = modal({ title: 'Смена пароля', body: h('div', {}, [
    h('div', { class: 'field' }, [h('label', { text: 'Текущий пароль' }), oldp]),
    h('div', { class: 'field' }, [h('label', { text: 'Новый пароль' }), newp]),
  ]), footer: [save] });
  save.addEventListener('click', async () => {
    try { await api.changePassword({ old_password: oldp.value, new_password: newp.value }); toast('Пароль изменён. Войдите заново.', 'ok'); m.close(); store.logout(); navigate('/auth'); location.reload(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

function verifyEmailModal() {
  const code = h('input', { class: 'input', placeholder: 'Код из письма' });
  const info = h('p', { class: 'hint' });
  const sendBtn = h('button', { class: 'btn btn-ghost', text: 'Отправить код' });
  const verifyBtn = h('button', { class: 'btn btn-primary', text: 'Подтвердить' });
  sendBtn.addEventListener('click', async () => {
    try { const r = await api.sendCode({ email: store.user.email, purpose: 'verify' }); info.textContent = r.dev_code ? `DEV-код: ${r.dev_code}` : 'Код отправлен на почту.'; toast('Код отправлен', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  });
  verifyBtn.addEventListener('click', async () => {
    try { await api.verifyEmail({ email: store.user.email, code: code.value.trim(), purpose: 'verify' }); toast('Email подтверждён', 'ok'); m.close(); store.loadUser().then(renderProfile); }
    catch (e) { toast(e.message, 'err'); }
  });
  const m = modal({ title: 'Подтверждение email', body: h('div', {}, [
    h('p', { class: 'muted mb-8', text: store.user.email }),
    h('div', { class: 'field' }, [code]), info, sendBtn,
  ]), footer: [verifyBtn] });
}
