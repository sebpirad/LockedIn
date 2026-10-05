// Quote page shown instead of a blocked site. Never offers a way to the blocked site while locked.
// The dev mock (?mock=1) only works outside the extension (no chrome.runtime.id).
// Design: docs/QUOTE-DESIGN.md, "Afgørelse". Rules live in lib/quote-type.js (type, credit), lib/quote-frame.js
// (crop, look room) and lib/darkroom.js (the print); this file measures the DOM and applies them.

import { shortWhen } from '../lib/time.js';
import { pickNext } from '../lib/shuffle.js';
import { nextDifferent, makeGate, makeDoubleTap, isNextKey } from '../lib/quote-next.js';
import {
  typeset, pickSize, okLines, ceiling, stepBelow, leading, tracking, measureEm, staggerMs, countWords, lifeDates, displayName,
  creditModel, SOURCE_MAX, remainLabel,
} from '../lib/quote-type.js';
import {
  isDesktop, faceOf, portraitSide, frameDesktop, framePhone, softenPx, grainOpacity, minColumn, zoneShare, stackedBand,
} from '../lib/quote-frame.js';
import { develop, grainPixels } from '../lib/darkroom.js';

const params = new URLSearchParams(location.search);
const HAS_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const MOCK = !HAS_EXT && params.get('mock') === '1';
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const css = (k, v) => root.style.setProperty(k, v);
const px = (v) => `${Math.round(v * 100) / 100}px`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const motion = () => matchMedia('(prefers-reduced-motion: no-preference)').matches;
if (MOCK) root.dataset.mock = '1';

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

/** One draw from the shuffle bag: the worker's (shared by every tab), or the dev mock's in sessionStorage. */
async function drawId(ids) {
  if (MOCK) {
    let st = null;
    try { st = JSON.parse(sessionStorage.getItem('bag') || 'null'); } catch { /* ignore */ }
    const r = pickNext(st, ids);
    try { sessionStorage.setItem('bag', JSON.stringify(r.state)); } catch { /* ignore */ }
    return r.id;
  }
  return (await workerInfo('nextQuote', { ids })).id;
}

async function chooseQuote(list) {
  let id = null;
  if (MOCK && params.has('q')) id = params.get('q');
  else { try { id = await drawId(list.map((q) => q.id)); } catch { /* fall through */ } }
  return list.find((q) => q.id === id) || list[Math.floor(Math.random() * list.length)];
}

// ---------- state for the current quote ----------

let quotes = [];       // every valid quote (for "another quote")
let quote = null;      // the quote object
let base = null;       // URL of quotes.json (images resolve against it)
let ts = null;         // typeset text { lines, words, verse }
let image = null;      // q.image when usable, else null
let face = null;       // normalised face box
let dims = null;       // { W, H } of the image file

const safeFile = (f) => typeof f === 'string' && /^(images\/)?[A-Za-z0-9._-]+$/.test(f);

// ---------- credit line ----------

function renderCredits(sourceMax, shortLink = false) {
  const parts = creditModel(quote, { hasPortrait: !!image, sourceMax, shortLink });
  const out = [];
  parts.forEach((runs, i) => {
    // "·" never starts a line (each part's own words are kept together where it matters: "CC BY 2.0 ↗",
    // "Wikimedia Commons ↗").
    if (i) out.push(document.createTextNode('\u00a0· '));
    for (const r of runs) {
      if (r.href) {
        const a = document.createElement('a');
        a.href = r.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = r.text;
        if (r.title) a.title = r.title;
        out.push(a);
      } else {
        out.push(document.createTextNode(r.text));
      }
    }
  });
  $('credits').replaceChildren(...out);
}

const lineCount = (el) => Math.round(el.offsetHeight / parseFloat(getComputedStyle(el).lineHeight));

/** One line (phone: two). The source is shown whole or left out — never cut; the attribution never is. */
function fitCredits(maxLines) {
  renderCredits(SOURCE_MAX);
  const full = lineCount($('credits'));
  if (full <= maxLines) { root.dataset.creditMin = String(full); return full; }
  renderCredits(0);
  const bare = lineCount($('credits'));
  if (bare > maxLines) {
    renderCredits(0, true); // last resort on a narrow phone: "Commons ↗"
    const shorter = lineCount($('credits'));
    if (shorter < bare) { root.dataset.creditMin = String(shorter); return shorter; }
    renderCredits(0);
  }
  root.dataset.creditMin = String(bare); // what the attribution alone needs
  if (bare >= full) renderCredits(SOURCE_MAX); // dropping the source would not save a line: keep it
  return Math.min(full, bare);
}

