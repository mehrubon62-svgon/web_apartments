// Nestora API client (React) — fetch wrapper with JWT + refresh.
const CFG = window.NESTORA_CONFIG || { apiBase: '', mapboxToken: '', googleClientId: '', aiEnabled: false };
const API_BASE = CFG.apiBase || '';

const TOKENS = {
  get access() { return localStorage.getItem('nestora_access'); },
  get refresh() { return localStorage.getItem('nestora_refresh'); },
  set({ access_token, refresh_token }) {
    if (access_token) localStorage.setItem('nestora_access', access_token);
    if (refresh_token) localStorage.setItem('nestora_refresh', refresh_token);
  },
  clear() { localStorage.removeItem('nestora_access'); localStorage.removeItem('nestora_refresh'); },
};

export class ApiError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

function qs(params) {
  if (!params) return '';
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.append(k, v); });
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function refresh() {
  const refresh_token = TOKENS.refresh;
  if (!refresh_token) return false;
  try {
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!r.ok) return false;
    TOKENS.set(await r.json());
    return true;
  } catch { return false; }
}

async function req(method, path, { body, params, isForm, retry = true, auth = true } = {}) {
  const headers = {};
  if (auth && TOKENS.access) headers.Authorization = `Bearer ${TOKENS.access}`;
  let payload;
  if (isForm) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(`${API_BASE}${path}${qs(params)}`, { method, headers, body: payload });
  } catch {
    throw new ApiError('Сеть недоступна. Проверьте подключение.', 0, null);
  }

  if (res.status === 401 && auth && retry && TOKENS.refresh) {
    if (await refresh()) return req(method, path, { body, params, isForm, retry: false, auth });
  }
  if (res.status === 204) return null;

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    let detail = (data && data.detail) || res.statusText || 'Ошибка запроса';
    if (Array.isArray(detail)) detail = detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
    throw new ApiError(detail, res.status, data);
  }
  return data;
}

