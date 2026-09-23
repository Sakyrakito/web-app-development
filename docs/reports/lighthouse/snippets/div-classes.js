// Paste into DevTools → Console. Lists class names used on <div> elements, most frequent first.
(() => {
  const freq = {};
  for (const div of document.getElementsByTagName('div'))
    for (const c of div.classList) freq[c] = (freq[c] || 0) + 1;
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return {
    url: location.href,
    divsTotal: document.getElementsByTagName('div').length,
    divsWithClass: document.querySelectorAll('div[class]:not([class=""])').length,
    distinctClasses: sorted.length,
    top60: sorted.slice(0, 60),
  };
})()
