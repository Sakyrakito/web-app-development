// Paste into DevTools → Console. Reports raw technology markers present on the page.
// Only reports what exists; interpretation is done in the report with a documentation link.
(() => {
  const globals = ['jQuery', 'React', 'ReactDOM', '__NEXT_DATA__', '__NUXT__', 'Vue', '__VUE__',
    'angular', 'ng', 'Ember', 'Backbone', '_', 'L', 'mapboxgl', 'google', 'ga', 'gtag',
    'dataLayer', 'fbq', 'ym', 'hj', '_satellite', 'Sentry', 'Turbo', 'Stimulus', 'htmx', 'Alpine'];
  const hosts = sel => [...new Set([...document.querySelectorAll(sel)]
    .map(e => { try { return new URL(e.src || e.href, location).host; } catch { return null; } })
    .filter(Boolean))];
  return {
    url: location.href,
    doctype: document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : null,
    htmlLang: document.documentElement.lang || null,
    generator: document.querySelector('meta[name="generator"]')?.content ?? null,
    csrfMeta: [...document.querySelectorAll('meta[name*="csrf" i]')].map(m => m.name),
    globalsPresent: globals.filter(g => typeof window[g] !== 'undefined'),
    versions: {
      jQuery: window.jQuery?.fn?.jquery ?? null,
      React: window.React?.version ?? null,
      Vue: window.Vue?.version ?? null,
      Leaflet: window.L?.version ?? null,
      mapboxgl: window.mapboxgl?.version ?? null,
    },
    domMarkers: {
      'ng-version': document.querySelector('[ng-version]')?.getAttribute('ng-version') ?? null,
      'data-reactroot': !!document.querySelector('[data-reactroot]'),
      'data-v-*': [...document.querySelectorAll('*')].some(e => [...e.attributes].some(a => a.name.startsWith('data-v-'))),
      'data-turbo': !!document.querySelector('[data-turbo], [data-turbo-track]'),
      'data-controller (Stimulus)': !!document.querySelector('[data-controller]'),
      'wp-content paths': !!document.querySelector('[src*="/wp-content/"], [href*="/wp-content/"]'),
    },
    scriptHosts: hosts('script[src]'),
    stylesheetHosts: hosts('link[rel="stylesheet"]'),
    inlineScripts: document.querySelectorAll('script:not([src])').length,
    externalScripts: document.querySelectorAll('script[src]').length,
  };
})()
