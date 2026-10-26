/** Черновик новой истории: выбор точки, метка на карте, определение адреса. */
import { mode, panel, sheetOpen, sideHidden, draft, tokens } from './state.js';
import { setSelected, placeDraftMarker, removeDraftMarker } from './map.js';
import { reverseGeocode as fetchAddress } from './services.js';

export function startCompose({ lat, lng, place = null }) {
  tokens.place++;
  if (mode.value !== 'map') mode.value = 'map';
  draft.error = '';
  if (place) {
    Object.assign(draft, { place_id: place.id, lat: place.lat, lng: place.lng, address: place.address || '', geocoding: false });
    tokens.geo++;
  } else {
    Object.assign(draft, { place_id: null, lat, lng });
    resolveAddress(lat, lng);
  }
  panel.value = 'compose';
  sheetOpen.value = true;
  sideHidden.value = false;
  setSelected(place ? place.id : null);
  placeDraftMarker(draft.lat, draft.lng, ({ lat: la, lng: ln }) => {
    draft.lat = la; draft.lng = ln; draft.place_id = null;
    resolveAddress(la, ln);
  });
}

/** Убирает метку черновика; текст сохраняется — вдруг пользователь просто перепутал точку. */
export function leaveDraft() {
  tokens.geo++;
  draft.geocoding = false;
  removeDraftMarker();
}

async function resolveAddress(lat, lng) {
  const token = ++tokens.geo;
  draft.geocoding = true;
  draft.address = '';
  try {
    const address = await fetchAddress(lat, lng);
    if (token === tokens.geo) draft.address = address;
  } catch {
    /* без адреса тоже можно публиковать */
  } finally {
    if (token === tokens.geo) draft.geocoding = false;
  }
}
