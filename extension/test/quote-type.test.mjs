// Quote page typography, credit line and timer (lib/quote-type.js).
// Design: docs/QUOTE-DESIGN.md "Afgørelse"; fixes: docs/QUOTE-QA.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  SCALE, FLOOR, ceiling, steps, stepBelow, leading, tracking, maxLines, measureEm, okLines, pickSize, staggerMs,
  typeset, countWords, lifeDates, sourceYear, autoShort, shortSource, displayName, creditModel, creditText, isAdaptedCC,
  cleanCredit, BAD_CREDIT, CREDIT_MAX, SOURCE_MAX, licenceLabel, remainLabel, remainNextChange,
} from '../lib/quote-type.js';

const WJ = '\u2060', NBSP = '\u00a0';

test('one modular scale, 128 down to 29 px; ceilings: desktop 15 vh, stacked min(15 vh, 16.5 vw)', () => {
  assert.deepEqual(SCALE, [128, 114, 104, 92, 82, 73, 65, 58, 52, 47, 42, 38, 34, 31, 29]);
  assert.equal(FLOOR, 29);
  assert.equal(ceiling(true, 900), 128);
  assert.equal(ceiling(true, 720), 108);
  assert.equal(Math.round(ceiling(false, 844, 390)), 64, 'about 64 px on a 390 px phone');
  assert.equal(Math.round(ceiling(false, 740, 360)), 59);
  assert.ok(ceiling(false, 900, 720) > 110, 'a split-screen window gets display type, not phone type');
  assert.deepEqual(steps(108), [104, 92, 82, 73, 65, 58, 52, 47, 42, 38, 34, 31, 29]);
  assert.deepEqual(steps(20), [29], 'the floor always remains');
  assert.equal(stepBelow(104), 92);
  assert.equal(stepBelow(29), 29);
});

test('leading 1.04 → 1.18 and tracking −0.015 → 0 em, interpolated', () => {
  assert.equal(leading(128), 1.04);
  assert.equal(leading(92), 1.04);
  assert.equal(leading(34), 1.18);
  assert.equal(leading(29), 1.18);
  assert.ok(leading(58) > 1.04 && leading(58) < 1.18);
  assert.equal(tracking(128), -0.015);
  assert.equal(tracking(40), 0);
  assert.ok(tracking(65) < 0 && tracking(65) > -0.015);
});

test('line limits per size and the measure', () => {
  assert.deepEqual([128, 104, 92, 82, 73, 65, 58, 52, 47].map(maxLines), [3, 3, 4, 4, 5, 5, 7, 7, Infinity]);
  assert.equal(measureEm(22), 17);
  assert.equal(measureEm(23), 22);
});

test('no fragments, no stranded single word, verse keeps its own lines', () => {
  assert.equal(okLines(82, [1, 2, 3, 2], 8), false, '"Purity / of heart / is to will / one thing."');
  assert.equal(okLines(73, [4, 4], 8), true);
  assert.equal(okLines(58, [3, 3, 2], 8), true);
  assert.equal(okLines(58, [2, 3, 3], 8), false);
  assert.equal(okLines(47, [4, 4, 1, 3, 4], 16), false, 'a one-word line in mid-quote ("… / determination, / …")');
  assert.equal(okLines(47, [4, 4, 3, 4, 1], 16), true, 'the last line may be one word');
  assert.equal(okLines(58, [5, 1, 1], 7), true, 'under 8 words a one-word line is allowed');
  assert.equal(okLines(128, [1, 1], 2), true, 'a two-word quote may stack');
  assert.equal(okLines(65, [2, 2, 3, 3], 10, true, 4), true, 'verse on its four lines');
  assert.equal(okLines(52, [1, 1, 2, 2, 2, 1, 1], 10, true, 4), false, 'verse lines may not run over');
  assert.equal(okLines(104, [3, 3, 3, 3], 12), false, 'too many lines for the size');
  assert.equal(okLines(52, [], 8), false);
  assert.equal(okLines(38, [4, 3, 4, 4, 2, 2], 19, false, 0, [18, 14, 19, 22, 4, 17]), false, '"of a" as a stub line');
  assert.equal(okLines(38, [4, 3, 4, 4, 4], 19, false, 0, [18, 14, 19, 22, 17]), true);
});

