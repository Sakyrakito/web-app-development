# Технический аудит: Historypin

Каждое утверждение в отчёте ссылается на файл в [`evidence/`](evidence/), из которого оно получено.
Если признака нет в собранных данных — он не упоминается или помечен как «не обнаружено».
Консольные сниппеты лежат в [`../snippets/`](../snippets/); порядок воспроизведения — в конце отчёта.

## Условия проверки

| Параметр | Значение |
|---|---|
| Дата и время | 2026-09-23, 20:50–20:56 (UTC+3) |
| Браузер | Google Chrome 152.0.7977.82, Linux |
| Сеть | Wi-Fi, дом, 100 Мбит/с |
| DNS в браузере | Secure DNS (DoH): `https://cloudflare-dns.com/dns-query` |
| Профиль | чистый (без cookies, расширений и кэша) |
| Страница | главная, `https://www.historypin.org/`, без прокрутки и кликов |
| Баннер согласия на cookies | не показывался (в DOM его нет) |

## 1. Название ресурса

**Historypin** — заголовок страницы `Home | Historypin`, описание в подвале:
«Historypin is a place for people around the globe to bring their stories to life.»
Организация-владелец на главной странице текстом не указана.

## 2. Адрес ресурса

<https://www.historypin.org/>

## 3. Архитектура и технологический стек

Сервер не отдаёт заголовков `x-powered-by` / `<meta name="generator">`
([`stack.json`](evidence/stack.json), [`document-headers.txt`](evidence/document-headers.txt)),
поэтому стек восстановлен только по документированным маркерам.