// ---------- the quote ----------

/** Tokens = the pieces between break opportunities (spaces, and after a closed-up dash or a real-word hyphen). */
function buildTokens(hang) {
  const el = $('text');
  el.replaceChildren();
  ts.lines.forEach((line, li) => {
    // Verse: each verse line is its own block with a hanging indent, so a long line that runs over (Shakespeare)
    // keeps its shape; prose is one run of text.
    const box = ts.verse ? el.appendChild(Object.assign(document.createElement('span'), { className: 'vl' })) : el;
    const words = line.split(' ');
    words.forEach((w, wi) => {
      const bits = w.split(/(?<=[—–\-/])(?=[^\s\u2060])/);
      bits.forEach((b, bi) => {
        const s = document.createElement('span');
        s.className = 'tk';
        const first = li === 0 && wi === 0 && bi === 0;
        const last = li === ts.lines.length - 1 && wi === words.length - 1 && bi === bits.length - 1;
        s.textContent = (first && !hang ? '“' : '') + b + (last ? '”' : '');
        s.dataset.sep = bi < bits.length - 1 ? '' : ' ';
        s.dataset.v = String(li);
        box.append(s);
        if (bi === bits.length - 1 && wi < words.length - 1) box.append(document.createTextNode(' '));
      });
    });
  });
}

/** Tokens grouped into the browser's lines. */
function currentLines() {
  const lines = [];
  let top = null;
  for (const s of $('text').querySelectorAll('.tk')) {
    const t = s.offsetTop;
    if (top === null || Math.abs(t - top) > 2) { lines.push([]); top = t; }
    lines[lines.length - 1].push(s);
  }
  return lines;
}

const lineText = (tokens) => tokens.map((s, k) => s.textContent + (k < tokens.length - 1 ? s.dataset.sep : '')).join('');

function setSize(size) {
  css('--qpx', px(size));
  css('--lh', String(leading(size)));
  css('--tr', `${tracking(size)}em`);
}

function measureAt(size, budget, stubs = true) {
  const el = $('text');
  setSize(size);
  el.style.removeProperty('max-width');
  el.classList.remove('many');
  let chars = [];
  const words = () => { const ls = currentLines(); chars = ls.map((t) => [...lineText(t)].length); return ls.map((t) => countWords(lineText(t))); };
  let lw = words();
  // Balanced breaking may leave a short first line ("Limits, like / fears, are often / …"); greedy breaking
  // fills the first lines. Use it when balance is too long (> 5 lines) or would fail the no-fragments rule.
  const verseLines = ts.verse ? ts.lines.length : 0;
  let lc = chars;
  if (lw.length > 5 || !okLines(size, lw, ts.words, ts.verse, verseLines, lc, ts.verseLong, stubs)) {
    el.classList.add('many');
    const greedy = words();
    if (lw.length > 5 || okLines(size, greedy, ts.words, ts.verse, verseLines, chars, ts.verseLong, stubs)) { lw = greedy; lc = chars; } else { el.classList.remove('many'); words(); }
  }
  const fitsNow = () => $('quote').offsetHeight <= budget && el.scrollWidth <= el.clientWidth + 1;
  let fits = fitsNow();
  // It fits but leaves a stranded word or a stub line ("for the / remaining quarter."): a slightly narrower measure
  // usually re-breaks it cleanly at the same size. Taken only if it still fits.
  if (fits && !okLines(size, lw, ts.words, ts.verse, verseLines, lc, ts.verseLong, stubs) && !ts.verse) {
    const many = el.classList.contains('many');
    let found = false;
    for (const k of [0.94, 0.88, 0.82]) {
      el.style.maxWidth = `min(${k * 100}%, calc(var(--measure) * ${k}em))`;
      for (const greedy of [false, true]) {
        el.classList.toggle('many', greedy);
        const w = words();
        if (okLines(size, w, ts.words, false, 0, chars, false, stubs) && fitsNow()) { lw = w; lc = chars; found = true; break; }
      }
      if (found) break;
    }
    if (!found) { el.style.removeProperty('max-width'); el.classList.toggle('many', many); words(); }
    fits = fitsNow();
  }
  if (MOCK) (window.fitLog = window.fitLog || []).push({ size, lw, lc, fits, h: $('quote').offsetHeight, budget: Math.round(budget) }); // dev only
  return { lineWords: lw, lineChars: lc, fits };
}

