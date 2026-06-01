export function money(value) {
  if (value === null || value === undefined) return '—';
  return '$' + Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function shortPrice(price) {
  if (price >= 1000000) return '$' + (price / 1000000).toFixed(price % 1000000 === 0 ? 0 : 1) + 'M';
  if (price >= 1000) return '$' + Math.round(price / 1000) + 'K';
  return '$' + price;
}

export function fmtDate(iso, withTime = false) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} дн`;
  return fmtDate(iso);
}

export function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || src[0].toUpperCase();
}

export function mediaUrl(url) { return url || ''; }

export const TYPE_LABELS = { apartment: 'Квартира', house: 'Дом', commercial: 'Коммерция' };
export const DEAL_LABELS = { rent: 'Аренда', sale: 'Продажа' };
export const TERM_LABELS = { short: 'Краткосрочно', long: 'Долгосрочно' };
export const STATUS_LABELS = { active: 'Активно', paused: 'На паузе', deleted: 'Удалено' };
export const ROLE_LABELS = { buyer: 'Покупатель', seller: 'Продавец', admin: 'Администратор' };
export const VERDICT = {
  great_deal: { label: 'Выгодно', color: '#2f7d52' },
  fair: { label: 'Справедливо', color: '#c2502e' },
  overpriced: { label: 'Завышено', color: '#b8862f' },
  suspicious: { label: 'Подозрительно', color: '#b8862f' },
  likely_scam: { label: 'Вероятно скам', color: '#b23b2e' },
  insufficient_data: { label: 'Мало данных', color: '#756c5e' },
};
