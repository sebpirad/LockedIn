// CDP driver for test/blocked-in-chrome.sh: the quote page (blocked.html?mock=1, dev mock over http — not the
// extension) in Chrome for Testing. Checks the rules in docs/QUOTE-DESIGN.md "Afgørelse" and the fixes in
// docs/QUOTE-QA.md on real renders: layout and collisions, type rules (scale, fragments, stranded words, verse),
// the credit line (clean, complete attribution, line count), contrast measured on pixels, no seam (everything
// outside the print is the page colour), print brightness, motion (≤ 600 ms; none under reduced motion), the
// small-window column, the lock and "session over" states, the no-image fallback.
// Usage: node drive-blocked.mjs <cdpPort> <httpPort>
//   FULL=1   all quotes (default: about 30 that cover every hard case of the current quotes.json)
//   SHOTS=dir  also save one final-state screenshot per quote and viewport into dir/<w>x<h>/<id>.png
//   VIEWS=1440,390  only these widths
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG, lum, cssLum, ratio, under, percentile } from './png.mjs';
import { okLines, typeset, licenceLabel, cleanTranslator } from '../../lib/quote-type.js';
import { isDesktop } from '../../lib/quote-frame.js';

const [cdpPort, httpPort] = process.argv.slice(2);
const ORIGIN = `http://127.0.0.1:${httpPort}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail !== '' ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

let ws;
let seq = 0;
const pending = new Map();
for (let i = 0; i < 80 && !ws; i++) {
  try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).webSocketDebuggerUrl); } catch { await sleep(250); }
}
await new Promise((r) => { ws.onopen = r; });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}, sessionId) => new Promise((r, reject) => {
  const id = ++seq;
  const t = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
  pending.set(id, (d) => { clearTimeout(t); r(d); });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
// Hard stop: nothing in this browser may reach the real daemon on port 919.
await send('Network.enable', {}, S);
await send('Network.setBlockedURLs', { urls: ['*127.0.0.1:919*', '*localhost:919*', '*[::1]:919*'] }, S);
await send('Page.enable', {}, S);
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }, S);
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function viewport(w, h, dpr, reduce) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false }, S);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] }, S);
}
/** Opens the dev mock and waits until the quote is set and the print developed (or the fallback is on). */
async function open(query) {
  await send('Page.navigate', { url: `${ORIGIN}/blocked.html?mock=1${query}` }, S);
  for (let i = 0; i < 120; i++) {
    await sleep(50);
    let st = null;
    try { st = await js(`const r = document.documentElement; return { mock: r.dataset.mock, set: r.classList.contains('is-set'), done: r.dataset.print === 'ready' || r.classList.contains('no-portrait') };`); } catch { /* navigating */ }
    if (st && st.mock !== '1' && st.set) { console.log('FAIL  page is not in mock mode — aborting'); process.exit(1); }
    if (st && st.set && st.done) return;
  }
  throw new Error(`page did not settle: ${query}`);
}
async function shot() {
  const r = await send('Page.captureScreenshot', { format: 'png' }, S);
  return Buffer.from(r.result.data, 'base64');
}

const quotes = JSON.parse(fs.readFileSync(new URL('../../quotes/quotes.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(quotes.map((q) => [q.id, q]));
const words = (q) => typeset(q.text).words;
const sortedBy = (f) => [...quotes].sort((a, b) => f(a) - f(b));
const SHORTEST = sortedBy(words)[0].id, LONGEST = sortedBy((q) => -words(q))[0].id;
// The hard cases of whatever quotes.json holds: every 3rd quote, plus the shortest and longest, verse, drawings,
// the smallest files, close-ups, profiles and sitters who look right (left-side portrait).
const special = quotes.filter((q) => / \/ /.test(q.text) || (q.image && (q.image.tone || (q.image.width || 999) < 500
  || (q.image.focus && (q.image.focus.h > 0.45 || Math.abs(q.image.focus.yaw) > 0.35))))).map((q) => q.id);
const SET = [...new Set([SHORTEST, LONGEST, ...special, ...quotes.filter((_, i) => i % 3 === 0).map((q) => q.id)])];
const ids = process.env.FULL ? quotes.map((q) => q.id) : SET;
const SHOTS = process.env.SHOTS || '';
const PAGE = [28, 31, 36]; // #1c1f24, blocked.css --black = darkroom PAGE

// ---------- 1. every quote at desktop, laptop, small window and phones ----------
const VIEWS = [
  { w: 1440, h: 900, dpr: 1, name: '1440×900' },
  { w: 1280, h: 720, dpr: 1, name: '1280×720' },
  { w: 1024, h: 768, dpr: 1, name: '1024×768' },
  { w: 900, h: 700, dpr: 1, name: '900×700' },
  { w: 720, h: 900, dpr: 1, name: '720×900 (split screen)' },
  { w: 390, h: 844, dpr: 2, name: '390×844@2x' },
  { w: 360, h: 740, dpr: 2, name: '360×740@2x' },
].filter((v) => !process.env.VIEWS || process.env.VIEWS.split(',').includes(String(v.w)));
const MEASURE = `
  const r = document.documentElement, $ = (id) => document.getElementById(id);
  const rects = (el) => { if (!el || el.hidden || !el.offsetParent) return []; const g = document.createRange(); g.selectNodeContents(el);
    return [...g.getClientRects()].filter((b) => b.width > 1 && b.height > 1).map((b) => [b.left, b.top, b.width, b.height]); };
  const box = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  const t = $('text'), cs = (el) => getComputedStyle(el);
  const cl = $('credits');
  const lis = [...t.querySelectorAll('.li')].map((l) => l.textContent.replace(/^\u201c/, '').trim());
  return {
    px: +t.dataset.px, lines: lis.length, overflow: r.classList.contains('overflow'), side: r.dataset.side,
    family: cs(t).fontFamily, style: cs(t).fontStyle, bodoni: t.classList.contains('bodoni'),
    hang: (() => { const h = t.querySelector('.hang, .mark'); return h ? { text: h.textContent, color: cs(h).color } : null; })(),
    lineWords: lis.map((l) => l.replace(/\\u2060/g, '').split(/[\\s\\u00a0]+/).filter((w) => /[\\p{L}\\d]/u.test(w)).length),
    lineChars: lis.map((l) => [...l].length),
    creditLines: Math.round(cl.offsetHeight / parseFloat(cs(cl).lineHeight)), creditMin: +(r.dataset.creditMin || 0), credit: cl.textContent,
    links: [...document.querySelectorAll('.stage a[href]')].filter((a) => !a.closest('[hidden]') && a.offsetParent).length,
    frame: r.dataset.frame ? JSON.parse(r.dataset.frame) : null,
    boxes: { quote: rects(t), name: rects($('author')), dates: rects($('dates')), timer: rects($('remain')), credit: rects(cl) },
    blocks: { slot: box($('slot')), quote: box($('quote')), credit: box(cl), author: box($('author')), dates: box($('dates')), text: box(t) },
    colors: { quote: cs(t).color, name: cs($('author')).color, dates: cs($('dates')).color, timer: cs($('remain')).color, credit: cs(cl).color },
    sw: document.documentElement.scrollWidth, vw: innerWidth, vh: innerHeight,
    host: document.body.innerText.includes('instagram'), hostEl: !!document.getElementById('host'),
  };`;
const HIDE_TEXT = `const s = document.createElement('style'); s.id = '__audit'; s.textContent = '.stage, .stage * { visibility: hidden !important; }'; document.head.append(s); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return true;`;
const intersects = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
const THRESH = { quote: 7, name: 7, timer: 7, dates: 7, credit: 4.5 };
/** Pixels in [x0, x1) × [y0, y1) (CSS px) that differ from the page colour by more than 1 on any channel. */
function offPage(img, [x0, y0, x1, y1], dpr) {
  let n = 0;
  for (let y = Math.max(0, Math.ceil(y0 * dpr)); y < Math.min(img.height, Math.floor(y1 * dpr)); y += 2) {
    for (let x = Math.max(0, Math.ceil(x0 * dpr)); x < Math.min(img.width, Math.floor(x1 * dpr)); x += 2) {
      const o = (y * img.width + x) * 4;
      if (Math.abs(img.data[o] - PAGE[0]) > 1 || Math.abs(img.data[o + 1] - PAGE[1]) > 1 || Math.abs(img.data[o + 2] - PAGE[2]) > 1) n++;
    }
  }
  return n;
}

const rows = [];
for (const v of VIEWS) {
  await viewport(v.w, v.h, v.dpr, true);
  const phone = !isDesktop(v.w, v.h); // the stacked layout: phone and split screen
  const bad = { overflow: [], hscroll: [], collide: [], face: [], outside: [], rag: [], verse: [], lines: [], credit: [], junk: [], creditLines: [], links: [], italic: [], hang: [], host: [], contrast: [], seam: [], signature: [], printUnder: [], faceTop: [] };
  const brightShares = [], printP99 = [], longCredit = [], cols = [];
  let oneLine = 0;
  const minRatio = Object.fromEntries(Object.keys(THRESH).map((k) => [k, { r: Infinity, id: '' }]));
  let minCreditMax = { r: Infinity, id: '' };
  for (const id of ids) {
    const q = byId[id];
    await open(`&q=${id}`);
    const m = await js(MEASURE);
    if (SHOTS) {
      const dir = path.join(SHOTS, `${v.w}x${v.h}`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${id}.png`), await shot());
    }
    rows.push({ view: v.name, id, px: m.px, lines: m.lines, side: m.side, creditLines: m.creditLines });
    cols.push(m.blocks.text[2]);
    if (m.overflow) bad.overflow.push(id);
    if (m.sw > m.vw) bad.hscroll.push(id);
    if (m.host || m.hostEl) bad.host.push(id);
    if (m.style !== 'normal' || !/^(Didot|"?Bodoni 72"?)/.test(m.family)) bad.italic.push(`${id}:${m.style}/${m.family.split(',')[0]}`);
    if (!m.hang || m.hang.text !== '\u201c' || m.hang.color !== 'rgb(242, 193, 78)') bad.hang.push(id);
    // type rules as rendered: line limits, no fragments, no stranded word; verse keeps its lines
    const ts = typeset(q.text);
    const atFloor = m.px <= 29;
    if (ts.verse) {
      const okV = ts.verseLong ? m.lines <= ts.lines.length * 2 : m.lines === ts.lines.length;
      if (!okV && !atFloor) bad.verse.push(`${id}:${m.lines}/${ts.lines.length}`);
    } else if (!okLines(m.px, m.lineWords, ts.words, false, 0, m.lineChars, false, false) && !atFloor) {
      bad.rag.push(`${id}@${m.px}:${m.lineWords.join('/')}`);
    }
    const max = m.px >= 104 ? 3 : m.px >= 82 ? 4 : m.px >= 65 ? 5 : m.px >= 52 ? 7 : Infinity;
    if (m.lines > max) bad.lines.push(`${id}:${m.px}px/${m.lines}`);
    // blocks: no overlaps, inside the window; the quote never over the face box (+15 % for the chin)
    const B = m.blocks;
    if (intersects(B.slot, B.quote) || intersects(B.quote, B.credit) || intersects(B.slot, B.credit)) bad.collide.push(id);
    for (const b of [B.slot, B.quote, B.credit]) if (b[0] < -1 || b[1] < -1 || b[0] + b[2] > m.vw + 1 || b[1] + b[3] > m.vh + 1) { bad.outside.push(id); break; }
    if (m.frame && m.frame.face) {
      const [fx, fy, fw, fh] = m.frame.face;
      const fb = [fx - fw / 2, fy - fh / 2, fw, fh * 1.15];
      if ([...m.boxes.quote, ...m.boxes.name, ...m.boxes.dates].some((r) => intersects(r, fb))) bad.face.push(id);
    }
    // signature: the dates wrap under the name, never under the rule
    if (B.dates[2] > 0 && B.dates[1] > B.author[1] + 2 && B.dates[0] < B.author[0] - 1) bad.signature.push(id);
    // the credit: clean, complete attribution — name, licence, "bearbejdet" for CC BY, translator, Commons link
    const img = q.image;
    if (img) {
      const lic = licenceLabel(img.license);
      const need = [`Billede: ${img.credit}`, lic];
      const tr = cleanTranslator(q.translation && q.translation.translator);
      if (tr) need.push(`Overs. ${tr}`);
      const flat = m.credit.replace(/\u00a0/g, ' ');
      const cc = /^CC BY/i.test(lic);
      if (!need.every((n) => flat.includes(n)) || cc !== flat.includes('bearbejdet') || !/(Wikimedia )?Commons ↗/.test(flat)) bad.credit.push(id);
    }
    if (/[[\]_]|https?:|\.jpe?g\b|\bunknown\b|Photo:|…/i.test(m.credit)) bad.junk.push(id);
    if (m.links > 2) bad.links.push(`${id}:${m.links}`);
    const limit = phone ? 2 : 1;
    if (m.creditLines <= 1) oneLine++;
    if (m.creditLines > Math.max(limit, m.creditMin)) bad.creditLines.push(`${id}:${m.creditLines}`);
    if (m.creditMin > limit) longCredit.push(`${id}:${m.creditMin}`);
    // contrast on the real pixels under each line of text (text hidden, layout unchanged)
    await js(HIDE_TEXT);
    const bg = decodePNG(await shot());
    await js(`document.getElementById('__audit').remove(); return true;`);
    for (const [k, rects] of Object.entries(m.boxes)) {
      if (!rects.length) continue;
      const vals = under(bg, rects, v.dpr);
      const tl = cssLum(m.colors[k]);
      const r95 = ratio(tl, percentile(vals, 0.95));
      if (r95 < minRatio[k].r) minRatio[k] = { r: r95, id };
      if (r95 < THRESH[k]) bad.contrast.push(`${id}:${k} ${r95.toFixed(2)}`);
      if (k === 'credit') {
        const rmax = ratio(tl, Math.max(...vals));
        if (rmax < minCreditMax.r) minCreditMax = { r: rmax, id };
        if (rmax < 4.5) bad.contrast.push(`${id}:credit-max ${rmax.toFixed(2)}`);
      }
    }
    // stacked (QA R2-M1): from 4 px above the quote's box down, every pixel is the page colour — the print has
    // dissolved before the first line; and the face box starts below the timer slot
    if (phone && m.frame && m.frame.face) {
      const n = offPage(bg, [0, B.quote[1] - 4, m.vw, m.vh], v.dpr);
      if (n) bad.printUnder.push(`${id}:${n}px`);
      const [, fy, , fh] = m.frame.face;
      if (fy - fh / 2 < B.slot[1] + B.slot[3]) bad.faceTop.push(`${id}:${Math.round(fy - fh / 2)}`);
    }
    // no seam: everything outside the portrait's zone is exactly the page colour (QA M1)
    if (m.frame && m.frame.zone) {
      const [zl, zt, zw, zh] = m.frame.zone;
      const area = phone ? [0, zt + zh + 1, m.vw, m.vh] : (m.frame.side === 'right' ? [0, 0, zl - 1, m.vh] : [zl + zw + 1, 0, m.vw, m.vh]);
      const n = offPage(bg, area, v.dpr);
      if (n) bad.seam.push(`${id}:${n}px`);
    }
    // print brightness: the words stay the brightest thing on the page
    let bright = 0;
    const all = [];
    for (let i = 0; i < bg.width * bg.height; i += 3) { const L = lum(bg, i); all.push(L); if (L > 0.35) bright++; }
    brightShares.push(bright / all.length);
    printP99.push({ id, L: percentile(all, 0.99), quote: cssLum(m.colors.quote) });
  }
  const label = `${v.name} (${ids.length} quotes)`;
  const list = (a) => (a.length ? a.slice(0, 8).join(', ') + (a.length > 8 ? ` … +${a.length - 8}` : '') : '');
  check(!bad.overflow.length, `${label}: every quote fits at a scale step`, list(bad.overflow));
  check(!bad.hscroll.length, `${label}: no horizontal scroll`, list(bad.hscroll));
  check(!bad.collide.length && !bad.outside.length, `${label}: timer, quote and credit never overlap and stay inside the window`, list([...bad.collide, ...bad.outside]));
  check(!bad.face.length, `${label}: no quote, name or dates over the face box (+15 %)`, list(bad.face));
  check(!bad.lines.length, `${label}: line limits per size (≥104 px: 3, ≥82: 4, ≥65: 5, ≥52: 7)`, list(bad.lines));
  check(!bad.rag.length, `${label}: no fragments, no stranded single word (above the 29 px floor)`, list(bad.rag));
  check(!bad.verse.length, `${label}: verse keeps its lines (short verse exactly; long verse runs over at most once, hanging)`, list(bad.verse));
  check(!bad.italic.length, `${label}: quote in Didot roman (Bodoni 72 only below 40 px at 1×), never italic`, list(bad.italic));
  check(!bad.hang.length, `${label}: opening “ in accent yellow`, list(bad.hang));
  check(!bad.signature.length, `${label}: the dates wrap under the name, never under the rule`, list(bad.signature));
  check(!bad.host.length, `${label}: no site name on the page during the lock`, list(bad.host));
  check(!bad.credit.length, `${label}: credit carries the full attribution (name, licence, Commons ↗, translator; "bearbejdet" only for CC BY)`, list(bad.credit));
  check(!bad.junk.length, `${label}: no wiki markup, file names, URLs, "Unknown" or cut-off "…" in the credit`, list(bad.junk));
  check(!bad.links.length, `${label}: at most 2 links (licence + Commons) during the lock`, list(bad.links));
  check(!bad.creditLines.length, `${label}: credit at most ${phone ? 2 : 1} line(s), or what the full attribution alone needs`, list(bad.creditLines));
  if (!phone && v.w >= 1280) check(oneLine / ids.length >= 0.95, `${label}: credit on one line for ≥ 95 %`, `${oneLine}/${ids.length}`);
  if (longCredit.length) console.log(`INFO  ${label}: ${longCredit.length} attribution(s) need more than ${phone ? 2 : 1} line(s) on their own: ${list(longCredit)}`);
  check(!bad.contrast.length, `${label}: contrast on pixels — quote/name/timer/dates ≥ 7, credit ≥ 4.5 (p95), credit ≥ 4.5 vs brightest pixel`,
    `${list(bad.contrast)} | worst: ${Object.entries(minRatio).map(([k, x]) => `${k} ${x.r.toFixed(1)} ${x.id}`).join(', ')}, credit-max ${minCreditMax.r.toFixed(1)} ${minCreditMax.id}`);
  check(!bad.seam.length, `${label}: no seam — outside the portrait every pixel is the page colour #1c1f24`, list(bad.seam));
  if (phone) {
    check(!bad.printUnder.length, `${label}: stacked — the print has dissolved to #1c1f24 before the quote's first line`, list(bad.printUnder));
    check(!bad.faceTop.length, `${label}: stacked — every face starts below the timer, none cropped at the top`, list(bad.faceTop));
  }
  const p90 = percentile(brightShares, 0.9);
  // 1.3.x lifted the prints (owner: "forholdsvis mørk"); the words stay brightest by the p99 rule below
  check(p90 <= 0.15, `${label}: print area brighter than L 0.35 ≤ 15 % of the window at p90`, `${(p90 * 100).toFixed(1)} %, max ${(Math.max(...brightShares) * 100).toFixed(1)} %`);
  const over = printP99.filter((x) => x.L >= x.quote);
  check(!over.length, `${label}: the print's 99th-percentile luminance stays below the quote's`, over.map((x) => x.id).join(', '));
  const pxs = rows.filter((r) => r.view === v.name).map((r) => r.px).sort((a, b) => a - b);
  const median = pxs[pxs.length >> 1];
  console.log(`      sizes ${v.name}: ${pxs[0]}–${pxs[pxs.length - 1]} px, median ${median}`);
  if (v.w === 1024) {
    check(median >= 52 && pxs[0] >= 42 && Math.min(...cols) >= 440 - 0.5, '1024×768: the quote stays bold — median ≥ 52 px, none under 42 px, column ≥ 440 px (QA M4)',
      `median ${median}, min ${pxs[0]}, column ${Math.round(Math.min(...cols))}`);
  }
}

