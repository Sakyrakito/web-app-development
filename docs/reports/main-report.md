# Технический аудит веб-ресурсов

---

## Ресурс 1: Atlas Obscura

### 1. Название ресурса

**Atlas Obscura** — платформа о необычных и малоизвестных местах мира.

---

### 2. Адрес ресурса

https://www.atlasobscura.com/

---

### 3. Анализ архитектуры и логики

**Условия проверки:** домашняя сеть Wi-Fi, ПК, браузер Google Chrome 152.0.7977.82 (Linux), чистый профиль без cookies, расширений и кэша. Баннер согласия на cookies (OneTrust) — нажата кнопка «Allow Cookies». Запись сетевых запросов велась 30 с до нажатия и 30 с после.

**CDN / прокси:** сайт стоит за Cloudflare — заголовки `Server: cloudflare`, `Cf-Cache-Status: DYNAMIC`, `server-timing: cfEdge…, cfOrigin…`.

**Хостинг:** Heroku — заголовок `Via: 1.1 heroku-router`, `x-request-id`, `nel`/`report-to` с `nel.heroku.com`.

**Бэкенд:** Ruby on Rails:
- Заголовок `x-runtime: 0.011312` — middleware `Rack::Runtime` (время обработки запроса).
- Заголовки `x-frame-options: SAMEORIGIN`, `x-xss-protection: 0`, `x-content-type-options: nosniff` и другие полностью совпадают со значениями по умолчанию `config.action_dispatch.default_headers` в Rails.
- Теги `<meta name="csrf-param">` и `<meta name="csrf-token">` — вывод хелпера `csrf_meta_tags` Rails.
- `id` у `<figure>` декодируется в `{"_rails":{"data":"gid://atlas/Place/71215?expires_in","pur":"default"}}` — подписанный Global ID Rails, имя приложения `atlas`, модели — `Place`, `Article`.

**Фронтенд:** Hotwire (Turbo + Stimulus) — глобальные объекты `Turbo` и `Stimulus`, атрибуты `data-turbo*`, `data-controller`.

**Сборщик:** Vite Ruby — путь `/vite/assets/` (значение по умолчанию `publicOutputDir: "vite"`).

**CSS:** Tailwind CSS — имя файла `aon.tailwind-…css`, классы `md:flex`, `z-[9999]`, `lg:col-span-4`, точки перелома 640/768/1024/1280/1536 px.

**Не обнаружено:** React, Vue, Angular, Next.js, Nuxt, jQuery, WordPress.

**Логика работы:** серверный рендеринг на Ruby on Rails (Heroku за Cloudflare, время обработки ~11 мс); интерактивность на клиенте — Turbo и Stimulus. Статика отдаётся с поддоменов `assets.`, `img.`, `images.`, `fonts.atlasobscura.com`.

**Объём запросов:** за 60 с — **454 запроса к 150 хостам**, из них 449 — до нажатия «Allow Cookies». Со своих доменов — 54 запроса, остальное — сторонние. По типам: Script 140, Image 135, Fetch 91, XHR 34, Document 17, Ping 12, Font 9, Stylesheet 5.

**Заголовки безопасности:** `strict-transport-security: max-age=300`; CSP только в режиме `report-only` (от Cloudflare) — ничего не блокирует.

---

### 4. Семантические элементы HTML5

Всего `<div>` на странице — 674.

| Элемент | Количество | Назначение |
|---------|-----------|------------|
| `<header>` | 37 | Шапки карточек и блоков разделов («Begin Your Journey», «Explore the Atlas»), шапки карточек городов |
| `<nav>` | 1 | `nav#navbar-component` — главная навигация сайта |
| `<main>` | 1 | Основной контент страницы |
| `<article>` | 45 | Карточки контента: направления, главная статья, места в карусели |
| `<section>` | 38 | Блоки главной: hero, «Popular Destinations», рассылка, поиск, рекламные слоты |
| `<footer>` | 45 | Подвалы карточек и статей |
| `<figure>` / `<figcaption>` | 13 / 13 | Изображения мест и статей с подписями |
| `<time>` | 4 | Даты публикаций |
| `<picture>` | 64 | Изображения внутри карточек |
| `aside`, `address`, `dialog`, `search` и др. | 0 | — |

