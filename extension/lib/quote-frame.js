// Quote page: where the portrait goes and how it is cropped. Pure geometry, unit-tested in node.
// Face data (image.focus {x, y, w, h, yaw}, normalised, top-left origin) is measured once on a Mac with
// tools/measure-faces.swift and stored in quotes.json; nothing is measured at runtime.

export const FLIP_YAW = 0.35;       // rad (~20°): a sitter turned this far to the viewer's right goes on the left
export const ZONE = 0.46;           // desktop: the portrait's share of the width at ≥ 1400 px …
export const ZONE_MIN = 0.36;       // … narrowing to 36 % at 1000 px, so a small window keeps a bold quote
export const MAX_UP = 1.75;         // CSS px per source px, desktop
export const MAX_UP_PHONE = 2.1;
export const TEXT_GAP = 40;         // the quote ends ≥ 40 px + half a face width before the face box (see frameDesktop)

/** The portrait zone's share of the width: 36 % at ≤ 1000 px, rising to 46 % at ≥ 1400 px. */
export const zoneShare = (vw) => clamp(ZONE_MIN + (vw - 1000) * 0.00025, ZONE_MIN, ZONE);

/**
 * The quote column the crop must leave: at least 440 px; below 1200 px at least 48 % of the width, so a small
 * desktop window keeps a bold quote (never more than the dark side holds).
 */
export const minColumn = (vw, pad) => Math.min(vw < 1200 ? Math.max(440, 0.48 * vw) : 440, vw * (1 - zoneShare(vw)) - 24 - pad);

/** How far the quote keeps from the face box: 40 px + ½ face width; below 1200 px 24 px + 0.35 face width. */
export const faceMargin = (vw, fw) => (vw < 1200 ? 24 + 0.35 * fw : TEXT_GAP + 0.5 * fw);

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/** Desktop / landscape: width ≥ 900 and aspect ≥ 1.1. Everything else is the phone layout. */
export const isDesktop = (vw, vh) => vw >= 900 && vw / vh >= 1.1;

const FALLBACK_FACE = Object.freeze({ x: 0.5, y: 0.3, w: 0.3, h: 0.22, yaw: 0 });

/** A usable face box from image.focus, or the centre/upper third when there is none. */
export function faceOf(image) {
  const f = image && image.focus;
  if (!f || ![f.x, f.y, f.w, f.h].every(num)) return { ...FALLBACK_FACE, fallback: true };
  return {
    x: clamp(f.x, 0, 1), y: clamp(f.y, 0, 1), w: clamp(f.w, 0.02, 1), h: clamp(f.h, 0.02, 1),
    yaw: num(f.yaw) ? f.yaw : 0, fallback: false,
  };
}

/**
 * Look room: the sitter looks into the frame, toward the quote. Default right; left when the face turns
 * to the viewer's right. The photograph itself is never mirrored.
 */
export const portraitSide = (face) => (face && num(face.yaw) && face.yaw > FLIP_YAW ? 'left' : 'right');

/**
 * Desktop crop. The portrait zone is zoneShare(vw) of the width on `side`; the face is 30 % of the window height,
 * centred at 70 % / 40 % (30 % / 40 % on the left). The print covers the full height and reaches the outer edge;
 * a full figure with a tiny face stops at the upscale cap and floats in darkness.
 * `pad` + `minCol`: the quote column must get at least minCol px; if the face margin would squeeze it, the print
 * slides outward, letting at most 15 % of the face leave the window (a close-up crops rather than the words shrink).
 * Returns viewport coordinates: zone, print box, face box, the zone's inner feather and the text edge.
 */
