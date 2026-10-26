/** Поиск мест по адресу (Nominatim). */
import { mode, search, searchInput, toast } from './state.js';
import { getBounds, invalidateSize } from './map.js';
import { searchPlaces } from './services.js';
import { flyToPoint } from './places.js';

const { nextTick } = Vue;

export function openSearch() {
  search.open = true;
  nextTick(() => searchInput.value?.focus());
}

export function closeSearch() {
  search.open = false;
  searchInput.value?.blur();
}

export async function runSearch() {
  const q = search.q.trim();
  if (q.length < 3) return;
  Object.assign(search, { loading: true, empty: false, open: true, results: [] });
  try {
    search.results = await searchPlaces(q, getBounds());
    search.empty = !search.results.length;
  } catch {
    toast('Поиск сейчас недоступен, попробуйте позже.', 'error');
  } finally {
    search.loading = false;
  }
}

export function pickSearch(r) {
  search.q = r.title;
  closeSearch();
  mode.value = 'map';
  nextTick(() => { invalidateSize(); flyToPoint(r.lat, r.lng, 17); });
}