/** Freezes the chosen breaks into one span per line, so each line can rise on its own. */
function freeze(hang) {
  const el = $('text');
  const groups = currentLines();
  const lines = groups.map(lineText);
  el.replaceChildren();
  lines.forEach((text, i) => {
    const ln = document.createElement('span');
    // a verse line that ran over continues with a hanging indent
    const cont = ts.verse && i > 0 && groups[i][0].dataset.v === groups[i - 1][groups[i - 1].length - 1].dataset.v;
    ln.className = cont ? 'ln cont' : 'ln';
    const li = document.createElement('span');
    li.className = 'li';
    li.style.setProperty('--i', String(i));
    if (i === 0) {
      const m = document.createElement('span');
      m.className = hang ? 'hang' : 'mark';
      m.setAttribute('aria-hidden', 'true');
      m.textContent = '“';
      li.append(m);
    }
    li.append(document.createTextNode(i === 0 && !hang ? text.replace(/^“/, '') : text));
    ln.append(li);
    el.append(ln);
    if (i < lines.length - 1) el.append(document.createTextNode(' '));
  });
  css('--stagger', `${staggerMs(lines.length)}ms`);
  return lines.length;
}

function fitQuote({ cap, budget, hang }) {
  const el = $('text');
  css('--measure', String(measureEm(ts.words)));
  el.classList.remove('bodoni');
  buildTokens(hang);
  const opts = { cap, words: ts.words, verse: ts.verse, verseLines: ts.verse ? ts.lines.length : 0, verseLong: ts.verseLong };
  const run = () => {
    // The stub rule is soft: it picks the better breaking at a size, but never costs a step of the scale.
    const strict = pickSize(opts, (size) => measureAt(size, budget, true));
    const loose = pickSize({ ...opts, stubs: false }, (size) => measureAt(size, budget, false));
    return loose.px > strict.px && !loose.overflow ? { ...loose, stubs: false } : strict;
  };
  let r = run();
  // 1× screens: below 40 px Didot's hairlines break up; Bodoni 72 Book is sturdier.
  if (r.px < 40 && (window.devicePixelRatio || 1) < 2) { el.classList.add('bodoni'); r = run(); }
  measureAt(r.px, budget, r.stubs !== false);
  freeze(hang);
  // Sub-pixel drift after freezing: tighten the tracking a hair, then (rarely) take the next step of the scale —
  // the size always stays on the scale.
  let size = r.px;
  const wide = () => [...el.querySelectorAll('.li')].some((s) => s.getBoundingClientRect().width > el.clientWidth + 0.5);
  for (let k = 1; k <= 3 && wide(); k++) css('--tr', `${tracking(size) - 0.004 * k}em`);
  if (wide()) { size = stepBelow(size); setSize(size); }
  el.dataset.px = String(size);
  root.classList.toggle('overflow', r.overflow);
  return { px: size, overflow: r.overflow };
}

// ---------- the portrait ----------

function grain() {
  if (grain.url) return;
  const c = document.createElement('canvas');
  c.width = c.height = 192;
  const g = c.getContext('2d');
  const id = g.createImageData(192, 192);
  id.data.set(grainPixels(192));
  g.putImageData(id, 0, 0);
  grain.url = c.toDataURL('image/png');
  css('--grain', `url(${grain.url})`);
}

