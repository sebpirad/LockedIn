// Quote page crop, look room and print (lib/quote-frame.js, lib/darkroom.js). Design: docs/QUOTE-DESIGN.md "Afgørelse".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FLIP_YAW, ZONE, MAX_UP, MAX_UP_PHONE, isDesktop, faceOf, portraitSide, frameDesktop, framePhone, softenPx, grainOpacity,
  zoneShare, minColumn, faceMargin, EDGE_PAD, TEXT_CLEAR, phoneTopSafe, minFacePhone, stackedBand,
} from '../lib/quote-frame.js';
import { LOOK, PAGE, exposureGamma, burnStrength, paletteLUT, toneCurve, develop, grainPixels } from '../lib/darkroom.js';

const CHURCHILL = { W: 618, H: 800, face: faceOf({ focus: { x: 0.38, y: 0.26, w: 0.28, h: 0.22, yaw: -0.3 } }) };
const CAESAR = { W: 589, H: 800, face: faceOf({ focus: { x: 0.46, y: 0.41, w: 0.7, h: 0.52, yaw: 0 } }) };
const RUTH = { W: 800, H: 1059, face: faceOf({ focus: { x: 0.54, y: 0.19, w: 0.08, h: 0.06, yaw: -0.36 } }) };

test('layout switch: desktop at width ≥ 900 and aspect ≥ 1.1', () => {
  assert.equal(isDesktop(1440, 900), true);
  assert.equal(isDesktop(1280, 720), true);
  assert.equal(isDesktop(390, 844), false);
  assert.equal(isDesktop(1000, 950), false);
  assert.equal(isDesktop(899, 500), false);
});

test('look room: right by default, left only when the face turns > 0.35 rad to the viewer\'s right', () => {
  assert.equal(FLIP_YAW, 0.35);
  assert.equal(portraitSide(faceOf({ focus: { x: 0.5, y: 0.3, w: 0.2, h: 0.2, yaw: 1.1 } })), 'left');
  assert.equal(portraitSide(faceOf({ focus: { x: 0.5, y: 0.3, w: 0.2, h: 0.2, yaw: 0.35 } })), 'right');
  assert.equal(portraitSide(faceOf({ focus: { x: 0.5, y: 0.3, w: 0.2, h: 0.2, yaw: -0.8 } })), 'right');
  assert.equal(portraitSide(faceOf({})), 'right');
  const fb = faceOf({ focus: { x: 'a' } });
  assert.equal(fb.fallback, true);
  assert.deepEqual([fb.x, fb.y], [0.5, 0.3]);
});

test('desktop crop: 46 % zone, face 30 % of the height at 70 % / 40 %, full height, text clear of the face', () => {
  const vw = 1440, vh = 900;
  const f = frameDesktop({ ...CHURCHILL, vw, vh, side: 'right' });
  assert.equal(Math.round(f.zone.width), Math.round(vw * ZONE));
  assert.equal(Math.round(f.zone.left), Math.round(vw - vw * ZONE));
  assert.ok(Math.abs(f.face.h - 0.3 * vh) < 1, `face height ${f.face.h}`);
  assert.ok(Math.abs(f.face.x - 0.7 * vw) < 1);
  assert.ok(f.print.top <= 0 && f.print.top + f.print.height >= vh, 'the print covers the full height');
  assert.ok(f.print.left + f.print.width >= vw - 1, 'reaches the outer edge');
  assert.ok(f.textEdge <= f.face.x - f.face.w - 40 + 0.01, 'quote ends ≥ 40 px + ½ face width before the face box');
  assert.ok(f.textEdge <= f.zone.left - 24);
  assert.ok(f.feather >= 80 && f.feather <= f.zone.width * 0.6);
  // mirrored when the sitter looks right
  const l = frameDesktop({ ...CHURCHILL, vw, vh, side: 'left' });
  assert.equal(l.zone.left, 0);
  assert.ok(l.face.x <= 0.3 * vw + 1 && l.face.x >= 0.25 * vw, 'face at 30 %, or nearer the edge when the print slides out to it');
  assert.ok(l.print.left <= 1e-9 || l.print.left < 0.3 * vw, 'the print reaches (or nearly reaches) the outer edge');
  assert.ok(l.textEdge >= l.face.x + l.face.w + 40 - 0.01);
  assert.ok(l.textEdge >= l.zone.width + 24);
});

