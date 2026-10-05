// DEV ONLY. Geometry sweep of the production quote page (blocked.html?mock=1) at exact viewport sizes, in
// same-origin iframes — usable in any browser, also while a real lock forbids Chrome for Testing.
// In the console of qa-sweep.html:  await sweep(1024, 768)   → summary + per-quote rows in window.rows
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function measure(frame, id) {
  await new Promise((res) => { frame.onload = res; frame.src = `../../blocked.html?mock=1&q=${id}&n=${Math.random()}`; });
  let doc = null;
  for (let i = 0; i < 160; i++) {
    await sleep(25);
    doc = frame.contentDocument;
    const r = doc && doc.documentElement;
    if (r && r.classList.contains('is-set') && (r.dataset.print === 'ready' || r.classList.contains('no-portrait'))) break;
  }
  await sleep(30);
  const w = frame.contentWindow, r = doc.documentElement, $ = (x) => doc.getElementById(x);
  const box = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
  const lines = [...doc.querySelectorAll('#text .li')].map((l) => l.textContent.replace(/^“/, '').trim());
  const words = lines.map((l) => l.replace(/⁠/g, '').split(/[\s ]+/).filter((x) => /[\p{L}\d]/u.test(x)).length);
  const cl = $('credits');
  const lh = parseFloat(w.getComputedStyle(cl).lineHeight);
  const frameData = r.dataset.frame ? JSON.parse(r.dataset.frame) : null;
  const q = box($('quote')), t = box($('text')), a = box($('author')), d = box($('dates')), rule = box(doc.querySelector('.rule'));
  const contrast = printContrast(doc, w, frameData);
  return {
    id, px: +$('text').dataset.px, lines, words, side: r.dataset.side, overflow: r.classList.contains('overflow'),
    col: t[2], creditLines: Math.round(cl.offsetHeight / lh), credit: cl.textContent,
    links: [...doc.querySelectorAll('a[href]')].filter((x) => !x.closest('[hidden]') && x.offsetParent).length,
    quote: q, slot: box($('slot')), credits: box(cl), author: a, dates: d, rule,
    face: frameData && frameData.face, zone: frameData && frameData.zone, print: frameData && frameData.print,
    sw: doc.documentElement.scrollWidth, vw: w.innerWidth, vh: w.innerHeight,
    contrast, slotBottom: box($('slot'))[1] + box($('slot'))[3],
    fadeEnd: frameData && printFadeEnd(doc, w, frameData),
  };
}