function applyFrame(f, desk, vw) {
  const zone = f.zone, p = f.print;
  // whole pixels: a layer edge on a fractional pixel can leave a 1 px line when the page is resampled
  const R = Math.round;
  css('--zl', px(R(zone.left))); css('--zt', px(R(zone.top))); css('--zw', px(R(zone.left + zone.width) - R(zone.left))); css('--zh', px(R(zone.height)));
  $('zone').style.setProperty('--feather', px(f.feather || 0));
  const pr = $('print');
  const set = (k, v) => pr.style.setProperty(k, v);
  set('--pl', px(R(p.left) - R(zone.left))); set('--pt', px(R(p.top) - R(zone.top))); set('--pw', px(R(p.left + p.width) - R(p.left))); set('--ph', px(R(p.top + p.height) - R(p.top)));
  let el = 0, er = 0;
  if (desk) {
    // A print narrower than its zone dissolves at its own edges too: long on the side toward the quote.
    const inL = p.left > zone.left + 1, inR = p.left + p.width < zone.left + zone.width - 1;
    const toward = (len) => clamp(len, 180, p.width * 0.62);
    if (f.side === 'right') {
      if (inL) el = toward(f.face.x - 0.3 * f.face.w - p.left);
      if (inR) er = Math.max(24, p.width * 0.12);
    } else {
      if (inR) er = toward(p.left + p.width - (f.face.x + 0.3 * f.face.w));
      if (inL) el = Math.max(24, p.width * 0.12);
    }
    // A small file that floats (shorter than the window) dissolves at top and bottom too.
    const fy = p.top > 1 ? Math.min(p.height * 0.18, 140) : 0, fb = p.top + p.height < (laid ? laid.vh : innerHeight) - 1 ? Math.min(p.height * 0.18, 140) : 0;
    set('--s0', '0px'); set('--s1', px(fy));
    set('--f0', fb ? px(p.height - fb) : '100%'); set('--f1', '100%');
  } else {
    // a print that does not fill the width (look room, or a close-up printed smaller) dissolves into the dark
    // at that side over a long feather, so it reads as a vignette rather than a pasted rectangle
    if (p.left > 1) el = Math.max(32, p.width * 0.2);
    if (p.left + p.width < vw - 1) er = Math.max(32, p.width * 0.2);
    set('--s0', px(f.strip.from)); set('--s1', px(f.strip.to));
    set('--f0', px(f.fade.from)); set('--f1', px(f.fade.to));
  }
  set('--el', px(el)); set('--er', px(er));
  // Light unit: the face height, but never less than 16 % (or more than 24 %) of the print — a full figure with a
  // tiny face stays lit, as in the darkroom's burn.
  const unit = clamp(f.face.h / p.height, 0.16, 0.24) * p.height;
  css('--fx', px(f.face.x - zone.left)); css('--fy', px(f.face.y - zone.top)); css('--fh', px(unit));
  const dev = f.scale * (window.devicePixelRatio || 1);
  css('--grain-o', String(grainOpacity(dev)));
  const canvas = pr.querySelector('canvas');
  if (canvas) {
    const blur = softenPx(dev);
    canvas.style.setProperty('filter', blur > 0.05 ? `blur(${blur}px)` : 'none');
  }
  root.dataset.frame = JSON.stringify({
    side: f.side, scale: +f.scale.toFixed(3), face: Object.values(f.face).map(Math.round),
    zone: [zone.left, zone.top, zone.width, zone.height].map(Math.round), print: [p.left, p.top, p.width, p.height].map(Math.round),
  });
}

async function loadPortrait(q) {
  const img = new Image();
  // The load event, not decode(): Chrome defers decode() in a hidden tab, and the worker opens this page in
  // background tabs too (every open tab on a blocked site when a lock starts).
  const ok = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = new URL(q.image.file, base).href;
  });
  if (quote !== q) return;
  if (!ok) { portraitFailed(); return; }
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) { portraitFailed(); return; }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  try {
    const id = g.getImageData(0, 0, W, H);
    develop(id.data, W, H, face, q.image.tone);
    g.putImageData(id, 0, 0);
  } catch { portraitFailed(); return; }
  const gr = document.createElement('div');
  gr.className = 'grain';
  grain();
  $('print').replaceChildren(c, gr);
  const known = dims && dims.W === W && dims.H === H;
  dims = { W, H };
  layout({ frameOnly: known });
  void $('print').offsetWidth; // flush, so the opacity transition runs even where rAF is throttled
  $('print').classList.add('is-lit');
  root.dataset.print = 'ready';
}

function portraitFailed() {
  image = null; face = null; dims = null;
  root.classList.add('no-portrait');
  $('print').replaceChildren();
  layout();
}

// ---------- layout ----------

let laid = null;