| Слой | Наблюдаемый артефакт | Что он означает (источник) |
|---|---|---|
| CDN / прокси | `server: cloudflare`, `cf-ray`, `cf-cache-status: DYNAMIC` ([headers](evidence/document-headers.txt)) | Ответ проходит через Cloudflare |
| Защита от ботов | cookie `__cf_bm` (HttpOnly), cookie `cf_clearance`, скрипт `/cdn-cgi/challenge-platform/.../jsd/main.js` ([network](evidence/network-requests.txt) #37–39) | Cloudflare Bot Management / JavaScript detections ([cookies](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/), [JS detections](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/)) |
| Бэкенд | cookie `csrftoken`; скрытое поле `csrfmiddlewaretoken` (2 шт.) в HTML ([markers](evidence/document-markers.txt)) | Имя cookie по умолчанию в Django ([CSRF_COOKIE_NAME](https://docs.djangoproject.com/en/stable/ref/settings/#csrf-cookie-name)) и имя поля, которое рендерит `{% csrf_token %}` ([Django CSRF](https://docs.djangoproject.com/en/stable/howto/csrf/)) |
| Бэкенд | статика вида `main.5a02606b4a87.css` — 12 hex-символов перед расширением ([network](evidence/network-requests.txt)) | Совпадает с форматом `ManifestStaticFilesStorage` Django, например `styles.55e7cbb9ba48.css` ([docs](https://docs.djangoproject.com/en/stable/ref/contrib/staticfiles/)) |
| Шаблоны | атрибуты `data-djc-id-*` (11 шт.) в HTML; скрипт `/static/django_components/django_components.min.js` | Атрибуты, которые проставляет библиотека django-components ([issue #1650](https://github.com/django-components/django-components/issues/1650)) |
| Фронтенд | глобальный объект `htmx`; атрибуты `hx-get` (2), `hx-post` (2), `hx-headers` (1); скрипт `/static/django_htmx/htmx.min.js` | Используется [htmx](https://htmx.org/). Префикс `django_htmx/` совпадает с пакетом django-htmx ([исходник](https://github.com/adamchainz/django-htmx/blob/main/src/django_htmx/jinja.py)), но имя файла `htmx.min.js` не совпадает с текущей схемой именования пакета — использование пакета не подтверждено |
| Фронтенд | глобальный объект `Alpine`; скрипт `unpkg.com/alpinejs@3.14.8`; атрибуты `x-data` (4), `@click` (17), `x-show` (10) | [Alpine.js](https://alpinejs.dev/) 3.14.8, подключён с CDN unpkg |
| Иконки | `cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css` | Font Awesome 6.7.2 с CDN cdnjs |
| Прочее | заголовки `x-do-app-origin`, `x-do-orig-status` | Присутствуют; официальной документации по ним не найдено, интерпретация не даётся |

Не обнаружено: React, Vue, Angular, Next.js, Nuxt, jQuery, WordPress ([`stack.json`](evidence/stack.json) — `globalsPresent`, `domMarkers`).

**Логика работы.** HTML формируется на сервере (в ответе на запрос документа уже есть весь контент, 111 940 байт).
Интерактивность — атрибутами в разметке: Alpine.js (`x-data`, `@click`, `x-show`) и htmx (`hx-get`, `hx-post`).
За загрузку главной страницы выполняется 43 запроса ([network](evidence/network-requests.txt)): 1 документ,
30 — статика со своего домена, 3 — Cloudflare challenge, 4 — CDN (cdnjs ×3, unpkg ×1), 1 — `data:`-URI (иконка),
4 — Google (Tag Manager ×2, Analytics ×2).

**Заголовки безопасности** ([headers](evidence/document-headers.txt)): `x-frame-options: DENY`,
`x-content-type-options: nosniff`, `referrer-policy: same-origin`, `cross-origin-opener-policy: same-origin`.
Заголовок `content-security-policy` отсутствует.

## 4. Семантические элементы HTML5

Источник: [`semantic.json`](evidence/semantic.json). Всего `<div>` на странице — 195.

| Элемент | Кол-во | Для чего используется (по классу / aria-label / первому заголовку) |
|---|---|---|
| `<header>` | 1 | `header.navigation` — шапка сайта с навигацией |
| `<nav>` | 2 | `aria-label="Main site menu"` — основное меню; `aria-label="Mobile site menu"` — мобильное меню |
| `<main>` | 1 | `main.main-content` — основной контент страницы |
| `<section>` | 8 | Блоки главной: hero («Our history is all of us»), темы коллекций, «What you can create with Historypin», пожертвования (2 блока), «Featured collections», отзывы, «How can Historypin help you tell your story?» |
| `<footer>` | 1 | подвал сайта |
| `<picture>` | 3 | Изображения hero-блока; одно — `home-hero-picture-mobile` (отдельная картинка для мобильных) |
| `article`, `aside`, `figure`, `figcaption`, `time`, `address`, `mark`, `details`, `summary`, `dialog`, `search`, `hgroup` | 0 | — |

## 5. Семантические классы при вёрстке `<div>`

Источник: [`div-classes.json`](evidence/div-classes.json). Из 195 `<div>` класс есть у 193, различных классов — 62.
Классы описывают назначение блока (в стиле, близком к БЭМ, но с дефисами вместо `__`/`--`). Примеры:

- `collection-card`, `collection-card-description`, `collection-card-owner`, `collection-card-featured-tag` — карточка коллекции и её части;
- `navigation-left`, `navigation-right`, `mobile-navigation`, `mobile-menu`, `language-switcher` — навигация;
- `testimonials-carousel`, `testimonial-slide`, `testimonial-indicators` — карусель отзывов;
- `footer-main`, `footer-social-links`, `footer-description` — подвал;
- `home-hero-container`, `home-hero-content` — первый экран.

Утилитарных/хэшированных классов (вида `css-1x2y3z`) в выборке (60 самых частых из 62) нет; единственный класс-состояние — `active`.

## 6. Адаптивность

Источник: [`media.json`](evidence/media.json), скриншоты в [`evidence/screenshots/`](evidence/screenshots/).

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` присутствует.
- Все таблицы стилей доступны для чтения (`unreadable: []`); найдено **19 различных media-запросов**.
- 16 из 19 запросов используют `max-width` — подход «desktop-first» (базовые стили для широкого экрана, переопределения для узких).
- Основная точка перелома — `max-width: 768px` (88 правил в `screen and (max-width: 768px)` + 8 в `(max-width: 768px)`).
- Прочие точки перелома: 389, 481, 578, 632, 816, 900, 910, 1024, 1093, 1096, 1108, 1327, 1368, 1580 px (max-width); 768 и 769 px (min-width).
- `(prefers-reduced-motion: reduce)` — 1 правило, из таблицы Font Awesome.

| 375 px | 768 px | 1440 px |
|---|---|---|
| ![375](evidence/screenshots/375.png) | ![768](evidence/screenshots/768.png) | ![1440](evidence/screenshots/1440.png) |
| меню-«гамбургер», hero-блок в одну колонку | меню-«гамбургер», кнопка на всю ширину | полное меню (Discover / Create / About / Language / Log in / Sign Up) |

## 7. Lighthouse

Lighthouse 13.5.0 (CLI), по 3 прогона на каждый режим, в таблице — медиана по каждому столбцу.
Команда: [`../run-lighthouse.sh`](../run-lighthouse.sh) `historypin https://www.historypin.org/`;
сводка: `node ../summarize-lighthouse.mjs historypin`. Полные отчёты — [`evidence/lighthouse/`](evidence/lighthouse/)
(`*.report.html` открываются в браузере).

Режимы эмуляции (из `configSettings` в JSON-отчётах, метод `simulate`):
- **Mobile:** moto g power (2022), экран 412×823, RTT 150 мс, 1,6 Мбит/с, замедление CPU ×4.
- **Desktop:** экран 1350×940, RTT 40 мс, 10 Мбит/с, без замедления CPU.

| Прогон | Performance | Accessibility | Best Practices | SEO | FCP, s | LCP, s | TBT, ms | CLS | SI, s |
|---|---|---|---|---|---|---|---|---|---|
| mobile-1 | 68 | 100 | 81 | 92 | 1.9 | 3.4 | 483 | 0.000 | 35.3 |
| mobile-2 | 75 | 100 | 81 | 100 | 1.9 | 3.4 | 344 | 0.000 | 7.4 |
| mobile-3 | 74 | 100 | 81 | 100 | 1.9 | 3.4 | 354 | 0.000 | 7.6 |
| **Mobile, медиана** | **74** | **100** | **81** | **100** | **1.9** | **3.4** | **354** | **0.000** | **7.6** |
| desktop-1 | 89 | 100 | 81 | 100 | 0.6 | 0.8 | 18 | 0.005 | 17.4 |
| desktop-2 | 94 | 100 | 81 | 100 | 0.6 | 0.8 | 19 | 0.005 | 2.3 |
| desktop-3 | 95 | 100 | 81 | 92 | 0.6 | 0.8 | 18 | 0.004 | 2.3 |
| **Desktop, медиана** | **94** | **100** | **81** | **100** | **0.6** | **0.8** | **18** | **0.005** | **2.3** |

**Выбросы.** В первых прогонах сервер отвечал на запрос документа 21 410 мс (mobile-1) и 26 620 мс (desktop-1)
(аудит `server-response-time`), отсюда Speed Index 35,3 и 17,4 с. SEO 92 в mobile-1 и desktop-3 — это аудит `robots-txt`
с ошибкой «Fetch of robots.txt failed: Timed out fetching resource», то есть таймаут загрузки файла, а не ошибка в нём.

**Основные замечания** (медианные прогоны mobile-3 / desktop-2):
- **Performance:** изображения не оптимизированы (`image-delivery-insight`: экономия 859 КиБ на mobile, 4 213 КиБ на desktop;
  общий вес страницы на desktop — 5 707 КиБ); неиспользуемый JS — 137 КиБ, неиспользуемый CSS — 18–30 КиБ;
  блокирующие рендеринг ресурсы; у изображений не заданы размеры (`unsized-images`); на mobile время до интерактивности — 10,3 с.
- **Best Practices (81):** единственный проваленный аудит — `deprecations`: 3 устаревших API (Shared Storage, `StorageType.persistent`,
  Protected Audience), все три — из скрипта Cloudflare `/cdn-cgi/challenge-platform/scripts/jsd/main.js`.
- **Accessibility (100)** и **SEO (100)** — проваленных аудитов в медианных прогонах нет.

## 8. Локальное хранилище и cookies

Источники: [`storage.json`](evidence/storage.json) (что видно из JS) и [`document-headers.txt`](evidence/document-headers.txt) (`Set-Cookie`, включая HttpOnly).

- `localStorage` — пусто; `sessionStorage` — пусто.
- Полнота списка cookies проверена независимой записью [`network-log.json`](evidence/network-log.json)
  (скрипт [`../record-network.mjs`](../record-network.mjs), CDP `Storage.getCookies` — все cookies браузера, включая HttpOnly и сторонние):
  те же 5 cookies, сторонних нет; там же — те же 43 запроса.

| Cookie | Кем установлен | Атрибуты | Назначение (источник) |
|---|---|---|---|
| `csrftoken` | сервер (`Set-Cookie` документа) | Secure, SameSite=Lax, 1 год | CSRF-токен Django ([docs](https://docs.djangoproject.com/en/stable/ref/settings/#csrf-cookie-name)) |
| `__cf_bm` | Cloudflare (`Set-Cookie` документа) | **HttpOnly**, Secure, SameSite=None, 30 мин | Bot Management ([Cloudflare](https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/)) |
| `cf_clearance` | Cloudflare (`Set-Cookie` запроса challenge-platform) | **HttpOnly**, Secure, SameSite=None, Partitioned, 1 год | Результат JavaScript detections ([Cloudflare](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/)) |
| `_ga` | JS (Google Analytics) | — | Различение пользователей, 2 года ([Google](https://business.safety.google/adscookies/)) |
| `_ga_GCQC5WS5N1` | JS (Google Analytics) | — | Cookie `_ga_<id>` Google Analytics, 2 года ([Google](https://business.safety.google/adscookies/)); суффикс совпадает с идентификатором `G-GCQC5WS5N1` |

## 9. Маркетинговые инструменты и аналитика

Источник: [`network-requests.txt`](evidence/network-requests.txt). Фильтр Network по ключевым словам задания:

| Ключевое слово | Найденные запросы |
|---|---|
| `tagmanager` | `googletagmanager.com/gtm.js?id=GTM-K2CK5LGL` (#19), `googletagmanager.com/gtag/js?id=G-GCQC5WS5N1` (#40) |
| `analytics` | `google-analytics.com/g/collect?...tid=G-GCQC5WS5N1` — 2 запроса: `en=page_view` (#41) и `en=HP GA4 Event` (#43) |
| `metrika` | не обнаружено |
| `facebook` | не обнаружено |
| `pixel` | не обнаружено |
| `hotjar` | не обнаружено |

Итого: **Google Tag Manager** (контейнер `GTM-K2CK5LGL`) загружает **Google Analytics 4**
(идентификатор `G-GCQC5WS5N1` — формат `G-…` соответствует GA4, [Google](https://support.google.com/analytics/answer/12270356)).
Кроме стандартного `page_view` отправляется собственное событие `HP GA4 Event`.
Других сторонних доменов, кроме CDN (cdnjs, unpkg) и Google, в запросах нет.

---

## Как воспроизвести

1. Chrome → Настройки → Конфиденциальность и безопасность → Безопасность → **Использовать безопасный DNS** → Cloudflare (1.1.1.1).
2. Открыть чистый профиль: `google-chrome --user-data-dir="$(mktemp -d)" --no-first-run`.
3. F12 → **Network**: включить *Preserve log* и *Disable cache*; открыть `https://www.historypin.org/`, ничего не нажимать.
4. **Network** — сверить список запросов с [`network-requests.txt`](evidence/network-requests.txt); фильтр по словам из п. 9;
   запрос документа → *Headers* — сверить с [`document-headers.txt`](evidence/document-headers.txt);
   *Response* + Ctrl+F — маркеры из [`document-markers.txt`](evidence/document-markers.txt).
5. **Console**: при первой вставке набрать `allow pasting`; вставить по очереди файлы из [`../snippets/`](../snippets/)
   и сравнить результат с одноимёнными `.json` в `evidence/`.
6. **Application → Cookies / Local storage / Session storage** — сверить с п. 8.
7. Адаптивность: **Device Toolbar** (Ctrl+Shift+M), ширина 375 / 768 / 1440.
8. Lighthouse: `cd docs/reports/lighthouse && ./run-lighthouse.sh historypin https://www.historypin.org/`,
   затем `node summarize-lighthouse.mjs historypin`. Результаты будут отличаться на несколько пунктов — это нормальный разброс Lighthouse.
