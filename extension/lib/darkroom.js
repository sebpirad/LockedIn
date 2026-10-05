// Quote page "darkroom": every portrait — colour or black-and-white, photograph, painting or bust — is
// re-printed through one tone curve and one warm monochrome palette, exposed for the face and burnt down
// away from it, so 100 mismatched files read as one series. Works on raw RGBA pixels: pure and testable;
// ui/blocked.js only moves pixels in and out of a canvas.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const LOOK = Object.freeze({
  face: 0.48,          // target face tone (gamma space) …
  faceShare: 0.6,      // … reached only 60 % of the way (log space), so skin tones stay distinct
  contrast: 0.32,      // S-curve amount
  ceil: 0.86,          // brightest printable value: a white backdrop never prints white
  burnMin: 0.3, burnMax: 0.65,
  stops: [[0, [6, 6, 7]], [0.52, [118, 110, 99]], [1, [236, 228, 213]]],
});

/** Drawings and paintings on paper: no burn and a gentler curve, so they do not print as ghosts. */
export const DRAWING = Object.freeze({ contrast: 0.12, gammaMin: 0.85, gammaMax: 1.15 });

/** Exposure: gamma that moves the face's mean tone `share` of the way (in log space) to `target`. */
export function exposureGamma(faceMean, target = LOOK.face, share = LOOK.faceShare, lo = 0.6, hi = 1.9) {
  const m = clamp(faceMean, 0.06, 0.94);
  return clamp(Math.pow(Math.log(target) / Math.log(m), share), lo, hi);
}

/** Burn strength from the backdrop's printed brightness: a white studio wall becomes a glow, not a slab. */
export const burnStrength = (edge) => clamp(LOOK.burnMin + 0.6 * Math.max(0, edge - 0.18), LOOK.burnMin, LOOK.burnMax);

/** 256-entry RGB lookup through the palette stops. */
export function paletteLUT(stops = LOOK.stops) {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const x = v / 255;
    let i = 0;
    while (i < stops.length - 2 && x > stops[i + 1][0]) i++;
    const [x0, c0] = stops[i], [x1, c1] = stops[i + 1];
    const t = clamp((x - x0) / (x1 - x0));
    for (let k = 0; k < 3; k++) lut[v * 3 + k] = Math.round(c0[k] + (c1[k] - c0[k]) * t);
  }
  return lut;
}

/** Tone curve: levels → gamma → S-curve → ceiling. Returns 256 printed values in 0–1. */
export function toneCurve({ bp, wp, gamma, contrast = LOOK.contrast, ceil = LOOK.ceil }) {
  const out = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    let x = Math.pow(clamp((v / 255 - bp) / (wp - bp)), gamma);
    x = x + contrast * (x * x * (3 - 2 * x) - x);
    out[v] = clamp(x * ceil);
  }
  return out;
}

/**
 * Re-prints `data` (RGBA, W×H) in place. `face` is the normalised face box (centre x, y; size w, h).
 * `tone` is undefined or "drawing". Returns the measured statistics.
 */
export function develop(data, W, H, face, tone) {
  const n = W * H;
  const Y = new Uint8Array(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const y = (data[j] * 54 + data[j + 1] * 183 + data[j + 2] * 19) >> 8;
    Y[i] = y; hist[y]++;
  }
  const pct = (q) => { let acc = 0; const t = q * n; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v / 255; } return 1; };
  const bp = Math.min(pct(0.004), 0.22);
  const wp = Math.max(pct(0.997), bp + 0.4);
  const norm = (y) => clamp((y / 255 - bp) / (wp - bp));

  // Meter the middle 70 % of the face box.
  const f = face;
  const x0 = Math.floor(clamp(f.x - f.w * 0.35) * W), x1 = Math.ceil(clamp(f.x + f.w * 0.35) * W);
  const y0 = Math.floor(clamp(f.y - f.h * 0.35) * H), y1 = Math.ceil(clamp(f.y + f.h * 0.35) * H);
  let sum = 0, cnt = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { sum += norm(Y[y * W + x]); cnt++; }
  const faceMean = cnt ? sum / cnt : 0.5;
  const drawing = tone === 'drawing';
  const gamma = drawing ? exposureGamma(faceMean, LOOK.face, LOOK.faceShare, DRAWING.gammaMin, DRAWING.gammaMax) : exposureGamma(faceMean);
  const curve = toneCurve({ bp, wp, gamma, contrast: drawing ? DRAWING.contrast : LOOK.contrast });

  // Backdrop: mean printed value of the outer 10 % ring.
  let eSum = 0, eCnt = 0;
  const bx = Math.max(1, Math.round(W * 0.1)), by = Math.max(1, Math.round(H * 0.1));
  for (let y = 0; y < H; y += 3) {
    for (let x = 0; x < W; x += 3) {
      if (x >= bx && x < W - bx && y >= by && y < H - by) continue;
      eSum += curve[Y[y * W + x]]; eCnt++;
    }
  }
  const edge = eCnt ? eSum / eCnt : 0.3;
  const burn = drawing ? 0 : burnStrength(edge);

  // Burn with distance from the face (smoothstep from 1.25 to 4.4 face units; the body below stays lit longer).
  const pal = paletteLUT();
  const cx = f.x * W, cy = f.y * H, unit = clamp(f.h, 0.16, 0.24) * H;
  const r0 = 1.25 * unit, r1 = 4.4 * unit;
  for (let y = 0, i = 0, j = 0; y < H; y++) {
    const dy = (y - cy) * (y > cy ? 0.78 : 1);
    for (let x = 0; x < W; x++, i++, j += 4) {
      let k = 1;
      if (burn) {
        const dx = x - cx;
        const t = clamp((Math.sqrt(dx * dx + dy * dy) - r0) / (r1 - r0));
        k = 1 - burn * t * t * (3 - 2 * t);
      }
      const c = Math.round(curve[Y[i]] * k * 255) * 3;
      data[j] = pal[c]; data[j + 1] = pal[c + 1]; data[j + 2] = pal[c + 2];
    }
  }
  return { bp, wp, faceMean, gamma, edge, burn };
}

/** Static grain tile (gray noise around 128, for an overlay blend). Deterministic. */
export function grainPixels(N = 192, seed = 7) {
  const px = new Uint8ClampedArray(N * N * 4);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) {
    const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 92;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  return px;
}
