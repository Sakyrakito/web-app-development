/** Внешний мир: PHP API, localStorage, Nominatim (OpenStreetMap). */
import { shortAddress } from './helpers.js';

// ───────────────────────── PHP API ─────────────────────────

export async function api(path, { method = 'GET', params, body } = {}) {
  const url = new URL(`api/${path}`, location.href);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* сервер вернул не JSON */ }
  if (!res.ok || data === null) {
    const err = new Error(data?.error || `Сервер не отвечает (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ───────────────────────── localStorage ─────────────────────────

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(`legends:${key}`); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`legends:${key}`, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
};

// ───────────────────────── Nominatim ─────────────────────────

const BASE = 'https://nominatim.openstreetmap.org';

/** Адрес по координатам. Бросает ошибку, если сервис недоступен. */
export async function reverseGeocode(lat, lng) {
  const url = new URL(`${BASE}/reverse`);
  url.search = new URLSearchParams({ format: 'jsonv2', zoom: '18', 'accept-language': 'ru', lat, lon: lng });
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return shortAddress(await res.json());
}

/** Поиск места по тексту с приоритетом текущей области карты. bounds: {west,north,east,south} */
export async function searchPlaces(q, bounds) {
  const url = new URL(`${BASE}/search`);
  url.search = new URLSearchParams({
    q, format: 'jsonv2', limit: '6', addressdetails: '1', 'accept-language': 'ru',
    viewbox: [bounds.west, bounds.north, bounds.east, bounds.south].join(','),
  });
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()).map(d => ({
    id: d.place_id, lat: +d.lat, lng: +d.lon,
    title: d.name || shortAddress(d), subtitle: d.display_name,
  }));
}
