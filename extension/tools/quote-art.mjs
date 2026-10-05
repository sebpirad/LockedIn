// Merges the quote page's art direction into extension/quotes/quotes.json. Safe to re-run; also run at the
// end of tools/sync-quotes.sh, so a fresh sync keeps it.
//   image.focus  {x, y, w, h, yaw}  — from tools/quote-faces.json (tools/measure-faces.swift, Apple Vision),
//                                      hand-set entries in tools/quote-art.json "facesManual" win
//   image.tone   "drawing"          — tools/quote-art.json "tone"
//   source.short ≤ 48 characters    — tools/quote-art.json "sourceShort", else autoShort() from lib/quote-type.js
//   image.width/height              — read from the JPEG, so the page can lay out the text before the image loads
// Usage: node extension/tools/quote-art.mjs [--check]   (--check: exit 1 if quotes.json is not up to date)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoShort, creditName, SOURCE_MAX, CREDIT_MAX, BAD_CREDIT } from '../lib/quote-type.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QUOTES = path.join(HERE, '..', 'quotes', 'quotes.json');
const readJSON = (p, fallback) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback);

const faces = readJSON(path.join(HERE, 'quote-faces.json'), {});
const art = readJSON(path.join(HERE, 'quote-art.json'), {});
const manual = art.facesManual || {};
const tones = art.tone || {};
const shorts = art.sourceShort || {};
const credits = art.credit || {};

const before = fs.readFileSync(QUOTES, 'utf8');
const list = JSON.parse(before);
const r3 = (v) => Math.round(v * 1000) / 1000;
const IMAGES = path.join(HERE, '..', 'quotes');

/** Pixel size of a baseline or progressive JPEG (SOFn marker), or null. */
function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}
let withFace = 0;
const needCredit = [];
const noFace = [];
for (const q of list) {
  if (q.source && typeof q.source === 'object') {
    const s = q.id in shorts ? shorts[q.id] : autoShort(q.source.work, SOURCE_MAX);
    if ([...s].length > SOURCE_MAX) throw new Error(`quote-art: sourceShort for ${q.id} is longer than ${SOURCE_MAX}`);
    q.source.short = s; // "" = the credit line leaves the source out
  }
  const img = q.image;
  if (!img || typeof img.file !== 'string') continue;
  const base = path.basename(img.file);
  const file = path.join(IMAGES, img.file);
  const size = fs.existsSync(file) ? jpegSize(fs.readFileSync(file)) : null;
  if (size) { img.width = size.width; img.height = size.height; } else { delete img.width; delete img.height; }
  const f = manual[base] || faces[base];
  if (f && ['x', 'y', 'w', 'h'].every((k) => typeof f[k] === 'number')) {
    img.focus = { x: r3(f.x), y: r3(f.y), w: r3(f.w), h: r3(f.h), yaw: r3(typeof f.yaw === 'number' ? f.yaw : 0) };
    withFace++;
  } else {
    delete img.focus;
    noFace.push(q.id);
  }
  if (tones[base]) img.tone = tones[base]; else delete img.tone;
  // The author's name for the credit line: hand-made, else cleaned from the Commons field. Never empty, never junk.
  const name = credits[base] || creditName(img);
  if (!name || [...name].length > CREDIT_MAX || BAD_CREDIT.test(name)) {
    needCredit.push(`${q.id} (${base}): ${String(img.creator).slice(0, 60)}`);
    img.credit = 'Ukendt';
  } else img.credit = name;
}
if (needCredit.length) {
  console.warn(`quote-art: ${needCredit.length} creator field(s) cannot be cleaned automatically — add a name to "credit" in tools/quote-art.json:\n  ${needCredit.join('\n  ')}`);
}
const after = JSON.stringify(list, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (after !== before) { console.error('quote-art: quotes.json is not up to date — run node extension/tools/quote-art.mjs'); process.exit(1); }
  console.log('quote-art: up to date');
} else {
  if (after !== before) fs.writeFileSync(QUOTES, after);
  console.log(`quote-art: ${withFace} portraits with a face box` + (noFace.length ? `, without: ${noFace.join(', ')} (centre/upper third)` : ''));
}