// ---------- contrast of each quote line over the print (an upper bound on the print's brightness) ----------
// The developed canvas × the print's own mask (the four gradients, intersected), over the page colour. The light
// overlay only darkens and is ignored, so the real pixels are at least this dark: a conservative estimate.
const sRGB = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const L = (r, g, b) => 0.2126 * sRGB(r) + 0.7152 * sRGB(g) + 0.0722 * sRGB(b);
const PAPER = L(0xf2, 0xec, 0xe1);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const pxv = (v, size) => (/%$/.test(v.trim()) ? (parseFloat(v) / 100) * size : parseFloat(v) || 0);
function maskParams(doc, w) {
  const pr = doc.querySelector('.print'), cs = w.getComputedStyle(pr);
  const ph = pr.offsetHeight, pw = pr.offsetWidth;
  const g = (k, size) => pxv(cs.getPropertyValue(k) || '0px', size);
  return { pw, ph, el: g('--el', pw), er: g('--er', pw), s0: g('--s0', ph), s1: g('--s1', ph), f0: g('--f0', ph), f1: g('--f1', ph) };
}
function maskAlpha(m, x, y) {
  if (x < 0 || y < 0 || x > m.pw || y > m.ph) return 0;
  const ramp = (d, len) => (len <= 0 ? 1 : d >= len ? 1 : d <= 0 ? 0 : d < 0.55 * len ? 0.45 * d / (0.55 * len) : 0.45 + 0.55 * (d - 0.55 * len) / (0.45 * len));
  let a = ramp(x, m.el) * ramp(m.pw - x, m.er);
  a *= y <= m.s0 ? 0 : y >= m.s1 ? 1 : (y - m.s0) / (m.s1 - m.s0);
  if (y > m.f0) {
    const t = m.f1 > m.f0 ? (y - m.f0) / (m.f1 - m.f0) : 1;
    a *= t >= 1 ? 0 : t < 0.35 ? 1 - 0.45 * t / 0.35 : t < 0.7 ? 0.55 - 0.4 * (t - 0.35) / 0.35 : 0.15 * (1 - (t - 0.7) / 0.3);
  }
  return a;
}
/** Desktop: the zone clips the print and dissolves its inner edge over `feather` px. Phone: no clip. */
function zoneAlpha(f, feather, x, y) {
  if (f.side === 'top') return 1;
  const [zl, zt, zw, zh] = f.zone;
  if (x < zl || x > zl + zw || y < zt || y > zt + zh) return 0;
  const d = f.side === 'right' ? x - zl : zl + zw - x;
  return feather > 0 ? Math.min(1, d / feather) : 1;
}
/** Where the print is fully transparent from (viewport y), from its mask. */
function printFadeEnd(doc, w, f) {
  const m = maskParams(doc, w);
  return f.print[1] + Math.min(m.f1, m.ph);
}
function printContrast(doc, w, f) {
  const canvas = doc.querySelector('.print canvas');
  const lines = [...doc.querySelectorAll('#text .li')];
  if (!canvas || !f || !lines.length) return null;
  const m = maskParams(doc, w);
  const [pl, pt] = f.print;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  const sx = canvas.width / m.pw, sy = canvas.height / m.ph;
  const feather = parseFloat(doc.getElementById('zone').style.getPropertyValue('--feather')) || 0;
  return lines.map((li) => {
    const b = li.getBoundingClientRect();
    const vals = [];
    for (let y = b.top; y < b.bottom; y += 2) {
      for (let x = b.left; x < b.right; x += 2) {
        const px = x - pl, py = y - pt;
        const a = maskAlpha(m, px, py) * zoneAlpha(f, feather, x, y);
        let c = [5, 5, 5];
        if (a > 0) {
          const o = (Math.min(canvas.height - 1, Math.floor(py * sy)) * canvas.width + Math.min(canvas.width - 1, Math.floor(px * sx))) * 4;
          c = [0, 1, 2].map((k) => 5 + a * (data[o + k] - 5));
        }
        vals.push(L(...c));
      }
    }
    vals.sort((p, q) => p - q);
    const p95 = vals[Math.floor(vals.length * 0.95)] || 0, max = vals[vals.length - 1] || 0;
    return { p95: +ratio(PAPER, p95).toFixed(2), worst: +ratio(PAPER, max).toFixed(2) };
  });
}

const inter = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