export function frameDesktop({ W, H, face, vw, vh, side = 'right', pad = 0, minCol = 0 }) {
  const zoneW = vw * zoneShare(vw);
  const zoneL = side === 'right' ? vw - zoneW : 0;
  // Cover the full height — unless that would blow a small file up past 1.25 × the cap (a 300 px scan): then it
  // stops there and floats, its top and bottom dissolving like its sides.
  const sCover = Math.min(vh / H, MAX_UP * 1.25);
  const s = clamp((0.3 * vh) / (face.h * H), sCover, Math.max(sCover, MAX_UP));
  const w = W * s, h = H * s;
  const fw = face.w * W * s, fh = face.h * H * s;
  // Face centre at 70 % (30 %) across; a close-up whose face box would start before the zone moves outward,
  // as far as the whole face stays in the window.
  const fxT = side === 'right'
    ? Math.min(Math.max(vw * 0.7, zoneL + fw / 2 + 24), Math.max(vw * 0.7, vw - fw / 2))
    : Math.max(Math.min(vw * 0.3, zoneL + zoneW - fw / 2 - 24), Math.min(vw * 0.3, fw / 2));
  let left = fxT - face.x * w;
  const top = h >= vh ? clamp(vh * 0.4 - face.y * h, vh - h, 0) : clamp(vh * 0.4 - face.y * h, 0, vh - h);
  // The print reaches the outer window edge; only a print shorter than the window floats (60 % of the way).
  const slide = h >= vh - 1 ? 1 : 0.6;
  if (side === 'right' && left + w < vw) left += (vw - (left + w)) * slide;
  if (side === 'left' && left > 0) left -= left * slide;
  let fx = left + face.x * w;
  const edgeFor = (x) => (side === 'right'
    ? Math.min(zoneL - 24, x - fw / 2 - faceMargin(vw, fw))
    : Math.max(zoneL + zoneW + 24, x + fw / 2 + faceMargin(vw, fw)));
  let textEdge = edgeFor(fx);
  const need = side === 'right' ? pad + minCol - textEdge : textEdge - (vw - pad - minCol);
  if (need > 0) {
    const room = side === 'right' ? vw + 0.15 * fw - (fx + fw / 2) : fx - fw / 2 + 0.15 * fw;
    const d = Math.max(0, Math.min(need, room));
    left += side === 'right' ? d : -d;
    fx += side === 'right' ? d : -d;
    textEdge = edgeFor(fx);
  }
  const fy = top + face.y * h;
  // Inner edge of the zone dissolves; the feather may reach the shadow side of the face, never its middle.
  const reach = side === 'right' ? fx - 0.3 * fw - zoneL : zoneL + zoneW - (fx + 0.3 * fw);
  const feather = clamp(reach, 80, zoneW * 0.6);
  return {
    side, scale: s,
    zone: { left: zoneL, top: 0, width: zoneW, height: vh },
    print: { left, top, width: w, height: h },
    face: { x: fx, y: fy, w: fw, h: fh },
    feather, textEdge,
  };
}

/** Transparent print kept inside the zone below the fade (see framePhone). */
export const EDGE_PAD = 4;
/** Stacked layout: px of pure page colour between the end of the print and the quote's box. */
export const TEXT_CLEAR = 4;
/** Stacked layout: the shortest dissolve from under the chin to nothing (9 % of the height, 56–90 px). */
export const fadeMin = (vh) => clamp(0.09 * vh, 56, 90);
const CHIN = 0.55; // the dissolve starts this far below the face centre, in face heights (at the chin)

/** Stacked layout: the face's top edge stays below the timer strip. */
export const phoneTopSafe = (stripH) => stripH + 12;
/** Stacked layout: the smallest face worth showing (a wider window shows a larger one); below it the quote
 *  steps down instead. */
export const minFacePhone = (vh, vw = 390) => clamp(Math.max(0.11 * vh, 0.24 * vw), 72, 0.24 * vh);
/** The image band a face of height fh needs above the quote: strip, the face, the chin and a full dissolve. */
export const bandFor = (fh, stripH, vh) => phoneTopSafe(stripH) + (0.5 + CHIN) * fh + fadeMin(vh) + TEXT_CLEAR;

/**
 * Stacked layout (phone, split screen): the image band reserved above the quote, in px from the top.
 * `min` always holds a face of minFacePhone(vh) and never less than 34 % of the height; `want` holds the face as
 * large as a print that just fills the width makes it, up to half the height.
 * The page fits the quote below `want`, and falls back to `min` when the bigger band would cost the quote more
 * than one step of the type scale.
 */
export function stackedBand({ W, H, face, vw, vh, stripH }) {
  const min = Math.max(0.34 * vh, bandFor(minFacePhone(vh, vw), stripH, vh));
  const fhCover = face.h * H * Math.min(vw / W, MAX_UP_PHONE * 1.25);
  const want = clamp(bandFor(fhCover, stripH, vh), min, Math.max(min, 0.5 * vh));
  return { min, want };
}

/**
 * Stacked crop (phone, split screen): the portrait owns the band above the quote and has dissolved to nothing
 * TEXT_CLEAR px before the quote's box, so no line of the quote ever sits on the print.
 * - The whole face sits in the band: its top below the timer strip, its chin plus a dissolve of ≥ fadeMin(vh)
 *   above the end. A face that cannot fit at the width-filling scale is printed smaller (narrower than the window,
 *   centred, its sides dissolving) — the face is never cropped.
 * - Otherwise the print fills the width; a full figure with a tiny face may be enlarged (up to MAX_UP_PHONE).
 * - A face turned more than 20° looks into the frame: it is shifted away from the side it faces.
 * `textTop` is the top of the quote's box. Returns viewport coordinates and the print-relative fade and strip.
 */