// ---------- 2. 1× screens: Bodoni 72 below 40 px; 2×: Didot always ----------
await viewport(390, 844, 1, true);
await open(`&q=${LONGEST}`);
let r = await js(`const t = document.getElementById('text'); return { px: +t.dataset.px, bodoni: t.classList.contains('bodoni'), family: getComputedStyle(t).fontFamily };`);
check(r.px >= 40 || (r.bodoni && /^"?Bodoni 72/.test(r.family)), '1× phone, small quote: Bodoni 72 Book', JSON.stringify(r));
await viewport(390, 844, 2, true);
await open(`&q=${LONGEST}`);
r = await js(`const t = document.getElementById('text'); return { px: +t.dataset.px, bodoni: t.classList.contains('bodoni') };`);
check(!r.bodoni, '2× phone: Didot even below 40 px', JSON.stringify(r));

// ---------- 3. motion: everything ends by 600 ms, nothing loops; reduced motion: no animations at all ----------
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await viewport(w, h, 1, false);
  await send('Page.navigate', { url: `${ORIGIN}/blocked.html?mock=1&q=${LONGEST}` }, S);
  let maxEnd = 0, count = 0, names = new Set();
  for (let i = 0; i < 40; i++) {
    await sleep(25);
    try {
      const a = await js(`return document.getAnimations().map((x) => ({ n: x.animationName || x.transitionProperty || 'anim', end: Math.round(x.effect.getComputedTiming().endTime * 10) / 10, it: x.effect.getComputedTiming().iterations }));`);
      for (const x of a) { count++; names.add(x.n); maxEnd = Math.max(maxEnd, x.it === Infinity ? Infinity : x.end); }
    } catch { /* navigating */ }
  }
  check(count > 0 && maxEnd <= 600, `motion ${w}×${h}: every animation ends by 600 ms`, `${[...names].join(', ')}; latest end ${maxEnd} ms`);
  await sleep(900);
  const after = await js(`return document.getAnimations().filter((x) => x.playState === 'running').length;`);
  check(after === 0, `motion ${w}×${h}: perfectly still after the entrance (no drift, no loop)`, `${after} running`);
}
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await viewport(w, h, 1, true);
  await send('Page.navigate', { url: `${ORIGIN}/blocked.html?mock=1&q=${SHORTEST}` }, S);
  let seen = 0;
  for (let i = 0; i < 30; i++) {
    await sleep(30);
    try { seen = Math.max(seen, await js(`return document.getAnimations().length;`)); } catch { /* navigating */ }
  }
  check(seen === 0, `reduced motion ${w}×${h}: getAnimations().length stays 0 through load and develop`, `${seen}`);
}

