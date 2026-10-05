// Designer 1 — shared engine for the two editorial mockups (dev only, never shipped).
// Loads the REAL quotes.json + images, typesets the quote, treats the portrait
// (auto-levels + duotone on a canvas, face-aware crop) and fits the quote to its box.
//
// URL (dev): ?q=<id>  ?mins=<n>  ?ended=1  ?host=<host>  ?still=1 (no entrance motion)
// Keys (dev): ← / → previous/next quote · E toggles the "session over" state.

import { formatCountdown, shortWhen } from '../../lib/time.js';
import { creditParts, daDates } from '../../lib/credits.js';

const params = new URLSearchParams(location.search);
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('still') === '1';

// ---------------------------------------------------------------- data

export async function loadData() {
  const [quotes, focus] = await Promise.all([
    fetch('../../quotes/quotes.json', { cache: 'no-store' }).then((r) => r.json()),
    fetch('d1-focus.json').then((r) => r.json()).catch(() => ({})),
  ]);
  const list = (Array.isArray(quotes) ? quotes : quotes.quotes || []).filter((q) => q && q.id && q.text && q.author);
  return { list, focus };
}

// ---------------------------------------------------------------- typesetting

/**
 * Typographic quotes, apostrophes, dashes. When the page wraps the quote in “ ” (wrapped = true)
 * inner double quotes become single, as nesting requires; otherwise they stay double.
 */
