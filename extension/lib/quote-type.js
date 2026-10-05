// Quote page typography, the credit line and the timer label. Pure: no DOM, so the rules are unit-tested in node.
// Design: docs/QUOTE-DESIGN.md, "Afgørelse" (+ docs/QUOTE-QA.md fixes).

import { daDates } from './credits.js';

// ---------- the type scale ----------

/** One modular scale for every quote: the largest step that fits wins, so equal quotes get equal sizes. */
export const SCALE = [128, 114, 104, 92, 82, 73, 65, 58, 52, 47, 42, 38, 34, 31, 29];
export const FLOOR = 29;

/**
 * Ceiling: desktop min(128 px, 15 vh); stacked (phone, split screen) min(128 px, 15 vh, 16.5 vw) —
 * about 64 px on a 390 px phone, up to ~119 px in a 720 px wide portrait window.
 */
export function ceiling(desktop, vh, vw = 390) {
  return desktop ? Math.min(128, vh * 0.15) : Math.min(128, vh * 0.15, vw * 0.165);
}

/** The scale steps that may be tried, largest first (never empty: the floor always remains). */
export function steps(cap) {
  const s = SCALE.filter((px) => px <= cap);
  return s.length ? s : [FLOOR];
}

/** The next step down the scale (or the floor). */
export const stepBelow = (px) => SCALE.find((s) => s < px) || FLOOR;

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Leading: 1.04 at ≥ 92 px, rising to 1.18 at ≤ 34 px. */
export function leading(px) {
  return +(1.18 + (1.04 - 1.18) * clamp01((px - 34) / (92 - 34))).toFixed(3);
}

/** Tracking in em: −0.015 at ≥ 92 px, rising to 0 at ≤ 40 px. */
export function tracking(px) {
  return +(-0.015 * clamp01((px - 40) / (92 - 40))).toFixed(4);
}

/** Line limits: ≥ 104 px → 3 lines, ≥ 82 → 4, ≥ 65 → 5, ≥ 52 → 7, below that only the height decides. */
export function maxLines(px) {
  if (px >= 104) return 3;
  if (px >= 82) return 4;
  if (px >= 65) return 5;
  if (px >= 52) return 7;
  return Infinity;
}

/** Measure in em: 17 up to 22 words, 22 above. */
export const measureEm = (words) => (words <= 22 ? 17 : 22);

/**
 * May this line breaking stand at this size?
 * - not more lines than the size allows;
 * - no fragments: in a quote of 6+ words the lines before the last average ≥ 3 words — or, failing that, each has
 *   ≥ 2 words and ≥ 11 characters ("He who would / preserve everything, / preserves nothing." may stand,
 *   "Purity / of heart / is to will" may not);
 * - no stranded word: in a quote of 8+ words no line but the last holds a single word ("… / determination, / …"),
 *   and no line but the last is a stub under 30 % of the longest ("… / of a / hundred battles.") — a soft rule: it
 *   chooses the breaking at a size but never costs a step of the scale (see ui/blocked.js fitQuote);
 * - verse keeps its own lines: short verse (Piet Hein's grooks, lines ≤ 24 characters) exactly, long verse
 *   (Shakespeare) may run each line over once — it is then set with a hanging indent.
 */
export function okLines(px, lineWords, words, verse = false, verseLines = 0, lineChars = null, verseLong = false, stubs = true) {
  const n = lineWords.length;
  if (!n || n > maxLines(px)) return false;
  if (verse) return !verseLines || (verseLong ? n <= verseLines * 2 : n === verseLines);
  if (words >= 6 && n > 1) {
    const body = lineWords.slice(0, -1);
    const avgOk = body.reduce((a, b) => a + b, 0) / body.length >= 3;
    const charsOk = !!lineChars && body.every((w, i) => w >= 2 && lineChars[i] >= 11);
    if (!avgOk && !charsOk) return false;
    if (words >= 8 && body.some((w) => w < 2)) return false;
    // no stub line in mid-quote ("… the result / of a / hundred battles."): each line before the last carries at
    // least 30 % of the longest line
    if (stubs && lineChars && lineChars.length === n) {
      const longest = Math.max(...lineChars);
      if (lineChars.slice(0, -1).some((c) => c < 0.3 * longest)) return false;
    }
  }
  return true;
}

/**
 * Walks the scale from the top. `measure(px)` sets the type at px and returns
 * { lineWords: number[], fits: boolean } (fits = inside the height budget and the column).
 * Returns { px, lineWords, overflow } — overflow only when even the floor does not fit.
 */
