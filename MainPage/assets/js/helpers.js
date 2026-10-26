/**
 * Чистые функции без состояния: форматирование, цвета категорий, адреса, определение мобильного режима.
 */
import { CATS, NONE, MOBILE_BREAKPOINT } from './constants.js';

// ───────────────────────── Форматирование ─────────────────────────

export function plural(n, [one, few, many]) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export const signed = n => (n > 0 ? `+${n}` : String(n));

// SQLite отдаёт UTC без зоны: «2026-10-06 14:00:00»
export const parseTs = ts => new Date(ts.replace(' ', 'T') + 'Z');

export function timeAgo(ts) {
  const sec = Math.max(0, (Date.now() - parseTs(ts)) / 1000);
  if (sec < 60) return 'только что';
  if (sec < 3600) return `${Math.floor(sec / 60)} мин назад`;
  if (sec < 86400) {
    const h = Math.floor(sec / 3600);
    return `${h} ${plural(h, ['час', 'часа', 'часов'])} назад`;
  }
  const d = Math.floor(sec / 86400);
  if (d < 30) return `${d} ${plural(d, ['день', 'дня', 'дней'])} назад`;
  return parseTs(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const fmtDate = ts => parseTs(ts).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
export const fmtDistance = m => (m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} км`);
export const fmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const fmtCoords = p => (p && p.lat != null ? `${(+p.lat).toFixed(5)}°, ${(+p.lng).toFixed(5)}°` : '');
export const snippet = text => (text.length > 90 ? text.slice(0, 88).trimEnd() + '…' : text);
export const textLength = s => Array.from(s.trim()).length; // как mb_strlen на сервере

// ───────────────────────── Категории и цвета ─────────────────────────

export const catColor = key => (CATS[key] || NONE).color;

/** Сегменты категорий в точке: [{key, n, color, label}] */
export function mixSegments(mix, total) {
  const segs = Object.entries(CATS)
    .map(([key, c]) => ({ key, n: mix?.[key] || 0, color: c.color, label: c.label }))
    .filter(s => s.n > 0);
  const rest = total - segs.reduce((a, s) => a + s.n, 0);
  if (rest > 0) segs.push({ key: 'none', n: rest, color: NONE.color, label: NONE.label });
  return segs;
}

export function conic(segs) {
  const total = segs.reduce((a, s) => a + s.n, 0);
  if (!total) return NONE.color;
  let acc = 0;
  const stops = segs.map(s => {
    const from = (acc / total) * 360;
    acc += s.n;
    return `${s.color} ${from.toFixed(1)}deg ${((acc / total) * 360).toFixed(1)}deg`;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

export const dominantColor = segs => (segs.length ? segs.reduce((a, b) => (b.n > a.n ? b : a)).color : NONE.color);

export const placeRing = p => conic(mixSegments(p.mix, p.stories));

// ───────────────────────── Адреса ─────────────────────────

export function shortAddress(d) {
  const a = d.address || {};
  const street = a.road || a.pedestrian || a.footway || a.square || a.neighbourhood || a.suburb || '';
  const parts = [];
  if (d.name && d.name !== street) parts.push(d.name);
  if (street) parts.push(a.house_number ? `${street}, ${a.house_number}` : street);
  return parts.join(', ') || (d.display_name || '').split(',').slice(0, 2).join(',').trim();
}

// ───────────────────────── Устройство ─────────────────────────

const mobileQuery = matchMedia(MOBILE_BREAKPOINT);
export const isMobile = () => mobileQuery.matches;