test('desktop crop: a close-up moves outward so its face box starts inside the zone; a full figure stops at the cap', () => {
  const c = frameDesktop({ ...CAESAR, vw: 1440, vh: 900, side: 'right' });
  assert.ok(c.face.x - c.face.w / 2 >= c.zone.left + 23, 'face box inside the zone');
  assert.ok(c.face.x + c.face.w / 2 <= 1440 + 0.5, 'whole face in the window');
  const r = frameDesktop({ ...RUTH, vw: 1440, vh: 900, side: 'right' });
  assert.equal(r.scale, MAX_UP);
  assert.ok(r.face.h < 0.3 * 900);
});

test('stacked crop: the whole face below the strip, and the print gone before the quote (QA R2-M1)', () => {
  const subjects = [CHURCHILL, CAESAR, RUTH, ALI, E04];
  for (const [vw, vh] of [[390, 844], [360, 740], [720, 900], [600, 800]]) {
    for (const sub of subjects) {
      const stripH = 64;
      for (const textTop of [0.36 * vh, 0.5 * vh, 0.7 * vh]) {
        const f = framePhone({ ...sub, vw, vh, stripH, textTop });
        const tag = `${vw}×${vh} textTop ${Math.round(textTop)}`;
        assert.ok(f.face.y - f.face.h / 2 >= phoneTopSafe(stripH) - 0.5, `${tag}: face top below the strip`);
        assert.ok(f.face.x - f.face.w / 2 >= -0.5 && f.face.x + f.face.w / 2 <= vw + 0.5, `${tag}: face whole across`);
        assert.ok(f.print.top + f.fade.to <= textTop - TEXT_CLEAR + 0.5, `${tag}: print fully transparent before the quote`);
        assert.ok(f.fade.to <= f.print.height + 0.5 && f.fade.from < f.fade.to, `${tag}: the fade lies inside the print`);
        assert.ok(f.zone.height <= textTop - TEXT_CLEAR + EDGE_PAD + 0.5, `${tag}: the light ends before the quote too`);
        if (f.print.width < vw - 1) {
          const gapL = f.print.left, gapR = vw - f.print.left - f.print.width;
          assert.ok(Math.abs(gapL - gapR) <= 0.25 * vw + 0.5, `${tag}: a narrow print stays near the centre`);
        }
      }
    }
  }
  // with room, an ordinary portrait fills the width
  const c = framePhone({ ...CHURCHILL, vw: 390, vh: 844, stripH: 64, textTop: 470 });
  assert.ok(c.print.width >= 390 - 0.5 && c.print.left <= 0.5);
});

test('stacked band: always room for a minimum face; a wider window reserves a bigger one; at most half the height', () => {
  for (const [vw, vh] of [[390, 844], [360, 740], [720, 900], [800, 600]]) {
    for (const sub of [CHURCHILL, CAESAR, RUTH, ALI]) {
      const b = stackedBand({ ...sub, vw, vh, stripH: 64 });
      assert.ok(b.min >= 0.34 * vh - 0.5 && b.want >= b.min && b.want <= Math.max(b.min, 0.5 * vh) + 0.5);
      const f = framePhone({ ...sub, vw, vh, stripH: 64, textTop: b.min });
      assert.ok(f.face.h >= minFacePhone(vh, vw) - 0.5 || f.scale >= Math.min(vw / sub.W, MAX_UP_PHONE) - 1e-6,
        `${vw}×${vh}: face ${Math.round(f.face.h)} in the minimum band`);
    }
  }
  assert.ok(minFacePhone(900, 720) > minFacePhone(844, 390));
});

