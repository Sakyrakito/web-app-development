/**
 * Обёртка над Leaflet. Здесь живут все объекты карты (вне реактивности Vue),
 * но нет знания о состоянии приложения: всё нужное приходит аргументами и колбэками.
 */
import { CITY } from './constants.js';
import { store } from './services.js';
import { mixSegments, conic, dominantColor } from './helpers.js';

let map = null, markersLayer = null, draftMarker = null, meMarker = null, meCircle = null;
const markers = new Map();

/**
 * @param {HTMLElement} el
 * @param {{onClick, onMove, onMoveEnd}} handlers
 * @returns {boolean} был ли сохранённый вид карты
 */
export function initMap(el, { onClick, onMove }) {
  const saved = store.get('mapView', null);
  map = L.map(el, { zoomControl: false, minZoom: 3, worldCopyJump: true })
    .setView(saved?.center || CITY.center, saved?.zoom || CITY.zoom);

  // Стандартные тайлы OSM; «ночной» вид делает CSS-фильтр (.map .leaflet-tile-pane).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);

  // Контейнер меняет размер при снятии v-cloak, смене режима и раскладки — Leaflet нужно об этом знать.
  new ResizeObserver(() => map.invalidateSize()).observe(el);

  map.on('click', e => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }));
  map.on('move', onMove);
  map.on('moveend', () => {
    const c = map.getCenter();
    store.set('mapView', { center: [+c.lat.toFixed(5), +c.lng.toFixed(5)], zoom: map.getZoom() });
  });
  return Boolean(saved);
}

export const isReady = () => map !== null;
export const invalidateSize = () => map?.invalidateSize();
export const getZoom = () => map.getZoom();
export function getView() {
  const c = map.getCenter();
  return { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
}
export function getBounds() {
  const b = map.getBounds();
  return { west: b.getWest(), north: b.getNorth(), east: b.getEast(), south: b.getSouth() };
}

/** offsetY — на сколько пикселей сместить цель вверх, чтобы её не закрывала шторка. */
export function flyTo(lat, lng, zoom = map.getZoom(), offsetY = 0) {
  let target = L.latLng(lat, lng);
  if (offsetY) target = map.unproject(map.project(target, zoom).add([0, offsetY]), zoom);
  map.flyTo(target, zoom, { duration: 0.8 });
}

export function flyToCity() {
  map.flyTo(CITY.center, CITY.zoom, { duration: 0.8 });
}

// ── Маркеры точек ──

export function renderMarkers(places, { category, selectedId, onSelect }) {
  if (!map) return;
  markersLayer.clearLayers();
  markers.clear();

  for (const p of places) {
    const count = category ? p.mix[category] : p.stories;
    const size = Math.round(Math.min(84, 30 + Math.sqrt(Math.max(0, p.rating) + count * 4) * 4.2));
    const segs = mixSegments(p.mix, p.stories);
    const cls = ['orb', p.rating >= 40 && 'orb--hot', p.id === selectedId && 'is-selected'].filter(Boolean).join(' ');
    const style = `--s:${size}px;--ring:${conic(segs)};--glow:${dominantColor(segs)};--d:${((p.id * 0.73) % 3).toFixed(2)}s`;

    const marker = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: 'orb-icon', iconSize: [size, size], html: `<div class="${cls}" style="${style}"><b>${count}</b></div>` }),
      title: p.address || 'Точка с историями',
      riseOnHover: true,
      zIndexOffset: p.id === selectedId ? 1000 : Math.round(size),
    }).on('click', () => onSelect(p.id));

    marker.addTo(markersLayer);
    markers.set(p.id, marker);
  }
}

export function setSelected(id) {
  for (const [pid, m] of markers) {
    m.getElement()?.querySelector('.orb')?.classList.toggle('is-selected', pid === id);
    m.setZIndexOffset(pid === id ? 1000 : 0);
  }
}

// ── Метка черновика ──

export function placeDraftMarker(lat, lng, onDragEnd) {
  if (!map) return;
  if (!draftMarker) {
    draftMarker = L.marker([lat, lng], {
      draggable: true,
      zIndexOffset: 2000,
      icon: L.divIcon({ className: 'drop-icon', iconSize: [48, 48], html: '<div class="drop"><i></i></div>' }),
    }).on('dragend', () => onDragEnd(draftMarker.getLatLng()));
    draftMarker.addTo(map);
  } else {
    draftMarker.setLatLng([lat, lng]);
  }
}

export function removeDraftMarker() {
  if (draftMarker) { draftMarker.remove(); draftMarker = null; }
}

// ── «Я на карте» ──

export function drawMe({ lat, lng }) {
  if (!meMarker) {
    meMarker = L.marker([lat, lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({ className: 'me-icon', iconSize: [22, 22], html: '<div class="me"></div>' }),
    }).addTo(map);
  } else {
    meMarker.setLatLng([lat, lng]);
  }
}

/** Круг точности вокруг синей точки. При точности лучше 25 м он только «мылит» точку — не рисуем. */
export function drawAccuracy({ lat, lng }, radius) {
  if (!radius || radius < 25) {
    if (meCircle) { meCircle.remove(); meCircle = null; }
    return;
  }
  if (meCircle) {
    meCircle.setLatLng([lat, lng]).setRadius(radius);
  } else {
    meCircle = L.circle([lat, lng], {
      radius,
      interactive: false,
      color: '#7fe7ff',
      weight: 1,
      opacity: .45,
      fillColor: '#7fe7ff',
      fillOpacity: .12,
    }).addTo(map);
  }
}
