// DEV ONLY — quote page, design direction 2 ("cinematic"). Never shipped; loaded by d2-a.html and d2-b.html.
//
// Three jobs the CSS cannot do alone:
//   1. develop()  — "darkroom": every portrait, colour or B&W, photo or painting, is re-printed through one tone curve
//                   and one warm monochrome palette, exposed for the FACE (not the whole frame).
//   2. frame()    — art-directed crop: the face (d2-focus.json, measured with macOS Vision) always lands on the same
//                   eye line at roughly the same size, and no image edge is ever visible (edges dissolve into black).
//   3. fit()      — the quote is set at the largest step of a fixed scale that fits the frame (3 to ~45 words).
//
// URL (mock only): ?q=<id> quote · ?mins=73 · ?ended=1 · ?host=www.instagram.com · ?still=1 (no ambient drift)
//                  ?notext=1 (hide all text, for contrast measurement) · ?measure=1 (write text boxes to <html data-boxes>)
// Keys (mock only): ← / → step through all quotes.

import { formatCountdown, shortWhen } from '../../lib/time.js';
import { creditParts, daDates } from '../../lib/credits.js';

const params = new URLSearchParams(location.search);
const VARIANT = document.documentElement.dataset.variant || 'a';
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const motionOK = () => !matchMedia('(prefers-reduced-motion: reduce)').matches && params.get('still') !== '1';

if (params.get('notext') === '1') document.documentElement.classList.add('notext');
if (params.get('still') === '1') document.documentElement.classList.add('still');

// ---------- per-variant constants ----------

const LOOK = {
  // face: target mean luminance of the face after levels (0–1, gamma space) · contrast: S-curve amount
  // ceil: brightest printable value (a white backdrop never prints as white) · stops: monochrome palette
  a: { face: 0.48, contrast: 0.32, ceil: 0.82, stops: [[0, [6, 6, 7]], [0.52, [118, 110, 99]], [1, [236, 228, 213]]] },
  b: { face: 0.46, contrast: 0.38, ceil: 0.78, stops: [[0, [5, 5, 6]], [0.5, [110, 103, 93]], [1, [232, 224, 209]]] },
}[VARIANT];

// Modular type scale (≈ 1.125 steps). fit() walks it from the top.
const SIZES = [104, 92, 82, 73, 65, 58, 52, 47, 42, 38, 34, 31, 28, 26, 24, 22, 20, 19, 18];
const leading = (px) => (px >= 70 ? 1.02 : px >= 52 ? 1.06 : px >= 40 ? 1.12 : px >= 30 ? 1.18 : px >= 24 ? 1.24 : 1.3);
const tracking = (px) => (px >= 70 ? -0.024 : px >= 52 ? -0.018 : px >= 38 ? -0.012 : px >= 28 ? -0.006 : 0);
const maxLines = (px) => (px >= 82 ? 3 : px >= 65 ? 4 : px >= 52 ? 5 : px >= 42 ? 6 : 99);

// ---------- mock data (same contract as ui/blocked.js) ----------

function mockInfo() {
  const mins = params.has('mins') ? +params.get('mins') : 73;
  const until = mockInfo.until || (mockInfo.until = Date.now() + mins * 60000);
  const locked = params.get('ended') !== '1' && until > Date.now();
  return { locked, lockedUntil: locked ? until : null, url: `https://${params.get('host') || 'www.instagram.com'}/` };
}

const validQuote = (q) => q && typeof q.id === 'string' && typeof q.text === 'string' && q.text.trim() && typeof q.author === 'string';

async function loadJSON(path) {
  try { return await (await fetch(path, { cache: 'no-store' })).json(); } catch { return null; }
}

// ---------- credits (production wording + "bearbejdet" for CC licences, because the print is a visible edit) ----------

function httpsLink(text, href) {
  let u = null;
  try { u = new URL(href); } catch { /* not a URL */ }
  if (!u || u.protocol !== 'https:') return document.createTextNode(text);
  const a = document.createElement('a');
  a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = text;
  return a;
}

