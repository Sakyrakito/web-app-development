/** Константы приложения: город, категории, лимиты, настройки геолокации. */

export const CITY = { name: 'Гродно', center: [53.6779, 23.8293], zoom: 15 };

export const CATS = {
  rumor:   { label: 'Слух',              plural: 'Слухи',     glyph: '∿', color: '#a58bff', hint: 'кто-то где-то слышал' },
  horror:  { label: 'Страшилка',         plural: 'Страшилки', glyph: '☾', color: '#ff5470', hint: 'лучше не ходить одному' },
  history: { label: 'Исторический факт', plural: 'Факты',     glyph: '§', color: '#e9b44c', hint: 'было на самом деле' },
  omen:    { label: 'Примета',           plural: 'Приметы',   glyph: '✶', color: '#3fd3b6', hint: 'работает, если верить' },
};
export const NONE = { label: 'Без категории', glyph: '·', color: '#8b8799' };

export const SORTS = [
  { key: 'new',  label: 'Новые' },
  { key: 'hot',  label: 'Обсуждают' },
  { key: 'top',  label: 'Популярные' },
  { key: 'near', label: 'Рядом' },
];
export const FEED_TITLES = { new: 'прямо сейчас', hot: 'громче всего', top: 'чаще всего', near: 'рядом с вами' };
export const RIBBONS     = { new: 'Только что', hot: 'Все шепчутся', top: 'Ярче всех', near: 'Ближе всех' };

// Те же правила, что в api/stories.php: сплетни — о местах, не о людях.
export const CONTACT_RULES = [
  [/(?<!\d)(?:\+?\d[\s\-()]{0,2}){7,}(?!\d)/u, 'Похоже на номер телефона — уберите его: легенды о местах, а не о конкретных людях.'],
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/iu, 'Похоже на email — уберите его: легенды о местах, а не о конкретных людях.'],
  [/https?:\/\/|www\./iu, 'Ссылки в историях не публикуются.'],
];
export const STORY_FORMS = ['история', 'истории', 'историй'];

export const TEXT_MIN = 20;
export const TEXT_MAX = 2000;
export const FEED_PAGE = 18;
export const MOBILE_BREAKPOINT = '(max-width: 860px)';

// Порядок как в Google Maps: сначала быстрый черновой замер, затем уточнение.
export const GEO_FINE   = { enableHighAccuracy: true,  timeout: 12000, maximumAge: 15000 };
export const GEO_COARSE = { enableHighAccuracy: false, timeout: 6000,  maximumAge: 300000 };
