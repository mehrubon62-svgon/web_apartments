// ============================================================
// Realtime WebSocket — server-pushed events (notifications, chat, ...)
// ============================================================
import { api } from './api.js';
import { store } from './store.js';
import { toast } from './ui.js';

let ws = null;
let pingTimer = null;
let reconnectTimer = null;
let manualClose = false;

const NOTIF_TITLES = {
  price_drop: '💸 Падение цены',
  new_message: '💬 Новое сообщение',
  booking_confirmed: '✅ Бронь подтверждена',
  recommendation: '✨ Новая рекомендация',
  warning: '⚠️ Предупреждение',
  ban: '🚫 Блокировка',
  complaint_decision: '🛡️ Решение по жалобе',
};

export function connectRealtime() {
  const token = api.tokens.access;
  if (!token) return;
  manualClose = false;

  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const base = api.base || `${proto}://${location.host}`;
  const url = base.startsWith('http')
    ? base.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`
    : `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`;

  try {
    ws = new WebSocket(url);
  } catch {
    return;
  }

  ws.onopen = () => {
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ event: 'ping' }));
    }, 25000);
  };

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleEvent(msg.event, msg.data || {});
  };

  ws.onclose = () => {
    clearInterval(pingTimer);
    if (!manualClose && api.tokens.access) {
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectRealtime, 4000);
    }
  };

  ws.onerror = () => { try { ws.close(); } catch {} };
}

export function disconnectRealtime() {
  manualClose = true;
  clearInterval(pingTimer);
  clearTimeout(reconnectTimer);
  if (ws) { try { ws.close(); } catch {} ws = null; }
}

function handleEvent(event, data) {
  store.emit(`rt:${event}`, data);

  switch (event) {
    case 'connected':
      break;
    case 'notification:new': {
      store.addNotification(data);
      const title = NOTIF_TITLES[data.type] || '🔔 Уведомление';
      const body = (data.content && (data.content.title || data.content.body)) || '';
      toast(`${title}${body ? ' — ' + body : ''}`, 'info', 4500);
      break;
    }
    case 'message:new':
      store.emit('chat:new', data);
      break;
    case 'message:edited':
      store.emit('chat:edited', data);
      break;
    case 'message:deleted':
      store.emit('chat:deleted', data);
      break;
    case 'message:read':
      store.emit('chat:read', data);
      break;
    case 'spatial_qa:done':
      store.emit('spatial:done', data);
      toast('🔍 Ответ на ваш Spatial Q&A готов', 'ok');
      break;
    default:
      break;
  }
}