export function framePhone({ W, H, face, vw, stripH, textTop, vh = 844 }) {
  const topSafe = phoneTopSafe(stripH);
  const end = textTop - TEXT_CLEAR;
  const span = 0.5 + CHIN, FADE_MIN = fadeMin(vh);
  const fhMax = Math.max(24, (end - topSafe - FADE_MIN) / span);
  const fhWant = Math.min(0.5 * (end - topSafe), 0.22 * vh);
  const unit = face.h * H; // face height per unit of scale
  const sCover = vw / W;
  const cap = Math.max(MAX_UP_PHONE, Math.min(sCover, MAX_UP_PHONE * 1.25));
  let s = clamp(fhWant / unit, sCover, Math.max(sCover, MAX_UP_PHONE));
  // a print too short to reach from the top edge to the end of the band grows until it does, as far as the face
  // still fits (otherwise darkness would open between the picture and the quote)
  s = Math.max(s, Math.min(end / H, MAX_UP_PHONE));
  s = Math.min(s, fhMax / unit, cap);
  const w = W * s, h = H * s;
  const fw = face.w * W * s, fh = unit * s;
  // Horizontal: look room. A print that fills the width may leave darkness on the side the face looks into; a
  // narrower print stays centred (± the look room), so it never stops short of one edge only.
  const look = Math.abs(face.yaw || 0) > FLIP_YAW ? -Math.sign(face.yaw) * vw * 0.12 : 0;
  let left = vw / 2 + look - face.x * w;
  if (w >= vw) left = clamp(left, vw - w - Math.max(0, -look), Math.max(0, look));
  else left = clamp(left, (vw - w) / 2 - Math.abs(look), (vw - w) / 2 + Math.abs(look));
  // Vertical: face centre at 40 % of the band, kept between the strip and the room the chin + dissolve need.
  const fyMin = topSafe + fh / 2, fyMax = Math.max(fyMin, end - FADE_MIN - CHIN * fh);
  let fy = clamp(0.4 * end, fyMin, fyMax);
  let top = fy - face.y * h;
  if (top > 0) { const d = Math.min(top, fy - fyMin); top -= d; fy -= d; }                        // reach the top edge
  if (top < 0 && top + h < end) { const d = Math.min(-top, end - (top + h), fyMax - fy); top += d; fy += d; } // and the band's end
  // Dissolve: from under the chin (or 16 % of the height above the end, for a long body) to nothing at `end`.
  const fadeTo = Math.max(1, Math.min(h, end - top));
  let fadeFrom = Math.max(fy + CHIN * fh - top, fadeTo - Math.max(FADE_MIN, 0.16 * vh));
  fadeFrom = Math.max(0, Math.min(fadeFrom, fadeTo - 40));
  const stripFrom = Math.max(0, -top);
  let stripTo = Math.max(stripFrom + 24, stripH + 28 - top);
  // a print that does not fill the window dissolves at its top as long as at its sides (never into the face)
  if (w < vw - 1 || top > 0) stripTo = Math.max(stripTo, Math.min(stripFrom + 0.2 * w, fy - fh / 2 - top));
  return {
    side: 'top', scale: s,
    // The zone (the light overlay) ends EDGE_PAD px after the print has faded out, so nothing reaches the quote
    // and the light's edge lies on page colour only. On phone the zone does not clip: the print's mask ends it.
    zone: { left: 0, top: 0, width: vw, height: Math.min(vh, top + fadeTo + EDGE_PAD) },
    print: { left, top, width: w, height: h },
    face: { x: left + face.x * w, y: fy, w: fw, h: fh },
    fade: { from: fadeFrom, to: fadeTo },
    strip: { from: stripFrom, to: stripTo },
    end,
  };
}

/** Softening once a print is upscaled past 2.6 device px per source px (reads as depth of field, not JPEG blocks). */
export const softenPx = (devicePerSource) => +clamp((devicePerSource - 2.6) * 0.32, 0, 1.1).toFixed(2);

/** Static grain strength, 0.30–0.45, rising with the upscale. */
export const grainOpacity = (devicePerSource) => +clamp(0.3 + (devicePerSource - 1.6) * 0.05, 0.3, 0.45).toFixed(2);
