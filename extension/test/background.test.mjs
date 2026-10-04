// Runs background.js against an in-memory fake of the chrome.* APIs and a fake daemon.
import test from 'node:test';
import assert from 'node:assert/strict';

const ID = 'nildondjeeibacombanbjnokenmhfhie';
const ORIGIN = `chrome-extension://${ID}/`;
let now = Date.parse('2026-10-04T10:00:00Z');
Date.now = () => now;

const listeners = {};
const ev = (name) => ({ addListener: (fn) => { (listeners[name] ||= []).push(fn); } });
const mem = { local: {}, session: {} };
const area = (k) => ({
  async get(keys) {
    const ks = typeof keys === 'string' ? [keys] : keys;
    return Object.fromEntries(ks.filter((x) => x in mem[k]).map((x) => [x, structuredClone(mem[k][x])]));
  },
  async set(obj) { Object.assign(mem[k], structuredClone(obj)); },
});
let dynamicRules = [];
let tabs = [];
const updates = [];
const alarms = {};

globalThis.chrome = {
  runtime: {
    id: ID,
    getManifest: () => ({ version: '1.0.0' }),
    getURL: (p) => ORIGIN + p,
    onInstalled: ev('installed'), onStartup: ev('startup'), onMessage: ev('message'),
  },
  storage: { local: area('local'), session: area('session') },
  alarms: {
    async get(n) { return alarms[n]; },
    create(n, o) { alarms[n] = o; },
    onAlarm: ev('alarm'),
  },
  declarativeNetRequest: {
    async getDynamicRules() { return structuredClone(dynamicRules); },
    async updateDynamicRules({ removeRuleIds = [], addRules = [] }) {
      dynamicRules = dynamicRules.filter((r) => !removeRuleIds.includes(r.id)).concat(structuredClone(addRules));
    },
    async isRegexSupported() { return { isSupported: true }; },
  },
  tabs: {
    async query() { return structuredClone(tabs); },
    async update(id, props) { updates.push([id, props.url]); const t = tabs.find((x) => x.id === id); if (t && props.url) t.url = props.url; },
    async create() {},
    onRemoved: ev('tabRemoved'),
  },
  windows: { async update() {} },
  webNavigation: { onBeforeNavigate: ev('before'), onCommitted: ev('committed'), onHistoryStateUpdated: ev('history') },
  action: { onClicked: ev('click') },
};

// Fake daemon
let daemon = { mode: 'down', status: null };
const calls = [];
const delivered = [];
globalThis.fetch = async (url, init) => {
  calls.push([init.method, url, init.headers]);
  if (daemon.mode === 'down') throw new TypeError('Failed to fetch');
  if (url.endsWith('/v1/heartbeat')) {
    delivered.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  }
  if (daemon.mode === 'broken') return { ok: false, status: 500, json: async () => ({ error: 'x', message: 'fejl' }) };
  return { ok: true, status: 200, json: async () => structuredClone(daemon.status) };
};
const beats = () => calls.filter(([m, u]) => m === 'POST' && u.endsWith('/v1/heartbeat')).length;

const site = (id, mode, suffixes, extra = {}) => ({ id, label: id, builtin: true, blocked: true, mode, suffixes, exactHosts: [], regexFilters: [], allowHosts: [], ...extra });
const SITES = [
  site('youtube', 'full', ['youtube.com'], { allowHosts: ['accounts.youtube.com'] }),
  site('adversus', 'tab', ['adversus.io', 'app.adversus.io']),
];
const status = (active, mins) => ({
  version: '1.0.0', active, activeUntil: active ? new Date(now + mins * 60000).toISOString() : null,
  sites: SITES, apps: [], schedules: [], maxSessionMinutes: 1440,
});

function send(msg, sender) {
  return new Promise((resolve) => {
    let replied = false;
    const ret = listeners.message.map((fn) => fn(msg, sender, (r) => { replied = true; resolve(r); }));
    if (!ret.includes(true) && !replied) resolve(undefined);
  });
}
const page = { id: ID, url: ORIGIN + 'app.html' };
const refresh = () => send({ type: 'refresh' }, page);

await import('../background.js');

test('worker: heartbeat on service-worker start, before any page asks', async () => {
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(beats() >= 1);
});

