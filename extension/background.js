// Locked in — service worker: syncs with lockedind and enforces the lock in Chrome.
// Never imports anything from dev/ — the UI mock cannot reach the blocking logic.

import { createApi, isValidStatus } from './lib/api.js';
import { reduceLock, isLocked, emptyLockState } from './lib/lock.js';
import { buildRules, rulesHash } from './lib/rules.js';
import { findBlockedSite, isValidDomain } from './lib/domains.js';
import { pickNext } from './lib/shuffle.js';
import { findIcon, sitesNeedingIcons, iconIsFresh, sameBytes, SENTINEL_PAGE, ICON_PX, MAX_DATA_URL } from './lib/icons.js';

const api = createApi();
const VERSION = chrome.runtime.getManifest().version;
const BLOCKED_URL = chrome.runtime.getURL('blocked.html');
const PAGE_ORIGIN = chrome.runtime.getURL('');
const TICK = 'tick';
const LOCK_END = 'lock-end';

// In-memory mirror of chrome.storage.local "lock" (+ runtime info that is not persisted).
let state = emptyLockState();
let runtime = { reachable: false, lastError: null, lastOkAt: null };
const targets = new Map(); // tabId → original URL that was blocked

const ready = (async () => {
  const got = await chrome.storage.local.get(['lock', 'runtime']);
  if (got.lock) state = { ...emptyLockState(), ...got.lock };
  if (got.runtime) runtime = { ...runtime, ...got.runtime };
  const sess = await chrome.storage.session.get('targets').catch(() => ({}));
  for (const [k, v] of Object.entries(sess.targets || {})) targets.set(+k, v);
})();

// ---------- sync ----------

let running = null;
let queued = null;
// Every poll also sends a heartbeat, independently of storage or status errors: the daemon
// closes Chrome during a session after 2 minutes without one.
function sync() {
  heartbeat();
  if (!running) {
    running = doSync().catch((e) => console.error('[locked-in] sync', e)).finally(() => { running = null; });
    return running;
  }
  if (!queued) queued = running.then(() => { queued = null; return sync(); });
  return queued;
}

async function doSync() {
  await ready;
  let status = null;
  let error = null;
  try {
    const s = await api.status();
    if (isValidStatus(s)) status = s;
    else error = 'Ugyldigt svar fra Locked in-tjenesten';
  } catch (e) {
    error = e.message;
  }
  const now = Date.now();
  const next = reduceLock(state, status, now);
  state = { lockedUntil: next.lockedUntil, lockSites: next.lockSites, lastStatus: next.lastStatus };
  runtime = { reachable: !!status, lastError: error, lastOkAt: status ? now : runtime.lastOkAt };
  await chrome.storage.local.set({ lock: state, runtime });

  if (next.lockedUntil) chrome.alarms.create(LOCK_END, { when: next.lockedUntil + 500 });
  await enforce(next.locked ? state.lockSites : []);
  queueMissingIcons();
}

// ---------- DNR ----------

const regexOk = new Map();
async function dropUnsupportedRegex(rules) {
  const out = [];
  for (const r of rules) {
    const re = r.condition.regexFilter;
    if (re) {
      if (!regexOk.has(re)) {
        const res = await chrome.declarativeNetRequest.isRegexSupported({ regex: re }).catch(() => ({ isSupported: false }));
        regexOk.set(re, !!res.isSupported);
      }
      if (!regexOk.get(re)) continue;
    }
    out.push(r);
  }
  return out.map((r, i) => ({ ...r, id: i + 1 }));
}

async function enforce(sites) {
  const rules = sites.length ? await dropUnsupportedRegex(buildRules(sites)) : [];
  const hash = rulesHash(rules);
  const current = await chrome.declarativeNetRequest.getDynamicRules();
  const { rulesHash: stored } = await chrome.storage.local.get('rulesHash');
  if (stored === hash && current.length === rules.length) return;

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: current.map((r) => r.id), addRules: rules,
    });
  } catch (e) {
    // One bad rule rejects the batch; add them one by one so the rest still applies.
    console.error('[locked-in] updateDynamicRules', e);
    const now = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: now.map((r) => r.id) }).catch(() => {});
    for (const r of rules) {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [r] })
        .catch((err) => console.error('[locked-in] rule rejected', r, err));
    }
  }
  await chrome.storage.local.set({ rulesHash: hash });
  if (rules.length) await sweepTabs();
}

