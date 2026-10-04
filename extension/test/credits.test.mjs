import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { daDates, creditParts } from '../lib/credits.js';

test('dates and years in Danish', () => {
  assert.equal(daDates('121–180 CE'), '121–180 e.Kr.');
  assert.equal(daDates('c. 4 BCE–65 CE'), 'ca. 4 f.Kr.–65 e.Kr.');
  assert.equal(daDates('compiled 5th–3rd century BCE'), 'samlet 5.–3. årh. f.Kr.');
  assert.equal(daDates('fl. c. 700 BCE'), 'virksom ca. 700 f.Kr.');
  assert.equal(daDates('written 1875, publ. 1888'), 'skrevet 1875, udg. 1888');
  assert.equal(daDates('1854 (7 December)'), '1854 (7. december)');
  assert.equal(daDates('c. 1490s–1510s'), "ca. 1490'erne–1510'erne");
  assert.equal(daDates('1670 (posthumous)'), '1670 (posthumt)');
  assert.equal(daDates(null), '');
});

test('credit line: Danish labels, no English locator notes, long creators shortened', () => {
  const q = {
    source: { work: 'Meditations', year: 'c. 170–180 CE', locator: 'Book II, §5 — verify' },
    translation: { translator: 'George Long' },
    image: { creator: 'x'.repeat(80), license: 'CC BY-SA 4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0', commons_page: 'https://commons.wikimedia.org/wiki/File:x.jpg' },
  };
  const c = creditParts(q, true);
  assert.equal(c.source, 'Meditations, ca. 170–180 e.Kr.');
  assert.equal(c.translator, 'Overs. George Long');
  assert.equal(c.photo.creator.length, 48);
  assert.ok(c.photo.creator.endsWith('…'));
  assert.equal(c.photo.creatorFull.length, 80);
  assert.equal(creditParts(q, false).photo, null);
});

test('no English date words left in the bundled quotes', () => {
  const url = new URL('../quotes/quotes.json', import.meta.url);
  if (!fs.existsSync(url)) return;
  const quotes = JSON.parse(fs.readFileSync(url, 'utf8'));
  const english = /\b(century|compiled|composed|written|publ|BCE|CE|c\.|fl\.|posthumous(ly)?|January|February|March|April|May|June|July|August|September|October|November|December|book)\b|\d(st|nd|rd|th)\b/;
  for (const q of quotes) {
    assert.doesNotMatch(daDates(q.author_dates), english, q.id);
    assert.doesNotMatch(creditParts(q, true).source.replace(q.source.work, ''), english, q.id);
  }
});