export function typeset(text, { wrapped = true } = {}) {
  let t = String(text).trim();
  t = t.replace(/“|”/g, '"');
  const [o, c] = wrapped ? ['‘', '’'] : ['“', '”'];
  t = t.replace(/(^|[\s(\[—–-])"/g, `$1${o}`).replace(/"/g, c);
  t = t.replace(/(\w)'(\w)/g, '$1’$2');
  t = t.replace(/(^|[\s(\[—–])'/g, '$1‘').replace(/'/g, '’');
  t = t.replace(/\s*--\s*/g, ' — ').replace(/\.\.\./g, '…');
  // A dash never starts a line; in longer quotes the last word never stands alone.
  t = t.replace(/ —/g, ' —');
  t = t.replace(/(\S)([—–])(?=\S)/g, '$1\u2060$2'); // never break before a closed-up dash
  // a hyphen may end a line only if both halves are real words (no "to-|morrow", "10-|minute")
  t = t.replace(/(^|[^\w])(\w{1,3})-(?=\w)/g, '$1$2-\u2060').replace(/(\w)-(\w{1,3})(?=[^\w]|$)/g, '$1-\u2060$2');
  // Verse (Piet Hein's grooks): " / " marks a line break in the poem.
  if (/ \/ /.test(t)) return t.split(/ \/ /).join('\n');
  if (t.split(' ').length >= 6) t = t.replace(/ (\S{1,9})$/, ' $1');
  return t;
}

/** "Laozi (traditional attribution)" → "Laozi". */
export const cleanName = (a) => String(a).replace(/\s*\([^)]*\)\s*/g, ' ').trim();

/** Danish dates, incl. living people: "born 1963" → "f. 1963". */
export function dates(q) {
  let s = daDates(q.author_dates || '');
  s = s.replace(/^(born|b\.)\s*/i, 'f. ');
  return s.replace(/(\d)–(\d)/g, '$1–$2');
}

/** Short source for a quiet line: title without publisher notes, a year without research notes. */
export function shortSource(q) {
  const src = q.source || {};
  let work = String(src.work || '').trim();
  const bare = work.replace(/\s*\([^)]*\)/g, '').trim();
  if (bare.length >= 10) work = bare;
  work = work.split(/;\s/)[0];
  const full = work;
  const colon = work.indexOf(': ');
  if (work.length > 56 && colon >= 14 && !/(^|\s)['‘“"]/.test(work.slice(0, colon))) work = work.slice(0, colon);
  if (work.length > 70) work = work.slice(0, 68).replace(/[\s,.:;—–-]+\S*$/, '') + '…';
  let year = String(src.year || '').replace(/\s*\([^)]*\)/g, '').trim();
  if (year.length > 22 || !/\d/.test(year)) year = (year.match(/\d{3,4}/) || [''])[0];
  year = daDates(year);
  return { work, full, year };
}

const LINK_ATTRS = { target: '_blank', rel: 'noopener noreferrer' };
function link(text, href) {
  try {
    const u = new URL(href);
    if (u.protocol !== 'https:') throw 0;
    const a = document.createElement('a');
    a.href = u.href; Object.assign(a, LINK_ATTRS); a.textContent = text;
    return a;
  } catch { return document.createTextNode(text); }
}

/** CC licences (not PD/CC0) need "changes indicated" once we duotone/crop the photo. */
export const isAdaptedCC = (lic) => /^CC BY/i.test(lic || '');

/** Fills `el` with: <i>work</i>, year · Overs. X */
export function renderSource(el, q) {
  const s = shortSource(q);
  const parts = [];
  if (s.work) {
    const i = document.createElement('i');
    i.textContent = s.work;
    if (s.full !== s.work) i.title = s.full;
    const a = link('', (q.source || {}).url);
    let head = i;
    if (a.nodeType === 1) { a.replaceChildren(i); head = a; }
    parts.push(s.year ? [head, document.createTextNode(`, ${s.year}`)] : [head]);
  } else if (s.year) parts.push([document.createTextNode(s.year)]);
  const tr = q.translation && String(q.translation.translator || '').replace(/\s*\([^)]*\)/g, '').trim();
  if (tr) parts.push([document.createTextNode(`Overs. ${tr}`)]);
  el.replaceChildren(...join(parts, ' · '));
  el.hidden = !parts.length;
}

/** Fills `el` with: Foto: creator · licence · Wikimedia Commons (· bearbejdet) */
export function renderPhotoCredit(el, q, { adapted = true, sep = ' · ' } = {}) {
  const c = creditParts(q, true).photo;
  if (!c) { el.replaceChildren(); el.hidden = true; return; }
  const who = document.createElement('span');
  who.textContent = c.creator;
  if (c.creator !== c.creatorFull) who.title = c.creatorFull;
  const parts = [[document.createTextNode('Foto: '), who]];
  if (c.license) parts.push([link(c.license, c.licenseUrl)]);
  if (c.commons) parts.push([link('Wikimedia Commons', c.commons)]);
  if (adapted && isAdaptedCC(c.license)) parts.push([document.createTextNode('bearbejdet')]);
  el.replaceChildren(...join(parts, sep));
  el.hidden = false;
}

function join(parts, sep) {
  const out = [];
  parts.forEach((p, i) => { if (i) out.push(document.createTextNode(sep)); out.push(...p); });
  return out;
}

// ---------------------------------------------------------------- portrait treatment

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/**
 * Draws `img` into a canvas: auto-levels (p1/p99 + gamma to a target median), then a
 * duotone ramp ink → mid → light, capped so no portrait outshines the quote.
 * → { canvas, stats: {p1, p99, median, gamma} }
 */
export function treat(img, { ink = '#0b0a09', mid = '#6b6052', light = '#e7ddcb', cap = 0.94, median = 0.40, faceTone = 0.56, contrast = 0.18 } = {}, face = null) {
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, w, h);
  const px = data.data;
  const n = w * h;
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const L = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    lum[j] = L; hist[L | 0]++;
  }
  const pct = (p) => { let acc = 0; const t = p * n; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
  const p1 = pct(0.01), p99 = pct(0.99), med = pct(0.5);
  const span = Math.max(24, p99 - p1);
  // Expose for the face when we know where it is (median of the face box), else for the frame.
  let ref = med, target = median;
  if (face) {
    const x0 = Math.max(0, Math.round((face.x - face.w / 2) * w)), x1 = Math.min(w, Math.round((face.x + face.w / 2) * w));
    const y0 = Math.max(0, Math.round((face.y - face.h / 2) * h)), y1 = Math.min(h, Math.round((face.y + face.h / 2) * h));
    const fh = new Uint32Array(256); let fn = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { fh[lum[y * w + x] | 0]++; fn++; }
    if (fn > 64) { let acc = 0; for (let v = 0; v < 256; v++) { acc += fh[v]; if (acc >= fn / 2) { ref = v; break; } } target = faceTone; }
  }
  const mN = clamp((ref - p1) / span, 0.02, 0.98);
  const gamma = clamp(Math.log(target) / Math.log(mN), 0.55, 1.8);
  // 256-entry LUT: levels → gamma → gentle S-curve → cap → 3-stop ramp
  const A = hex(ink), M = hex(mid), B = hex(light);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    let t = clamp((v - p1) / span, 0, 1);
    t = Math.pow(t, gamma);
    t = t + contrast * 2 * t * (1 - t) * (2 * t - 1); // gentle S, monotonic for contrast ≤ .5
    t = clamp(t, 0, 1) * cap;
    const [c0, c1, u] = t < 0.5 ? [A, M, t / 0.5] : [M, B, (t - 0.5) / 0.5];
    for (let k = 0; k < 3; k++) lut[v * 3 + k] = c0[k] + (c1[k] - c0[k]) * u;
  }
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const v = lum[j] | 0;
    px[i] = lut[v * 3]; px[i + 1] = lut[v * 3 + 1]; px[i + 2] = lut[v * 3 + 2];
  }
  cx.putImageData(data, 0, 0);
  return { canvas: cv, stats: { p1, p99, median: med, face: face ? ref : null, gamma: +gamma.toFixed(2) } };
}

