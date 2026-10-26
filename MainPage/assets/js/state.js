/**
 * Общее состояние приложения: реактивные данные, вычисляемые значения, уведомления.
 * Приложение одно на странице, поэтому состояние живёт на уровне модуля.
 */
import {
  CATS, NONE, FEED_TITLES, RIBBONS, STORY_FORMS, CONTACT_RULES, TEXT_MIN, TEXT_MAX,
} from './constants.js';
import { store } from './services.js';
import { plural, textLength, mixSegments } from './helpers.js';

const { createApp, ref, reactive, computed, watch, onMounted, nextTick } = Vue;

// ───────────────────────── Данные ─────────────────────────

export const mode        = ref('map');       // map | feed; при входе всегда карта
export const category    = ref(null);
export const places      = ref([]);
export const panel       = ref('overview');  // overview | place | compose
export const current     = ref(null);        // { place, stories }
export const sheetOpen   = ref(false);       // шторка на телефоне
export const locating    = ref(false);
export const userPos     = ref(null);        // { lat, lng } — уходит в API сортировки «рядом»
export const geoAccuracy = ref(0);           // радиус круга точности в метрах
export const lastGeoError = ref('');         // причина последней неудачи геолокации
export const whispers    = ref([]);
export const toasts      = ref([]);
export const sideHidden  = ref(store.get('sideHidden', false));  // ПК: правая панель скрыта
export const topHidden   = ref(store.get('topHidden', false));   // телефон: верхнее меню скрыто

export const hud    = reactive({ lat: '', lng: '', zoom: 0 });
export const search = reactive({ q: '', results: [], loading: false, empty: false, open: false });
export const draft  = reactive({
  lat: null, lng: null, place_id: null, address: '', geocoding: false,
  text: '', category: null, sending: false, error: '',
});

const savedSort = store.get('feedSort', 'new');
export const feed = reactive({
  items: [], offset: 0, done: false, loading: false, loaded: false,
  sort: savedSort === 'near' ? 'new' : savedSort,   // «рядом» без геопозиции не откроется
});

// Ссылки на DOM-элементы шаблона (ref="..." в index.html)
export const mapEl       = ref(null);
export const feedEl      = ref(null);
export const feedEnd     = ref(null);
export const draftText   = ref(null);
export const searchInput = ref(null);

/** Счётчики запросов: устаревший ответ сравнивает свой токен с текущим и отбрасывается. */
export const tokens = { place: 0, feed: 0, geo: 0 };

// ───────────────────────── Вычисляемые значения ─────────────────────────

export const totalStories = computed(() => places.value.reduce((a, p) => a + p.stories, 0));

export const catCounts = computed(() => {
  const counts = Object.fromEntries(Object.keys(CATS).map(k => [k, 0]));
  for (const p of places.value) for (const k in counts) counts[k] += p.mix[k] || 0;
  return counts;
});

export const topCategory = computed(() => {
  const [key, n] = Object.entries(catCounts.value).sort((a, b) => b[1] - a[1])[0] || [];
  return n ? CATS[key] : NONE;
});

export const visiblePlaces = computed(() =>
  category.value ? places.value.filter(p => (p.mix[category.value] || 0) > 0) : places.value);

export const hotPlaces = computed(() => [...visiblePlaces.value].sort((a, b) => b.rating - a.rating).slice(0, 5));

export const placeRating = computed(() => (current.value ? current.value.stories.reduce((a, s) => a + s.rating, 0) : 0));

export const placeMix = computed(() => {
  if (!current.value) return [];
  const mix = {};
  for (const s of current.value.stories) if (s.category) mix[s.category] = (mix[s.category] || 0) + 1;
  return mixSegments(mix, current.value.stories.length);
});

export const draftLen   = computed(() => textLength(draft.text));
export const draftIssue = computed(() => CONTACT_RULES.find(([re]) => re.test(draft.text))?.[1] || '');
export const draftOk    = computed(() => draftLen.value >= TEXT_MIN && draftLen.value <= TEXT_MAX && !draftIssue.value);
export const draftFill  = computed(() => `${Math.min(100, (draftLen.value / TEXT_MAX) * 100).toFixed(2)}%`);
export const draftHint  = computed(() => {
  if (draftLen.value < TEXT_MIN) return `ещё ${TEXT_MIN - draftLen.value} ${plural(TEXT_MIN - draftLen.value, ['символ', 'символа', 'символов'])} до публикации`;
  if (draftLen.value > TEXT_MAX - 150) return `осталось ${TEXT_MAX - draftLen.value}`;
  return 'готово к публикации';
});

export const handleText = computed(() => {
  if (panel.value === 'compose') return 'Новая легенда';
  if (panel.value === 'place') return current.value?.place.address || 'Точка на карте';
  return `${totalStories.value} ${plural(totalStories.value, STORY_FORMS)} на карте`;
});

export const feedTitle    = computed(() => FEED_TITLES[feed.sort]);
export const ribbon       = computed(() => RIBBONS[feed.sort]);
export const whispersLoop = computed(() => [...whispers.value, ...whispers.value]);

// ───────────────────────── Уведомления ─────────────────────────

export function toast(text, kind = 'info') {
  const id = Date.now() + Math.random();
  toasts.value.push({ id, text, kind });
  setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 4200);
}