// ---------- 4. the lock and "session over" ----------
await viewport(1440, 900, 1, true);
await open(`&q=${LONGEST}&mins=95`);
r = await js(`const $ = (id) => document.getElementById(id); return { title: document.title, remain: $('remain').textContent, tip: $('remain').title, role: $('remain').getAttribute('role'), label: $('remain').getAttribute('aria-label'), ended: !$('ended').hidden, link: !!document.querySelector('a[href*="instagram"]') };`);
check(/^1:35 · LockedIn$/.test(r.title) && r.remain === '1:35', 'lock: hours and minutes in the timer and the tab title — no ticking seconds', `${r.title}`);
check(/^Låst til /.test(r.tip) && r.role === 'timer' && r.label === 'Tid tilbage', 'lock: "Låst til …" tooltip, role=timer, label "Tid tilbage"', `${r.tip} / ${r.role} / ${r.label}`);
check(!r.ended && !r.link, 'lock: no way back to the blocked site', JSON.stringify(r));
await open(`&q=${LONGEST}&ended=1`);
r = await js(`const $ = (id) => document.getElementById(id); const a = $('backLink'); return { title: document.title, remainHidden: $('remain').hidden, endedText: $('ended').querySelector('.ended-title').textContent, link: a.hidden ? '' : a.textContent, href: a.getAttribute('href'), color: getComputedStyle(a).color, isEnded: document.documentElement.classList.contains('is-ended'), quote: document.getElementById('text').textContent.length };`);
check(r.title === 'LockedIn' && r.remainHidden && r.endedText === 'Fokussessionen er slut' && r.isEnded, 'session over: "Fokussessionen er slut" in the timer slot, title "LockedIn"', JSON.stringify(r));
check(r.link === 'Fortsæt til instagram.com' && r.href === 'https://www.instagram.com/' && r.color === 'rgb(242, 193, 78)', 'session over: yellow "Fortsæt til instagram.com" link back', `${r.link} → ${r.href}`);
check(r.quote > 0, 'session over: the quote stays', `${r.quote} chars`);

