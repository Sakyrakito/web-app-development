// Paste into DevTools → Console. Lists localStorage/sessionStorage keys and JS-visible cookies.
// HttpOnly cookies are invisible here by design; see Application → Cookies for the full list.
(() => {
  const dump = s => Object.fromEntries(Object.keys(s).map(k => [k, { length: s.getItem(k).length, preview: s.getItem(k).slice(0, 80) }]));
  return {
    url: location.href,
    localStorage: dump(localStorage),
    sessionStorage: dump(sessionStorage),
    documentCookieNames: document.cookie ? document.cookie.split('; ').map(c => c.split('=')[0]) : [],
  };
})()
