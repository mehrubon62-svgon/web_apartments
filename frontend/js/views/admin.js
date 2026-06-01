// ============================================================
// Admin moderation view — complaints + AI moderation decisions
// ============================================================
import { h, esc, fmtDate, timeAgo, toast, confirmDialog, empty, loadingBlock } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent } from '../components.js';

const DECISION = {
  unfounded: ['tag-muted', 'Без действий'],
  warning: ['tag-warn', 'Предупреждение'],
  ban: ['tag-danger', 'Блокировка'],
};

export async function renderAdmin() {
  if (!store.isAdmin()) { toast('Доступ только для администратора', 'err'); navigate('/'); return; }

  const tabsBar = h('div', { class: 'tabs' });
  const panel = h('div', {});
  ['Жалобы', 'Решения ИИ-модерации'].forEach((label, i) => {
    const btn = h('button', { class: i === 0 ? 'active' : '', text: label, onClick: () => {
      tabsBar.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      i === 0 ? loadComplaints(panel) : loadModeration(panel);
    } });
    tabsBar.appendChild(btn);
  });

  mountContent(h('div', { class: 'page' }, h('div', { class: 'container' }, [
    h('div', { class: 'page-head' }, [
      h('div', {}, [h('div', { class: 'page-title', text: '🛡 Модерация' }), h('div', { class: 'page-sub', text: 'Жалобы на продавцов и автоматические решения ИИ' })]),
    ]),
    tabsBar,
    panel,
  ])));

  loadComplaints(panel);
}

async function loadComplaints(panel) {
  panel.innerHTML = ''; panel.appendChild(loadingBlock());
  try {
    const items = await api.adminComplaints({ limit: 200 });
    panel.innerHTML = '';
    if (!items.length) { panel.appendChild(empty('🕊', 'Жалоб нет', 'Пока никто не жаловался на продавцов')); return; }

    // group by seller
    const groups = {};
    items.forEach((c) => { (groups[c.seller_id] = groups[c.seller_id] || []).push(c); });

    Object.entries(groups).forEach(([sellerId, list]) => {
      const card = h('div', { class: 'card card-pad mb-16' }, [
        h('div', { class: 'row-between mb-8' }, [
          h('strong', { text: `Продавец #${sellerId}` }),
          h('span', { class: `tag ${list.length >= 3 ? 'tag-danger' : 'tag-warn'}`, text: `${list.length} жалоб` }),
        ]),
        ...list.map((c) => h('div', { class: 'fact-row' }, [
          h('span', {}, [h('span', { text: c.reason }), c.property_id ? h('a', { class: 'muted', style: { marginLeft: '8px', fontSize: '12px' }, href: `#/properties/${c.property_id}`, text: `· объект #${c.property_id}` }) : null]),
          h('span', { class: 'muted', style: { fontSize: '12px', whiteSpace: 'nowrap' }, text: timeAgo(c.created_at) }),
        ])),
        h('div', { class: 'row', style: { gap: '8px', marginTop: '12px' } }, [
          overrideBtn(sellerId, 'unfounded', 'Снять обвинения', 'btn-ghost'),
          overrideBtn(sellerId, 'warning', 'Предупредить', 'btn-soft'),
          overrideBtn(sellerId, 'ban', 'Заблокировать', 'btn-danger-soft'),
          h('button', { class: 'btn btn-ghost btn-sm', text: '↩ Разбанить', onClick: async () => {
            try { await api.adminUnban(Number(sellerId)); toast('Пользователь разбанен', 'ok'); } catch (e) { toast(e.message, 'err'); }
          } }),
        ]),
      ]);
      panel.appendChild(card);
    });
  } catch (e) { panel.innerHTML = ''; panel.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}

function overrideBtn(sellerId, decision, label, cls) {
  return h('button', { class: `btn ${cls} btn-sm`, text: label, onClick: async () => {
    const ok = await confirmDialog({ title: 'Подтвердите решение', message: `${label} для продавца #${sellerId}?`, danger: decision === 'ban' });
    if (!ok) return;
    try { await api.adminOverride(Number(sellerId), { decision }); toast('Решение применено', 'ok'); } catch (e) { toast(e.message, 'err'); }
  } });
}

async function loadModeration(panel) {
  panel.innerHTML = ''; panel.appendChild(loadingBlock());
  try {
    const items = await api.adminModeration({ limit: 200 });
    panel.innerHTML = '';
    if (!items.length) { panel.appendChild(empty('🤖', 'Решений нет', 'ИИ ещё не выносил решений по модерации')); return; }
    const table = h('table', { class: 'table' }, [
      h('thead', {}, h('tr', {}, [
        h('th', { text: 'Продавец' }), h('th', { text: 'Решение' }), h('th', { text: 'Обоснование ИИ' }),
        h('th', { text: 'Источник' }), h('th', { text: 'Дата' }), h('th', { text: '' }),
      ])),
      h('tbody', {}, items.map((m) => {
        const [cls, label] = DECISION[m.decision] || ['tag-muted', m.decision];
        return h('tr', {}, [
          h('td', { text: `#${m.seller_id}` }),
          h('td', {}, h('span', { class: `tag ${cls}`, text: label })),
          h('td', { class: 'muted', style: { maxWidth: '360px' }, text: m.ai_reasoning || '—' }),
          h('td', {}, m.overridden_by_admin ? h('span', { class: 'tag tag-muted', text: '👤 админ' }) : h('span', { class: 'tag tag-soft tag-muted', text: '🤖 ИИ' })),
          h('td', { class: 'muted', style: { fontSize: '13px' }, text: fmtDate(m.created_at) }),
          h('td', {}, h('button', { class: 'btn btn-ghost btn-sm', text: 'Разбан', onClick: async () => {
            try { await api.adminUnban(m.seller_id); toast('Разбанен', 'ok'); } catch (e) { toast(e.message, 'err'); }
          } })),
        ]);
      })),
    ]);
    panel.appendChild(h('div', { class: 'card', style: { overflow: 'auto' } }, table));
  } catch (e) { panel.innerHTML = ''; panel.appendChild(empty('⚠️', 'Ошибка', e.message)); }
}
