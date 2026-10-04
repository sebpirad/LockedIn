// Quote page shown instead of a blocked site. Never offers a way to the blocked site while locked.
// The dev mock (?mock=1) only works outside the extension (no chrome.runtime.id).

import { formatCountdown, shortWhen } from '../lib/time.js';
import { pickNext } from '../lib/shuffle.js';
import { creditParts, daDates } from '../lib/credits.js';

const params = new URLSearchParams(location.search);
const HAS_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const MOCK = !HAS_EXT && params.get('mock') === '1';
const $ = (id) => document.getElementById(id);

let info = { locked: false, lockedUntil: null, url: null };
let target = null;
let ended = false;

// ---------- data ----------

async function workerInfo(type, extra) {
  const v = await chrome.runtime.sendMessage({ type, ...extra });
  if (!v || v.error) throw new Error(v && v.error);
  return v;
}

function mockInfo() {
  const mins = params.has('mins') ? +params.get('mins') : 73;
  const until = mockInfo.until || (mockInfo.until = Date.now() + mins * 60000);
  const locked = params.get('ended') !== '1' && until > Date.now();
  return { locked, lockedUntil: locked ? until : null, url: `https://${params.get('host') || 'www.instagram.com'}/` };
}

const getInfo = (type) => (MOCK ? Promise.resolve(mockInfo()) : workerInfo(type));

const validQuote = (q) => q && typeof q.id === 'string' && typeof q.text === 'string' && q.text.trim() && typeof q.author === 'string';

async function loadQuotes() {
  const tryLoad = async (path) => {
    try {
      const data = await (await fetch(path, { cache: 'no-store' })).json();
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.quotes) ? data.quotes : []);
      return { base: new URL(path, location.href), list: list.filter(validQuote) };
    } catch { return { base: null, list: [] }; }
  };
  let q = await tryLoad('quotes/quotes.json');
  if (!q.list.length && MOCK) q = await tryLoad('dev/sample-quotes.json');
  return q;
}

async function chooseQuote(list) {
  const ids = list.map((q) => q.id);
  let id = null;
  if (MOCK && params.has('q')) {
    id = params.get('q');
  } else if (MOCK) {
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem('bag') || 'null'); } catch { /* ignore */ }
    const r = pickNext(st, ids);
    try { sessionStorage.setItem('bag', JSON.stringify(r.state)); } catch { /* ignore */ }
    id = r.id;
  } else {
    try { id = (await workerInfo('nextQuote', { ids })).id; } catch { /* fall through */ }
  }
  return list.find((q) => q.id === id) || list[Math.floor(Math.random() * list.length)];
}

// ---------- rendering ----------

function httpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? x : null;
  } catch { return null; }
}

function link(text, href) {
  const u = httpUrl(href);
  if (!u || u.protocol !== 'https:') return document.createTextNode(text);
  const a = document.createElement('a');
  a.href = u.href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = text;
  return a;
}

/** One quiet line in Danish: source · translator · photo credit with licence (required for CC BY/BY-SA). */
function credits(q) {
  const c = creditParts(q, !$('portrait').hidden);
  const parts = [];
  if (c.source) parts.push([link(c.source, (q.source || {}).url)]);
  if (c.translator) parts.push([document.createTextNode(c.translator)]);
  if (c.photo) {
    const who = document.createElement('span');
    who.textContent = c.photo.creator;
    if (c.photo.creator !== c.photo.creatorFull) who.title = c.photo.creatorFull;
    const bits = [document.createTextNode('Foto: '), who];
    if (c.photo.license) bits.push(document.createTextNode(', licens '), link(c.photo.license, c.photo.licenseUrl));
    if (c.photo.commons) bits.push(document.createTextNode(', '), link('Wikimedia Commons', c.photo.commons));
    parts.push(bits);
  }
  const out = [];
  parts.forEach((p, i) => { if (i) out.push(document.createTextNode(' · ')); out.push(...p); });
  $('credits').replaceChildren(...out);
}

function renderQuote(q, base) {
  if (!q) return;
  const text = q.text.trim();
  $('text').textContent = text;
  $('text').classList.toggle('short', text.length < 70);
  $('text').classList.toggle('long', text.length > 150);
  $('text').classList.toggle('xlong', text.length > 230);
  $('author').textContent = q.author;
  $('dates').textContent = daDates(q.author_dates);

  const img = q.image;
  if (img && typeof img.file === 'string' && /^(images\/)?[A-Za-z0-9._-]+$/.test(img.file) && base) {
    $('img').src = new URL(img.file, base).href;
    $('img').alt = q.author;
    $('img').addEventListener('error', () => { $('portrait').hidden = true; credits(q); }, { once: true });
    $('portrait').hidden = false;
  }
  credits(q);
  $('quote').hidden = false;
}

function renderHost() {
  const u = httpUrl(target);
  $('host').textContent = u ? u.hostname.replace(/^www\./, '') : '';
}

function showEnded() {
  ended = true;
  $('remain').hidden = true;
  $('ended').hidden = false;
  const u = httpUrl(target);
  if (u) {
    $('backLink').href = u.href;
    $('backLink').textContent = `Fortsæt til ${u.hostname.replace(/^www\./, '')}`;
    $('backWrap').hidden = false;
  }
  document.title = 'Locked in';
}

let checking = false;
async function recheck() {
  if (checking || ended) return;
  checking = true;
  try {
    info = { ...info, ...(await getInfo('refresh')) };
    if (!info.locked || !info.lockedUntil) showEnded();
  } catch { /* keep counting; the worker stays the authority */ } finally {
    checking = false;
  }
}

function tick() {
  if (ended) return;
  const left = (info.lockedUntil || 0) - Date.now();
  if (left <= 0) { recheck(); return; }
  $('remain').textContent = formatCountdown(left);
  $('remain').title = `Låst til ${shortWhen(Date.now(), info.lockedUntil)}`;
  document.title = `${formatCountdown(left)} · Locked in`;
}

async function main() {
  try { info = await getInfo('blockedInfo'); } catch { /* worker unavailable */ }
  target = info.url || null;
  renderHost();
  if (!info.locked || !info.lockedUntil) await recheck();
  if (!ended) {
    $('remain').hidden = false;
    tick();
    setInterval(tick, 1000);
    setInterval(recheck, 30000);
  }
  const { base, list } = await loadQuotes();
  if (list.length) renderQuote(await chooseQuote(list), base);
}

main();