test('low-resolution insurance: softening past 2.6 device px per source px, grain 0.30–0.45', () => {
  assert.equal(softenPx(2), 0);
  assert.equal(softenPx(2.6), 0);
  assert.ok(softenPx(3.17) > 0.15 && softenPx(3.17) < 0.2);
  assert.equal(softenPx(10), 1.1);
  assert.equal(grainOpacity(1), 0.3);
  assert.equal(grainOpacity(10), 0.45);
});

test('darkroom: exposure goes only part of the way, so skin tones stay distinct', () => {
  const dark = 0.29, light = 0.76;
  const gd = exposureGamma(dark), gl = exposureGamma(light);
  assert.ok(gd < 1 && gl > 1);
  const outD = dark ** gd, outL = light ** gl;
  assert.ok(outD > dark && outD < LOOK.face, `dark face lifted, not to the target (${outD.toFixed(3)})`);
  assert.ok(outL < light && outL > LOOK.face, `light face lowered, not to the target (${outL.toFixed(3)})`);
  assert.ok(outL - outD > 0.1, 'the two faces still differ');
  assert.equal(burnStrength(0), LOOK.burnMin);
  assert.equal(burnStrength(1), LOOK.burnMax);
  assert.ok(LOOK.ceil < 0.95, 'a white backdrop never prints white');
});

test('darkroom: the palette\'s black is the page colour, so nothing in a print is darker than the page (no seam)', () => {
  const pal = paletteLUT();
  assert.deepEqual([pal[0], pal[1], pal[2]], [...PAGE]);
  for (let v = 0; v < 256; v++) for (let k = 0; k < 3; k++) assert.ok(pal[v * 3 + k] >= PAGE[k], 'never below the page');
  const css = fs.readFileSync(new URL('../ui/blocked.css', import.meta.url), 'utf8');
  const hex = css.match(/--black:\s*#([0-9a-f]{6})/i)[1];
  assert.deepEqual([0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)), [...PAGE], 'blocked.css --black = darkroom PAGE');
  for (const m of css.matchAll(/rgba\((\d+), (\d+), (\d+), [.\d]+\)/g)) {
    if (m.index > css.indexOf('.light {') && m.index < css.indexOf('/* ---------- the words')) {
      assert.deepEqual([+m[1], +m[2], +m[3]], [...PAGE], 'the light overlay is the page colour');
    }
  }
});

test('darkroom: monochrome palette, highlights capped, drawings unburnt', () => {
  const pal = paletteLUT();
  const W = 60, H = 80;
  const make = (fn) => { const d = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) { const [r, g, b] = fn(i % W, Math.floor(i / W)); d.set([r, g, b, 255], i * 4); } return d; };
  // a red-and-green colour photo with a white backdrop
  const img = make((x, y) => (x > 10 && x < 50 && y > 10 && y < 50 ? [200, 60, 40] : x < 5 ? [255, 255, 255] : [30, 160, 60]));
  const face = { x: 0.5, y: 0.37, w: 0.6, h: 0.45 };
  const st = develop(img, W, H, face);
  const top = Math.round(curveMax() * 255) * 3;
  function curveMax() { return toneCurve({ bp: 0, wp: 1, gamma: 1 })[255]; }
  for (let i = 0; i < W * H; i++) {
    const rgb = [img[i * 4], img[i * 4 + 1], img[i * 4 + 2]];
    const v = pal.findIndex((_, k) => k % 3 === 0 && pal[k] === rgb[0] && pal[k + 1] === rgb[1] && pal[k + 2] === rgb[2]);
    assert.ok(v >= 0, `pixel ${i} is on the palette`);
    assert.ok(rgb[0] <= pal[top] + 1, 'never brighter than the ceiling');
  }
  assert.ok(st.burn >= LOOK.burnMin && st.burn <= LOOK.burnMax);
  const drawing = make(() => [220, 200, 170]);
  assert.equal(develop(drawing, W, H, face, 'drawing').burn, 0);
  assert.equal(grainPixels(8).length, 8 * 8 * 4);
  assert.deepEqual(grainPixels(8), grainPixels(8), 'deterministic');
});