function renderCredits(q, hasPortrait) {
  const c = creditParts(q, hasPortrait);
  const parts = [];
  if (c.source) parts.push([httpsLink(c.source, (q.source || {}).url)]);
  if (c.translator) parts.push([document.createTextNode(c.translator)]);
  if (c.photo) {
    const who = document.createElement('span');
    who.textContent = c.photo.creator;
    if (c.photo.creator !== c.photo.creatorFull) who.title = c.photo.creatorFull;
    const bits = [document.createTextNode('Foto: '), who];
    if (c.photo.license) bits.push(document.createTextNode(', '), httpsLink(c.photo.license, c.photo.licenseUrl));
    if (/^CC BY/i.test(c.photo.license)) bits.push(document.createTextNode(', bearbejdet'));
    if (c.photo.commons) bits.push(document.createTextNode(', '), httpsLink('Wikimedia Commons', c.photo.commons));
    parts.push(bits);
  }
  const out = [];
  parts.forEach((p, i) => { if (i) out.push(document.createTextNode(' · ')); out.push(...p); });
  $('credits').replaceChildren(...out);
}

// ---------- 1. darkroom ----------

function paletteLUT(stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    let i = 0;
    while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
    const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
    const t = clamp((x - x0) / (x1 - x0));
    for (let k = 0; k < 3; k++) lut[v * 3 + k] = c0[k] + (c1[k] - c0[k]) * t;
  }
  return lut;
}

/** Re-prints the image in place: levels → expose for the face → S-curve → highlight ceiling → monochrome palette. */
function develop(img, face) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, W, H);
  const p = id.data, n = W * H;
  const Y = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const y = (p[j] * 54 + p[j + 1] * 183 + p[j + 2] * 19) >> 8;
    Y[i] = y; hist[y]++;
  }
  const pct = (q) => { let acc = 0; const t = q * n; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v / 255; } return 1; };
  const bp = Math.min(pct(0.004), 0.22);
  const wp = Math.max(pct(0.997), bp + 0.4);
  const norm = (y) => clamp((y / 255 - bp) / (wp - bp));

  // Meter the face (or, with no face, the upper middle where a portrait's head usually is).
  const f = face || { x: 0.5, y: 0.32, w: 0.3, h: 0.22 };
  const x0 = Math.floor(clamp(f.x - f.w * 0.35) * W), x1 = Math.ceil(clamp(f.x + f.w * 0.35) * W);
  const y0 = Math.floor(clamp(f.y - f.h * 0.35) * H), y1 = Math.ceil(clamp(f.y + f.h * 0.35) * H);
  let sum = 0, cnt = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { sum += norm(Y[y * W + x]); cnt++; }
  const fm = clamp(cnt ? sum / cnt : 0.5, 0.06, 0.94);
  // Expose for the face, but only part of the way (k = 0.6 in log space): a dark-skinned face is lifted, a pale one
  // is lowered, and they still do not come out the same grey — the subject's own tonality survives.
  const gamma = clamp(Math.pow(Math.log(LOOK.face) / Math.log(fm), 0.6), 0.6, 1.9);

  const pal = paletteLUT(LOOK.stops);
  const tone = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let x = Math.pow(norm(v), gamma);
    x = x + LOOK.contrast * (x * x * (3 - 2 * x) - x);
    tone[v] = clamp(x * LOOK.ceil);
  }

  // How bright is the backdrop? Mean printed value of the outer 10 % ring.
  let eSum = 0, eCnt = 0;
  const bx = Math.max(1, Math.round(W * 0.1)), by = Math.max(1, Math.round(H * 0.1));
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if (x >= bx && x < W - bx && y >= by && y < H - by) continue;
      eSum += tone[Y[y * W + x]]; eCnt++;
    }
  }
  const edge = eCnt ? eSum / eCnt : 0.3;

  // Burn: the print darkens with distance from the face, harder when the backdrop is light — a white studio wall
  // becomes a glow behind the head instead of a grey slab. Full-length figures get a larger lit area.
  const burn = clamp(0.38 + 0.75 * Math.max(0, edge - 0.18), 0.38, 0.8);
  const cx = f.x * W, cy = f.y * H, unit = clamp(f.h, 0.16, 0.24) * H;
  const r0 = 1.25 * unit, r1 = 4.4 * unit;
  for (let y = 0, i = 0, j = 0; y < H; y++) {
    const dy = (y - cy) * (y > cy ? 0.78 : 1); // the body below the face stays lit a little longer
    for (let x = 0; x < W; x++, i++, j += 4) {
      const dx = x - cx;
      const d = Math.sqrt(dx * dx + dy * dy);
      const t = clamp((d - r0) / (r1 - r0));
      const k = 1 - burn * t * t * (3 - 2 * t);
      const c = Math.round(tone[Y[i]] * k * 255) * 3;
      p[j] = pal[c]; p[j + 1] = pal[c + 1]; p[j + 2] = pal[c + 2];
    }
  }
  g.putImageData(id, 0, 0);
  return { canvas: cv, W, H, face: f, stats: { bp: +bp.toFixed(3), wp: +wp.toFixed(3), faceMean: +fm.toFixed(3), gamma: +gamma.toFixed(2), edge: +edge.toFixed(3), burn: +burn.toFixed(2) } };
}