export function pickSize({ cap, words, verse = false, verseLines = 0, verseLong = false, stubs = true }, measure) {
  const list = steps(cap);
  for (const px of list) {
    const m = measure(px);
    if (m.fits && okLines(px, m.lineWords, words, verse, verseLines, m.lineChars, verseLong, stubs)) return { px, lineWords: m.lineWords, overflow: false };
  }
  const px = list[list.length - 1];
  const m = measure(px);
  return { px, lineWords: m.lineWords, overflow: !m.fits };
}

/** Per-line entrance: 40 ms lead-in, stagger ≤ 40 ms, total spread ≤ 140 ms, 420 ms per line → done by 600 ms. */
export const staggerMs = (lines) => (lines > 1 ? Math.min(40, 140 / (lines - 1)) : 0);

// ---------- typesetting ----------

const WJ = '\u2060';   // word joiner: no line break on either side
const NBSP = '\u00a0';

/** Straight quotes → typographic, nested as single ‘ ’ inside a wrapper's “ ”; apostrophes → ’. */
export function smartQuotes(s, { nested = true } = {}) {
  let t = String(s || '');
  t = t.replace(/[“”„]/g, '"');
  const [o, c] = nested ? ['‘', '’'] : ['“', '”'];
  t = t.replace(/(^|[\s(\[{—–-])"/g, `$1${o}`).replace(/"/g, c);
  t = t.replace(/(\w)'(\w)/g, '$1’$2');
  return t.replace(/(^|[\s(\[{—–-])'/g, '$1‘').replace(/'/g, '’');
}

/**
 * Typographic text for a quote the page wraps in “ ”:
 * - inner quotation marks are nested as single ‘ ’; apostrophes become ’; "..." becomes …
 * - a closed-up dash never starts a line (glued to the word before); a spaced dash is bound with a no-break space
 * - a hyphen never breaks a short compound (≤ 16 characters: "to-day", "self-discipline", "ninety-nine"), nor
 *   one with a number ("10-minute"); longer compounds may break after the hyphen
 * - " / " in the data marks a verse line (Piet Hein's grooks)
 * - in quotes of 6+ words the last two words are bound when the last word is ≤ 12 characters
 * Returns { lines: string[], words, verse, verseLong }.
 */
export function typeset(raw) {
  let t = String(raw || '').trim().replace(/\s+/g, ' ');
  t = smartQuotes(t);
  t = t.replace(/\.\.\./g, '…').replace(/\s+--\s+/g, ' — ');
  t = t.replace(/ ([—–]) /g, `${NBSP}$1 `);
  t = t.replace(/(\S)—(?=\S)/g, `$1${WJ}—`);
  t = t.replace(/([\p{L}\d]+(?:-[\p{L}\d]+)+)/gu, (m) => ((m.length <= 16 || /\d/.test(m)) ? m.replace(/-/g, `-${WJ}`) : m));
  const verse = / \/ /.test(t);
  let lines = verse ? t.split(/ \/ /) : [t];
  const words = countWords(lines.join(' '));
  const verseLong = verse && lines.some((l) => [...l].length > 24);
  if (!verse && words >= 6) {
    lines = [lines[0].replace(/ (\S+) (\S+)$/, (m, a, b) => ([...b.replace(/\u2060/g, '')].length <= 12 && [...(a + b)].length <= 24 ? ` ${a}${NBSP}${b}` : m))];
  }
  return { lines, words, verse, verseLong };
}

/** Words as a reader counts them (no-break spaces and word joiners do not merge words). */
export function countWords(s) {
  return String(s).replace(/\u2060/g, '').split(/[\s\u00a0]+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
}

// ---------- names, dates, sources ----------

/** "Laozi (traditional attribution)" → "Laozi": the dates line already says "trad.". */
export const displayName = (a) => String(a || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** Danish life dates, including living people: "born 1943" / "b. 1951" → "f. 1943". */
export function lifeDates(s) {
  return daDates(s || '').replace(/^(?:born|b\.)\s*/i, 'f. ').replace(/\btraditional\b/gi, 'traditionelt');
}

/** The year of a source, without research notes: "1911 (IBM's page says …)" → "1911". */
export function sourceYear(y) {
  let s = String(y || '').replace(/\s*\([^)]*\)/g, '').trim();
  if (s.length > 22 || (s && !/\d/.test(s))) s = (s.match(/\d{3,4}/) || [''])[0];
  return daDates(s);
}

export const SOURCE_MAX = 32;

const balanced = (s) => (s.match(/[‘“]/g) || []).length === (s.match(/[’”]/g) || []).length - (s.match(/\w’\w/g) || []).length;

/**
 * A short title for the credit line, ≤ max characters, typographic quotes. Never cut mid-phrase: the whole
 * title, else the title before its subtitle, else its first clause — or nothing at all (the source is then left
 * out; tools/quote-art.json can always give a hand-made short title).
 */
export function autoShort(work, max = SOURCE_MAX) {
  let w = String(work || '').trim();
  const bare = w.replace(/\s*\([^)]*\)/g, '').replace(/\s+,/g, ',').trim();
  if (bare.length >= 6) w = bare;
  w = smartQuotes(w.split(/;\s/)[0].replace(/[\s,;:—–-]+$/, ''), { nested: false });
  const fits = (s) => s && [...s].length <= max && balanced(s);
  if (fits(w)) return w;
  const colon = w.indexOf(': ');
  if (colon > 0 && fits(w.slice(0, colon))) return w.slice(0, colon);
  const comma = w.indexOf(', ');
  if (comma > 0 && fits(w.slice(0, comma))) return w.slice(0, comma);
  return '';
}

/** The source as shown: data's source.short when present, else autoShort; plus the cleaned year. */
export function shortSource(q, max = SOURCE_MAX) {
  const src = (q && q.source) || {};
  const full = String(src.work || '').trim();
  const given = typeof src.short === 'string' ? src.short.trim() : null;
  const work = given !== null ? ([...given].length <= max ? given : '') : autoShort(full, max);
  return { work, full, year: sourceYear(src.year) };
}

/** "Inter IKEA Systems B.V. (IKEA's official English version)" → "Inter IKEA Systems B.V." */
export const cleanTranslator = (t) => String(t || '').replace(/\s*\([^)]*\)/g, '').split(/\s*;\s*/)[0].trim();

/** CC BY / BY-SA need "changes indicated": the page grades and crops the photograph. PD and CC0 do not. */
export const isAdaptedCC = (lic) => /^CC BY/i.test(String(lic || '').trim());

/** A licence with a deed worth linking: Creative Commons only. Public domain has none. */
const isCC = (lic) => /^CC(0|\s)/i.test(String(lic || '').trim());

/** "Public domain (PD-UKGov)" → "Public domain"; "CC0 (Smithsonian Open Access)" → "CC0": no notes in the line. */
export const licenceLabel = (lic) => {
  const l = String(lic || '').replace(/\s*\([^)]*\)/g, '').trim();
  return /^public domain/i.test(l) ? 'Public domain' : l;
};

export const CREDIT_MAX = 40;

/** Text that must never appear in a credit: wiki markup, URLs, file names, raw Commons fields. */
export const BAD_CREDIT = /[[\]_]|https?:|www\.|\.(jpe?g|png|tiff?|gif|svg)\b|\bunknown\b|^photo:/i;

/**
 * The author's name as shown, from a raw Commons creator field (tools/quote-art.mjs stores it as image.credit;
 * a hand-made name in tools/quote-art.json wins). Drops notes, archive numbers, restorers, URLs, file names and
 * wiki markup; "Unknown photographer" → "Ukendt fotograf". Returns '' when nothing clean ≤ 40 characters remains.
 */
export function cleanCredit(creator) {
  let s = String(creator || '').replace(/\s+/g, ' ').trim();
  s = s.replace(/\[[^\]]*\]/g, '');
  s = s.replace(/^\S+\.(jpe?g|png|tiff?|gif|svg)\s*:\s*/i, '');
  s = s.replace(/\s*derivative work:.*$/i, '');
  s = s.replace(/^photo(?:graph)?(?::|\s+by)\s*/i, '');
  for (let k = 0; k < 3; k++) s = s.replace(/\s*\([^()]*\)/g, ''); // notes, dates, archive numbers (nested too)
  s = s.split(/\s*;\s*|\s+[—–]\s+/)[0];
  s = s.replace(/https?:\/\/\S+/gi, '');
  s = s.replace(/^unknown (photographer|author)\b.*$/i, (m, w) => (w.toLowerCase() === 'photographer' ? 'Ukendt fotograf' : 'Ukendt'));
  s = s.replace(/^unknown\b.*$/i, 'Ukendt');
  s = s.replace(/,?\s*\b(restor(?:ation|ed|e)?|retouched|cropped|crop|edited)\s+by\s+[^,;]+/gi, '');
  s = s.replace(/\s+active\s+\d.*$/i, '');
  // The author is the first comma-separated part; what follows is place, date, agency, medium or title.
  s = s.split(/,\s+/)[0];
  s = s.replace(/\s+(staff\s+)?photographer\.?$/i, '').replace(/\s+from\s+[A-ZÁÉÍÓÚ].*$/, '');
  s = s.replace(/^attributed to\s+/i, 'Tilskrevet ');
  s = s.replace(/\s+and\s+/g, ' & ');
  s = smartQuotes(s, { nested: false }).trim().replace(/[\s,;:]+$/, '');
  if (/\.$/.test(s) && !/(\b[A-Z]|Bros|Jr|Sr|Co|St)\.$/.test(s)) s = s.slice(0, -1).trim();
  if (!s || [...s].length > CREDIT_MAX || BAD_CREDIT.test(s) || /\d{4}/.test(s)) return '';
  return s;
}

/**
 * The name for the credit line from an image record: the author part of Commons' own attribution line
 * ("Kuhlmann/MSC, CC BY 3.0 DE, via Wikimedia Commons") when it is clean and short, else the cleaned creator field.
 */
export function creditName(img) {
  const attr = String((img && img.attribution) || '').split(/,\s*(?=CC\b|CC0|public domain|Public domain)/)[0];
  return (attr && attr !== (img && img.attribution) && cleanCredit(attr)) || cleanCredit(img && img.creator);
}

const httpsUrl = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; }
};

/**
 * The one credit line, as parts joined by " · " (each part = runs of { text, href?, title? }):
 *   {source}, {year} · Overs. X · Billede: {name}, {licence ↗}, bearbejdet · Wikimedia Commons ↗
 * - the source is plain text (no way off the page during a lock); `sourceMax` 0 leaves it out;
 * - the name is image.credit (cleaned at build time), the raw creator field only in the tooltip;
 * - only a Creative Commons licence links to its deed; "Public domain" is plain text;
 * - creator, licence, "bearbejdet", translator and the Commons link are never left out (on a narrow phone, as a
 *   last resort, the link may read "Commons ↗").
 */
export function creditModel(q, { hasPortrait = true, sourceMax = SOURCE_MAX, shortLink = false } = {}) {
  const parts = [];
  if (sourceMax > 0) {
    const s = shortSource(q, sourceMax);
    if (s.work) parts.push([{ text: s.work, title: s.full !== s.work ? s.full : undefined }, ...(s.year ? [{ text: `, ${s.year}` }] : [])]);
  }
  const tr = cleanTranslator(q && q.translation && q.translation.translator);
  if (tr) parts.push([{ text: `Overs. ${tr}` }]);
  const img = q && q.image;
  if (img && hasPortrait) {
    const raw = String(img.creator || '').trim();
    const given = typeof img.credit === 'string' ? img.credit.trim() : '';
    const name = (given && !BAD_CREDIT.test(given) ? given : creditName(img)) || 'Ukendt';
    const runs = [{ text: 'Billede: ' }, { text: name, title: raw && raw !== name ? raw : undefined }];
    const lic = licenceLabel(img.license);
    if (lic) {
      const href = isCC(lic) ? httpsUrl(img.license_url) : null;
      runs.push({ text: ', ' }, href ? { text: `${lic}\u00a0↗`, href } : { text: lic });
    }
    if (isAdaptedCC(lic)) runs.push({ text: ', bearbejdet' });
    parts.push(runs);
    const commons = httpsUrl(img.commons_page);
    if (commons) parts.push([{ text: shortLink ? 'Commons\u00a0↗' : 'Wikimedia\u00a0Commons\u00a0↗', href: commons }]);
  }
  return parts;
}

/** Plain text of a credit model (tests, tooltips). */
export const creditText = (parts) => parts.map((p) => p.map((r) => r.text).join('')).join(' · ').replace(/\u00a0/g, ' ');

// ---------- the timer ----------

/**
 * The time left, quiet: "1:12" (hours:minutes, rounded up, changing once a minute) — seconds only in the last
 * minute ("42 s"). Ticking seconds would be the only motion left on a still page.
 */
export function remainLabel(ms) {
  const left = Math.max(0, ms);
  if (left <= 60000) return `${Math.max(1, Math.ceil(left / 1000))} s`;
  const mins = Math.ceil(left / 60000);
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

/** Milliseconds until the label next changes (so the page repaints once a minute, then once a second). */
export function remainNextChange(ms) {
  const left = Math.max(0, ms);
  if (left <= 60000) return (left % 1000) || 1000;
  return (left % 60000) || 60000;
}
