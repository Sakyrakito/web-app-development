// Paste into DevTools → Console. Collects @media conditions from every readable stylesheet.
// Cross-origin sheets without CORS throw on .cssRules; they are listed under `unreadable`
// and must be inspected via Network → CSS → Response instead.
(() => {
  const found = {}, unreadable = [], sheets = [];
  const walk = (rules, origin) => {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) {
        const key = r.media.mediaText;
        (found[key] ||= { rules: 0, sheets: new Set() });
        found[key].rules += r.cssRules.length;
        found[key].sheets.add(origin);
      }
      if (r instanceof CSSImportRule && r.styleSheet) visit(r.styleSheet);
      if (r.cssRules) walk(r.cssRules, origin);
    }
  };
  const visit = sheet => {
    const origin = sheet.href || 'inline <style>';
    try {
      walk(sheet.cssRules, origin);
      sheets.push({ origin, media: sheet.media.mediaText || null });
    } catch (e) { unreadable.push(origin); }
  };
  for (const s of document.styleSheets) visit(s);
  return {
    url: location.href,
    viewportMeta: document.querySelector('meta[name="viewport"]')?.content ?? null,
    readableSheets: sheets,
    unreadable,
    mediaQueries: Object.entries(found)
      .map(([q, v]) => ({ query: q, rules: v.rules, sheets: [...v.sheets] }))
      .sort((a, b) => b.rules - a.rules),
  };
})()