function grainTile() {
  const N = 192;
  const cv = document.createElement('canvas');
  cv.width = N; cv.height = N;
  const g = cv.getContext('2d');
  const id = g.createImageData(N, N);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) {
    const v = 128 + ((rnd() + rnd() + rnd() - 1.5) * 92);
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return cv.toDataURL('image/png');
}

// ---------- 2. framing ----------

let print = null; // { canvas, W, H, face }

function isTall() {
  return innerWidth < 760 || innerWidth / innerHeight < 0.95;
}

/** Places the plate so the face lands on the variant's eye line; sets the masks and the light around the face. */
function frame() {
  if (!print) return;
  const vw = innerWidth, vh = innerHeight;
  const { W, H, face: f } = print;
  const plate = $('plate');
  const tall = isTall();
  const flip = VARIANT === 'a' && !tall && (f.yaw || 0) > 0.35;
  document.documentElement.classList.toggle('flip', flip);
  const card = $('card').getBoundingClientRect();
  let s, left, top, fxT, fyT, faceH;
  const sMaxUp = 1.75; // CSS px per source px; beyond this the print only gets softer

  if (!tall && VARIANT === 'a') {
    // Portrait bleeds off the right edge, full height. Face at 71 % across, eye line at ~38 %.
    // Look room: a sitter who turns to the viewer's right (yaw > 0.35 rad ≈ 20°) is placed on the LEFT instead, so
    // every face looks into the frame, toward its own words. The photograph itself is never mirrored.
    faceH = 0.30 * vh;
    const sCover = vh / H;
    s = clamp(faceH / (f.h * H), sCover, Math.max(sCover, sMaxUp));
    const w = W * s, h = H * s;
    fxT = vw * (flip ? 0.29 : 0.71); fyT = vh * 0.40;
    left = fxT - f.x * w; top = fyT - f.y * h;
    top = clamp(top, vh - h, 0);
    // A narrow print slides most of the way to the edge; the rest of the gap is darkness (that edge feathered).
    if (!flip && left + w < vw) left += (vw - (left + w)) * 0.6;
    if (flip && left > 0) left -= left * 0.6;
  } else if (!tall) {
    // B: portrait centred on the stage, full height; the quote sits over its lower half, so the face is placed
    // in the space above the quote (eye line just under the top third of that space).
    // Close-ups are NOT blown up to cover the height (that pushed the chin into the quote): the print may float,
    // its top edge then dissolves into black like the sides.
    const above = Math.max(card.top, vh * 0.4);
    faceH = Math.min(0.26 * vh, above * 0.42);
    s = Math.min(faceH / (f.h * H), sMaxUp);
    const w = W * s, h = H * s;
    fxT = vw * 0.5; fyT = clamp(above * 0.46, vh * 0.2, vh * 0.3);
    left = fxT - f.x * w; top = fyT - f.y * h;
    if (top > 0 && top + h > vh) top = Math.max(0, vh - h); // a small gap above is darkness, but prefer no gap
    top = Math.min(top, Math.max(0, fyT - f.y * h));
  } else {
    // Phone / tall window: portrait fills the width at the top and dissolves into the text below it.
    // The whole face must fit between the dark top strip (site name, countdown) and the quote; a close-up that
    // cannot is printed a little narrower than the screen (down to 80 %) and its sides dissolve too.
    const room = Math.max(card.top + card.height * 0.25, vh * 0.42); // where the image may still be seen
    const limit = card.top - 14, topSafe = 72;
    faceH = 0.25 * room;
    const sCover = vw / W;
    s = clamp(faceH / (f.h * H), sCover, Math.max(sCover, sMaxUp * 1.2));
    s = Math.min(s, Math.max((limit - topSafe) / (1.12 * f.h * H), 0.8 * sCover));
    const w = W * s, h = H * s;
    fxT = vw * 0.5; fyT = room * 0.40;
    left = fxT - f.x * w; top = fyT - f.y * h;
    left = w >= vw ? clamp(left, vw - w, 0) : clamp(left, 0, vw - w);
    top = Math.min(top, 0);
    const faceTop = top + (f.y - f.h * 0.5) * h;
    if (faceTop < topSafe && top < 0) top += Math.min(topSafe - faceTop, -top);
    if (top + h < room) top = room - h;
    const chin = top + (f.y + f.h * 0.62) * h;
    if (chin > limit) top -= chin - limit;
  }

  const w = W * s, h = H * s;
  const fx = left + f.x * w, fy = top + f.y * h, fh = f.h * H * s, fw = f.w * W * s;
  Object.assign(plate.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
  const cvs = $('print');
  if (cvs.width !== W) { cvs.width = W; cvs.height = H; }
  cvs.getContext('2d').drawImage(print.canvas, 0, 0);

  // Masks, in plate pixels: every edge that falls inside the window dissolves into black.
  const feather = (edgeInside, len) => (edgeInside ? Math.max(24, len) : 0);
  let mL, mR, mT, mB, mT0 = 0;
  if (!tall && VARIANT === 'a') {
    // Long feather on the side that faces the quote; it may reach the shadow side of the face (Rembrandt light),
    // never past its middle.
    const reachL = fx - fw * 0.3 - left, reachR = left + w - (fx + fw * 0.3);
    mL = flip ? feather(left > 0, w * 0.12) : feather(left > 0, clamp(reachL, 180, w * 0.62));
    mR = flip ? feather(left + w < vw - 1, clamp(reachR, 180, w * 0.62)) : feather(left + w < vw - 1, w * 0.12);
    mT = feather(top > 0, h * 0.1); mB = feather(top + h < vh - 1, h * 0.1);
  } else if (!tall) {
    const side = Math.max(120, Math.min(w * 0.36, (w - fw * 2.4) / 2));
    mL = feather(left > 0, side); mR = feather(left + w < vw, side);
    mT = feather(top > 0, Math.min(h * 0.3, Math.max(60, fy - fh * 0.9 - top)));
    mB = feather(top + h < vh - 1, h * 0.25);
  } else {
    mL = feather(left > 0, w * 0.1); mR = feather(left + w < vw, w * 0.1);
    // The top strip of the window is always dark: the site name and the countdown sit there.
    mT0 = Math.max(0, -top); mT = mT0 + 76;
    // dissolve from just under the chin to the top of the quote
    // (always inside the print: a close-up whose chin is near its bottom edge still gets ≥ 110 px of fade)
    const fadeFrom = Math.min(Math.max(fy + fh * 0.9, card.top - vh * 0.16) - top, h - 110);
    const fadeTo = Math.min(h, Math.max(fadeFrom + 80, card.top + card.height * 0.2 - top));
    mB = 0;
    plate.style.setProperty('--fb0', `${fadeFrom}px`);
    plate.style.setProperty('--fb1', `${fadeTo}px`);
  }
  plate.style.setProperty('--ml', `${mL}px`);
  plate.style.setProperty('--mr', `${mR}px`);
  plate.style.setProperty('--mt0', `${mT0}px`);
  plate.style.setProperty('--mt', `${mT}px`);
  plate.style.setProperty('--mb', `${mB}px`);
  plate.classList.toggle('fade-bottom', tall);
  plate.style.transformOrigin = `${fx - left}px ${fy - top}px`;

  const root = document.documentElement.style;
  root.setProperty('--fx', `${fx}px`);
  root.setProperty('--fy', `${fy}px`);
  root.setProperty('--fh', `${fh}px`);
  document.documentElement.dataset.face = JSON.stringify([fx - fw / 2, fy - fh / 2, fw, fh].map(Math.round));
  root.setProperty('--card-top', `${card.top}px`);

  // Low-res insurance: past ~2.6 device px per source px, soften slightly (reads as depth of field, not JPEG blocks)
  // and lift the grain a little so the eye gets texture back.
  const dev = s * (devicePixelRatio || 1);
  const soften = clamp((dev - 2.6) * 0.32, 0, 1.1);
  $('print').style.filter = soften > 0.05 ? `blur(${soften.toFixed(2)}px)` : '';
  root.setProperty('--grain', String(clamp(0.34 + (dev - 1.6) * 0.06, 0.3, 0.5).toFixed(2)));
  document.documentElement.dataset.frame = JSON.stringify({ s: +s.toFixed(3), devUpscale: +dev.toFixed(2), soften: +soften.toFixed(2), ...print.stats });
}

// ---------- 3. type fitting ----------

function fit() {
  const text = $('text');
  const mid = $('middle');
  const tall = isTall();
  const vh = innerHeight;
  // Cap so a three-word quote is a title, not a billboard.
  const cap = tall ? Math.min(48, vh * 0.062) : VARIANT === 'a' ? vh * 0.104 : vh * 0.09;
  // Height budget for quote + name: the window minus the fixed rows. On a tall screen the portrait keeps ≥ ~half.
  const cs = (el) => getComputedStyle(el);
  const stage = document.querySelector('.stage'), foot = document.querySelector('.foot');
  const pad = (el) => parseFloat(cs(el).paddingTop) + parseFloat(cs(el).paddingBottom);
  let budget = vh - pad(stage) - stage.firstElementChild.offsetHeight - foot.offsetHeight - pad(mid);
  if (tall) budget = Math.min(budget, vh * 0.45);
  else if (VARIANT === 'b') budget = Math.min(budget, vh * 0.4); // the face keeps the upper half
  let chosen = SIZES[SIZES.length - 1];
  for (const px of SIZES) {
    if (px > cap) continue;
    text.style.fontSize = `${px}px`;
    text.style.lineHeight = String(leading(px));
    text.style.letterSpacing = `${tracking(px)}em`;
    const lines = Math.round(text.offsetHeight / (px * leading(px)));
    chosen = px;
    if (lines <= maxLines(px) && $('card').offsetHeight <= budget) break;
  }
  text.classList.toggle('many', Math.round(text.offsetHeight / (chosen * leading(chosen))) > 5);
  text.dataset.px = String(chosen);
  document.documentElement.style.setProperty('--qpx', `${chosen}px`);
}

// ---------- typesetting ----------

/** Straight quotes → typographic ones; apostrophes → ’. */
function smart(t) {
  return t
    .replace(/(\S)\u2014/g, '$1\u2060\u2014') // an em dash never starts a line
    .replace(/ \u2014/g, '\u00a0\u2014')
    .replace(/(^|[\s([{—–-])"/g, '$1\u201C').replace(/"/g, '\u201D')
    .replace(/(\w)'(\w)/g, '$1\u2019$2')
    .replace(/(^|[\s([{—–-])'/g, '$1\u2018').replace(/'/g, '\u2019');
}

/** " / " in the data marks a verse line (Piet Hein's grooks): set it as a real line break. */
function setText(el, raw) {
  const lines = smart(raw.trim()).split(/\s+\/\s+/);
  const out = [];
  lines.forEach((l, i) => { if (i) out.push(document.createElement('br')); out.push(document.createTextNode(l)); });
  el.replaceChildren(...out);
  el.classList.toggle('verse', lines.length > 1);
}

// ---------- quote ----------

let quotes = [], base = null, focus = {}, current = null, loadToken = 0;

function setQuote(q) {
  current = q;
  const token = ++loadToken;
  const html = document.documentElement;
  html.classList.remove('is-in');
  $('plate').classList.remove('is-lit');
  const fc = q.image && focus[q.image.file];
  html.classList.toggle('flip', VARIANT === 'a' && !isTall() && !!fc && (fc.yaw || 0) > 0.35); // before layout: no jump
  setText($('text'), q.text);
  $('name').textContent = q.author;
  $('dates').textContent = daDates(q.author_dates).replace(/^(?:born|b\.)\s*(\d{3,4})$/, 'f. $1');
  $('dates').hidden = !q.author_dates;
  renderCredits(q, false);
  fit();
  void html.offsetWidth; // restart the entrance
  html.classList.add('is-in');

  print = null;
  const img = q.image;
  if (!(img && typeof img.file === 'string' && /^(images\/)?[A-Za-z0-9._-]+$/.test(img.file) && base)) {
    html.classList.add('no-portrait');
    fit();
    return;
  }
  html.classList.remove('no-portrait');
  const el = new Image();
  el.decoding = 'async';
  el.onload = () => {
    if (token !== loadToken) return;
    const t0 = performance.now();
    print = develop(el, focus[img.file] || null);
    print.stats.ms = Math.round(performance.now() - t0);
    renderCredits(q, true);
    fit();
    frame();
    paintHaze();
    void $('plate').offsetWidth; // flush, so the opacity transition runs even where rAF is throttled
    $('plate').classList.add('is-lit');
    if (params.get('measure') === '1') setTimeout(measure, motionOK() ? 900 : 50);
  };
  el.onerror = () => { if (token === loadToken) { html.classList.add('no-portrait'); fit(); } };
  el.src = new URL(img.file, base).href;
}

/** The print's own light, blurred across the whole window. Its strength is set so the haze averages ≈ #121110:
 *  a dark print gets a visible glow, a light one cannot grey the side where the quote stands. */
function paintHaze() {
  const hz = $('haze');
  const w = 48, h = Math.round(48 * print.H / print.W);
  hz.width = w; hz.height = h;
  const g = hz.getContext('2d', { willReadFrequently: true });
  g.drawImage(print.canvas, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const c = d[i + 1] / 255;
    sum += c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const mean = sum / (w * h);
  document.documentElement.style.setProperty('--haze', String(clamp(0.006 / Math.max(mean, 0.001), 0.04, 0.2).toFixed(3)));
}

/** For the contrast audit: every text line's box, in CSS px. */
function measure() {
  const boxes = {};
  const lineRects = (el) => {
    const r = document.createRange();
    r.selectNodeContents(el);
    return [...r.getClientRects()].filter((b) => b.width > 2).map((b) => [b.left, b.top, b.width, b.height].map((v) => Math.round(v)));
  };
  for (const id of ['text', 'name', 'dates', 'remain', 'ended', 'credits', 'host']) {
    const el = $(id);
    if (el && !el.hidden && el.offsetParent !== null) boxes[id] = lineRects(el);
  }
  const col = (id) => getComputedStyle($(id)).color;
  document.documentElement.dataset.boxes = JSON.stringify({
    boxes, colors: Object.fromEntries(['text', 'name', 'dates', 'remain', 'ended', 'credits', 'host'].map((id) => [id, col(id)])),
    px: +$('text').dataset.px, vw: innerWidth, vh: innerHeight,
    face: document.documentElement.dataset.face ? JSON.parse(document.documentElement.dataset.face) : null,
  });
}

// ---------- countdown ----------

let info = { locked: false, lockedUntil: null, url: null }, ended = false;

function host() {
  try { return new URL(info.url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function showEnded() {
  ended = true;
  $('remain').hidden = true;
  $('ended').hidden = false;
  const h = host();
  if (h) { $('backLink').href = info.url; $('backLink').textContent = `Fortsæt til ${h}`; $('backLink').hidden = false; }
  document.documentElement.classList.add('is-ended');
  document.title = 'LockedIn';
}

function tick() {
  if (ended) return;
  const left = (info.lockedUntil || 0) - Date.now();
  if (left <= 0) { info = mockInfo(); if (!info.locked) showEnded(); return; }
  $('remain').textContent = formatCountdown(left);
  $('remain').title = `Låst til ${shortWhen(Date.now(), info.lockedUntil)}`;
  document.title = `${formatCountdown(left)} · LockedIn`;
}

// ---------- boot ----------

let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => { fit(); frame(); }, 60);
});

addEventListener('keydown', (e) => {
  if (!quotes.length || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
  const i = quotes.indexOf(current);
  const q = quotes[(i + (e.key === 'ArrowRight' ? 1 : quotes.length - 1)) % quotes.length];
  params.set('q', q.id);
  history.replaceState(null, '', `?${params}`);
  setQuote(q);
});

async function main() {
  info = mockInfo();
  $('host').textContent = host();
  if (!info.locked) showEnded();
  else { $('remain').hidden = false; tick(); setInterval(tick, 1000); }

  document.documentElement.style.setProperty('--grain-img', `url(${grainTile()})`);
  const [data, fdoc] = await Promise.all([loadJSON('../../quotes/quotes.json'), loadJSON('d2-focus.json')]);
  focus = (fdoc && fdoc.faces) || {};
  quotes = (Array.isArray(data) ? data : (data && data.quotes) || []).filter(validQuote);
  base = new URL('../../quotes/quotes.json', location.href);
  if (!quotes.length) return;
  const q = quotes.find((x) => x.id === params.get('q')) || quotes[Math.floor(Math.random() * quotes.length)];
  setQuote(q);
}

main();