test('pickSize walks the scale from the top and takes the first step that fits and breaks well', () => {
  const tried = [];
  const text = 'Strength does not come from physical capacity. It comes from an indomitable will.';
  const words = text.split(' ');
  const measure = (px) => {
    tried.push(px);
    const perLine = Math.floor(1400 / px);
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > perLine) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
    }
    lines.push(cur);
    return { lineWords: lines.map((l) => l.split(' ').length), fits: lines.length * px * 1.1 <= 520 };
  };
  const r = pickSize({ cap: 128, words: words.length }, measure);
  assert.equal(tried[0], 128);
  assert.ok(r.px < 128 && !r.overflow && SCALE.includes(r.px));
  assert.ok(okLines(r.px, r.lineWords, words.length));
  const none = pickSize({ cap: 128, words: 30 }, () => ({ lineWords: [5, 5, 5, 5, 5, 5], fits: false }));
  assert.deepEqual([none.px, none.overflow], [29, true]);
  // verse: the size steps down until each verse line fits on one line
  const verse = pickSize({ cap: 64, words: 10, verse: true, verseLines: 4 }, (px) => ({ lineWords: px > 42 ? [1, 1, 2, 2, 2, 1, 1] : [2, 2, 3, 3], fits: true }));
  assert.equal(verse.px, 42);
});

test('entrance stagger keeps the last line inside 600 ms', () => {
  for (const n of [1, 2, 4, 7, 12]) assert.ok(40 + (n - 1) * staggerMs(n) + 420 <= 600, `${n} lines`);
});

