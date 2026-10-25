/**
 * Геолокация: разовое определение, слежение за перемещением, понятные тексты ошибок.
 * Сначала быстрый черновой замер, затем уточнение в режиме высокой точности.
 */
import { mode, userPos, geoAccuracy, locating, lastGeoError, toast } from './state.js';
import { GEO_FINE, GEO_COARSE } from './constants.js';
import { drawMe, drawAccuracy, invalidateSize } from './map.js';
import { flyToPoint } from './places.js';

const { nextTick } = Vue;

let watchId = null;

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
  drawMe(userPos.value);
  drawAccuracy(userPos.value, geoAccuracy.value);
  if (!fly) return;
  mode.value = 'map';
  // При грубом замере (километры) приближаться вплотную бессмысленно.
  nextTick(() => { invalidateSize(); flyToPoint(lat, lng, accuracy > 300 ? 15 : 16); });
}

/** Точка едет за пользователем, как в Google Maps. */
export function trackMe() {
  if (watchId !== null || !('geolocation' in navigator)) return;
  watchId = navigator.geolocation.watchPosition(
    pos => applyFix(pos),
    () => { /* черновое положение уже показано — уточнение необязательно */ },
    GEO_FINE,
  );
}

/** Перестаём опрашивать датчики, пока вкладка скрыта: на телефоне это экономит батарею. */
export function stopTracking() {
  if (watchId === null) return;
  navigator.geolocation.clearWatch(watchId);
  watchId = null;
}

export function locate({ fly = true, silent = false } = {}) {
  const fail = (message, err) => {
    locating.value = false;
    lastGeoError.value = message;
    if (silent) console.warn('[геолокация]', message, err || '');
    else toast(message, 'error');
    return false;
  };

  if (!('geolocation' in navigator)) {
    return Promise.resolve(fail('Геолокация недоступна в этом браузере.'));
  }

  // Координаты отдаются только «доверенному» источнику: https, localhost или 127.0.0.1.
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
      lastGeoError.value = geoTrouble(err);
      if (silent) console.warn('[геолокация]', err.code, err.message);
      else toast(lastGeoError.value, 'error');
      resolve(false);
    }, GEO_FINE);

    navigator.geolocation.getCurrentPosition(ok, refine, GEO_COARSE);
  });
}
