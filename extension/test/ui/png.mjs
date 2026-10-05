// Minimal PNG decoder for Chrome screenshots (8-bit RGB/RGBA, not interlaced) — enough for the contrast audit.
import zlib from 'node:zlib';

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type})`);
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

const LIN = new Float64Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });

/** WCAG relative luminance of pixel i (RGBA index / 4). */
export const lum = (img, i) => 0.2126 * LIN[img.data[i * 4]] + 0.7152 * LIN[img.data[i * 4 + 1]] + 0.0722 * LIN[img.data[i * 4 + 2]];

/** Luminance of a CSS rgb()/rgba() colour string (alpha ignored: the page's text colours are opaque or near). */
export function cssLum(col) {
  const [r, g, b] = (col.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
  return 0.2126 * LIN[Math.round(r)] + 0.7152 * LIN[Math.round(g)] + 0.0722 * LIN[Math.round(b)];
}

export const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Luminances of the pixels under CSS-px rectangles [x, y, w, h] at device scale `dpr`. */
export function under(img, rects, dpr = 1) {
  const v = [];
  for (const [x, y, w, h] of rects) {
    const x0 = Math.max(0, Math.floor(x * dpr)), y0 = Math.max(0, Math.floor(y * dpr));
    const x1 = Math.min(img.width, Math.ceil((x + w) * dpr)), y1 = Math.min(img.height, Math.ceil((y + h) * dpr));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) v.push(lum(img, yy * img.width + xx));
  }
  return v;
}

export function percentile(values, p) {
  if (!values.length) return 0;
  const s = Float64Array.from(values).sort();
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}