function layout({ frameOnly = false } = {}) {
  if (!quote) return;
  const vw = innerWidth, vh = innerHeight;
  const desk = isDesktop(vw, vh);
  root.dataset.layout = desk ? 'desktop' : 'phone';

  if (!frameOnly || !laid) {
    // 1. the text column: the side away from the portrait, clear of the face (see frameDesktop), never narrower
    //    than minColumn() — below 1200 px the portrait gives way, not the words
    let colL, colR, frame = null;
    const pad = clamp(vw * 0.05, 32, 80);
    const frameArgs = { pad, minCol: minColumn(vw, pad) };
    if (desk) {
      if (image && dims) {
        const side = portraitSide(face);
        frame = frameDesktop({ W: dims.W, H: dims.H, face, vw, vh, side, ...frameArgs });
        root.dataset.side = side;
        if (side === 'right') { colL = pad; colR = Math.max(colL + 280, frame.textEdge); }
        else { colR = vw - pad; colL = Math.min(colR - 280, frame.textEdge); }
      } else {
        root.dataset.side = 'none';
        colL = pad * 1.5; colR = Math.min(vw - pad * 1.5, colL + 1100);
      }
    } else {
      root.dataset.side = image ? 'top' : 'none';
      // phone: 20 px; a split-screen window gets a little more air
      const m = vw < 480 ? 20 : clamp(vw * 0.055, 20, 48);
      colL = m; colR = vw - m;
    }
    css('--col-left', px(colL));
    css('--col-width', px(colR - colL));
    // The credit starts on the quote's left edge and may run to the edge of the print zone (the face rule is
    // for the quote), never onto the print. On a left-side portrait it may start at the zone's edge if that
    // saves a line.
    const side = root.dataset.side;
    const zoneEdge = vw * (1 - zoneShare(vw));
    const crR = desk && image && dims && side === 'right' ? Math.max(colR, zoneEdge - 24) : colR;
    css('--credit-left', px(colL));
    css('--credit-width', px(crR - colL));

    // 2. timer slot and credit line
    const slotTop = desk ? clamp(vh * 0.055, 28, 56) : 20;
    css('--slot-top', px(slotTop));
    const slotBottom = slotTop + $('slot').offsetHeight;
    const creditBottom = desk ? clamp(vh * 0.045, 20, 40) : 20;
    css('--credit-bottom', px(creditBottom));
    if (fitCredits(desk ? 1 : 2) > 1 && desk && image && dims && side === 'left') {
      const wideL = vw - zoneEdge + 24;
      css('--credit-left', px(wideL));
      css('--credit-width', px(colR - wideL));
      fitCredits(1);
    }
    const creditTop = vh - creditBottom - $('credits').offsetHeight;

    // 3. the quote: the largest step that fits, centred on 46 % of the height (phone: just above the credit,
    //    leaving the portrait at least 34 % of the height)
    const gap = desk ? clamp(vh * 0.045, 24, 44) : 18;
    const cap = ceiling(desk, vh, vw);
    let fit;
    if (desk) {
      fit = fitQuote({ cap, budget: creditTop - gap - (slotBottom + gap), hang: true });
    } else if (image && dims) {
      // Stacked: the portrait owns a band at the top and has dissolved before the quote begins (QA R2-M1), so
      // the quote is sized for what is left below the band — the larger band when it costs at most one step of
      // the type scale, else the smaller one (which always holds a face of minFacePhone).
      const band = stackedBand({ W: dims.W, H: dims.H, face, vw, vh, stripH: slotBottom + 20 });
      fit = fitQuote({ cap, budget: creditTop - gap - band.min, hang: false });
      if (band.want > band.min + 1) {
        const atMin = fit;
        fit = fitQuote({ cap, budget: creditTop - gap - band.want, hang: false });
        if (fit.overflow || fit.px < stepBelow(atMin.px)) fit = fitQuote({ cap, budget: creditTop - gap - band.min, hang: false });
      }
    } else {
      fit = fitQuote({ cap, budget: creditTop - gap - Math.max(vh * 0.34, slotBottom + gap), hang: false });
    }
    const h = $('quote').offsetHeight;
    const top = desk ? clamp(vh * 0.46 - h / 2, slotBottom + gap, creditTop - gap - h) : creditTop - gap - h;
    css('--quote-top', px(top));
    laid = { desk, vw, vh, top, firstLine: fit.px * leading(fit.px), stripH: slotBottom + 20, frameArgs };
  }

  // 4. the print
  if (!image || !dims) return;
  const s = laid;
  const frame = s.desk
    ? frameDesktop({ W: dims.W, H: dims.H, face, vw: s.vw, vh: s.vh, side: portraitSide(face), ...s.frameArgs })
    : framePhone({ W: dims.W, H: dims.H, face, vw: s.vw, vh: s.vh, stripH: s.stripH, textTop: s.top });
  css('--strip', px(s.stripH));
  applyFrame(frame, s.desk, s.vw);
}

let settleTimer = 0;

