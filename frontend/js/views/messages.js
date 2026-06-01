// ============================================================
// Messages view — buyer <-> realtor chat (realtime, reply, edit, delete, files)
// ============================================================
import { h, esc, toast, fmtTime, timeAgo, confirmDialog, empty, mediaUrl } from '../ui.js';
import { api } from '../api.js';
import { store } from '../store.js';
import { mountContent, avatar } from '../components.js';

let activeConvo = null;
let messages = [];
let replyTo = null;
let unsubs = [];

export async function renderMessages() {
  const listEl = h('div', { class: 'chat-list', id: 'chat-list' });
  const mainEl = h('div', { class: 'chat-main', id: 'chat-main' }, emptyChat());
  const layout = h('div', { class: 'chat-layout' }, [listEl, mainEl]);
  mountContent(layout);

  await loadConversations(listEl, mainEl);

  // Realtime listeners
  unsubs.push(store.on('chat:new', (d) => {
    if (activeConvo && Number(d.conversation_id) === activeConvo.id) reloadMessages();
    loadConversations(listEl, null, true);
  }));
  unsubs.push(store.on('chat:edited', (d) => { if (activeConvo && Number(d.conversation_id) === activeConvo.id) reloadMessages(); }));
  unsubs.push(store.on('chat:deleted', (d) => { if (activeConvo && Number(d.conversation_id) === activeConvo.id) reloadMessages(); }));
  unsubs.push(store.on('chat:read', (d) => { if (activeConvo && Number(d.conversation_id) === activeConvo.id) reloadMessages(); }));

  return () => { unsubs.forEach((u) => u()); unsubs = []; activeConvo = null; };
}

function emptyChat() {
  return h('div', { style: { display: 'grid', placeContent: 'center', height: '100%' } },
    empty('💬', 'Выберите диалог', 'Начните общение с риелтором со страницы объекта'));
}

async function loadConversations(listEl, mainEl, silent) {
  if (!silent) listEl.innerHTML = '<div class="loading-row"><div class="boot-spinner"></div></div>';
  try {
    const data = await api.conversations();
    listEl.innerHTML = '';
    if (!data.items.length) {
      listEl.appendChild(h('div', { class: 'empty', style: { padding: '40px 16px' } }, [
        h('div', { class: 'emoji', text: '📭' }), h('p', { text: 'Диалогов пока нет' }),
      ]));
      return;
    }
    data.items.forEach((c) => listEl.appendChild(convoItem(c, mainEl, listEl)));
  } catch (e) {
    listEl.innerHTML = '';
    listEl.appendChild(h('div', { class: 'muted center', style: { padding: '20px' }, text: e.message }));
  }
}

function convoItem(c, mainEl, listEl) {
  const me = store.user;
  const other = me && c.buyer.id === me.id ? c.seller : c.buyer;
  const item = h('div', { class: `chat-list-item ${activeConvo && activeConvo.id === c.id ? 'active' : ''}` }, [
    avatar(other, 46),
    h('div', { style: { flex: '1', minWidth: 0 } }, [
      h('div', { class: 'ci-top' }, [
        h('span', { class: 'ci-name', text: other.full_name || other.company_name || 'Пользователь' }),
        h('span', { class: 'muted', style: { fontSize: '12px' }, text: timeAgo(c.last_message_at) }),
      ]),
      h('div', { class: 'row-between' }, [
        h('span', { class: 'ci-last', text: c.last_message || 'Нет сообщений' }),
        c.unread > 0 ? h('span', { class: 'badge', style: { position: 'static', border: 'none' }, text: c.unread }) : null,
      ]),
    ]),
  ]);
  item.addEventListener('click', () => openConvo(c, mainEl || document.getElementById('chat-main'), listEl || document.getElementById('chat-list')));
  return item;
}

async function openConvo(c, mainEl, listEl) {
  activeConvo = c;
  replyTo = null;
  if (listEl) listEl.querySelectorAll('.chat-list-item').forEach((el) => el.classList.remove('active'));
  const me = store.user;
  const other = me && c.buyer.id === me.id ? c.seller : c.buyer;

  const body = h('div', { class: 'chat-body', id: 'chat-body' }, '<div class="loading-row"><div class="boot-spinner"></div></div>');
  body.innerHTML = '';
  body.appendChild(h('div', { class: 'loading-row' }, h('div', { class: 'boot-spinner' })));

  const replyBar = h('div', { class: 'reply-bar', id: 'reply-bar', style: { display: 'none' } });
  const composeArea = buildCompose();

  mainEl.innerHTML = '';
  mainEl.appendChild(h('div', { class: 'chat-head' }, [
    avatar(other, 42),
    h('div', {}, [
      h('div', { style: { fontWeight: '700' }, text: other.full_name || other.company_name || 'Пользователь' }),
      h('div', { class: 'muted', style: { fontSize: '12.5px' }, text: ({ seller: 'Продавец', buyer: 'Покупатель', admin: 'Администратор' }[other.role]) }),
    ]),
    c.property_id ? h('a', { class: 'btn btn-soft btn-sm', style: { marginLeft: 'auto' }, href: `#/properties/${c.property_id}`, text: '🏠 К объекту' }) : null,
  ]));
  mainEl.appendChild(body);
  mainEl.appendChild(replyBar);
  mainEl.appendChild(composeArea);

  await reloadMessages();
  await api.markRead(c.id).catch(() => {});
}

async function reloadMessages() {
  if (!activeConvo) return;
  const body = document.getElementById('chat-body');
  if (!body) return;
  try {
    messages = await api.messages(activeConvo.id, { limit: 100 });
    renderMessageList(body);
  } catch (e) { toast(e.message, 'err'); }
}