test('quotes.json: every portrait has a face box, a size and a short source ≤ 32; the data is merged', () => {
  const qs = JSON.parse(fs.readFileSync(new URL('../quotes/quotes.json', import.meta.url), 'utf8'));
  for (const q of qs) {
    if (q.source) assert.ok(typeof q.source.short === 'string' && [...q.source.short].length <= 32, `${q.id} source.short`);
    if (!q.image) continue;
    const f = q.image.focus;
    assert.ok(f && [f.x, f.y, f.w, f.h, f.yaw].every((v) => typeof v === 'number'), `${q.id} focus`);
    assert.ok(f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1 && f.w > 0 && f.h > 0, `${q.id} focus range`);
    assert.ok(q.image.width > 0 && q.image.height > 0, `${q.id} size`);
    assert.ok(!q.image.tone || q.image.tone === 'drawing', `${q.id} tone`);
  }
  assert.ok(qs.some((q) => q.image && q.image.tone === 'drawing'), 'drawings are marked');
});

const ALI = { W: 800, H: 1001, face: faceOf({ focus: { x: 0.526, y: 0.595, w: 0.679, h: 0.543, yaw: -0.1 } }) };
const E04 = { W: 750, H: 1100, face: faceOf({ focus: { x: 0.55, y: 0.43, w: 0.62, h: 0.42, yaw: 0 } }) };

test('small desktop windows: the portrait gives way, the quote column stays ≥ 440 px (QA M4)', () => {
  assert.equal(zoneShare(1440), ZONE);
  assert.equal(zoneShare(1000), 0.36);
  assert.ok(zoneShare(1024) < 0.37 && zoneShare(1280) > 0.42 && zoneShare(1280) < 0.44);
  assert.ok(faceMargin(1024, 400) < faceMargin(1440, 400));
  for (const [vw, vh] of [[1024, 768], [1100, 720], [1024, 640], [1180, 760]]) {
    const pad = Math.min(80, Math.max(32, vw * 0.05));
    for (const sub of [ALI, CAESAR, CHURCHILL, RUTH]) {
      const f = frameDesktop({ ...sub, vw, vh, side: 'right', pad, minCol: minColumn(vw, pad) });
      assert.ok(f.textEdge - pad >= 440 - 0.5, `${vw}×${vh}: column ${Math.round(f.textEdge - pad)}`);
      assert.ok(f.face.x + f.face.w / 2 <= vw + 0.15 * f.face.w + 0.5, 'at most 15 % of the face leaves the window');
      const l = frameDesktop({ ...sub, vw, vh, side: 'left', pad, minCol: minColumn(vw, pad) });
      assert.ok(vw - pad - l.textEdge >= 440 - 0.5, `${vw}×${vh} left: column ${Math.round(vw - pad - l.textEdge)}`);
    }
  }
  // at 1440 the guarantee is only the 440 floor: the approved composition is unchanged
  assert.equal(minColumn(1440, 72), 440);
});

test('desktop: a print that covers the full height reaches the outer edge (QA S4)', () => {
  for (const side of ['right', 'left']) {
    const f = frameDesktop({ ...E04, vw: 1440, vh: 900, side, pad: 72, minCol: 440 });
    assert.ok(f.print.height >= 900 - 1);
    if (side === 'right') assert.ok(f.print.left + f.print.width >= 1440 - 0.5, `right edge ${f.print.left + f.print.width}`);
    else assert.ok(f.print.left <= 0.5, `left edge ${f.print.left}`);
  }
});

test('stacked: look room (N3) — a profile looks into the frame', () => {
  const leo = { W: 558, H: 800, face: faceOf({ focus: { x: 0.3, y: 0.3, w: 0.35, h: 0.3, yaw: -1.2 } }) };
  const f = framePhone({ ...leo, vw: 390, vh: 844, stripH: 64, textTop: 470 });
  const straight = framePhone({ ...leo, face: { ...leo.face, yaw: 0 }, vw: 390, vh: 844, stripH: 64, textTop: 470 });
  assert.ok(f.face.x - straight.face.x >= 0.1 * 390, 'a profile facing left moves right, so it looks into the frame');
  assert.ok(f.print.left > 0, 'the space it looks into may be darkness (that edge dissolves)');
});