test('worker: fail-closed lifecycle against a fake daemon', async () => {
  // 1. daemon down, never locked → nothing installed
  let v = await refresh();
  assert.equal(v.reachable, false);
  assert.equal(v.locked, false);
  assert.equal(dynamicRules.length, 0);
  assert.equal(calls[0][2]['X-LockedIn'], '1');

  // 2. lock starts; open tabs on blocked sites are sent to the quote page
  tabs = [
    { id: 1, url: 'https://www.youtube.com/watch?v=x', windowId: 1 },
    { id: 2, url: 'https://app.adversus.io/dialer', windowId: 1 },
    { id: 3, url: 'https://accounts.youtube.com/signin', windowId: 1 },
    { id: 4, url: 'https://example.com/', windowId: 1 },
  ];
  daemon = { mode: 'up', status: status(true, 60) };
  v = await refresh();
  assert.equal(v.locked, true);
  assert.equal(v.lockedUntil, now + 3600000);
  const types = dynamicRules.map((r) => r.action.type).sort();
  assert.deepEqual(types, ['allow', 'block', 'redirect', 'redirect']);
  assert.deepEqual(updates.map((u) => u[0]).sort(), [1, 2]);
  assert.ok(updates.every((u) => u[1] === ORIGIN + 'blocked.html'));
  const info = await send({ type: 'blockedInfo' }, { id: ID, url: ORIGIN + 'blocked.html', tab: { id: 1 } });
  assert.equal(info.url, 'https://www.youtube.com/watch?v=x');
  assert.ok(alarms['lock-end']);

  // 3. unchanged status → no rebuild (same rule objects)
  const before = dynamicRules;
  await refresh();
  assert.equal(dynamicRules, before);

  // 4. daemon dies mid-session → rules stay
  daemon = { mode: 'down' };
  now += 10 * 60000;
  v = await refresh();
  assert.equal(v.locked, true);
  assert.equal(dynamicRules.length, 4);

  // 5. daemon comes back saying "inactive" (state lost) → rules stay until lockedUntil
  daemon = { mode: 'up', status: status(false) };
  v = await refresh();
  assert.equal(v.locked, true);
  assert.equal(dynamicRules.length, 4);

  // 6. bfcache recheck from a content script redirects; content scripts cannot call refresh
  updates.length = 0;
  await send({ type: 'recheck' }, { id: ID, url: 'https://youtube.com/', frameId: 0, tab: { id: 9, url: 'https://youtube.com/' } });
  assert.deepEqual(updates, [[9, ORIGIN + 'blocked.html']]);
  const denied = await send({ type: 'refresh' }, { id: ID, url: 'https://evil.example/', frameId: 0, tab: { id: 9, url: 'https://evil.example/' } });
  assert.equal(denied, undefined);

  // 7. history-state navigation into a blocked site during the lock is redirected
  updates.length = 0;
  await Promise.all(listeners.history.map((fn) => fn({ frameId: 0, tabId: 4, url: 'https://m.youtube.com/shorts/1' })));
  assert.deepEqual(updates, [[4, ORIGIN + 'blocked.html']]);
  updates.length = 0;
  await Promise.all(listeners.history.map((fn) => fn({ frameId: 0, tabId: 4, url: 'https://accounts.youtube.com/x' })));
  assert.deepEqual(updates, []);

  // 8. lock time passes while daemon unreachable → rules removed
  daemon = { mode: 'down' };
  now += 51 * 60000;
  v = await refresh();
  assert.equal(v.locked, false);
  assert.equal(dynamicRules.length, 0);

  // 9. heartbeat on every alarm and on every poll — also when /v1/status fails
  daemon = { mode: 'up', status: status(false) };
  calls.length = 0;
  await Promise.all(listeners.alarm.map((fn) => fn({ name: 'tick' })));
  assert.equal(beats(), 1);
  await refresh();
  await refresh();
  assert.equal(beats(), 3);
  daemon = { mode: 'broken' };
  delivered.length = 0;
  v = await refresh();
  assert.equal(v.reachable, false);
  assert.deepEqual(delivered, [{ extensionVersion: '1.0.0' }]);
});

test('worker: M3 probe — mid-lock "inactive" + allowHosts instagram.com keeps instagram blocked', async () => {
  const ig = site('instagram', 'full', ['instagram.com']);
  daemon = { mode: 'up', status: { ...status(true, 30), sites: [ig, ...SITES] } };
  let v = await refresh();
  assert.equal(v.locked, true);
  const spoofSites = [{ ...ig, allowHosts: ['instagram.com'] }, ...SITES.map((s) => ({ ...s, allowHosts: [...s.allowHosts, 'instagram.com'] }))];
  daemon = { mode: 'up', status: { ...status(false), sites: spoofSites } };
  v = await refresh();
  assert.equal(v.locked, true);
  const allowDomains = dynamicRules.filter((r) => r.action.type === 'allow').flatMap((r) => r.condition.requestDomains);
  assert.ok(!allowDomains.includes('instagram.com'));
  assert.ok(dynamicRules.some((r) => r.action.type === 'redirect' && r.condition.requestDomains.includes('instagram.com')));
  updates.length = 0;
  await Promise.all(listeners.history.map((fn) => fn({ frameId: 0, tabId: 7, url: 'https://www.instagram.com/' })));
  assert.deepEqual(updates, [[7, ORIGIN + 'blocked.html']]);
});

test('worker: nextQuote serialises and never repeats back-to-back', async () => {
  const ids = ['a', 'b', 'c'];
  const got = await Promise.all(Array.from({ length: 9 }, () => send({ type: 'nextQuote', ids }, page)));
  const seq = got.map((r) => r.id);
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1]);
  for (let r = 0; r < 3; r++) assert.deepEqual(seq.slice(r * 3, r * 3 + 3).sort(), ids);
});