// ---------- 5. no image: type only, no picture credit ----------
await send('Network.setBlockedURLs', { urls: ['*127.0.0.1:919*', '*localhost:919*', '*[::1]:919*', '*.jpg'] }, S);
await open(`&q=${LONGEST}`);
r = await js(`return { fallback: document.documentElement.classList.contains('no-portrait'), credit: document.getElementById('credits').textContent, vis: getComputedStyle(document.getElementById('quote')).visibility, px: +document.getElementById('text').dataset.px };`);
check(r.fallback && !r.credit.includes('Billede') && r.vis === 'visible' && r.px >= 29, 'image fails: type only, no picture credit', JSON.stringify(r));
await send('Network.setBlockedURLs', { urls: ['*127.0.0.1:919*', '*localhost:919*', '*[::1]:919*'] }, S);

// ---------- 6. another quote: double-click / → / Space; the timer never moves ----------
async function click(x, y, count) {
  for (let c = 1; c <= count; c++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: c }, S);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: c }, S);
  }
}
const state = () => js(`const $ = (id) => document.getElementById(id); return { who: $('author').textContent, text: $('text').textContent, remain: $('remain').textContent, title: document.title, sel: String(getSelection()), print: document.documentElement.dataset.print || '', anims: document.getAnimations().map((x) => Math.round(x.effect.getComputedTiming().endTime)) };`);
for (const reduce of [false, true]) {
  await viewport(1440, 900, 1, reduce);
  await open(`&q=${SHORTEST}&mins=95`);
  await sleep(800);
  const a = await state();
  await click(300, 450, 2);
  let maxEnd = 0, ran = 0;
  for (let i = 0; i < 24; i++) { await sleep(40); const x = await state(); ran = Math.max(ran, x.anims.length); maxEnd = Math.max(maxEnd, ...x.anims, 0); }
  await sleep(700);
  const b = await state();
  const tag = reduce ? 'reduced motion' : 'motion';
  check(b.who && b.text !== a.text && b.print === 'ready', `another quote (${tag}): a double-click shows a different quote, portrait developed`, `${a.who} → ${b.who}`);
  check(b.remain === a.remain && b.title === a.title && a.remain === '1:35', `another quote (${tag}): the countdown neither resets nor jumps`, `${a.remain} → ${b.remain}`);
  check(b.sel === '', `another quote (${tag}): the double-click selects no text`, JSON.stringify(b.sel));
  check(reduce ? ran === 0 : maxEnd <= 600, `another quote (${tag}): ${reduce ? 'no animation at all' : 'every animation ends by 600 ms'}`, `${ran} animations, latest end ${maxEnd} ms`);
  await sleep(900);
  await click(300, 450, 4); // a quadruple click is one change, not two
  await sleep(1400);
  const c = await state();
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, S);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, S);
  await sleep(1400);
  const d = await state();
  check(c.text !== b.text && d.text !== c.text, `another quote (${tag}): a quadruple click and → each give one new quote`, `${b.who} → ${c.who} → ${d.who}`);
}
const bagSeen = await js(`return JSON.parse(sessionStorage.getItem('bag') || 'null');`);
check(bagSeen && Array.isArray(bagSeen.seen) && new Set(bagSeen.seen).size === bagSeen.seen.length, 'another quote: drawn from the shuffle bag, no repeats within a round', JSON.stringify(bagSeen && bagSeen.seen));

if (process.env.SUMMARY) fs.writeFileSync(process.env.SUMMARY, JSON.stringify(rows, null, 1));
console.log(failures ? `\n${failures} FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