function renderQuote(q, b) {
  if (!q) return;
  quote = q; base = b;
  ts = typeset(q.text);
  $('author').textContent = displayName(q.author);
  const d = lifeDates(q.author_dates);
  $('dates').textContent = d;
  $('dates').hidden = !d;
  image = q.image && safeFile(q.image.file) && base ? q.image : null;
  face = image ? faceOf(image) : null;
  dims = image ? (image.width > 0 && image.height > 0 ? { W: image.width, H: image.height } : { W: 600, H: 800 }) : null;
  root.classList.toggle('no-portrait', !image);
  layout();
  root.classList.add('is-set');
  clearTimeout(settleTimer); // a change of quote restarts the entrance; the previous one's timer must not cut it
  settleTimer = setTimeout(() => root.classList.add('settled'), motion() ? 700 : 0);
  if (image) loadPortrait(q);
}

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { root.classList.add('settled'); laid = null; layout(); }, 80);
});

// ---------- countdown and "session over" ----------

function linkTo(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? { href: x.href, host: x.hostname.replace(/^www\./, '') } : null;
  } catch { return null; }
}

function showEnded() {
  ended = true;
  const u = linkTo(target);
  if (u) {
    $('backLink').href = u.href;
    $('backLink').textContent = `Fortsæt til ${u.host}`;
    $('backLink').hidden = false;
  }
  root.classList.add('is-ended');
  const r = $('remain');
  if (!r.hidden && motion()) {
    r.classList.add('out');
    setTimeout(() => { r.hidden = true; }, 300);
    $('ended').classList.add('in');
  } else {
    r.hidden = true;
  }
  $('ended').hidden = false;
  document.title = 'LockedIn';
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
  // Hours and minutes, changing once a minute (seconds only in the last minute): the page stays still.
  const label = remainLabel(left);
  if ($('remain').textContent !== label) {
    $('remain').textContent = label;
    $('remain').title = `Låst til ${shortWhen(Date.now(), info.lockedUntil)}`;
    document.title = `${label} · LockedIn`;
  }
}

async function main() {
  try { info = await getInfo('blockedInfo'); } catch { /* worker unavailable */ }
  target = info.url || null;
  const t = linkTo(target);
  root.dataset.host = t ? t.host : ''; // known to the page (and its tests); shown only once the session is over
  if (!info.locked || !info.lockedUntil) await recheck();
  if (!ended) {
    $('remain').hidden = false;
    tick();
    setInterval(tick, 1000);
    setInterval(recheck, 30000);
  }
  const { base: b, list } = await loadQuotes();
  quotes = list;
  if (list.length) renderQuote(await chooseQuote(list), b);
  else root.classList.add('no-quotes'); // the timer shows on its own (normally it waits for the layout)
}

// ---------- another quote: double-click, double-tap, → or Space (no hint on the page) ----------

const gate = makeGate();
const OUT_MS = 180; // the old quote's fade-out; the new one then uses the entrance (all within 600 ms)

async function anotherQuote() {
  if (!quote || quotes.length < 2 || !gate.enter(performance.now())) return;
  try {
    const id = await nextDifferent(() => drawId(quotes.map((q) => q.id)), quote.id);
    const next = id && quotes.find((q) => q.id === id);
    if (!next) return;
    if (motion()) {
      root.classList.add('swap-out');
      await new Promise((r) => setTimeout(r, OUT_MS));
    }
    // The old print goes while nothing shows; the timer slot is never touched (no reset, no jump).
    $('print').classList.remove('is-lit');
    $('print').replaceChildren();
    delete root.dataset.print;
    delete root.dataset.frame;
    root.classList.remove('settled', 'swap-out');
    laid = null;
    renderQuote(next, base);
  } finally {
    gate.leave(performance.now());
  }
}

// Double-click anywhere but a link. A double-click must not select a word on the way.
document.addEventListener('mousedown', (e) => {
  if (e.detail > 1 && !(e.target instanceof Element && e.target.closest('a'))) e.preventDefault();
});
document.addEventListener('dblclick', (e) => {
  if (e.detail > 2 || (e.target instanceof Element && e.target.closest('a'))) return;
  anotherQuote();
});
// Double-tap on a touch screen (where no dblclick may come; if one does, the gate makes it the same change).
const doubleTap = makeDoubleTap();
document.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || (e.target instanceof Element && e.target.closest('a'))) return;
  if (doubleTap(e.timeStamp, e.clientX, e.clientY)) anotherQuote();
});
document.addEventListener('keydown', (e) => {
  if (!isNextKey(e)) return;
  if (e.key !== 'ArrowRight' && e.target instanceof Element && e.target.closest('a, button')) return; // Space on a link stays the link's
  e.preventDefault();
  anotherQuote();
});

main();
