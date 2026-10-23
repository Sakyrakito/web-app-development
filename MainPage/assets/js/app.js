/**
 * «Городские легенды» — главная страница.
 * Vue 3 (глобальная сборка, без бандлера) + Leaflet. Данные — из PHP API в /api.
 */
(() => {
  'use strict';

  const { createApp, ref, reactive, computed, watch, onMounted, nextTick } = Vue;

  // ---------------------- Константы ----------------------

  const CITY = { name: 'Гродно', center: [53.6779, 23.8293], zoom: 15 };

  const CATS = {
    rumor:   { label: 'Слух',              plural: 'Слухи',     glyph: '∿', color: '#a58bff', hint: 'кто-то где-то слышал' },
    horror:  { label: 'Страшилка',         plural: 'Страшилки', glyph: '☾', color: '#ff5470', hint: 'лучше не ходить одному' },
    history: { label: 'Исторический факт', plural: 'Факты',     glyph: '§', color: '#e9b44c', hint: 'было на самом деле' },
    omen:    { label: 'Примета',           plural: 'Приметы',   glyph: '✶', color: '#3fd3b6', hint: 'работает, если верить' },
  };
  const NONE = { label: 'Без категории', glyph: '·', color: '#8b8799' };

  const SORTS = [
    { key: 'new',  label: 'Новые' },
    { key: 'hot',  label: 'Обсуждают' },
    { key: 'top',  label: 'Популярные' },
    { key: 'near', label: 'Рядом' },
  ];
  const FEED_TITLES = { new: 'прямо сейчас', hot: 'громче всего', top: 'чаще всего', near: 'рядом с вами' };
  const RIBBONS     = { new: 'Только что', hot: 'Все шепчутся', top: 'Ярче всех', near: 'Ближе всех' };

  // Те же правила, что в api/stories.php: сплетни — о местах, не о людях.
  const CONTACT_RULES = [
    [/(?<!\d)(?:\+?\d[\s\-()]{0,2}){7,}(?!\d)/u, 'Похоже на номер телефона — уберите его: легенды о местах, а не о конкретных людях.'],
    [/[\w.+-]+@[\w-]+\.[a-z]{2,}/iu, 'Похоже на email — уберите его: легенды о местах, а не о конкретных людях.'],
    [/https?:\/\/|www\./iu, 'Ссылки в историях не публикуются.'],
  ];
  const STORY_FORMS = ['история', 'истории', 'историй'];

  const TEXT_MIN = 20;
  const TEXT_MAX = 2000;
  const FEED_PAGE = 18;
  const MOBILE_QUERY = matchMedia('(max-width: 860px)');

  // ---------------------- Утилиты ----------------------

  async function api(path, { method = 'GET', params, body } = {}) {
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

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(`legends:${key}`); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`legends:${key}`, JSON.stringify(value)); } catch { /* приватный режим */ }
    },
  };

  function plural(n, [one, few, many]) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  const signed = n => (n > 0 ? `+${n}` : String(n));

  // SQLite отдаёт UTC без зоны: «2026-10-06 14:00:00»
  const parseTs = ts => new Date(ts.replace(' ', 'T') + 'Z');

  function timeAgo(ts) {
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

  const fmtDate = ts => parseTs(ts).toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
  const fmtDistance = m => (m < 1000 ? `${Math.round(m / 10) * 10} м` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} км`);
  const fmtClock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const fmtCoords = p => (p && p.lat != null ? `${(+p.lat).toFixed(5)}°, ${(+p.lng).toFixed(5)}°` : '');
  const catColor = key => (CATS[key] || NONE).color;
  const snippet = text => (text.length > 90 ? text.slice(0, 88).trimEnd() + '…' : text);
  const textLength = s => Array.from(s.trim()).length; // как mb_strlen на сервере

  /** Сегменты категорий в точке: [{key, n, color, label}] */
  function mixSegments(mix, total) {
    const segs = Object.entries(CATS)
      .map(([key, c]) => ({ key, n: mix?.[key] || 0, color: c.color, label: c.label }))
      .filter(s => s.n > 0);
    const rest = total - segs.reduce((a, s) => a + s.n, 0);
    if (rest > 0) segs.push({ key: 'none', n: rest, color: NONE.color, label: NONE.label });
    return segs;
  }

  function conic(segs) {
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

  const dominantColor = segs => (segs.length ? segs.reduce((a, b) => (b.n > a.n ? b : a)).color : NONE.color);

  function shortAddress(d) {
    const a = d.address || {};
    const street = a.road || a.pedestrian || a.footway || a.square || a.neighbourhood || a.suburb || '';
    const parts = [];
    if (d.name && d.name !== street) parts.push(d.name);
    if (street) parts.push(a.house_number ? `${street}, ${a.house_number}` : street);
    return parts.join(', ') || (d.display_name || '').split(',').slice(0, 2).join(',').trim();
  }

  // ---------------------- Карточка истории ----------------------

  const StoryCard = {
    name: 'StoryCard',
    props: {
      story: { type: Object, required: true },
      compact: Boolean,
      featured: Boolean,
      showPlace: Boolean,
      ribbon: { type: String, default: '' },
    },
    emits: ['vote', 'report', 'locate'],
    setup(props, { emit }) {
      const expanded = ref(false);
      const confirming = ref(false);
      let confirmTimer = null;

      const cat = computed(() => CATS[props.story.category] || NONE);
      const isLong = computed(() => props.story.text.length > (props.featured ? 560 : props.compact ? 240 : 300));

      // Жалоба в два касания: первое — «Точно?», второе — отправка.
      function askReport() {
        if (props.story.reported) return;
        clearTimeout(confirmTimer);
        if (!confirming.value) {
          confirming.value = true;
          confirmTimer = setTimeout(() => { confirming.value = false; }, 3000);
          return;
        }
        confirming.value = false;
        emit('report', props.story);
      }

      function onCardClick() {
        if (!props.compact) emit('locate', props.story);
      }

      return { expanded, confirming, cat, isLong, askReport, onCardClick, timeAgo, fmtDate, fmtDistance };
    },
    template: `
      <article class="story"
               :class="{ 'story--compact': compact, 'story--featured': featured, 'story--link': !compact }"
               :style="{ '--cat': cat.color }" @click="onCardClick">
        <span v-if="ribbon" class="story__ribbon">{{ ribbon }}</span>
        <header class="story__head">
          <span class="stamp">{{ cat.glyph }} {{ cat.label }}</span>
          <time :datetime="story.created_at" :title="fmtDate(story.created_at)">{{ timeAgo(story.created_at) }}</time>
        </header>

        <p class="story__text" :class="{ 'is-clamped': isLong && !expanded }">{{ story.text }}</p>
        <button v-if="isLong" type="button" class="more" @click.stop="expanded = !expanded">
          {{ expanded ? 'Свернуть' : 'Читать дальше' }}
        </button>

        <footer class="story__foot">
          <button v-if="showPlace" type="button" class="place-chip" title="Показать на карте" @click.stop="$emit('locate', story)">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6 7-11.5a7 7 0 1 0-14 0C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
            <span>{{ story.place.address || 'Точка на карте' }}</span>
            <b v-if="story.distance != null">{{ fmtDistance(story.distance) }}</b>
          </button>
          <span v-else class="spacer"></span>

          <div class="votes" :class="{ 'is-mine': story.mine }" :title="story.mine ? 'Это ваша история' : ''" @click.stop>
            <button type="button" class="vote vote--up" :class="{ 'is-on': story.my_vote === 1 }"
                    :disabled="story.mine || story.busy" aria-label="Верю" title="Верю" @click="$emit('vote', story, 1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>
            </button>
            <span class="score" :class="{ 'is-neg': story.rating < 0 }">{{ story.rating }}</span>
            <button type="button" class="vote vote--down" :class="{ 'is-on': story.my_vote === -1 }"
                    :disabled="story.mine || story.busy" aria-label="Не верю" title="Не верю" @click="$emit('vote', story, -1)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
          </div>

          <button type="button" class="report" :class="{ 'is-confirm': confirming }" :disabled="story.reported"
                  :title="story.reported ? 'Жалоба отправлена' : 'Пожаловаться'" :aria-label="story.reported ? 'Жалоба отправлена' : 'Пожаловаться'"
                  @click.stop="askReport">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>
            <span v-if="confirming">Точно?</span>
          </button>
        </footer>
      </article>`,
  };

  // ---------------------- Приложение ----------------------

  createApp({
    components: { StoryCard },
    setup() {
      const mode      = ref('map');            // при входе всегда карта
      const category  = ref(null);
      const places    = ref([]);
      const panel     = ref('overview');       // overview | place | compose
      const current   = ref(null);             // { place, stories }
      const sheetOpen = ref(false);            // шторка на телефоне
      const locating  = ref(false);
      const userPos   = ref(null);             // { lat, lng } — уходит в API сортировки «рядом»
      const geoAccuracy = ref(0);              // радиус круга точности в метрах
      const whispers  = ref([]);
      const toasts    = ref([]);

      const hud    = reactive({ lat: '', lng: '', zoom: 0 });
      const search = reactive({ q: '', results: [], loading: false, empty: false, open: false });
      const draft  = reactive({
        lat: null, lng: null, place_id: null, address: '', geocoding: false,
        text: '', category: null, sending: false, error: '',
      });
      const savedSort = store.get('feedSort', 'new');
      const feed = reactive({
        items: [], offset: 0, done: false, loading: false, loaded: false,
        sort: savedSort === 'near' ? 'new' : savedSort,   // «рядом» без геопозиции не откроется
      });

      const mapEl = ref(null);
      const feedEl = ref(null);
      const feedEnd = ref(null);
      const draftText = ref(null);
      const searchInput = ref(null);

      // Leaflet-объекты держим вне реактивности — Vue-прокси им только мешают.
      let map = null, markersLayer = null, draftMarker = null, meMarker = null, meCircle = null, feedObserver = null;
      let meWatch = null;   // id слежения за перемещением (watchPosition)
      let lastGeoError = ''; // причина последней неудачи — её показывает подсказка при входе
      const markers = new Map();
      let placeReq = 0, feedReq = 0, geoReq = 0, placesRefreshTimer = null;

      const isMobile = () => MOBILE_QUERY.matches;

      // ── Вычисляемые ──

      const totalStories = computed(() => places.value.reduce((a, p) => a + p.stories, 0));

      const catCounts = computed(() => {
        const counts = Object.fromEntries(Object.keys(CATS).map(k => [k, 0]));
        for (const p of places.value) for (const k in counts) counts[k] += p.mix[k] || 0;
        return counts;
      });

      const topCategory = computed(() => {
        const [key, n] = Object.entries(catCounts.value).sort((a, b) => b[1] - a[1])[0] || [];
        return n ? CATS[key] : NONE;
      });

      const visiblePlaces = computed(() =>
        category.value ? places.value.filter(p => (p.mix[category.value] || 0) > 0) : places.value);

      const hotPlaces = computed(() => [...visiblePlaces.value].sort((a, b) => b.rating - a.rating).slice(0, 5));

      const placeRating = computed(() => (current.value ? current.value.stories.reduce((a, s) => a + s.rating, 0) : 0));

      const placeMix = computed(() => {
        if (!current.value) return [];
        const mix = {};
        for (const s of current.value.stories) if (s.category) mix[s.category] = (mix[s.category] || 0) + 1;
        return mixSegments(mix, current.value.stories.length);
      });

      const draftLen  = computed(() => textLength(draft.text));
      const draftIssue = computed(() => CONTACT_RULES.find(([re]) => re.test(draft.text))?.[1] || '');
      const draftOk   = computed(() => draftLen.value >= TEXT_MIN && draftLen.value <= TEXT_MAX && !draftIssue.value);
      const draftFill = computed(() => `${Math.min(100, (draftLen.value / TEXT_MAX) * 100).toFixed(2)}%`);
      const draftHint = computed(() => {
        if (draftLen.value < TEXT_MIN) return `ещё ${TEXT_MIN - draftLen.value} ${plural(TEXT_MIN - draftLen.value, ['символ', 'символа', 'символов'])} до публикации`;
        if (draftLen.value > TEXT_MAX - 150) return `осталось ${TEXT_MAX - draftLen.value}`;
        return 'готово к публикации';
      });

      const handleText = computed(() => {
        if (panel.value === 'compose') return 'Новая легенда';
        if (panel.value === 'place') return current.value?.place.address || 'Точка на карте';
        return `${totalStories.value} ${plural(totalStories.value, STORY_FORMS)} на карте`;
      });

      const feedTitle    = computed(() => FEED_TITLES[feed.sort]);
      const ribbon       = computed(() => RIBBONS[feed.sort]);
      const whispersLoop = computed(() => [...whispers.value, ...whispers.value]);

      // ── Уведомления ──

      function toast(text, kind = 'info') {
        const id = Date.now() + Math.random();
        toasts.value.push({ id, text, kind });
        setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, 4200);
      }

      // ── Карта ──

      function initMap() {
        const saved = store.get('mapView', null);
        map = L.map(mapEl.value, { zoomControl: false, minZoom: 3, worldCopyJump: true })
          .setView(saved?.center || CITY.center, saved?.zoom || CITY.zoom);

        // Стандартные тайлы OSM; «ночной» вид делает CSS-фильтр (.map .leaflet-tile-pane).
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        L.control.zoom({ position: 'bottomright', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map);
        markersLayer = L.layerGroup().addTo(map);

        // Контейнер меняет размер при снятии v-cloak, смене режима и раскладки — Leaflet нужно об этом знать.
        new ResizeObserver(() => map.invalidateSize()).observe(mapEl.value);

        map.on('click', e => startCompose({ lat: e.latlng.lat, lng: e.latlng.lng }));
        map.on('move', updateHud);
        map.on('moveend', () => {
          const c = map.getCenter();
          store.set('mapView', { center: [+c.lat.toFixed(5), +c.lng.toFixed(5)], zoom: map.getZoom() });
        });
        updateHud();
        return Boolean(saved);
      }

      function updateHud() {
        const c = map.getCenter();
        hud.lat = c.lat.toFixed(4);
        hud.lng = c.lng.toFixed(4);
        hud.zoom = map.getZoom();
      }

      /** На телефоне шторка закрывает низ карты — сдвигаем цель в видимую часть. */
      function flyTo(lat, lng, zoom = map.getZoom()) {
        let target = L.latLng(lat, lng);
        const sheet = document.querySelector('.side');
        if (isMobile() && sheetOpen.value && sheet) {
          target = map.unproject(map.project(target, zoom).add([0, sheet.offsetHeight / 2]), zoom);
        }
        map.flyTo(target, zoom, { duration: 0.8 });
      }

      function renderMarkers() {
        if (!map) return;
        markersLayer.clearLayers();
        markers.clear();
        const selectedId = panel.value === 'place' ? current.value?.place.id : null;

        for (const p of visiblePlaces.value) {
          const count = category.value ? p.mix[category.value] : p.stories;
          const size = Math.round(Math.min(84, 30 + Math.sqrt(Math.max(0, p.rating) + count * 4) * 4.2));
          const segs = mixSegments(p.mix, p.stories);
          const cls = ['orb', p.rating >= 40 && 'orb--hot', p.id === selectedId && 'is-selected'].filter(Boolean).join(' ');
          const style = `--s:${size}px;--ring:${conic(segs)};--glow:${dominantColor(segs)};--d:${((p.id * 0.73) % 3).toFixed(2)}s`;

          const marker = L.marker([p.lat, p.lng], {
            icon: L.divIcon({ className: 'orb-icon', iconSize: [size, size], html: `<div class="${cls}" style="${style}"><b>${count}</b></div>` }),
            title: p.address || 'Точка с историями',
            riseOnHover: true,
            zIndexOffset: p.id === selectedId ? 1000 : Math.round(size),
          }).on('click', () => openPlace(p.id));

          marker.addTo(markersLayer);
          markers.set(p.id, marker);
        }
      }

      function setSelected(id) {
        for (const [pid, m] of markers) {
          m.getElement()?.querySelector('.orb')?.classList.toggle('is-selected', pid === id);
          m.setZIndexOffset(pid === id ? 1000 : 0);
        }
      }

      function placeDraftMarker(lat, lng) {
        if (!map) return;
        if (!draftMarker) {
          draftMarker = L.marker([lat, lng], {
            draggable: true,
            zIndexOffset: 2000,
            icon: L.divIcon({ className: 'drop-icon', iconSize: [48, 48], html: '<div class="drop"><i></i></div>' }),
          }).on('dragend', () => {
            const { lat: la, lng: ln } = draftMarker.getLatLng();
            draft.lat = la; draft.lng = ln; draft.place_id = null;
            reverseGeocode(la, ln);
          });
          draftMarker.addTo(map);
        } else {
          draftMarker.setLatLng([lat, lng]);
        }
      }

      function removeDraftMarker() {
        if (draftMarker) { draftMarker.remove(); draftMarker = null; }
      }

      function drawMe() {
        const { lat, lng } = userPos.value;
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

      /** Круг точности вокруг синей точки — как ореол в Google Maps.
       *  При точности лучше 25 м он только «мылит» точку, поэтому его не рисуем. */
      function drawAccuracy() {
        const { lat, lng } = userPos.value;
        const radius = geoAccuracy.value;
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

      // ── Данные ──

      async function loadPlaces() {
        try {
          places.value = await api('places.php');
          renderMarkers();
        } catch (e) {
          toast(e.message, 'error');
        }
      }

      function schedulePlacesRefresh() {
        clearTimeout(placesRefreshTimer);
        placesRefreshTimer = setTimeout(loadPlaces, 900);
      }

      async function loadWhispers() {
        try {
          whispers.value = (await api('stories.php', { params: { sort: 'new', limit: 10 } })).items;
        } catch { /* бегущая строка — необязательное украшение */ }
      }

      async function loadFeed(reset = false) {
        if (!reset && (feed.loading || feed.done)) return;
        const token = ++feedReq;
        if (reset) {
          feed.items = []; feed.offset = 0; feed.done = false;
          if (feedEl.value) feedEl.value.scrollTop = 0;
        }
        feed.loading = true;
        try {
          const params = { sort: feed.sort, category: category.value, offset: feed.offset, limit: FEED_PAGE };
          if (userPos.value) Object.assign(params, userPos.value);
          const res = await api('stories.php', { params });
          if (token !== feedReq) return;
          feed.items.push(...res.items);
          feed.offset += res.items.length;
          feed.done = !res.has_more;
        } catch (e) {
          if (token !== feedReq) return;
          toast(e.message, 'error');
          feed.done = true;
        } finally {
          if (token === feedReq) {
            feed.loading = false;
            feed.loaded = true;
            // Если после подгрузки «хвост» ленты всё ещё на экране — наблюдатель сработает снова.
            nextTick(() => {
              if (feedObserver && feedEnd.value) { feedObserver.unobserve(feedEnd.value); feedObserver.observe(feedEnd.value); }
            });
          }
        }
      }

      async function setSort(key) {
        if (key === feed.sort) return;
        if (key === 'near' && !userPos.value && !(await locate({ fly: false }))) return;
        feed.sort = key;
        store.set('feedSort', key);
        loadFeed(true);
      }

      function patchStory(id, patch) {
        const lists = [feed.items, current.value?.stories || [], whispers.value];
        for (const list of lists) for (const s of list) if (s.id === id) Object.assign(s, patch);
      }

      function dropStory(id) {
        feed.items = feed.items.filter(s => s.id !== id);
        whispers.value = whispers.value.filter(s => s.id !== id);
        if (current.value) current.value.stories = current.value.stories.filter(s => s.id !== id);
      }

      // ── Панель точки ──

      async function openPlace(id, { fly = true } = {}) {
        const token = ++placeReq;
        leaveDraft();
        if (current.value?.place.id !== id) current.value = null;
        panel.value = 'place';
        sheetOpen.value = true;
        setSelected(id);
        try {
          const data = await api('places.php', { params: { id } });
          if (token !== placeReq) return;
          current.value = data;
          if (fly && map) flyTo(data.place.lat, data.place.lng, Math.max(map.getZoom(), 16));
        } catch (e) {
          if (token !== placeReq) return;
          toast(e.message, 'error');
          closePanel();
        }
      }

      function closePanel() {
        placeReq++;
        leaveDraft();
        panel.value = 'overview';
        current.value = null;
        setSelected(null);
        if (isMobile()) sheetOpen.value = false;
      }

      function showOnMap(story) {
        mode.value = 'map';
        nextTick(() => {
          map.invalidateSize();
          openPlace(story.place.id);
        });
      }

      // ── Новая история ──

      function startCompose({ lat, lng, place = null }) {
        placeReq++;
        if (mode.value !== 'map') mode.value = 'map';
        draft.error = '';
        if (place) {
          Object.assign(draft, { place_id: place.id, lat: place.lat, lng: place.lng, address: place.address || '', geocoding: false });
          geoReq++;
        } else {
          Object.assign(draft, { place_id: null, lat, lng });
          reverseGeocode(lat, lng);
        }
        panel.value = 'compose';
        sheetOpen.value = true;
        setSelected(place ? place.id : null);
        placeDraftMarker(draft.lat, draft.lng);
      }

      /** Убирает метку черновика; текст сохраняется — вдруг пользователь просто перепутал точку. */
      function leaveDraft() {
        geoReq++;
        draft.geocoding = false;
        removeDraftMarker();
      }

      function cancelDraft() {
        const backTo = draft.place_id;
        leaveDraft();
        if (backTo) openPlace(backTo, { fly: false });
        else closePanel();
      }

      async function reverseGeocode(lat, lng) {
        const token = ++geoReq;
        draft.geocoding = true;
        draft.address = '';
        try {
          const url = new URL('https://nominatim.openstreetmap.org/reverse');
          url.search = new URLSearchParams({ format: 'jsonv2', zoom: '18', 'accept-language': 'ru', lat, lon: lng });
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const data = await res.json();
          if (token === geoReq) draft.address = shortAddress(data);
        } catch {
          /* без адреса тоже можно публиковать */
        } finally {
          if (token === geoReq) draft.geocoding = false;
        }
      }

      async function submitDraft() {
        if (draft.sending) return;
        if (!draftOk.value) {
          draft.error = draftIssue.value || (draftLen.value < TEXT_MIN
            ? `Минимум ${TEXT_MIN} символов — расскажите чуть подробнее.`
            : `Максимум ${TEXT_MAX} символов.`);
          draftText.value?.focus();
          return;
        }
        draft.sending = true;
        draft.error = '';
        try {
          const story = await api('stories.php', {
            method: 'POST',
            body: {
              text: draft.text.trim(),
              category: draft.category,
              lat: draft.lat,
              lng: draft.lng,
              address: draft.address || null,
              place_id: draft.place_id,
            },
          });
          draft.text = '';
          draft.category = null;
          leaveDraft();
          toast('Легенда записана. Город запомнит.', 'ok');
          await loadPlaces();
          openPlace(story.place.id);
          loadWhispers();
          if (feed.loaded) loadFeed(true);
        } catch (e) {
          draft.error = e.status === 429 && e.data?.retry_after
            ? `Подождите ${fmtClock(e.data.retry_after)} перед следующей публикацией.`
            : e.message;
        } finally {
          draft.sending = false;
        }
      }

      // ── Голоса и жалобы ──

      async function vote(story, value) {
        if (story.mine || story.busy) return;
        story.busy = true;
        try {
          const res = await api('vote.php', { method: 'POST', body: { story_id: story.id, value } });
          patchStory(story.id, { likes: res.likes, dislikes: res.dislikes, rating: res.rating, my_vote: res.my_vote });
          schedulePlacesRefresh();
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          story.busy = false;
        }
      }

      async function report(story) {
        try {
          const res = await api('report.php', { method: 'POST', body: { story_id: story.id } });
          patchStory(story.id, { reported: true });
          if (res.hidden) {
            dropStory(story.id);
            loadPlaces();
            toast('История скрыта и отправлена на модерацию.', 'ok');
          } else {
            toast('Жалоба принята. Спасибо, что бережёте город.', 'ok');
          }
        } catch (e) {
          if (e.status === 409) patchStory(story.id, { reported: true });
          toast(e.message, 'error');
        }
      }

      // ── Геолокация ──
      //
      // Порядок как в Google Maps: сначала быстрый черновой замер (при enableHighAccuracy: false
      // браузер считает его по окружающим сетям и отдаёт за доли секунды), затем уточнение
      // в режиме высокой точности и слежение за перемещением. Раньше сразу запрашивалась
      // высокая точность: на ноутбуке без GPS-чипа такой запрос часто упирается в timeout.

      const GEO_FINE   = { enableHighAccuracy: true,  timeout: 12000, maximumAge: 15000 };
      const GEO_COARSE = { enableHighAccuracy: false, timeout: 6000,  maximumAge: 300000 };

      /** Вместо кода GeolocationPositionError — что именно делать пользователю. */
      function geoTrouble(err) {
        if (err.code === 1) {
          return 'Доступ к геопозиции запрещён: нажмите на замок слева от адреса → «Местоположение» → «Разрешить» и обновите страницу.';
        }
        if (err.code === 2) {
          return 'Браузер не смог определить координаты. Проверьте: Windows → Параметры → Конфиденциальность и защита → Местоположение — службы определения местоположения включены, доступ классическим приложениям разрешён.';
        }
        return 'Определение местоположения заняло слишком много времени. Попробуйте ещё раз или поставьте точку на карте вручную.';
      }

      function applyFix(pos, { fly = false } = {}) {
        const { latitude: lat, longitude: lng, accuracy = 0 } = pos.coords;
        userPos.value = { lat, lng };
        geoAccuracy.value = Math.round(accuracy);
        drawMe();
        drawAccuracy();
        if (!fly) return;
        mode.value = 'map';
        // При грубом замере (километры) приближаться вплотную бессмысленно.
        nextTick(() => { map.invalidateSize(); flyTo(lat, lng, accuracy > 300 ? 15 : 16); });
      }

      /** Точка едет за пользователем, как в Google Maps. */
      function trackMe() {
        if (meWatch !== null || !('geolocation' in navigator)) return;
        meWatch = navigator.geolocation.watchPosition(
          pos => applyFix(pos),
          () => { /* черновое положение уже показано — уточнение необязательно */ },
          GEO_FINE,
        );
      }

      /** Перестаём опрашивать датчики, пока вкладка скрыта: на телефоне это экономит батарею. */
      function stopTracking() {
        if (meWatch === null) return;
        navigator.geolocation.clearWatch(meWatch);
        meWatch = null;
      }

      function locate({ fly = true, silent = false } = {}) {
        const fail = (message, err) => {
          locating.value = false;
          lastGeoError = message;
          if (silent) console.warn('[геолокация]', message, err || '');
          else toast(message, 'error');
          return false;
        };

        if (!('geolocation' in navigator)) {
          return Promise.resolve(fail('Геолокация недоступна в этом браузере.'));
        }

        // Координаты отдаются только «доверенному» источнику: https, localhost или 127.0.0.1.
        // Файл с диска и адрес вида http://192.168.x.x или http://mysite.local не подходят —
        // там запрос падает сразу и без диалога о разрешении, что и выглядит как «не определяется».
        if (location.protocol === 'file:' || !window.isSecureContext) {
          return Promise.resolve(fail(
            'Браузер отдаёт геопозицию только на https или на localhost, а сайт открыт не оттуда. '
            + 'Запустите php -S localhost:8000 router.php и откройте http://localhost:8000.',
          ));
        }

        locating.value = true;
        return new Promise(resolve => {
          const ok = pos => {
            locating.value = false;
            applyFix(pos, { fly });
            trackMe();
            if (!silent) toast(`Местоположение определено · точность ±${Math.round(pos.coords.accuracy)} м`, 'ok');
            resolve(true);
          };
          const refine = () => navigator.geolocation.getCurrentPosition(ok, err => {
            locating.value = false;
            lastGeoError = geoTrouble(err);
            if (silent) console.warn('[геолокация]', err.code, err.message);
            else toast(lastGeoError, 'error');
            resolve(false);
          }, GEO_FINE);

          navigator.geolocation.getCurrentPosition(ok, refine, GEO_COARSE);
        });
      }

      async function addNearby() {
        if (!userPos.value && !(await locate({ fly: false }))) {
          toast('Нажмите на карту в нужном месте — история привяжется к нему.', 'info');
          return;
        }
        startCompose({ lat: userPos.value.lat, lng: userPos.value.lng });
        flyTo(userPos.value.lat, userPos.value.lng, 17);
      }

      // ── Поиск (Nominatim) ──

      function openSearch() {
        search.open = true;
        nextTick(() => searchInput.value?.focus());
      }

      function closeSearch() {
        search.open = false;
        searchInput.value?.blur();
      }

      async function runSearch() {
        const q = search.q.trim();
        if (q.length < 3) return;
        Object.assign(search, { loading: true, empty: false, open: true, results: [] });
        try {
          const b = map.getBounds();
          const url = new URL('https://nominatim.openstreetmap.org/search');
          url.search = new URLSearchParams({
            q, format: 'jsonv2', limit: '6', addressdetails: '1', 'accept-language': 'ru',
            viewbox: [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(','),
          });
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          search.results = (await res.json()).map(d => ({
            id: d.place_id, lat: +d.lat, lng: +d.lon,
            title: d.name || shortAddress(d), subtitle: d.display_name,
          }));
          search.empty = !search.results.length;
        } catch {
          toast('Поиск сейчас недоступен, попробуйте позже.', 'error');
        } finally {
          search.loading = false;
        }
      }

      function pickSearch(r) {
        search.q = r.title;
        closeSearch();
        mode.value = 'map';
        nextTick(() => { map.invalidateSize(); flyTo(r.lat, r.lng, 17); });
      }

      function goHome() {
        mode.value = 'map';
        closePanel();
        nextTick(() => { map.invalidateSize(); map.flyTo(CITY.center, CITY.zoom, { duration: 0.8 }); });
      }

      const placeRing = p => conic(mixSegments(p.mix, p.stories));

      // ── Реакции ──

      watch(mode, m => {
        if (m !== 'feed') return;
        closeSearch();
        sheetOpen.value = false;
        if (!feed.loaded) loadFeed(true);
      });

      watch(category, () => {
        renderMarkers();
        if (feed.loaded) loadFeed(true);
      });

      // Фокус в поле истории после анимации смены панели (на телефоне не открываем клавиатуру сами).
      watch(draftText, el => { if (el && !isMobile()) el.focus({ preventScroll: true }); });

      onMounted(() => {
        const hadSavedView = initMap();
        loadPlaces();
        loadWhispers();
        // Точка появляется сама, как в Google Maps. Если не вышло — один раз объясняем причину:
        // молчаливый отказ выглядел просто как «карта не нашла меня».
        locate({ silent: true, fly: !hadSavedView }).then(ok => {
          if (!ok) toast(lastGeoError || 'Местоположение не определено.', 'info');
        });

        // Пока вкладка скрыта, датчики не опрашиваем; при возврате — снова следим за перемещением.
        document.addEventListener('visibilitychange', () => {
          if (!userPos.value) return;
          if (document.hidden) stopTracking();
          else trackMe();
        });

        feedObserver = new IntersectionObserver(entries => {
          if (mode.value === 'feed' && feed.loaded && entries.some(e => e.isIntersecting)) loadFeed();
        }, { root: feedEl.value, rootMargin: '600px 0px' });
        feedObserver.observe(feedEnd.value);

        document.addEventListener('pointerdown', e => {
          if (search.open && !e.target.closest('.search')) search.open = false;
        });
        document.addEventListener('keydown', e => {
          if (e.key !== 'Escape' || search.open) return;
          if (panel.value === 'compose') cancelDraft();
          else if (panel.value === 'place') closePanel();
          else if (isMobile()) sheetOpen.value = false;
        });
      });

      return {
        // константы и форматтеры для шаблона
        CITY, CATS, SORTS, STORY_FORMS, TEXT_MAX,
        plural, signed, fmtCoords, catColor, snippet, placeRing,
        // состояние
        mode, category, places, panel, current, sheetOpen, locating, whispers, toasts, geoAccuracy,
        hud, search, draft, feed,
        mapEl, feedEl, feedEnd, draftText, searchInput,
        // вычисляемые
        totalStories, catCounts, topCategory, hotPlaces, placeRating, placeMix,
        draftLen, draftOk, draftIssue, draftFill, draftHint, handleText, feedTitle, ribbon, whispersLoop,
        // действия
        openPlace, closePanel, showOnMap, startCompose, cancelDraft, submitDraft,
        vote, report, locate, addNearby, setSort,
        openSearch, closeSearch, runSearch, pickSearch, goHome,
      };
    },
  }).mount('#app');
})();
