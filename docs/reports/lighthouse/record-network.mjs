// Usage: node record-network.mjs <slug> <url> [consentSelector] [secondsPerPhase=30]
//
// Records every network request of a page load, including those made by iframes and
// workers, via the Chrome DevTools Protocol — the same event stream the DevTools Network
// panel displays. Exists because chrome-devtools-mcp keeps only the last 1000 requests per
// navigation, which ad-heavy pages exceed within seconds.
//
// Phase "before-consent" lasts secondsPerPhase after navigation; then consentSelector is
// clicked (if given) and phase "after-consent" lasts another secondsPerPhase. Finally all
// browser cookies (including HttpOnly and third-party) are dumped.
// Output: <slug>/evidence/network-log.json, plus bodies of first-party stylesheets in
// <slug>/evidence/css/ (cross-origin sheets can't be read from the page's JS, so their
// @media rules are only visible in the response body).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [slug, url, consentSelector, seconds = '30'] = process.argv.slice(2);
const phaseMs = Number(seconds) * 1000;
const outDir = join(dirname(fileURLToPath(import.meta.url)), slug, 'evidence');
mkdirSync(outDir, { recursive: true });

const profile = mkdtempSync(join(tmpdir(), 'audit-'));
writeFileSync(join(profile, 'Local State'),
  JSON.stringify({ dns_over_https: { mode: 'secure', templates: 'https://cloudflare-dns.com/dns-query' } }));
const chrome = spawn('google-chrome', [`--user-data-dir=${profile}`, '--remote-debugging-port=0',
  '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const portFile = join(profile, 'DevToolsActivePort');
while (!existsSync(portFile) || readFileSync(portFile, 'utf8').split('\n').length < 2) await sleep(100);
const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');

const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
await new Promise(r => ws.addEventListener('open', r));
let nextId = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
  const id = ++nextId;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

const started = Date.now();
let phase = 'before-consent';
const requests = new Map();
const key = (sessionId, requestId) => `${sessionId}:${requestId}`;
const siteDomain = new URL(url).hostname.split('.').slice(-2).join('.');
const cssDir = join(outDir, 'css');
let documentHeaders = null;
const redactCookies = headers => Object.fromEntries(Object.entries(headers).map(([k, v]) =>
  [k, k.toLowerCase() === 'set-cookie' ? v.split('\n').map(c => c.replace(/=[^;]*/, '=<redacted>')).join('\n') : v]));

// Every page, iframe and worker gets its own session; enable Network on each and let it
// auto-attach its own children, so nested ad iframes are recorded too.
const instrument = async sessionId => {
  await send('Network.enable', {}, sessionId).catch(() => {});
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId).catch(() => {});
  await send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
};

ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    return msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  }
  const { method, params, sessionId } = msg;
  if (method === 'Target.attachedToTarget') instrument(params.sessionId);
  if (method === 'Network.requestWillBeSent') {
    requests.set(key(sessionId, params.requestId), {
      phase, t: Date.now() - started, method: params.request.method, url: params.request.url,
      type: params.type ?? null, status: null, setCookie: [],
    });
  }
  const r = requests.get(key(sessionId, params?.requestId));
  if (!r) return;
  if (method === 'Network.responseReceived') {
    r.status = params.response.status;
    if (!documentHeaders && params.type === 'Document' && r.url === url)
      documentHeaders = { status: params.response.status, headers: params.response.headers };
  }
  if (method === 'Network.loadingFinished' && r.type === 'Stylesheet' && new URL(r.url).hostname.endsWith(siteDomain)) {
    send('Network.getResponseBody', { requestId: params.requestId }, sessionId).then(({ body, base64Encoded }) => {
      mkdirSync(cssDir, { recursive: true });
      writeFileSync(join(cssDir, new URL(r.url).pathname.split('/').pop()), base64Encoded ? Buffer.from(body, 'base64') : body);
    }).catch(() => {});
  }
  if (method === 'Network.responseReceivedExtraInfo') {
    const header = Object.entries(params.headers).find(([k]) => k.toLowerCase() === 'set-cookie')?.[1];
    // Only cookie names and attributes are kept; values are session identifiers.
    if (header) r.setCookie.push(...header.split('\n').map(c => c.replace(/=[^;]*/, '=<redacted>')));
    if (!r.status) r.status = params.statusCode;
  }
  if (method === 'Network.loadingFailed') r.status = `failed: ${params.errorText}`;
});

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await instrument(sessionId);
await send('Page.navigate', { url }, sessionId);
await sleep(phaseMs);

let consent = 'no selector given';
if (consentSelector) {
  const { result } = await send('Runtime.evaluate', {
    expression: `(() => { const b = document.querySelector(${JSON.stringify(consentSelector)}); if (!b) return 'not found'; b.click(); return 'clicked: ' + b.textContent.trim(); })()`,
  }, sessionId);
  consent = result.value;
  phase = 'after-consent';
  await sleep(phaseMs);
}

const { cookies } = await send('Storage.getCookies');
const log = {
  url, recordedAt: new Date(started).toISOString(), chrome: (await send('Browser.getVersion')).product,
  secondsPerPhase: Number(seconds), consentSelector: consentSelector ?? null, consent,
  document: documentHeaders && { ...documentHeaders, headers: redactCookies(documentHeaders.headers) },
  requestCount: requests.size,
  requests: [...requests.values()],
  cookies: cookies.map(({ value, ...c }) => c),
};
writeFileSync(join(outDir, 'network-log.json'), JSON.stringify(log, null, 1));
console.log(`${requests.size} requests, ${cookies.length} cookies, consent: ${consent}`);

await send('Browser.close').catch(() => {});
chrome.kill();
await sleep(500);
rmSync(profile, { recursive: true, force: true });
process.exit(0);