export const api = {
  base: API_BASE,
  config: CFG,
  tokens: TOKENS,
  isAuthed: () => !!TOKENS.access,

  get: (p, params) => req('GET', p, { params }),
  post: (p, body, o) => req('POST', p, { body, ...o }),

  register: (b) => req('POST', '/auth/register', { body: b, auth: false }),
  login: (b) => req('POST', '/auth/login', { body: b, auth: false }),
  google: (b) => req('POST', '/auth/google', { body: b, auth: false }),
  sendCode: (b) => req('POST', '/auth/send-code', { body: b, auth: false }),
  verifyEmail: (b) => req('POST', '/auth/verify-email', { body: b, auth: false }),
  loginCode: (b) => req('POST', '/auth/login-code', { body: b, auth: false }),
  resetPassword: (b) => req('POST', '/auth/reset-password', { body: b, auth: false }),
  logout: () => req('POST', '/auth/logout', { body: { refresh_token: TOKENS.refresh || '' } }).catch(() => {}),

  me: () => req('GET', '/users/me'),
  updateMe: (b) => req('PUT', '/users/me', { body: b }),
  changePassword: (b) => req('POST', '/users/me/change-password', { body: b }),
  deleteMe: () => req('DELETE', '/users/me'),
  requestDeletion: (b) => req('POST', '/users/me/request-deletion', { body: b }),
  uploadAvatar: (fd) => req('POST', '/users/me/avatar', { body: fd, isForm: true }),
  publicProfile: (id) => req('GET', `/users/${id}/public`),
  sellerListings: (id, params) => req('GET', `/users/${id}/listings`, { params }),
  sellerReviews: (id, params) => req('GET', `/users/${id}/reviews`, { params }),

  listProperties: (params) => req('GET', '/properties', { params }),
  searchProperties: (params) => req('GET', '/properties/search', { params }),
  getProperty: (id) => req('GET', `/properties/${id}`),
  createProperty: (b) => req('POST', '/properties', { body: b }),
  updateProperty: (id, b) => req('PUT', `/properties/${id}`, { body: b }),
  deleteProperty: (id) => req('DELETE', `/properties/${id}`),
  mapMarkers: (params) => req('GET', '/properties/map', { params }),
  infrastructure: (params) => req('GET', '/properties/map/infrastructure', { params }),
  compare: (ids) => req('GET', '/properties/compare', { params: { ids } }),
  similar: (id, limit) => req('GET', `/properties/${id}/similar`, { params: { limit } }),
  aiReview: (id, lang) => req('GET', `/properties/${id}/ai-review`, { params: { lang } }),
  translateListing: (id, lang) => req('GET', `/properties/${id}/translate`, { params: { lang } }),
  priceHistory: (id) => req('GET', `/properties/${id}/price-history`),
  mortgage: (id, b) => req('POST', `/properties/${id}/mortgage`, { body: b }),
  reviews: (id) => req('GET', `/properties/${id}/reviews`),
  addReview: (id, b) => req('POST', `/properties/${id}/reviews`, { body: b }),
  editReview: (id, rid, b) => req('PUT', `/properties/${id}/reviews/${rid}`, { body: b }),
  deleteReview: (id, rid) => req('DELETE', `/properties/${id}/reviews/${rid}`),
  canReview: (id) => req('GET', `/properties/${id}/can-review`),
  translateText: (text, lang) => req('POST', '/properties/translate-text', { body: { text, lang } }),
  availability: (id) => req('GET', `/properties/${id}/availability`),
  addAvailability: (id, b) => req('POST', `/properties/${id}/availability`, { body: b }),

  getTour: (id) => req('GET', `/tours/${id}`),
  upsertTour: (id, b) => req('PUT', `/tours/${id}`, { body: b }),
  pannellum: (id) => req('GET', `/tours/${id}/pannellum`),
  shareRoom: (id, room_id) => req('GET', `/tours/${id}/share`, { params: { room_id } }),
  get3dTour: (id) => req('GET', `/tours/${id}/3d`),
  upload3dTour: (id, fd) => req('POST', `/tours/${id}/3d`, { body: fd, isForm: true }),
  delete3dTour: (id) => req('DELETE', `/tours/${id}/3d`),

  askSpatial: (b) => req('POST', '/spatial-qa', { body: b }),
  spatialOne: (id) => req('GET', `/spatial-qa/${id}`),

  favorites: () => req('GET', '/favorites'),
  addFavorite: (id) => req('POST', `/favorites/${id}`),
  removeFavorite: (id) => req('DELETE', `/favorites/${id}`),
  clearFavorites: () => req('DELETE', '/favorites'),

  history: (params) => req('GET', '/history', { params }),
  clearHistory: () => req('DELETE', '/history'),

  createBooking: (b) => req('POST', '/bookings', { body: b }),
  bookings: (params) => req('GET', '/bookings', { params }),
  payTest: (id) => req('POST', `/bookings/${id}/pay-test`),
  cancelBooking: (id) => req('POST', `/bookings/${id}/cancel`),
  paymentStatus: (token) => req('GET', `/pay/${token}/status`, { auth: false }),

  submitRequest: (b) => req('POST', '/purchase-requests', { body: b }),
  myRequests: (params) => req('GET', '/purchase-requests', { params }),

  startConversation: (b) => req('POST', '/conversations', { body: b }),
  conversations: () => req('GET', '/conversations'),
  messages: (cid, params) => req('GET', `/conversations/${cid}/messages`, { params }),
  sendMessage: (cid, b) => req('POST', `/conversations/${cid}/messages`, { body: b }),
  markRead: (cid) => req('POST', `/conversations/${cid}/read`),
  sendFileMessage: (cid, fd) => req('POST', `/conversations/${cid}/messages/upload`, { body: fd, isForm: true }),
  editMessage: (cid, mid, b) => req('PUT', `/conversations/${cid}/messages/${mid}`, { body: b }),
  deleteMessage: (cid, mid) => req('DELETE', `/conversations/${cid}/messages/${mid}`),

  trackers: () => req('GET', '/price-trackers'),
  addTracker: (b) => req('POST', '/price-trackers', { body: b }),
  removeTracker: (pid) => req('DELETE', `/price-trackers/${pid}`),

  recommendations: (params) => req('GET', '/recommendations', { params }),
  aiRecommendations: (params) => req('GET', '/recommendations/ai', { params }),

  agentChat: (b) => req('POST', '/agent/chat', { body: b }),
  agentChatStreamUrl: () => `${API_BASE}/agent/chat/stream`,
  agentConversations: () => req('GET', '/agent/conversations'),
  deleteAgentConversation: (id) => req('DELETE', `/agent/conversations/${id}`),

  submitComplaint: (b) => req('POST', '/complaints', { body: b }),

  notifications: (params) => req('GET', '/notifications', { params }),
  readNotification: (id) => req('POST', `/notifications/${id}/read`),
  readAllNotifications: () => req('POST', '/notifications/read-all'),

  myListings: () => req('GET', '/dashboard/listings'),
  pauseListing: (id) => req('POST', `/dashboard/listings/${id}/pause`),
  activateListing: (id) => req('POST', `/dashboard/listings/${id}/activate`),
  listingAnalytics: (id) => req('GET', `/dashboard/listings/${id}/analytics`),

  adminComplaints: (params) => req('GET', '/admin/complaints', { params }),
  adminModeration: (params) => req('GET', '/admin/moderation', { params }),
  adminOverride: (sid, b) => req('POST', `/admin/moderation/${sid}/override`, { body: b }),
  adminUnban: (uid) => req('POST', `/admin/users/${uid}/unban`),

  upload: (fd) => req('POST', '/media/upload', { body: fd, isForm: true }),
};
