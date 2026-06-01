// ============================================================
// AI Agent view — function-calling chat
// ============================================================
import { h, esc, toast } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { mountContent } from '../components.js';

const TOOL_LABELS = {
  search_properties: '🔎 поиск объектов', open_tour: '🌐 открыть тур', show_on_map: '🗺 показать на карте',
  compare_properties: '⚖️ сравнение', get_favorites: '♥ избранное', add_to_favorites: '➕ в избранное',
  get_viewing_history: '🕘 история', delete_viewing_history: '🧹 очистка истории',
  set_price_tracker: '📉 трекер цены', get_recommendations: '✨ рекомендации',
};

const SUGGESTIONS = [
  'Найди квартиру в аренду до $300 за ночь',
  'Покажи дома на продажу до $800k',
  'Что у меня в избранном?',
  'Сравни объекты 1 и 2',
  'Посоветуй по ипотеке на 20 лет',
];

let conversationId = null;

export async function renderAgent() {
  if (!store.user) { toast('Войдите, чтобы общаться с ИИ-агентом', 'info'); navigate('/auth'); return; }

  const body = h('div', { class: 'agent-body', id: 'agent-body' });
  const input = h('textarea', { class: 'textarea', id: 'agent-input', placeholder: 'Спросите что угодно про недвижимость...', rows: 1,
    onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const sendBtn = h('button', { class: 'btn btn-primary btn-icon btn-lg', html: '➤', onClick: send });

  const suggest = h('div', { class: 'agent-suggest' }, SUGGESTIONS.map((s) =>
    h('button', { class: 'chip', text: s, onClick: () => { input.value = s; send(); } })));

  const wrap = h('div', { class: 'agent-wrap' }, [
    h('div', { class: 'page-head', style: { paddingTop: '20px', marginBottom: '8px' } }, [
      h('div', {}, [
        h('div', { class: 'page-title', style: { fontSize: '24px' }, html: '🤖 ИИ-агент Nestora' }),
        h('div', { class: 'page-sub', text: 'Ищет, сравнивает и управляет объектами за вас через реальные инструменты' }),
      ]),
      h('button', { class: 'btn btn-ghost btn-sm', html: '＋ Новый чат', onClick: () => { conversationId = null; resetBody(body); } }),
    ]),
    body,
    h('div', { class: 'agent-compose' }, [suggest, h('div', { class: 'row', style: { gap: '10px' } }, [input, sendBtn])]),
  ]);

  mountContent(wrap);

  if (!api.config.aiEnabled) {
    body.appendChild(botMsg('⚠️ ИИ не настроен на сервере (нет AI_API_KEY). Агент будет недоступен, но остальные функции работают.'));
  } else {
    resetBody(body);
  }
}

function resetBody(body) {
  body.innerHTML = '';
  body.appendChild(botMsg('Привет! Я ИИ-агент Nestora. Могу найти объекты по описанию, сравнить их, добавить в избранное, поставить трекер цены или дать совет. С чего начнём?'));
}

function userMsg(text) {
  return h('div', { class: 'agent-msg user' }, [
    h('div', { class: 'ava', text: '🧑' }),
    h('div', { class: 'agent-bubble', text }),
  ]);
}

function botMsg(text, tools) {
  const bubble = h('div', { class: 'agent-bubble' }, [h('div', { style: { whiteSpace: 'pre-wrap' }, text })]);
  if (tools && tools.length) {
    const uniq = [...new Set(tools)];
    bubble.appendChild(h('div', { class: 'agent-tools' }, uniq.map((t) => h('span', { class: 'tool-chip', text: TOOL_LABELS[t] || t }))));
  }
  return h('div', { class: 'agent-msg bot' }, [h('div', { class: 'ava', html: '◈' }), bubble]);
}

function typingMsg() {
  return h('div', { class: 'agent-msg bot', id: 'agent-typing' }, [
    h('div', { class: 'ava', html: '◈' }),
    h('div', { class: 'agent-bubble' }, h('div', { class: 'typing' }, [h('span'), h('span'), h('span')])),
  ]);
}

async function send() {
  const input = document.getElementById('agent-input');
  const body = document.getElementById('agent-body');
  if (!input || !body) return;
  const text = input.value.trim();
  if (!text) return;
  if (!api.config.aiEnabled) { toast('ИИ не настроен на сервере', 'err'); return; }

  input.value = '';
  body.appendChild(userMsg(text));
  const typing = typingMsg();
  body.appendChild(typing);
  body.scrollTop = body.scrollHeight;

  try {
    const res = await api.agentChat({ message: text, conversation_id: conversationId });
    conversationId = res.conversation_id;
    typing.remove();
    body.appendChild(botMsg(res.reply || '(пустой ответ)', res.tool_calls));
    body.scrollTop = body.scrollHeight;
  } catch (e) {
    typing.remove();
    body.appendChild(botMsg('⚠️ ' + e.message));
    body.scrollTop = body.scrollHeight;
  }
}