---

### 5. Семантические классы при вёрстке div-ами

Из 674 `<div>` класс есть у 592, различных классов — 464. Большинство самых частых — **утилиты Tailwind** (не семантические): `flex` (98), `relative` (48), `w-full` (46), `absolute` (46), `items-center` (40).

Семантические (именованные) классы также присутствуют:

- `aon--avatar-group-component` (17), `aon--byline-avatar-component` (16) — группа аватаров и аватар автора;
- `activity-streams--button` (32) — кнопка ленты активности;
- `articles--carousel-grid--image` (14) — изображение в сетке-карусели;
- `statistic-box` (14) — блок статистики;
- `aon-heading-tiniest` (22), `aon-container-fluid` (13) — заголовок, контейнер.

Подход смешанный: утилитарная вёрстка Tailwind плюс именованные компоненты в стиле БЭМ (`блок--элемент`).

---

### 6. Адаптивность

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` присутствует.
- Подход **mobile-first** — стандартные breakpoints Tailwind: 640 / 768 / 1024 / 1280 / 1536 px.
- При уменьшении ширины экрана интерфейс перестраивается: карточки укладываются в один столбец, навигация адаптируется.
- Сайт корректно отображается на десктопе и мобильных устройствах (проверено через Device Toolbar в DevTools).

---

### 7. Анализ с помощью Lighthouse

**Условия проверки:** домашняя сеть Wi-Fi, ПК, Lighthouse 13.5.0 CLI, по 3 прогона на каждый режим. Mobile: эмуляция Moto G Power, RTT 150 мс, 1,6 Мбит/с, CPU ×4. Desktop: RTT 40 мс, 10 Мбит/с.

| Метрика | Mobile (медиана) | Desktop (медиана) |
|---------|-----------------|-------------------|
| Performance | 28 | 35 |
| Accessibility | 85 | 85 |
| Best Practices | 54 | 54 |
| SEO | 83 | 83 |
| FCP | 4,0 с | 2,9 с |
| LCP | 8,4 с | 4,2 с |
| TBT | ~29 000 мс | ~1 894 мс |

**Основные проблемы:**
- **Performance (28/35):** Total Blocking Time — 42,7 с на mobile; время выполнения JS — 84,7 с; за время проверки выполнено 4 721 запрос (mobile).
- **Accessibility (85):** недостаточный контраст цветов, отсутствие `alt` у изображений, ссылки без текста, мелкие области нажатия.
- **Best Practices (54):** 499 сторонних cookies, 6 устаревших API, ошибки в консоли.
- **SEO (83):** 3 ссылки с неописательным текстом, отсутствие `alt`.

В 4 из 6 прогонов Lighthouse предупреждал: «The page loaded too slowly to finish within the time limit».

---

### 8. Локальное хранилище и cookies

**localStorage:** 94 ключа — PostHog, Klaviyo, рекламные идентификаторы (id5id, 33acrossId, _pubcid, cto_bundle, ключи для criteo.com, liveramp.com, uidapi.com и др.), `_grecaptcha`, New Relic.

**sessionStorage:** 23 ключа — TikTok (`tt_sessionId`, `tt_pixel_session_index`), Klaviyo, `is_eu`.

**Cookies:** всего **172**; от своего домена — 38, сторонних — 134 от **68 доменов**; HttpOnly — 39; Partitioned — 15.

Примеры собственных cookies: `_session_production` (HttpOnly), `user_signed_in`, `OptanonConsent` (OneTrust), `cf_clearance` (Cloudflare), `_ga`, `_hjSession_1038905` (Hotjar), `_clck`/`_clsk` (Clarity), `_ttp` (TikTok), `_pin_unauth` (Pinterest).

Сторонние — рекламные биржи и синхронизация идентификаторов: rubiconproject.com, pubmatic.com, doubleclick.net, adnxs.com, criteo.com, tapad.com, adsrvr.org, linkedin.com, bing.com и другие.

---

### 9. Маркетинговые инструменты и аналитика

Фильтрация по ключевым словам во вкладке Network (454 запроса):

| Ключевое слово | Запросов | Хосты |
|---------------|---------|-------|
| `analytics` | 22 | analytics.google.com, analytics.tiktok.com, static-tracking.klaviyo.com и др. |
| `metrika` | 0 | не обнаружено |
| `facebook` | 3 | connect.facebook.net, www.facebook.com |
| `pixel` | 35 | doubleclick.net, analytics.tiktok.com, pixel.quantserve.com, pixel.rubiconproject.com и др. |
| `tagmanager` | 9 | www.googletagmanager.com |
| `hotjar` | 3 | static.hotjar.com, script.hotjar.com |

**Обнаруженные инструменты:**

| Инструмент | Доказательство |
|-----------|---------------|
| Google Tag Manager | `gtm.js?id=GTM-KXJCD57`, `gtm.js?id=GTM-PH5RC2F` |
| Google Analytics 4 | `gtag/js?id=G-VE390YR3HM`, `G-M3FGM78D1R`, `G-FVWZ0RM4DH` |
| Meta (Facebook) Pixel | `fbevents.js`, `facebook.com/tr/?id=1651185805144770` |
| Hotjar | `hotjar-1038905.js` |
| TikTok Pixel | `events.js?sdkid=CUUUR7JC77UF169S8CUG` |
| Microsoft Clarity | `clarity.ms/tag/lf5vdfyz6d` |
| Pinterest Tag | `s.pinimg.com/ct/core.js` |
| PostHog | `t.atlasobscura.com/array/phc_…/posthog-recorder.js` (запись сессий) |
| Plausible | `plausible.io/js/plausible.js` |
| Cloudflare Web Analytics | `beacon.min.js` |
| comScore | `sb.scorecardresearch.com/beacon.js` |
| Quantcast | `secure.quantserve.com/quant.js` |
| Klaviyo | `static.klaviyo.com/onsite/js/UUnqkC/klaviyo.js` |
| New Relic Browser | `js-agent.newrelic.com/nr-spa-1.322.0.min.js` |
| OneTrust | `otSDKStub.js` (баннер согласия) |

Также присутствует рекламный стек: Google Ad Manager, Criteo и десятки бирж синхронизации cookie.

**Важно:** все инструменты из таблицы загрузились **до** нажатия «Allow Cookies», несмотря на подключённый `OtAutoBlock.js` OneTrust.

---
---

## Ресурс 2: Hoodmaps

### 1. Название ресурса

**Hoodmaps** — краудсорсинговая карта городских районов.

---

### 2. Адрес ресурса

https://hoodmaps.com/

---

### 3. Анализ архитектуры и логики

**Условия проверки:** анализ проводился через вкладки Network и Sources инструментов разработчика Chrome.

**CDN / прокси:** сайт стоит за Cloudflare — заголовок `Server: cloudflare`, `Cf-Cache-Status: HIT`. Страницы отдаются из кэша Cloudflare, реальный сервер скрыт за прокси.

**Бэкенд:** язык и фреймворк определить не удалось — заголовок `X-Powered-By` отсутствует, намеренно скрыт Cloudflare. Косвенный признак — структура API-запросов вида `?action=get_data&slug=new-york-city` и `?action=get_places&city_slug=new-york-city`, характерная для PHP, однако утверждать это однозначно нельзя.

**Картографическая библиотека:** MapLibre GL JS 5.6.0 — определено по имени файла `maplibre-gl-5.6.0.js` во вкладке Network. Карта рендерится через WebGL в элемент `<canvas>`.

**JS-библиотека:** jQuery 3.5.1 — файл `jquery.js` виден во вкладке Network, версия подтверждена командой `$.fn.jquery` в консоли, вернувшей `"3.5.1"`.

**JS-фреймворк:** отсутствует. Код в Sources написан на Vanilla JS с использованием jQuery. React, Vue, Angular не обнаружены.

**Формат данных API:** сервер возвращает JSON (`Content-Type: application/json`) и GeoJSON-файлы для данных карты, `.pbf` — векторные тайлы в формате Protobuf.

**Защита от ботов:** Cloudflare Turnstile — обнаружено в коде файла `index.js` (`window.hmTurnstile`), используется при добавлении меток.

---

### 4. Семантические элементы HTML5

Страница построена преимущественно на `<div>`-ах. Семантические теги HTML5 (`<main>`, `<article>`, `<section>`, `<nav>`) практически не используются. Это снижает доступность для скринридеров и поисковых роботов.

---

### 5. Семантические классы при вёрстке div-ами

CSS-классы именованы осмысленно и отражают содержимое блока, а не его внешний вид:

| Класс | Назначение |
|-------|-----------|
| `neighborhood-display` | Блок отображения названия района |
| `action-draw-mode active` | Кнопка режима рисования (с модификатором активного состояния) |
| `action-enable-gps` | Кнопка включения геолокации |
| `zoom-buttons` | Блок кнопок масштабирования карты |

Классы описывают смысл и функцию элемента — хорошая практика при div-вёрстке, однако не заменяет семантические HTML-теги.

---

### 6. Адаптивность

Ресурс адаптивен. Проверка проводилась через режим Device Toolbar в DevTools (Ctrl+Shift+M) — при уменьшении ширины экрана интерфейс перестраивается: панели управления сворачиваются, карта занимает весь экран. Сайт корректно отображается как на десктопе, так и на мобильных устройствах.

---

### 7. Анализ с помощью Lighthouse

**Условия проверки:** домашняя сеть Wi-Fi, ПК, браузер Chrome, режим Desktop.

| Категория | Балл |
|-----------|------|
| Performance | 31 |
| Accessibility | 81 |
| Best Practices | 100 |
| SEO | 92 |

**Комментарий:**

- **Performance (31):** низкий показатель. Основная причина — тяжёлая библиотека MapLibre GL JS с WebGL-рендерингом, которая существенно увеличивает время загрузки. Типичная проблема картографических сервисов.
- **Accessibility (81):** приемлемый результат. Вероятная причина потерь — отсутствие семантических HTML-тегов и ARIA-атрибутов.
- **Best Practices (100):** отличный результат, сайт следует всем современным техническим стандартам.
- **SEO (92):** хороший показатель, страница хорошо оптимизирована для поисковых систем.

---

### 8. Локальное хранилище и cookies

Детальные данные не были зафиксированы в ходе аудита. По результатам анализа Network-запросов сторонние трекинговые cookies не обнаружены.

---

### 9. Маркетинговые инструменты и аналитика

Поиск проводился во вкладке Network с поочерёдной фильтрацией по ключевым словам: `analytics`, `metrika`, `facebook`, `pixel`, `tagmanager`, `hotjar`.

По всем фильтрам запросы к сторонним маркетинговым сервисам **не обнаружены**. Сайт не использует счётчики и пиксели отслеживания. Это осознанная позиция автора проекта — минимальный сбор данных о пользователях без трекинга.

---
---

## Ресурс 3: Historypin

### 1. Название ресурса

**Historypin** — некоммерческая платформа для сохранения исторических историй и фотографий, привязанных к местам на карте.

---

### 2. Адрес ресурса

https://www.historypin.org/

---

### 3. Анализ архитектуры и логики

**Условия проверки:** домашняя сеть Wi-Fi, ПК, браузер Google Chrome 152.0.7977.82 (Linux), чистый профиль без cookies, расширений и кэша. Страница — главная, без прокрутки и кликов. Баннер согласия на cookies не показывался.

**CDN / прокси:** сайт стоит за Cloudflare — заголовки `Server: cloudflare`, `cf-ray`, `Cf-Cache-Status: DYNAMIC`.

**Защита от ботов:** Cloudflare Bot Management — cookie `__cf_bm` (HttpOnly), cookie `cf_clearance`, скрипт `/cdn-cgi/challenge-platform/.../jsd/main.js`.

**Бэкенд:** Django (Python):
- Cookie `csrftoken` и скрытое поле `csrfmiddlewaretoken` (2 шт.) в HTML — имя cookie по умолчанию в Django и имя поля, которое рендерит `{% csrf_token %}`.
- Статика вида `main.5a02606b4a87.css` (12 hex-символов) — формат `ManifestStaticFilesStorage` Django.
- Атрибуты `data-djc-id-*` (11 шт.) и скрипт `/static/django_components/django_components.min.js` — библиотека django-components.

**Фронтенд:**
- **htmx** — глобальный объект `htmx`, атрибуты `hx-get` (2), `hx-post` (2), `hx-headers` (1), скрипт `/static/django_htmx/htmx.min.js`.
- **Alpine.js 3.14.8** — глобальный объект `Alpine`, подключён с CDN unpkg, атрибуты `x-data` (4), `@click` (17), `x-show` (10).

**Иконки:** Font Awesome 6.7.2 с CDN cdnjs.

**JS-фреймворки:** не обнаружены. React, Vue, Angular, Next.js, Nuxt, jQuery, WordPress отсутствуют.

**Логика работы:** HTML формируется на сервере (в ответе на запрос документа уже есть весь контент, 111 940 байт). Интерактивность — атрибутами в разметке: Alpine.js и htmx. Всего за загрузку главной страницы — **43 запроса**: 1 документ, 30 — статика со своего домена, 3 — Cloudflare challenge, 4 — CDN (cdnjs ×3, unpkg ×1), 4 — Google (Tag Manager ×2, Analytics ×2), 1 — `data:`-URI.

**Заголовки безопасности:** `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: same-origin`, `cross-origin-opener-policy: same-origin`. Заголовок `content-security-policy` отсутствует.

---

### 4. Семантические элементы HTML5

Всего `<div>` на странице — 195.

| Элемент | Количество | Назначение |
|---------|-----------|------------|
| `<header>` | 1 | `header.navigation` — шапка сайта с навигацией |
| `<nav>` | 2 | `aria-label="Main site menu"` — основное меню; `aria-label="Mobile site menu"` — мобильное меню |
| `<main>` | 1 | `main.main-content` — основной контент страницы |
| `<section>` | 8 | Hero-блок, темы коллекций, «What you can create», пожертвования (2), «Featured collections», отзывы |
| `<footer>` | 1 | Подвал сайта |
| `<picture>` | 3 | Изображения hero-блока, включая отдельную картинку для мобильных |
| `article`, `aside`, `figure`, `time`, `dialog`, `search` и др. | 0 | — |

---

### 5. Семантические классы при вёрстке div-ами

Из 195 `<div>` класс есть у 193, различных классов — 62. Все классы описывают назначение блока в стиле, близком к БЭМ (дефисы вместо `__`/`--`). Утилитарных и хэшированных классов нет.

Примеры:

- `collection-card`, `collection-card-description`, `collection-card-owner`, `collection-card-featured-tag` — карточка коллекции и её части;
- `navigation-left`, `navigation-right`, `mobile-navigation`, `mobile-menu`, `language-switcher` — навигация;
- `testimonials-carousel`, `testimonial-slide`, `testimonial-indicators` — карусель отзывов;
- `footer-main`, `footer-social-links`, `footer-description` — подвал;
- `home-hero-container`, `home-hero-content` — первый экран.

---

### 6. Адаптивность

- `<meta name="viewport" content="width=device-width, initial-scale=1.0">` присутствует.
- Найдено **19 различных media-запросов**; 16 из 19 используют `max-width` — подход **desktop-first**.
- Основная точка перелома — `max-width: 768px` (88 правил).
- Прочие точки перелома: 389, 481, 578, 632, 816, 900, 910, 1024, 1093, 1096, 1108, 1327, 1368, 1580 px.
- Поддерживается `prefers-reduced-motion: reduce` (1 правило из Font Awesome).

Поведение при разных ширинах:

| 375 px | 768 px | 1440 px |
|--------|--------|---------|
| Меню-«гамбургер», hero-блок в одну колонку | Меню-«гамбургер», кнопка на всю ширину | Полное горизонтальное меню (Discover / Create / About / Log in / Sign Up) |

---

### 7. Анализ с помощью Lighthouse

**Условия проверки:** домашняя сеть Wi-Fi, ПК, Lighthouse 13.5.0 CLI, по 3 прогона на каждый режим. Mobile: эмуляция Moto G Power (2022), экран 412×823, RTT 150 мс, 1,6 Мбит/с, CPU ×4. Desktop: экран 1350×940, RTT 40 мс, 10 Мбит/с.

| Прогон | Performance | Accessibility | Best Practices | SEO | FCP, s | LCP, s | TBT, ms | CLS |
|--------|-------------|---------------|----------------|-----|--------|--------|---------|-----|
| Mobile (медиана) | **74** | **100** | **81** | **100** | 1,9 | 3,4 | 354 | 0,000 |
| Desktop (медиана) | **94** | **100** | **81** | **100** | 0,6 | 0,8 | 18 | 0,005 |

**Основные замечания:**
- **Performance:** изображения не оптимизированы (экономия 859 КиБ на mobile, 4 213 КиБ на desktop); неиспользуемый JS — 137 КиБ; блокирующие рендеринг ресурсы; у изображений не заданы размеры (`unsized-images`). На mobile время до интерактивности — 10,3 с.
- **Best Practices (81):** единственный проваленный аудит — `deprecations`: 3 устаревших API из скрипта Cloudflare `/cdn-cgi/challenge-platform/scripts/jsd/main.js` (Shared Storage, `StorageType.persistent`, Protected Audience).
- **Accessibility (100)** и **SEO (100)** — проваленных аудитов в медианных прогонах нет.

**Примечание:** в первых прогонах сервер отвечал 21–26 секунд, что дало Speed Index 35,3 с (mobile) и 17,4 с (desktop). Это выброс, не медианное значение.

---

### 8. Локальное хранилище и cookies

**localStorage:** пусто.
**sessionStorage:** пусто.

**Cookies** — всего **5**, сторонних нет:

| Cookie | Кем установлен | Атрибуты | Назначение |
|--------|---------------|----------|-----------|
| `csrftoken` | Сервер | Secure, SameSite=Lax, 1 год | CSRF-токен Django |
| `__cf_bm` | Cloudflare | HttpOnly, Secure, SameSite=None, 30 мин | Bot Management |
| `cf_clearance` | Cloudflare | HttpOnly, Secure, SameSite=None, Partitioned, 1 год | JavaScript detections |
| `_ga` | JS (Google Analytics) | — | Различение пользователей, 2 года |
| `_ga_GCQC5WS5N1` | JS (Google Analytics) | — | Идентификатор GA4, 2 года |

---

### 9. Маркетинговые инструменты и аналитика

Фильтрация по ключевым словам во вкладке Network (43 запроса):

| Ключевое слово | Найденные запросы |
|---------------|------------------|
| `tagmanager` | `gtm.js?id=GTM-K2CK5LGL`, `gtag/js?id=G-GCQC5WS5N1` |
| `analytics` | `google-analytics.com/g/collect?...tid=G-GCQC5WS5N1` — 2 запроса: `en=page_view` и `en=HP GA4 Event` |
| `metrika` | не обнаружено |
| `facebook` | не обнаружено |
| `pixel` | не обнаружено |
| `hotjar` | не обнаружено |

**Итого:** используется **Google Tag Manager** (контейнер `GTM-K2CK5LGL`), через который загружается **Google Analytics 4** (идентификатор `G-GCQC5WS5N1`). Кроме стандартного `page_view` отправляется собственное событие `HP GA4 Event`. Других сторонних маркетинговых инструментов нет.