test('typesetting: nested quotes, apostrophes, dashes, hyphens, verse, bound last words', () => {
  const e09 = typeset('"Don\'t put all your eggs in one basket" is all wrong. I tell you "put all your eggs in one basket, and then watch that basket."');
  assert.match(e09.lines[0], /^‘Don’t put all/);
  assert.match(e09.lines[0], /basket’ is all wrong\. I tell you ‘put all/);
  assert.ok(!/["']/.test(e09.lines[0]));
  assert.match(typeset('the much-praised “line of retreat” is a snare').lines[0], /‘line of retreat’/);
  assert.ok(typeset('never, never, never—in nothing').lines[0].includes(`never${WJ}—in`));
  assert.ok(typeset('the dream — and more').lines[0].includes(`dream${NBSP}— and`));
  // a short compound (≤ 16 characters) or one with a number never breaks; a long one may
  const h = typeset('Lay hold of to-day\'s task, a 10-minute, self-discipline, ninety-nine, much-praised, self-satisfaction').lines[0];
  for (const c of ['to-', '10-', 'self-', 'ninety-', 'much-']) assert.ok(h.includes(`${c}${WJ}`), c);
  assert.ok(h.includes('self-satisfaction'), 'a compound over 16 characters may break after its hyphen');
  const v = typeset('Problems worthy / of attack / prove their worth / by hitting back.');
  assert.deepEqual(v.lines, ['Problems worthy', 'of attack', 'prove their worth', 'by hitting back.']);
  assert.equal(v.verse, true);
  assert.equal(v.words, 10);
  // the last two words are bound when the last word is ≤ 12 characters ("conventional wisdom" too)
  assert.ok(typeset('Purity of heart is to will one thing.').lines[0].endsWith(`one${NBSP}thing.`));
  assert.ok(typeset('Swim upstream. Go the other way. Ignore the conventional wisdom.').lines[0].endsWith(`conventional${NBSP}wisdom.`));
  assert.ok(!typeset('Do not make it six words incapacitatedness.').lines[0].includes(NBSP), 'not when the last word is long');
  assert.equal(typeset('Champions adjust.').lines[0], 'Champions adjust.');
  assert.ok(typeset('Nothing great ... is produced suddenly').lines[0].includes('…'));
  assert.equal(countWords(`one${NBSP}thing never${WJ}—in`), 3, 'a closed-up dash joins two words into one token');
});

test('names, life dates and source years in Danish', () => {
  assert.equal(displayName('Laozi (traditional attribution)'), 'Laozi');
  assert.equal(lifeDates('born 1943'), 'f. 1943');
  assert.equal(lifeDates('b. 1951'), 'f. 1951');
  assert.equal(lifeDates('121–180 CE'), '121–180 e.Kr.');
  assert.equal(lifeDates('c. 544–496 BCE (traditional)'), 'ca. 544–496 f.Kr. (traditionelt)');
  assert.equal(sourceYear('1941 (29 October)'), '1941');
  assert.equal(sourceYear("1911 (IBM's page says 1915, which cannot be right for an NCR meeting)"), '1911');
  assert.equal(sourceYear('c. 121 CE (Suetonius)'), 'ca. 121 e.Kr.');
});

test('short source titles: ≤ 32 characters, whole phrases only, typographic quotes — or nothing', () => {
  assert.equal(SOURCE_MAX, 32);
  assert.equal(autoShort('Speech at Harrow School'), 'Speech at Harrow School');
  assert.equal(autoShort('On the Shortness of Life (De Brevitate Vitae)'), 'On the Shortness of Life');
  assert.equal(autoShort('Up from Slavery: An Autobiography'), 'Up from Slavery', 'the title before its subtitle');
  assert.equal(autoShort("'Problems', in Grooks"), '‘Problems’, in Grooks');
  assert.equal(autoShort("'The Doctrine of the Sword', Young India"), '‘The Doctrine of the Sword’');
  assert.equal(autoShort('Around the World in Seventy-Two Days (New York: Pictorial Weeklies Company)'), '', 'too long and no subtitle: left out');
  for (const w of ["'West India Emancipation' (The Significance), address at Canandaigua, New York", 'Apollo 11 air-to-ground transmission, as corrected in the Apollo 11 Lunar Surface Journal']) {
    const s = autoShort(w);
    assert.ok(!s.includes('…') && [...s].length <= 32, s);
  }
  assert.equal(shortSource({ source: { work: 'Anything long', short: 'Given', year: '1912' } }).work, 'Given');
  assert.equal(shortSource({ source: { work: 'Anything', short: '' } }).work, '', '"" in the data leaves the source out');
});

test('credit names: raw Commons fields are cleaned, junk never shown', () => {
  const cases = {
    'Charles_Darwin_seated.jpg: Henry Maull (1829–1914) and John Fox (1832–1907) (Maull & Fox) [3] derivative work: Beao': 'Henry Maull & John Fox',
    'aphrodite-in-nyc (Flickr user, https://www.flickr.com/photos/aphrodite-in-nyc)': 'aphrodite-in-nyc',
    'Photo: Jastrow (Marie-Lan Nguyen), 2006, public domain; bust: Roman copy after Lysippos': 'Jastrow',
    'Unknown photographer (Library of Congress, cph.3g07503)': 'Ukendt fotograf',
    'Unknown photographer, 1911 (Library of Congress, LCCN 97504565)': 'Ukendt fotograf',
    'Unknown author': 'Ukendt',
    'Pach Brothers (1904); restoration by Adam Cuerden': 'Pach Brothers',
    'Louis Bachrach, Bachrach Studios, restored by Michel Vuijlsteke': 'Louis Bachrach',
    'Maull & Fox (Henry Maull, 1829–1914; John Fox, 1832–1907), c. 1854; crop by Beao': 'Maull & Fox',
    'Kuhlmann / Munich Security Conference (MSC), 18 February 2017': 'Kuhlmann / Munich Security Conference',
    'Attributed to John Taylor — the \'Chandos portrait\', National Portrait Gallery, London (NPG 1)': 'Tilskrevet John Taylor',
    'Steffen Prößdorf (own work, 7 Dec 2021, RB Leipzig v Manchester City), crop by ArsenalGhanaPartey': 'Steffen Prößdorf',
    'Davis & Sanford studio(?), 1895; published by Scientific American': 'Davis & Sanford studio',
    'Photograph 1895': '',
    'Benjamin D. Maxham active 1848 - 1858': 'Benjamin D. Maxham',
    'Hartsook, photographer.': 'Hartsook',
    'Attributed to Francesco Melzi': 'Tilskrevet Francesco Melzi',
    'Ángel M. Felicísimo from Mérida, España': 'Ángel M. Felicísimo',
    "Warren's Portraits, Boston (c. 1870); restoration by Adam Cuerden": 'Warren’s Portraits',
    'NASA (photo S69-31741)': 'NASA',
    'unknown; a copy of the painting of François II Quesnel, which was made for Gérard Edelinck en 1691[réf. nécessaire].': 'Ukendt',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(cleanCredit(raw), want, raw);
  assert.equal(cleanCredit('Sandra Baqirjazid / Ministry of Enterprise, Energy and Communications of Sweden (Flickr)'), '', 'too long: needs a hand-made name');
  for (const bad of ['a [3]', 'see https://x', 'File_name', 'x.jpg', 'Unknown author', 'Photo: X']) assert.ok(BAD_CREDIT.test(bad), bad);
});

const CC = {
  id: 'q003', text: 'x', author: 'Marcus Aurelius',
  source: { work: 'Meditations', year: 'c. 170–180 CE', url: 'https://www.gutenberg.org/ebooks/15877', short: 'Meditations' },
  translation: { translator: 'George Long' },
  image: {
    file: 'images/q003.jpg', license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0',
    creator: 'Daniel Martin (some archive note, 2019)', credit: 'Daniel Martin',
    commons_page: 'https://commons.wikimedia.org/wiki/File:MSR-ra-61-b-1-DM.jpg',
  },
};

test('credit line: source · Overs. · Billede: name, licence ↗, bearbejdet · Wikimedia Commons ↗', () => {
  assert.equal(creditText(creditModel(CC)), 'Meditations, ca. 170–180 e.Kr. · Overs. George Long · Billede: Daniel Martin, CC BY-SA 4.0 ↗, bearbejdet · Wikimedia Commons ↗');
  const parts = creditModel(CC);
  assert.equal(parts[0][0].href, undefined, 'the source is plain text: no way off the page during a lock');
  assert.equal(parts[2][1].title, CC.image.creator, 'the raw creator field only in the tooltip');
  assert.equal(parts[2].find((r) => r.href).href, 'https://creativecommons.org/licenses/by-sa/4.0');
  assert.equal(parts[3][0].href, CC.image.commons_page);
  assert.equal(parts.flat().filter((r) => r.href).length, 2, 'two focus stops at most');
});

test('credit line: public domain is plain text; only the source is ever left out; attribution never', () => {
  const pd = { ...CC, translation: null, image: { ...CC.image, license: 'Public domain (PD-UKGov)', license_url: 'https://commons.wikimedia.org/x' } };
  const t = creditText(creditModel(pd));
  assert.ok(t.includes('Billede: Daniel Martin, Public domain · Wikimedia Commons ↗') && !t.includes('bearbejdet') && !t.includes('PD-UKGov'), t);
  assert.equal(creditModel(pd).flat().filter((r) => r.href).length, 1, 'only the Commons link');
  const dropped = creditText(creditModel(CC, { sourceMax: 0 }));
  assert.ok(!dropped.includes('Meditations') && dropped.includes('Daniel Martin') && dropped.includes('bearbejdet') && dropped.includes('Overs. George Long'));
  assert.ok(!creditText(creditModel(CC, { hasPortrait: false })).includes('Billede'));
  const junk = { ...CC, image: { ...CC.image, credit: undefined, creator: 'x_y.jpg' } };
  assert.ok(creditText(creditModel(junk)).includes('Billede: Ukendt,'), 'junk is never shown');
  assert.equal(isAdaptedCC('CC BY 2.0'), true);
  assert.equal(isAdaptedCC('CC0'), false);
  assert.equal(licenceLabel('Public domain (PD-UKGov)'), 'Public domain');
  const odd = { ...CC, translation: { translator: 'Inter IKEA Systems B.V. (IKEA\'s official English version)' } };
  assert.equal(creditModel(odd)[1][0].text, 'Overs. Inter IKEA Systems B.V.');
});

test('every quote in quotes.json: a clean name ≤ 40 characters, a whole short source ≤ 32', () => {
  const qs = JSON.parse(fs.readFileSync(new URL('../quotes/quotes.json', import.meta.url), 'utf8'));
  for (const q of qs) {
    const t = creditText(creditModel(q));
    assert.ok(!/[[\]_]|https?:|\.jpe?g\b|\bunknown\b|Photo:|…/i.test(t), `${q.id}: ${t}`);
    assert.ok(q.image.credit && [...q.image.credit].length <= CREDIT_MAX && !BAD_CREDIT.test(q.image.credit), `${q.id} credit`);
    assert.ok(typeof q.source.short === 'string' && [...q.source.short].length <= SOURCE_MAX && !q.source.short.includes('…'), `${q.id} short`);
  }
});

test('timer: hours and minutes, changing once a minute; seconds only in the last minute', () => {
  assert.equal(remainLabel(73 * 60000), '1:13');
  assert.equal(remainLabel(72 * 60000 + 59000), '1:13', 'rounded up');
  assert.equal(remainLabel(60 * 60000), '1:00');
  assert.equal(remainLabel(5 * 60000 + 1), '0:06');
  assert.equal(remainLabel(61000), '0:02');
  assert.equal(remainLabel(60000), '60 s');
  assert.equal(remainLabel(42000), '42 s');
  assert.equal(remainLabel(10), '1 s');
  assert.equal(remainNextChange(73 * 60000 + 12000), 12000);
  assert.equal(remainNextChange(42500), 500);
});
