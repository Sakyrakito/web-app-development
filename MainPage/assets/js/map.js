/**
 * Leaflet wrapper. All map objects live here (outside Vue reactivity),
 * but it knows nothing about app state: everything arrives via arguments and callbacks.
 */
import { CITY } from './constants.js';
import { store } from './services.js';
import { mixSegments, conic, dominantColor, plural } from './helpers.js';

let map = null, markersLayer = null, draftMarker = null, meMarker = null, meCircle = null;
const markers = new Map();

/**
 * @param {HTMLElement} el
 * @param {{onClick, onMove, onMoveEnd}} handlers
 * @returns {boolean} whether a saved map view was restored
 */
export function initMap(el, { onClick, onMove }) {
  const saved = store.get('mapView', null);
  map = L.map(el, { zoomControl: false, minZoom: 3, worldCopyJump: true })
    .setView(saved?.center || CITY.center, saved?.zoom || CITY.zoom);

  // Standard OSM tiles; the night look is a CSS filter (.map .leaflet-tile-pane).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map);
  markersLayer = L.markerClusterGroup({
    // Orbs are 30–84 px wide, so this merges roughly the ones that would overlap.
    maxClusterRadius: 60,
    showCoverageOnHover: false,
    iconCreateFunction: clusterIcon,
  }).addTo(map);

  // The container resizes when v-cloak is removed and on mode/layout changes, and Leaflet must be told.
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

/** offsetY: how many pixels to shift the target up so the bottom sheet doesn't cover it. */
export function flyTo(lat, lng, zoom = map.getZoom(), offsetY = 0) {
  let target = L.latLng(lat, lng);
  if (offsetY) target = map.unproject(map.project(target, zoom).add([0, offsetY]), zoom);
  map.flyTo(target, zoom, { duration: 0.8 });
}

export function flyToCity() {
  map.flyTo(CITY.center, CITY.zoom, { duration: 0.8 });
}

// ── Place markers ──

let selectedId = null;

/** One orb for a place or a whole cluster: ring = category shares, size grows with rating and story count. */
function orbIcon({ mix, stories, rating, count, phase, selected, cluster, title }) {
  const size = Math.round(Math.min(84, 30 + Math.sqrt(Math.max(0, rating) + count * 4) * 4.2));
  const segs = mixSegments(mix, stories);
  const cls = ['orb', cluster && 'orb--cluster', rating >= 40 && 'orb--hot', selected && 'is-selected'].filter(Boolean).join(' ');
  const style = `--s:${size}px;--ring:${conic(segs)};--glow:${dominantColor(segs)};--d:${((phase * 0.73) % 3).toFixed(2)}s`;
  return L.divIcon({
    className: 'orb-icon',
    iconSize: [size, size],
    html: `<div class="${cls}" style="${style}"${title ? ` title="${title}"` : ''}><b>${count}</b></div>`,
  });
}

function clusterIcon(cluster) {
  const children = cluster.getAllChildMarkers().map(m => m.options.place);
  const mix = {};
  let stories = 0, rating = 0, count = 0;
  for (const { p, count: n } of children) {
    for (const [k, v] of Object.entries(p.mix)) mix[k] = (mix[k] || 0) + v;
    stories += p.stories;
    rating += p.rating;
    count += n;
  }
  return orbIcon({
    mix, stories, rating, count,
    phase: children[0].p.id,
    selected: children.some(c => c.p.id === selectedId),
    cluster: true,
    title: `${children.length} ${plural(children.length, ['точка', 'точки', 'точек'])} рядом`,
  });
}

export function renderMarkers(places, { category, selectedId: selected, onSelect }) {
  if (!map) return;
  selectedId = selected;
  markersLayer.clearLayers();
  markers.clear();

  const batch = places.map(p => {
    const count = category ? p.mix[category] : p.stories;
    const icon = orbIcon({ mix: p.mix, stories: p.stories, rating: p.rating, count, phase: p.id, selected: p.id === selected });
    const marker = L.marker([p.lat, p.lng], {
      icon,
      title: p.address || 'Точка с историями',
      riseOnHover: true,
      zIndexOffset: p.id === selected ? 1000 : icon.options.iconSize[0],
      place: { p, count },
    }).on('click', () => onSelect(p.id));
    markers.set(p.id, marker);
    return marker;
  });
  markersLayer.addLayers(batch);
}

export function setSelected(id) {
  selectedId = id;
  for (const [pid, m] of markers) {
    m.getElement()?.querySelector('.orb')?.classList.toggle('is-selected', pid === id);
    m.setZIndexOffset(pid === id ? 1000 : m.options.icon.options.iconSize[0]);
  }
  // A selected place hidden inside a cluster marks the cluster instead.
  markersLayer.refreshClusters();
}

// ── Draft marker ──

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

// ── "Me" on the map ──

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

/** Accuracy circle around the blue dot. Below 25 m it only blurs the dot, so it isn't drawn. */
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