// ---------- tabs ----------

function blockedSiteFor(url) {
  if (!url || url.startsWith(PAGE_ORIGIN)) return null;
  if (!isLocked(state, Date.now())) return null;
  return findBlockedSite(url, state.lockSites);
}

async function rememberTarget(tabId, url) {
  targets.set(tabId, url);
  await chrome.storage.session.set({ targets: Object.fromEntries(targets) }).catch(() => {});
}

async function redirectTab(tabId, url) {
  await rememberTarget(tabId, url);
  await chrome.tabs.update(tabId, { url: BLOCKED_URL }).catch(() => {});
}

async function sweepTabs() {
  const tabs = await chrome.tabs.query({});
  for (const t of tabs) {
    const url = t.pendingUrl || t.url;
    if (blockedSiteFor(url)) await redirectTab(t.id, url);
  }
}

const NAV_FILTER = { url: [{ schemes: ['http', 'https'] }] };

chrome.webNavigation.onBeforeNavigate.addListener(async (d) => {
  if (d.frameId !== 0) return;
  await ready;
  if (blockedSiteFor(d.url)) await rememberTarget(d.tabId, d.url);
}, NAV_FILTER);

async function recheckNav(d) {
  if (d.frameId !== 0) return;
  await ready;
  if (blockedSiteFor(d.url)) await redirectTab(d.tabId, d.url);
}
chrome.webNavigation.onCommitted.addListener(recheckNav, NAV_FILTER);
chrome.webNavigation.onHistoryStateUpdated.addListener(recheckNav, NAV_FILTER);

chrome.tabs.onRemoved.addListener((tabId) => {
  if (targets.delete(tabId)) chrome.storage.session.set({ targets: Object.fromEntries(targets) }).catch(() => {});
});

// ---------- heartbeat / alarms ----------

function heartbeat() {
  try {
    return api.heartbeat(VERSION).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

async function ensureAlarm() {
  if (!(await chrome.alarms.get(TICK))) chrome.alarms.create(TICK, { periodInMinutes: 0.5, delayInMinutes: 0.5 });
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === TICK) await sync();
  else if (a.name === LOCK_END) await sync();
});

chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); sync(); });
chrome.runtime.onStartup.addListener(() => { ensureAlarm(); sync(); });
ensureAlarm().catch(() => {});

// ---------- toolbar ----------

chrome.action.onClicked.addListener(async () => {
  const appUrl = chrome.runtime.getURL('app.html');
  const [tab] = await chrome.tabs.query({ url: appUrl + '*' });
  if (tab) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: appUrl });
  }
});

// ---------- icons for own sites ----------
// Only for sites that are not blocked right now; nothing is weakened to fetch an icon.

function isBlockedNow(url) {
  if (isLocked(state, Date.now()) && findBlockedSite(url, state.lockSites)) return true;
  const sites = state.lastStatus && Array.isArray(state.lastStatus.sites) ? state.lastStatus.sites : [];
  return !!findBlockedSite(url, sites);
}

async function fetchCapped(url, maxBytes) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) return null;
    // A redirect may land on a blocked host: check the final URL too.
    if (r.url && isBlockedNow(r.url)) return null;
    const buf = await r.arrayBuffer();
    return buf.byteLength > maxBytes ? null : { buf, type: r.headers.get('content-type') || '' };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let globeBytes = null;
async function faviconBytes(pageUrl) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(ICON_PX));
  const r = await fetch(u.href).catch(() => null);
  return r && r.ok ? r.arrayBuffer() : null;
}

