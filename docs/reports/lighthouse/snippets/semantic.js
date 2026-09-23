// Paste into DevTools → Console. Counts HTML5 semantic elements in the live DOM and
// describes each occurrence (class, id, aria-label, first heading, parent) so its role
// on the page can be stated from evidence rather than inferred.
(() => {
  const tags = ['header', 'nav', 'main', 'article', 'section', 'aside', 'footer',
    'figure', 'figcaption', 'time', 'address', 'mark', 'details', 'summary', 'dialog',
    'picture', 'search', 'hgroup'];
  const describe = el => ({
    class: el.className || null,
    id: el.id || null,
    ariaLabel: el.getAttribute('aria-label'),
    firstHeading: el.querySelector('h1,h2,h3,h4,h5,h6')?.textContent.trim().slice(0, 80) ?? null,
    parent: el.parentElement ? el.parentElement.tagName.toLowerCase() + (el.parentElement.className ? '.' + [...el.parentElement.classList].join('.') : '') : null,
  });
  const counts = {}, occurrences = {};
  for (const t of tags) {
    const els = [...document.getElementsByTagName(t)];
    counts[t] = els.length;
    if (els.length) occurrences[t] = els.map(describe);
  }
  return { url: location.href, counts, totalDivs: document.getElementsByTagName('div').length, occurrences };
})()
