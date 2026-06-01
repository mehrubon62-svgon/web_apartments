// ============================================================
// Nestora API client — thin wrapper over fetch with JWT + refresh
// ============================================================

const CFG = window.NESTORA_CONFIG || { apiBase: '', mapboxToken: '', googleClientId: '', aiEnabled: false };
const API_BASE = CFG.apiBase || '';

const TOKENS = {
  get access() { return localStorage.getItem('nestora_access'); },
  get refresh() { return localStorage.getItem('nestora_refresh'); },
  set({ access_token, refresh_token }) {
    if (access_token) localStorage.setItem('nestora_access', access_token);
    if (refresh_token) localStorage.setItem('nestora_refresh', refresh_token);
  },
  clear() {
    localStorage.removeItem('nestora_access');
    localStorage.removeItem('nestora_refresh');
  },
};

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

function buildQuery(params) {
  if (!params) return '';
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.append(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

async function refreshTokens() {
  const refresh_token = TOKENS.refresh;
  if (!refresh_token) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    TOKENS.set(data);
    return true;
  } catch {
    return false;
  }
}

async function request(method, path, { body, params, isForm, retry = true, auth = true } = {}) {
  const headers = {};
  if (auth && TOKENS.access) headers['Authorization'] = `Bearer ${TOKENS.access}`;

  let payload;
  if (isForm) {
    payload = body; // FormData
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const url = `${API_BASE}${path}${buildQuery(params)}`;
  let res;
  try {
    res = await fetch(url, { method, headers, body: payload });
  } catch (e) {
    throw new ApiError('Сеть недоступна. Проверьте подключение.', 0, null);
  }

  if (res.status === 401 && auth && retry && TOKENS.refresh) {
    const ok = await refreshTokens();
    if (ok) return request(method, path, { body, params, isForm, retry: false, auth });
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

const api = {
  base: API_BASE,
  config: CFG,
  tokens: TOKENS,
  ApiError,
  get: (p, params) => request('GET', p, { params }),
  post: (p, body, opts) => request('POST', p, { body, ...opts }),
  put: (p, body) => request('PUT', p, { body }),
  del: (p, params) => request('DELETE', p, { params }),
  postForm: (p, formData) => request('POST', p, { body: formData, isForm: true }),

  isAuthed: () => !!TOKENS.access,

  // ---- Auth ----
  register: (b) => request('POST', '/auth/register', { body: b, auth: false }),
  login: (b) => request('POST', '/auth/login', { body: b, auth: false }),
  google: (b) => request('POST', '/auth/google', { body: b, auth: false }),
  sendCode: (b) => request('POST', '/auth/send-code', { body: b, auth: false }),
  verifyEmail: (b) => request('POST', '/auth/verify-email', { body: b, auth: false }),
  loginCode: (b) => request('POST', '/auth/login-code', { body: b, auth: false }),
  resetPassword: (b) => request('POST', '/auth/reset-password', { body: b, auth: false }),
  logout: () => request('POST', '/auth/logout', { body: { refresh_token: TOKENS.refresh || '' } }).catch(() => {}),

  me: () => request('GET', '/users/me'),
  updateMe: (b) => request('PUT', '/users/me', { body: b }),
  changePassword: (b) => request('POST', '/users/me/change-password', { body: b }),
  deleteMe: () => request('DELETE', '/users/me'),

  // ---- Properties ----
  listProperties: (params) => request('GET', '/properties', { params }),
  searchProperties: (params) => request('GET', '/properties/search', { params }),
  getProperty: (id) => request('GET', `/properties/${id}`),
  createProperty: (b) => request('POST', '/properties', { body: b }),
  updateProperty: (id, b) => request('PUT', `/properties/${id}`, { body: b }),
  deleteProperty: (id) => request('DELETE', `/properties/${id}`),
  mapMarkers: (params) => request('GET', '/properties/map', { params }),
  infrastructure: (params) => request('GET', '/properties/map/infrastructure', { params }),
  nearby: (params) => request('GET', '/properties/nearby', { params }),
  compare: (ids) => request('GET', '/properties/compare', { params: { ids } }),
  similar: (id, limit) => request('GET', `/properties/${id}/similar`, { params: { limit } }),
  aiReview: (id) => request('GET', `/properties/${id}/ai-review`),
  priceHistory: (id) => request('GET', `/properties/${id}/price-history`),
  mortgage: (id, b) => request('POST', `/properties/${id}/mortgage`, { body: b }),
  reviews: (id) => request('GET', `/properties/${id}/reviews`),
  addReview: (id, b) => request('POST', `/properties/${id}/reviews`, { body: b }),
  availability: (id) => request('GET', `/properties/${id}/availability`),
  addAvailability: (id, b) => request('POST', `/properties/${id}/availability`, { body: b }),

  // ---- Tours ----
  getTour: (id) => request('GET', `/tours/${id}`),
  upsertTour: (id, b) => request('PUT', `/tours/${id}`, { body: b }),
  pannellum: (id) => request('GET', `/tours/${id}/pannellum`),
  shareRoom: (id, room_id) => request('GET', `/tours/${id}/share`, { params: { room_id } }),

  // ---- Spatial QA ----
  askSpatial: (b) => request('POST', '/spatial-qa', { body: b }),
  spatialList: (params) => request('GET', '/spatial-qa', { params }),
  spatialOne: (id) => request('GET', `/spatial-qa/${id}`),
  spatialDelete: (id) => request('DELETE', `/spatial-qa/${id}`),

  // ---- Favorites ----
  favorites: () => request('GET', '/favorites'),
  addFavorite: (id) => request('POST', `/favorites/${id}`),
  removeFavorite: (id) => request('DELETE', `/favorites/${id}`),
  clearFavorites: () => request('DELETE', '/favorites'),

  // ---- History ----
  history: (params) => request('GET', '/history', { params }),
  deleteHistory: (id) => request('DELETE', `/history/${id}`),
  clearHistory: () => request('DELETE', '/history'),

  // ---- Bookings & payments ----
  createBooking: (b) => request('POST', '/bookings', { body: b }),
  bookings: (params) => request('GET', '/bookings', { params }),
  getBooking: (id) => request('GET', `/bookings/${id}`),
  payTest: (id) => request('POST', `/bookings/${id}/pay-test`),
  cancelBooking: (id) => request('POST', `/bookings/${id}/cancel`),
  paymentStatus: (token) => request('GET', `/pay/${token}/status`, { auth: false }),

  // ---- Requests ----
  submitRequest: (b) => request('POST', '/purchase-requests', { body: b }),
  myRequests: (params) => request('GET', '/purchase-requests', { params }),

  // ---- Messages ----
  startConversation: (b) => request('POST', '/conversations', { body: b }),
  conversations: () => request('GET', '/conversations'),
  messages: (cid, params) => request('GET', `/conversations/${cid}/messages`, { params }),
  sendMessage: (cid, b) => request('POST', `/conversations/${cid}/messages`, { body: b }),
  markRead: (cid) => request('POST', `/conversations/${cid}/read`),
  sendFileMessage: (cid, formData) => request('POST', `/conversations/${cid}/messages/upload`, { body: formData, isForm: true }),
  editMessage: (cid, mid, b) => request('PUT', `/conversations/${cid}/messages/${mid}`, { body: b }),
  deleteMessage: (cid, mid) => request('DELETE', `/conversations/${cid}/messages/${mid}`),

  // ---- Trackers ----
  trackers: () => request('GET', '/price-trackers'),
  addTracker: (b) => request('POST', '/price-trackers', { body: b }),
  removeTracker: (pid) => request('DELETE', `/price-trackers/${pid}`),

  // ---- Recommendations ----
  recommendations: (params) => request('GET', '/recommendations', { params }),
  aiRecommendations: (params) => request('GET', '/recommendations/ai', { params }),

  // ---- Agent ----
  agentChat: (b) => request('POST', '/agent/chat', { body: b }),
  agentConversations: () => request('GET', '/agent/conversations'),
  deleteAgentConversation: (id) => request('DELETE', `/agent/conversations/${id}`),

  // ---- Complaints ----
  submitComplaint: (b) => request('POST', '/complaints', { body: b }),

  // ---- Notifications ----
  notifications: (params) => request('GET', '/notifications', { params }),
  readNotification: (id) => request('POST', `/notifications/${id}/read`),
  readAllNotifications: () => request('POST', '/notifications/read-all'),
  deleteNotification: (id) => request('DELETE', `/notifications/${id}`),

  // ---- Dashboard (seller) ----
  myListings: () => request('GET', '/dashboard/listings'),
  pauseListing: (id) => request('POST', `/dashboard/listings/${id}/pause`),
  activateListing: (id) => request('POST', `/dashboard/listings/${id}/activate`),
  listingAnalytics: (id) => request('GET', `/dashboard/listings/${id}/analytics`),

  // ---- Admin ----
  adminComplaints: (params) => request('GET', '/admin/complaints', { params }),
  adminModeration: (params) => request('GET', '/admin/moderation', { params }),
  adminOverride: (sid, b) => request('POST', `/admin/moderation/${sid}/override`, { body: b }),
  adminUnban: (uid) => request('POST', `/admin/users/${uid}/unban`),

  // ---- Media ----
  upload: (formData) => request('POST', '/media/upload', { body: formData, isForm: true }),
  uploadAvatar: (formData) => request('POST', '/users/me/avatar', { body: formData, isForm: true }),
};

export { api, ApiError, CFG };