const iconDeps = {
  isBlocked: isBlockedNow,
  async faviconCache(pageUrl) {
    const buf = await faviconBytes(pageUrl);
    if (!buf) return null;
    if (!globeBytes) globeBytes = await faviconBytes(SENTINEL_PAGE);
    return sameBytes(buf, globeBytes) ? null : new Blob([buf], { type: 'image/png' });
  },
  async fetchText(url) {
    const r = await fetchCapped(url, 1024 * 1024);
    return r && /html/i.test(r.type) ? new TextDecoder().decode(r.buf) : null;
  },
  async fetchBlob(url) {
    const r = await fetchCapped(url, 512 * 1024);
    return r ? new Blob([r.buf], { type: r.type }) : null;
  },
  async encode(blob) {
    let bmp;
    try { bmp = await createImageBitmap(blob); } catch { return null; }
    if (bmp.width < 8 || bmp.height < 8) return null;
    const c = new OffscreenCanvas(ICON_PX, ICON_PX);
    const g = c.getContext('2d');
    const k = Math.min(ICON_PX / bmp.width, ICON_PX / bmp.height);
    const w = bmp.width * k, h = bmp.height * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, (ICON_PX - w) / 2, (ICON_PX - h) / 2, w, h);
    const png = new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let bin = '';
    for (let i = 0; i < png.length; i += 0x8000) bin += String.fromCharCode(...png.subarray(i, i + 0x8000));
    const url = 'data:image/png;base64,' + btoa(bin);
    return url.length <= MAX_DATA_URL ? url : null;
  },
};

let iconChain = Promise.resolve();
function fetchIcons(domains, force) {
  const run = iconChain.then(async () => {
    for (const domain of domains) {
      if (!isValidDomain(domain)) continue;
      const { icons = {} } = await chrome.storage.local.get('icons');
      if (!force && iconIsFresh(icons[domain], Date.now())) continue;
      const r = await findIcon(domain, iconDeps);
      if (r.skipped) continue; // blocked now: try again another time
      const { icons: latest = {} } = await chrome.storage.local.get('icons');
      latest[domain] = r.dataUrl ? { data: r.dataUrl, at: Date.now(), source: r.source } : { none: true, at: Date.now() };
      await chrome.storage.local.set({ icons: latest });
    }
  });
  iconChain = run.catch(() => {});
  return run;
}

async function queueMissingIcons() {
  try {
    const { icons = {} } = await chrome.storage.local.get('icons');
    const sites = state.lastStatus && state.lastStatus.sites;
    const todo = sitesNeedingIcons(sites, icons, isBlockedNow, Date.now()).slice(0, 5);
    if (todo.length) fetchIcons(todo, false);
  } catch { /* best effort */ }
}

// ---------- messages ----------

function view() {
  const now = Date.now();
  return {
    now,
    status: state.lastStatus,
    reachable: runtime.reachable,
    lastError: runtime.lastError,
    lastOkAt: runtime.lastOkAt,
    locked: isLocked(state, now),
    lockedUntil: state.lockedUntil,
  };
}

let quoteChain = Promise.resolve();
function nextQuote(ids) {
  const run = quoteChain.then(async () => {
    const { quoteBag } = await chrome.storage.local.get('quoteBag');
    const r = pickNext(quoteBag, ids);
    await chrome.storage.local.set({ quoteBag: r.state });
    return r.id;
  });
  quoteChain = run.catch(() => {});
  return run;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg.type !== 'string') return;
  // Extension pages (app.html, blocked.html) have a chrome-extension:// sender.url; content scripts don't.
  const fromPage = typeof sender.url === 'string' && sender.url.startsWith(PAGE_ORIGIN);

  // The only message a content script may send.
  if (msg.type === 'recheck') {
    const tab = sender.tab;
    if (tab && sender.frameId === 0) {
      ready.then(() => (blockedSiteFor(tab.url) ? redirectTab(tab.id, tab.url) : null)).finally(() => sendResponse({}));
      return true;
    }
    return;
  }
  if (!fromPage) return;

  (async () => {
    await ready;
    switch (msg.type) {
      case 'refresh':
        await sync();
        return view();
      case 'state':
        return view();
      case 'blockedInfo': {
        const url = sender.tab ? targets.get(sender.tab.id) || null : null;
        return { ...view(), url };
      }
      case 'fetchIcon': {
        const domain = String(msg.domain || '').toLowerCase();
        if (!isValidDomain(domain)) return { error: 'invalid' };
        await fetchIcons([domain], true);
        return { ok: true };
      }
      case 'nextQuote':
        return { id: await nextQuote(Array.isArray(msg.ids) ? msg.ids.slice(0, 5000) : []) };
      default:
        return { error: 'unknown' };
    }
  })().then(sendResponse, (e) => sendResponse({ error: String(e && e.message) }));
  return true;
});

// Service-worker start (every wake-up): heartbeat + sync right away.
sync();
