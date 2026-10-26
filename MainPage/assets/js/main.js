/**
 * «Городские легенды» — точка входа.
 * Vue 3 (глобальная сборка) + Leaflet. Здесь собирается приложение и подключаются реакции
 * (watch-ы, запуск при загрузке). Логика лежит в соседних модулях, каждый отвечает за свою тему.
 */
import { CITY, CATS, SORTS, STORY_FORMS, TEXT_MAX } from './constants.js';
import { plural, signed, fmtCoords, snippet, catColor, placeRing, isMobile } from './helpers.js';
import * as S from './state.js';
import { initMap, getView } from './map.js';
import { StoryCard } from './StoryCard.js';
import {
  openPlace, closePanel, showOnMap, goHome, toggleSide, toggleTop, loadPlaces, loadWhispers, refreshMarkers,
} from './places.js';
import { startCompose } from './draft.js';
import { cancelDraft, submitDraft, addNearby } from './compose.js';
import { vote, report, setSort, loadFeed, initFeedObserver } from './stories.js';
import { locate, trackMe, stopTracking } from './geolocation.js';
import { openSearch, closeSearch, runSearch, pickSearch } from './search.js';

const { createApp, watch, onMounted } = Vue;

// ───────────────────────── Реакции ─────────────────────────

function updateHud() {
  const { lat, lng, zoom } = getView();
  S.hud.lat = lat.toFixed(4);
  S.hud.lng = lng.toFixed(4);
  S.hud.zoom = zoom;
}

function registerEffects() {
  watch(S.mode, m => {
    if (m !== 'feed') return;
    closeSearch();
    S.sheetOpen.value = false;
    if (!S.feed.loaded) loadFeed(true);
  });

  watch(S.category, () => {
    refreshMarkers();
    if (S.feed.loaded) loadFeed(true);
  });

  // Фокус в поле истории после анимации смены панели (на телефоне не открываем клавиатуру сами).
  watch(S.draftText, el => { if (el && !isMobile()) el.focus({ preventScroll: true }); });

  onMounted(() => {
    const hadSavedView = initMap(S.mapEl.value, { onClick: startCompose, onMove: updateHud });
    updateHud();
    loadPlaces();
    loadWhispers();

    // Точка появляется сама, как в Google Maps. Если не вышло — один раз объясняем причину.
    locate({ silent: true, fly: !hadSavedView }).then(ok => {
      if (!ok) S.toast(S.lastGeoError.value || 'Местоположение не определено.', 'info');
    });

    // Пока вкладка скрыта, датчики не опрашиваем; при возврате — снова следим за перемещением.
    document.addEventListener('visibilitychange', () => {
      if (!S.userPos.value) return;
      if (document.hidden) stopTracking();
      else trackMe();
    });

    initFeedObserver();

    document.addEventListener('pointerdown', e => {
      if (S.search.open && !e.target.closest('.search')) S.search.open = false;
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || S.search.open) return;
      if (S.panel.value === 'compose') cancelDraft();
      else if (S.panel.value === 'place') closePanel();
      else if (isMobile()) S.sheetOpen.value = false;
    });
  });
}

// ───────────────────────── Приложение ─────────────────────────

createApp({
  components: { StoryCard },
  setup() {
    registerEffects();

    return {
      // константы и форматтеры для шаблона
      CITY, CATS, SORTS, STORY_FORMS, TEXT_MAX,
      plural, signed, fmtCoords, catColor, snippet, placeRing,
      // состояние
      mode: S.mode, category: S.category, places: S.places, panel: S.panel,
      current: S.current, sheetOpen: S.sheetOpen, sideHidden: S.sideHidden, topHidden: S.topHidden, locating: S.locating,
      whispers: S.whispers, toasts: S.toasts, geoAccuracy: S.geoAccuracy,
      hud: S.hud, search: S.search, draft: S.draft, feed: S.feed,
      mapEl: S.mapEl, feedEl: S.feedEl, feedEnd: S.feedEnd,
      draftText: S.draftText, searchInput: S.searchInput,
      // вычисляемые
      totalStories: S.totalStories, catCounts: S.catCounts, topCategory: S.topCategory,
      hotPlaces: S.hotPlaces, placeRating: S.placeRating, placeMix: S.placeMix,
      draftLen: S.draftLen, draftOk: S.draftOk, draftIssue: S.draftIssue,
      draftFill: S.draftFill, draftHint: S.draftHint, handleText: S.handleText,
      feedTitle: S.feedTitle, ribbon: S.ribbon, whispersLoop: S.whispersLoop,
      // действия
      openPlace, closePanel, showOnMap, toggleSide, toggleTop, startCompose, cancelDraft, submitDraft,
      vote, report, locate, addNearby, setSort,
      openSearch, closeSearch, runSearch, pickSearch, goHome,
    };
  },
}).mount('#app');