function renderMessageList(body) {
  body.innerHTML = '';
  const me = store.user;
  let lastDate = '';
  messages.forEach((m) => {
    const dateStr = new Date(m.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    if (dateStr !== lastDate) {
      lastDate = dateStr;
      body.appendChild(h('div', { class: 'center muted', style: { fontSize: '12px', margin: '8px 0' }, text: dateStr }));
    }
    body.appendChild(messageBubble(m, me));
  });
  body.scrollTop = body.scrollHeight;
}

function messageBubble(m, me) {
  const out = m.sender_id === me.id;
  const bubble = h('div', { class: `msg ${out ? 'out' : 'in'}`, dataset: { id: m.id } });

  if (m.reply_to_id) {
    const parent = messages.find((x) => x.id === m.reply_to_id);
    bubble.appendChild(h('div', { class: 'reply-quote', text: parent ? (parent.text || '📎 вложение') : 'сообщение' }));
  }

  if (m.is_deleted) {
    bubble.appendChild(h('em', { class: 'muted', text: '🚫 Сообщение удалено' }));
  } else {
    if (m.attachment_url) {
      const isImg = (m.attachment_type || '').startsWith('image/');
      if (isImg) {
        bubble.appendChild(h('img', { class: 'attach-img', src: mediaUrl(m.attachment_url), onClick: () => window.open(mediaUrl(m.attachment_url), '_blank') }));
      } else {
        bubble.appendChild(h('a', { class: 'attach', href: mediaUrl(m.attachment_url), target: '_blank' }, [
          h('span', { text: '📎' }), h('span', { text: m.attachment_name || 'Файл' }),
        ]));
      }
    }
    if (m.text) bubble.appendChild(h('div', { text: m.text }));

    // actions for own messages
    if (out) {
      const actions = h('div', { class: 'msg-actions' }, [
        h('button', { html: '↩', title: 'Ответить', onClick: (e) => { e.stopPropagation(); setReply(m); } }),
        m.text ? h('button', { html: '✏️', title: 'Изменить', onClick: (e) => { e.stopPropagation(); editMsg(m); } }) : null,
        h('button', { html: '🗑', title: 'Удалить', onClick: (e) => { e.stopPropagation(); delMsg(m); } }),
      ].filter(Boolean));
      bubble.appendChild(actions);
    } else {
      const actions = h('div', { class: 'msg-actions' }, [
        h('button', { html: '↩', title: 'Ответить', onClick: (e) => { e.stopPropagation(); setReply(m); } }),
      ]);
      bubble.appendChild(actions);
    }
  }

  bubble.appendChild(h('div', { class: 'meta' }, [
    h('span', { text: fmtTime(m.created_at) }),
    m.is_edited ? h('span', { text: '· изменено' }) : null,
    out && m.is_read ? h('span', { text: '· ✓✓' }) : (out ? h('span', { text: '· ✓' }) : null),
  ].filter(Boolean)));

  return bubble;
}

function setReply(m) {
  replyTo = m;
  const bar = document.getElementById('reply-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  bar.innerHTML = '';
  bar.appendChild(h('span', { text: `↩ Ответ: ${(m.text || '📎 вложение').slice(0, 50)}` }));
  bar.appendChild(h('button', { class: 'icon-btn btn-sm', html: '✕', style: { width: '28px', height: '28px' }, onClick: clearReply }));
  document.getElementById('chat-input')?.focus();
}
function clearReply() {
  replyTo = null;
  const bar = document.getElementById('reply-bar');
  if (bar) { bar.style.display = 'none'; bar.innerHTML = ''; }
}

function buildCompose() {
  const input = h('textarea', { class: 'textarea', id: 'chat-input', placeholder: 'Напишите сообщение...', rows: 1,
    onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } });
  const fileInput = h('input', { type: 'file', style: { display: 'none' }, onChange: (e) => sendFile(e.target.files[0]) });
  const attachBtn = h('button', { class: 'icon-btn', html: '📎', title: 'Прикрепить файл', onClick: () => fileInput.click() });
  const sendBtn = h('button', { class: 'btn btn-primary btn-icon', html: '➤', onClick: send });
  return h('div', { class: 'chat-compose' }, [attachBtn, fileInput, input, sendBtn]);
}

async function send() {
  const input = document.getElementById('chat-input');
  if (!input || !activeConvo) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await api.sendMessage(activeConvo.id, { text, reply_to_id: replyTo ? replyTo.id : null });
    clearReply();
    await reloadMessages();
  } catch (e) { toast(e.message, 'err'); input.value = text; }
}

async function sendFile(file) {
  if (!file || !activeConvo) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    toast('Загрузка файла...', 'info');
    await api.sendFileMessage(activeConvo.id, fd);
    await reloadMessages();
  } catch (e) { toast(e.message, 'err'); }
}

async function editMsg(m) {
  const { modal } = await import('../ui.js');
  const input = h('textarea', { class: 'textarea', text: m.text });
  input.value = m.text;
  const save = h('button', { class: 'btn btn-primary', text: 'Сохранить' });
  const dlg = modal({ title: 'Изменить сообщение', body: h('div', { class: 'field' }, input), footer: [save] });
  save.addEventListener('click', async () => {
    try { await api.editMessage(activeConvo.id, m.id, { text: input.value.trim() }); dlg.close(); await reloadMessages(); }
    catch (e) { toast(e.message, 'err'); }
  });
}

async function delMsg(m) {
  const ok = await confirmDialog({ title: 'Удалить сообщение?', message: 'Сообщение будет помечено как удалённое.', confirmText: 'Удалить', danger: true });
  if (!ok) return;
  try { await api.deleteMessage(activeConvo.id, m.id); await reloadMessages(); }
  catch (e) { toast(e.message, 'err'); }
}