/** Monochrome grain tile as a data URL (static; generated once). */
let grainUrl = null;
export function grain(size = 180) {
  if (grainUrl) return grainUrl;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const cx = cv.getContext('2d');
  const d = cx.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 120;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = g; d.data[i + 3] = 255;
  }
  cx.putImageData(d, 0, 0);
  return (grainUrl = cv.toDataURL('image/png'));
}

/** Face box for an image file (Vision framework, see d1-focus.json) or null. */
export function faceOf(focus, file) {
  const f = focus[String(file).split('/').pop()];
  return f && f.n && f.conf > 0.5 ? f : null;
}

/**
 * Cover-crop with intent: scale so the face reaches `faceFrac` of the box height (never
 * below cover, never above `maxPx` CSS px per image px), then put the face centre at
 * (ax, ay) of the box, clamped so the image always covers the box.
 */
export function cropTo(el, box, nat, face, { ax = 0.5, ay = 0.36, faceFrac = 0.24, maxPx = 1.9, minX = 0 } = {}) {
  const { width: W, height: H } = box;
  const { w, h } = nat;
  const s0 = Math.max(W / w, H / h);
  const fx = face ? face.x : 0.5, fy = face ? face.y : 0.3;
  const place = (s) => {
    const dw = w * s, dh = h * s;
    return { dw, dh, left: clamp(ax * W - fx * dw, W - dw, 0), top: clamp(ay * H - fy * dh, H - dh, 0) };
  };
  let s = s0;
  if (face) s = clamp((faceFrac * H) / (face.h * h), s0, Math.max(s0, maxPx));
  // A face stuck near the plate's faded edge gets a little more scale (≤ 1.35×) to reach minX.
  if (face && minX) {
    const p = place(s);
    if (p.left + fx * p.dw < minX * W) s = Math.min(Math.max(s, (minX * W) / (fx * w)), 1.35 * s0, Math.max(s0, maxPx));
  }
  const p = place(s);
  Object.assign(el.style, { width: `${p.dw}px`, height: `${p.dh}px`, left: `${p.left}px`, top: `${p.top}px` });
  return { scale: s, upscale: s * devicePixelRatio };
}

// ---------------------------------------------------------------- fitting + line reveal

/**
 * Largest font size in [min, max] at which `el` fits `maxH` and no word overflows the width.
 * Line height and tracking follow the size (tight when big, open when small).
 */
export function fit(el, { min, max, maxH, lh = [1.24, 1.0], track = [0, -0.02], range = [28, 140], maxLines = 0 }) {
  const set = (s) => {
    const k = clamp((s - range[0]) / (range[1] - range[0]), 0, 1);
    el.style.fontSize = `${s}px`;
    el.style.lineHeight = (lh[0] + (lh[1] - lh[0]) * k).toFixed(3);
    el.style.letterSpacing = `${(track[0] + (track[1] - track[0]) * k).toFixed(4)}em`;
  };
  let lo = Math.floor(min), hi = Math.floor(max), best = lo;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    set(m);
    let ok = el.scrollHeight <= maxH + 1 && el.scrollWidth <= el.clientWidth + 1;
    if (ok && maxLines) ok = Math.round(el.scrollHeight / parseFloat(getComputedStyle(el).lineHeight)) <= maxLines;
    if (ok) { best = m; lo = m + 1; } else hi = m - 1;
  }
  set(best);
  return { size: best, set };
}

