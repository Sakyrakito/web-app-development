// Usage: node summarize-lighthouse.mjs <slug>
// Prints per-run category scores and lab metrics from <slug>/evidence/lighthouse/*.report.json,
// plus the median per form factor, as a Markdown table.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), process.argv[2], 'evidence', 'lighthouse');
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
const metrics = {
  'first-contentful-paint': 'FCP, s',
  'largest-contentful-paint': 'LCP, s',
  'total-blocking-time': 'TBT, ms',
  'cumulative-layout-shift': 'CLS',
  'speed-index': 'SI, s',
};
const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const fmt = (id, v) => id === 'cumulative-layout-shift' ? v.toFixed(3)
  : id === 'total-blocking-time' ? Math.round(v) : (v / 1000).toFixed(1);

const header = ['Run', ...categories, ...Object.values(metrics)];
console.log(`| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|`);

for (const factor of ['mobile', 'desktop']) {
  const runs = readdirSync(dir).filter(f => f.startsWith(factor) && f.endsWith('.report.json')).sort()
    .map(f => ({ name: f.replace('.report.json', ''), lhr: JSON.parse(readFileSync(join(dir, f))) }));
  // A bot-protection block page (e.g. Cloudflare 403) still produces a full report; refuse it.
  for (const { name, lhr } of runs) {
    const doc = lhr.audits['network-requests'].details.items.find(i => i.resourceType === 'Document');
    if (doc?.statusCode !== 200) throw new Error(`${name}: main document status ${doc?.statusCode}, not the real page`);
  }
  const rows = runs.map(({ name, lhr }) => ({
    name,
    cats: categories.map(c => Math.round(lhr.categories[c].score * 100)),
    mets: Object.keys(metrics).map(m => lhr.audits[m].numericValue),
  }));
  for (const r of rows)
    console.log(`| ${r.name} | ${r.cats.join(' | ')} | ${r.mets.map((v, i) => fmt(Object.keys(metrics)[i], v)).join(' | ')} |`);
  const medCats = categories.map((_, i) => median(rows.map(r => r.cats[i])));
  const medMets = Object.keys(metrics).map((m, i) => fmt(m, median(rows.map(r => r.mets[i]))));
  console.log(`| **${factor} median** | ${medCats.map(v => `**${v}**`).join(' | ')} | ${medMets.map(v => `**${v}**`).join(' | ')} |`);
}