window.sweep = async function sweep(vw, vh, ids) {
  const quotes = await (await fetch('../../quotes/quotes.json', { cache: 'no-store' })).json();
  const list = ids || quotes.map((q) => q.id);
  const byId = Object.fromEntries(quotes.map((q) => [q.id, q]));
  const frame = document.createElement('iframe');
  frame.width = vw; frame.height = vh;
  frame.style.cssText = 'border:0;display:block';
  document.body.replaceChildren(frame);
  const rows = [];
  for (const id of list) rows.push(await measure(frame, id));
  window.rows = rows;
  const bad = (f) => rows.filter(f).map((x) => x.id);
  const pxs = rows.map((x) => x.px).sort((a, b) => a - b);
  const verse = rows.filter((x) => / \/ /.test(byId[x.id].text));
  const phone = vw < 900 || vw / vh < 1.1;
  return {
    size: `${vw}×${vh}`, n: rows.length,
    px: { min: pxs[0], median: pxs[pxs.length >> 1], max: pxs[pxs.length - 1], le42: pxs.filter((p) => p <= 42).length },
    colMin: Math.round(Math.min(...rows.map((x) => x.col))),
    overflow: bad((x) => x.overflow), hscroll: bad((x) => x.sw > x.vw),
    collide: bad((x) => inter(x.slot, x.quote) || inter(x.quote, x.credits) || inter(x.slot, x.credits)),
    outside: bad((x) => [x.quote, x.credits, x.slot].some((b) => b[0] < -1 || b[1] < -1 || b[0] + b[2] > x.vw + 1 || b[1] + b[3] > x.vh + 1)),
    overFace: bad((x) => x.face && inter(x.quote, [x.face[0] - x.face[2] / 2, x.face[1] - x.face[3] / 2, x.face[2], x.face[3] * 1.15])),
    verseLines: verse.map((x) => `${x.id}:${x.lines.length}`),
    stranded: rows.filter((x) => !/ \/ /.test(byId[x.id].text) && x.words.reduce((a, b) => a + b, 0) >= 8 && x.words.slice(0, -1).some((n) => n < 2)).map((x) => `${x.id}@${x.px}`),
    stub: rows.filter((x) => !/ \/ /.test(byId[x.id].text) && x.lines.length > 1 && x.lines.slice(0, -1).some((l) => [...l].length < 0.3 * Math.max(...x.lines.map((m) => [...m].length)))).map((x) => `${x.id}@${x.px}`),
    hyphenEnd: bad((x) => x.lines.slice(0, -1).some((l, i) => /-$/.test(l) && (l.split(/\s/).pop() + x.lines[i + 1].split(/\s/)[0]).length <= 16)),
    creditOver: rows.filter((x) => x.creditLines > (phone ? 2 : 1)).map((x) => `${x.id}:${x.creditLines}`),
    creditJunk: bad((x) => /[[\]_]|https?:|\.jpe?g\b|\bunknown\b|Photo:|…/i.test(x.credit)),
    links: Math.max(...rows.map((x) => x.links)),
    signature: bad((x) => x.dates[2] > 0 && x.dates[1] > x.author[1] + 2 && x.dates[0] < x.author[0] - 1),
    ruleAlone: bad((x) => x.author[1] > x.rule[1] + 2 + x.author[3]),
    slotAligned: phone ? [] : bad((x) => Math.abs(x.slot[0] - x.quote[0]) > 2),
    // the zone (print + light) must end inside the quote block — the light is the page colour, so even then no edge
    seam: phone ? bad((x) => x.zone && x.zone[1] + x.zone[3] > x.quote[1] + x.quote[3]) : [],
    // stacked: the print has dissolved before the quote's box; the face is whole and below the timer strip
    printUnderText: phone ? rows.filter((x) => x.fadeEnd != null && x.fadeEnd > x.quote[1] - 2).map((x) => `${x.id}:${Math.round(x.fadeEnd - x.quote[1])}`) : [],
    faceUnderStrip: phone ? rows.filter((x) => x.face && x.face[1] - x.face[3] / 2 < x.slotBottom).map((x) => x.id) : [],
    faceOut: bad((x) => x.face && (x.face[1] - x.face[3] / 2 < 0 || x.face[0] - x.face[2] / 2 < -0.15 * x.face[2] || x.face[0] + x.face[2] / 2 > x.vw + 0.15 * x.face[2])),
    contrastFirst: (() => { const c = rows.filter((x) => x.contrast).map((x) => x.contrast[0].p95).sort((a, b) => a - b); return c.length ? { min: c[0], p10: c[Math.floor(c.length * 0.1)] } : null; })(),
    under7: rows.filter((x) => x.contrast && x.contrast.some((c) => c.p95 < 7)).map((x) => `${x.id}:${Math.min(...x.contrast.map((c) => c.p95))}`),
    under45: rows.filter((x) => x.contrast && x.contrast.some((c) => c.worst < 4.5)).map((x) => `${x.id}:${Math.min(...x.contrast.map((c) => c.worst))}`),
    narrowPrint: phone ? rows.filter((x) => x.print && x.print[2] < x.vw - 1).map((x) => `${x.id}:${Math.round(100 * x.print[2] / x.vw)}%`) : [],
    edgeGap: phone ? [] : bad((x) => x.print && x.print[3] >= x.vh - 1 && (x.side === 'right' ? x.print[0] + x.print[2] < x.vw - 1 : x.print[0] > 1)),
  };
};