/** Line breaks are frozen; if a frozen line still overflows (sub-pixel drift), step down 2 px and redo. */
export function settle(el, text, fitted, opts) {
  let size = fitted.size;
  for (let k = 0; k < 6; k++) {
    splitLines(el, text, opts);
    const over = [...el.querySelectorAll('.ln > span')].some((s) => s.getBoundingClientRect().width > el.clientWidth + 0.5);
    if (!over) break;
    size -= 2; fitted.set(size);
  }
  el.dataset.size = size;
  return size;
}

/**
 * Freezes the current line breaks into <span class="ln"><span>…</span></span> so each line can
 * rise from its own mask. Text stays in reading order; screen readers get the blockquote's label.
 */
export function splitLines(el, text, { openMark = '', closeMark = '', hang = true } = {}) {
  el.textContent = '';
  const verses = text.split('\n');
  const spans = [];
  verses.forEach((v, vi) => {
    const words = v.split(/ /);
    words.forEach((w, i) => {
      // a closed-up dash is a break opportunity inside a "word": never—in → [never—][in]
      const bits = w.split(/(?<=[—–\-\/])(?=[^\s\u2060])/);
      bits.forEach((b, k) => {
        const s = document.createElement('span');
        const last = vi === verses.length - 1 && i === words.length - 1 && k === bits.length - 1;
        const first = vi === 0 && i === 0 && k === 0;
        s.textContent = (first && !hang ? openMark : '') + b + (last ? closeMark : '');
        s.dataset.sep = k < bits.length - 1 ? '' : ' ';
        el.append(s);
        spans.push(s);
      });
      if (i < words.length - 1) el.append(document.createTextNode(' '));
    });
    if (vi < verses.length - 1) el.append(document.createElement('br'));
  });
  const lines = [];
  let top = null;
  for (const s of spans) {
    const t = Math.round(s.offsetTop);
    if (top === null || Math.abs(t - top) > 2) { lines.push([]); top = t; }
    lines[lines.length - 1].push(s);
  }
  el.textContent = '';
  lines.forEach((ws, i) => {
    const outer = document.createElement('span');
    outer.className = 'ln';
    const inner = document.createElement('span');
    inner.textContent = ws.map((s, k) => s.textContent + (k < ws.length - 1 ? s.dataset.sep : '')).join('');
    if (i === 0 && openMark && hang) {
      const mark = document.createElement('span');
      mark.className = 'hang';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = openMark;
      inner.prepend(mark);
    }
    inner.style.setProperty('--i', i);
    outer.append(inner);
    el.append(outer, document.createTextNode(i < lines.length - 1 ? ' ' : ''));
  });
  el.style.setProperty('--lines', lines.length);
  // stagger so the last line finishes by 600 ms: 40 ms lead-in + ≤ 140 ms spread + 420 ms per line
  el.style.setProperty('--stagger', `${lines.length > 1 ? Math.min(45, 140 / (lines.length - 1)) : 0}ms`);
  return lines.length;
}

// ---------------------------------------------------------------- session state (mock)

export function session(onChange) {
  const mins = params.has('mins') ? +params.get('mins') : 73;
  const host = params.get('host') || 'instagram.com';
  let until = Date.now() + mins * 60000;
  let ended = params.get('ended') === '1';
  const state = () => ({
    ended,
    host,
    left: ended ? '' : formatCountdown(until - Date.now()),
    until: ended ? '' : shortWhen(Date.now(), until),
  });
  const tick = () => {
    if (!ended && until - Date.now() <= 0) ended = true;
    onChange(state());
    document.title = ended ? 'LockedIn' : `${state().left} · LockedIn`;
  };
  tick();
  setInterval(tick, 1000);
  return { toggle() { ended = !ended; if (!ended) until = Date.now() + mins * 60000; tick(); } };
}

// ---------------------------------------------------------------- quote choice + dev keys

export function pickIndex(list) {
  if (params.has('q')) {
    const i = list.findIndex((q) => q.id === params.get('q'));
    if (i >= 0) return i;
  }
  return Math.floor(Math.random() * list.length);
}

export function devKeys({ next, prev, toggleEnded }) {
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
    else if (e.key === 'e' || e.key === 'E') toggleEnded();
  });
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    if (params.get('noimg') === '1') { rej(new Error('noimg')); return; } // dev: fallback without portrait
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
    im.onerror = rej;
    im.src = src;
  });
}

export { $, clamp, params };
