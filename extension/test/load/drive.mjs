// CDP driver for test/load-in-chrome.sh. Usage: node drive.mjs <cdpPort> <daemonPort> <extId>
const [cdpPort, daemonPort, EXT] = process.argv.slice(2);
const ORIGIN = `chrome-extension://${EXT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

// ---------- CDP plumbing ----------
let ws;
let seq = 0;
const pending = new Map();
for (let i = 0; i < 80 && !ws; i++) {
  try {
    const v = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();
    ws = new WebSocket(v.webSocketDebuggerUrl);
  } catch { await sleep(250); }
}
if (!ws) { console.log('FAIL  could not reach Chrome DevTools'); process.exit(1); }
await new Promise((r) => { ws.onopen = r; });
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
const send = (method, params = {}, sessionId) => new Promise((r, reject) => {
  const id = ++seq;
  const t = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, (d) => { clearTimeout(t); r(d); });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
async function evaluate(sessionId, expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.error) throw new Error(r.error.message);
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function targets() { return (await send('Target.getTargets')).result.targetInfos; }
async function attach(targetId) {
  const sessionId = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
  await send('Runtime.runIfWaitingForDebugger', {}, sessionId);
  return sessionId;
}

// ---------- 1. installed, service worker running ----------
let sw = null;
for (let i = 0; i < 60 && !sw; i++) {
  sw = (await targets()).find((t) => t.type === 'service_worker' && t.url === `${ORIGIN}background.js`);
  if (!sw) await sleep(250);
}
check(!!sw, 'extension installed and service worker running', sw ? sw.url : 'no service_worker target');
if (!sw) process.exit(1);
const swS = await attach(sw.targetId);
let apiReady = false;
for (let i = 0; i < 40 && !apiReady; i++) {
  apiReady = await evaluate(swS, '!!(self.chrome && chrome.declarativeNetRequest)').catch(() => false);
  if (!apiReady) await sleep(250);
}
check(apiReady, 'extension APIs available in the service worker');

// ---------- 2. rules installed from the fake daemon's lock ----------
let n = 0;
for (let i = 0; i < 60 && !n; i++) {
  n = await evaluate(swS, 'chrome.declarativeNetRequest.getDynamicRules().then((r) => r.length)');
  if (!n) await sleep(250);
}
check(n > 0, 'dynamic rules installed during the (fake) lock', `${n} rules`);

// What would Chrome do with a request? (testMatchOutcome: unpacked extensions only)
const OUTCOME = `async (url, type) => {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const byId = new Map(rules.map((r) => [r.id, r]));
  const res = await chrome.declarativeNetRequest.testMatchOutcome({ url, type, tabId: -1 });
  const hit = res.matchedRules.map((m) => byId.get(m.ruleId)).filter(Boolean).sort((a, b) => b.priority - a.priority)[0];
  return hit ? hit.action.type : 'none';
}`;
const outcome = (url, type) => evaluate(swS, `(${OUTCOME})(${JSON.stringify(url)}, ${JSON.stringify(type)})`);
const untouched = (o) => o === 'none' || o === 'allow';

async function expectOutcomes() {
  const cases = [
    ['https://www.instagram.com/', 'main_frame', (o) => o === 'redirect', 'redirect'],
    ['https://scontent.cdninstagram.com/x.jpg', 'image', (o) => o === 'block', 'block'],
    ['https://www.youtube.com/', 'main_frame', (o) => o === 'redirect', 'redirect'],
    ['https://i.ytimg.com/vi/x/hq.jpg', 'image', (o) => o === 'block', 'block'],
    ['https://app.adversus.io/', 'main_frame', (o) => o === 'redirect', 'redirect (tab mode)'],
    ['https://app.adversus.io/api/leads', 'xmlhttprequest', untouched, 'untouched (tab mode)'],
    ['https://app.adversus.io/socket', 'websocket', untouched, 'untouched (tab mode)'],
    ['https://app.adversus.io/embed', 'sub_frame', untouched, 'untouched (tab mode)'],
    ['https://app.adversus.io/app.js', 'script', untouched, 'untouched (tab mode)'],
    ['https://journeys.adversus.dk/trigger', 'xmlhttprequest', untouched, 'untouched'],
    ['https://journeys.adversus.dk/', 'main_frame', untouched, 'untouched'],
    ['https://accounts.youtube.com/accounts/CheckConnection', 'main_frame', untouched, 'untouched'],
    ['https://accounts.youtube.com/x', 'xmlhttprequest', untouched, 'untouched'],
    ['https://accounts.youtube.com/x', 'sub_frame', untouched, 'untouched'],
    ['https://example.com/', 'main_frame', untouched, 'untouched'],
  ];
  for (const [url, type, ok, want] of cases) {
    let o;
    try { o = await outcome(url, type); } catch (e) { o = 'error: ' + e.message; }
    check(ok(o), `${type.padEnd(14)} ${url} → ${want}`, o);
  }
}
await expectOutcomes();

// ---------- 3. real navigations ----------
const { result: { targetId: tabId } } = await send('Target.createTarget', { url: 'about:blank' });
const tabS = await attach(tabId);
async function go(url, wait = 2500) {
  await send('Page.navigate', { url }, tabS);
  await sleep(wait);
  return evaluate(tabS, 'location.href');
}
for (const url of ['https://www.instagram.com/', 'https://app.adversus.io/dialer']) {
  const href = await go(url);
  check(href.startsWith(`${ORIGIN}blocked.html`), `navigate ${url} → blocked.html`, href);
}
const quote = await evaluate(tabS, `new Promise((r) => setTimeout(() => r({
  host: document.getElementById('host').textContent,
  text: document.getElementById('text').textContent.length,
  remain: document.getElementById('remain').textContent,
}), 1200))`);
check(quote.host === 'adversus.io' || quote.host === 'app.adversus.io', 'quote page knows the attempted host', quote.host);
check(quote.text > 0, 'quote page shows a quote', `${quote.text} chars`);
check(/^\d\d:\d\d:\d\d$/.test(quote.remain), 'quote page counts down', quote.remain);

// ---------- 4. control page renders under the CSP ----------
const { result: { targetId: appId } } = await send('Target.createTarget', { url: `${ORIGIN}app.html` });
const appS = await attach(appId);
await sleep(2500);
const app = await evaluate(appS, `({ big: document.getElementById('big').textContent, tiles: document.getElementById('tiles').children.length, sub: document.getElementById('sub').textContent, alert: document.getElementById('alert').hidden ? '' : document.getElementById('alert').textContent })`);
check(/^\d\d:\d\d:\d\d$/.test(app.big) && app.tiles > 0 && /^Låst til/.test(app.sub), 'app.html renders the lock', JSON.stringify(app));
check(app.alert === '', 'heartbeat 403 is not shown as an error', app.alert);

// ---------- 5. heartbeat ----------
const hits = await (await fetch(`http://127.0.0.1:${daemonPort}/__hits`)).json();
const beats = hits.filter(([m, p]) => m === 'POST' && p === '/v1/heartbeat');
check(beats.length > 0, 'heartbeat reached the daemon', `${beats.length} × ${beats[0] ? beats[0][2] : ''}`);
check(hits.some(([m, p, h]) => m === 'GET' && p === '/v1/status' && h === '1'), 'status polled with X-LockedIn: 1');
check(!hits.some(([m, p]) => m === 'POST' && p.startsWith('/v1/session')), 'no session was ever started');

// ---------- 6. review M3: daemon turns "inactive" and allows instagram.com mid-lock ----------
const polls = async () => (await (await fetch(`http://127.0.0.1:${daemonPort}/__hits`)).json()).filter(([m, p]) => m === 'GET' && p === '/v1/status').length;
const before = await polls();
await fetch(`http://127.0.0.1:${daemonPort}/__mode/spoof`, { method: 'POST' });
await evaluate(appS, 'location.reload()').catch(() => {});
await sleep(3000);
check((await polls()) > before, 'M3: the worker fetched the spoofed status');
const lockedView = await evaluate(swS, 'chrome.storage.local.get("lock").then((x) => !!(x.lock && x.lock.lockedUntil > Date.now()))');
check(lockedView, 'M3: worker still considers itself locked');
check((await outcome('https://www.instagram.com/', 'main_frame')) === 'redirect', 'M3: instagram still redirected after spoofed status');
const href = await go('https://www.instagram.com/');
check(href.startsWith(`${ORIGIN}blocked.html`), 'M3: navigating to instagram still lands on blocked.html', href);
await expectOutcomes();

console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
