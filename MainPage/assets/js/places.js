/** Map places: loading, markers, side panel, navigation and camera. */
import {
  mode, category, places, panel, current, sheetOpen, sideHidden, topHidden, whispers, tokens, toast, visiblePlaces,
} from './state.js';
import { api, store } from './services.js';
import { isMobile } from './helpers.js';
import { getZoom, isReady, invalidateSize, setSelected, flyTo, flyToCity, renderMarkers } from './map.js';
import { leaveDraft } from './draft.js';

const { nextTick } = Vue;

// ───────────────────────── Camera ─────────────────────────

/** On mobile the bottom sheet covers the lower map, so shift the target into the visible area. */
export function flyToPoint(lat, lng, zoom) {
  const sheet = document.querySelector('.side');
  const offsetY = isMobile() && sheetOpen.value && sheet ? sheet.offsetHeight / 2 : 0;
  flyTo(lat, lng, zoom, offsetY);
}

// ───────────────────────── Loading places and markers ─────────────────────────

let refreshTimer = null;

export function refreshMarkers() {
  renderMarkers(visiblePlaces.value, {
    category: category.value,
    selectedId: panel.value === 'place' ? current.value?.place.id : null,
    onSelect: id => openPlace(id),
  });
}

export async function loadPlaces() {
  try {
    places.value = await api('places.php');
    refreshMarkers();
  } catch (e) {
    toast(e.message, 'error');
  }
}

export function schedulePlacesRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(loadPlaces, 900);
}

export async function loadWhispers() {
  try {
    whispers.value = (await api('stories.php', { params: { sort: 'new', limit: 10 } })).items;
  } catch { /* the ticker is optional decoration */ }
}

// ───────────────────────── Place panel ─────────────────────────

export async function openPlace(id, { fly = true } = {}) {
  const token = ++tokens.place;
  leaveDraft();
  if (current.value?.place.id !== id) current.value = null;
  panel.value = 'place';
  sheetOpen.value = true;
  sideHidden.value = false;   // a hidden panel reopens when it has something to show
  setSelected(id);
  try {
    const data = await api('places.php', { params: { id } });
    if (token !== tokens.place) return;
    current.value = data;
    if (fly && isReady()) flyToPoint(data.place.lat, data.place.lng, Math.max(getZoom(), 16));
  } catch (e) {
    if (token !== tokens.place) return;
    toast(e.message, 'error');
    closePanel();
  }
}

export function closePanel() {
  tokens.place++;
  leaveDraft();
  panel.value = 'overview';
  current.value = null;
  setSelected(null);
  if (isMobile()) sheetOpen.value = false;
}

export function showOnMap(story) {
  mode.value = 'map';
  nextTick(() => {
    invalidateSize();
    openPlace(story.place.id);
  });
}

export function goHome() {
  mode.value = 'map';
  closePanel();
  nextTick(() => { invalidateSize(); flyToCity(); });
}

// ───────────────────────── Hiding UI on the map ─────────────────────────

/** Desktop: show/hide the right panel; the map fills the freed space. */
export function toggleSide() {
  sideHidden.value = !sideHidden.value;
  store.set('sideHidden', sideHidden.value);
}

/** Mobile: show/hide the top menu (logo, toggle, search). */
export function toggleTop() {
  topHidden.value = !topHidden.value;
  store.set('topHidden', topHidden.value);
}
