import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock, formatCountdown, formatDuration, dayLabel, formatUntil, formatWindow, cphParts, dayDiff,
} from '../lib/time.js';

const t = (iso) => Date.parse(iso);

test('summer time (CEST, UTC+2) and winter time (CET, UTC+1)', () => {
  assert.equal(formatClock(t('2026-10-04T12:30:00Z')), '14:30');
  assert.equal(formatClock(t('2026-12-01T12:30:00Z')), '13:30');
});

test('24-hour with colon, midnight is 00:00 not 24:00', () => {
  assert.equal(formatClock(t('2026-10-04T22:00:00Z')), '00:00');
  assert.equal(formatClock(t('2026-10-04T21:05:00Z')), '23:05');
});

test('DST end 2026-10-25: 02:00–03:00 happens twice', () => {
  // 00:30Z = 02:30 CEST (first), 01:30Z = 02:30 CET (second)
  assert.equal(formatClock(t('2026-10-25T00:30:00Z')), '02:30');
  assert.equal(formatClock(t('2026-10-25T01:30:00Z')), '02:30');
  assert.equal(formatClock(t('2026-10-25T00:59:59Z')), '02:59');
  assert.equal(formatClock(t('2026-10-25T01:00:00Z')), '02:00');
  assert.equal(formatClock(t('2026-10-25T02:00:00Z')), '03:00');
});

test('DST end: a 1 t session started 02:30 CEST ends 02:30 CET; countdown is real time', () => {
  const start = t('2026-10-25T00:30:00Z');
  const end = start + 60 * 60000;
  assert.equal(formatClock(end), '02:30');
  assert.equal(formatCountdown(end - start), '01:00:00');
  assert.equal(formatUntil(start, end), 'kl. 02:30 (i dag)');
});

test('DST end: session over midnight from Saturday evening', () => {
  const sat = t('2026-10-24T21:00:00Z'); // 23:00 CEST Saturday
  const end = sat + 4 * 60 * 60000; // 4 real hours → 02:00 CET Sunday (03:00 CEST minus the repeated hour)
  assert.equal(formatClock(sat), '23:00');
  assert.equal(formatClock(end), '02:00');
  assert.equal(dayLabel(sat, end), 'i morgen');
  assert.equal(cphParts(end).weekday, 7);
});

test('DST start 2026-03-29: 02:00 → 03:00', () => {
  assert.equal(formatClock(t('2026-03-29T00:59:00Z')), '01:59');
  assert.equal(formatClock(t('2026-03-29T01:00:00Z')), '03:00');
});

test('day labels by Copenhagen calendar, not UTC', () => {
  const now = t('2026-10-04T21:30:00Z'); // 23:30 local Sunday
  assert.equal(dayLabel(now, t('2026-10-04T21:50:00Z')), 'i dag');
  assert.equal(dayLabel(now, t('2026-10-04T22:10:00Z')), 'i morgen'); // 00:10 local, same UTC day
  assert.equal(dayDiff(now, t('2026-10-06T08:00:00Z')), 2);
  assert.equal(dayLabel(now, t('2026-10-06T08:00:00Z')), 'tirsdag');
});

test('next-session window text', () => {
  const now = t('2026-10-04T10:00:00Z'); // søndag
  assert.equal(formatWindow(now, t('2026-10-06T07:00:00Z'), t('2026-10-06T10:00:00Z')), 'tirsdag 09:00–12:00');
  assert.equal(formatWindow(now, t('2026-10-05T07:00:00Z'), t('2026-10-05T10:00:00Z')), 'i morgen 09:00–12:00');
});

test('countdown and duration formatting', () => {
  assert.equal(formatCountdown(0), '00:00:00');
  assert.equal(formatCountdown(-5000), '00:00:00');
  assert.equal(formatCountdown(1), '00:00:01');
  assert.equal(formatCountdown(24 * 3600000), '24:00:00');
  assert.equal(formatCountdown((2 * 3600 + 3 * 60 + 4) * 1000), '02:03:04');
  assert.equal(formatDuration(25), '25 min');
  assert.equal(formatDuration(60), '1 t');
  assert.equal(formatDuration(150), '2 t 30 min');
  assert.equal(formatDuration(1440), '24 t');
});

import { untilToday, defaultUntil, isoUtc, shortWhen, wallInstants } from '../lib/time.js';

test('Indtil: only later times today, at least 1 minute ahead', () => {
  const now = t('2026-10-04T12:38:20Z'); // 14:38:20 CEST
  assert.equal(untilToday(now, '15:00'), t('2026-10-04T13:00:00Z'));
  assert.equal(untilToday(now, '14:38'), null);          // past
  assert.equal(untilToday(now, '14:39'), null);          // only 40 s ahead
  assert.equal(untilToday(now, '14:40'), t('2026-10-04T12:40:00Z'));
  assert.equal(untilToday(now, '09:00'), null);          // earlier today, never "tomorrow"
  assert.equal(untilToday(now, '23:59'), t('2026-10-04T21:59:00Z'));
  assert.equal(untilToday(now, '24:00'), null);
  assert.equal(untilToday(now, '9:00'), null);
  assert.equal(untilToday(now, ''), null);
  assert.equal(untilToday(t('2026-10-04T21:58:30Z'), '23:59'), null); // 23:58:30 → 30 s left today
});

test('Indtil: ISO conversion across DST end 2026-10-25', () => {
  // Morning of the change, before 02:00 CEST: 02:30 means the first (CEST) occurrence
  assert.equal(isoUtc(untilToday(t('2026-10-24T23:10:00Z'), '02:30')), '2026-10-25T00:30:00Z');
  // During the repeated hour (02:10 CET, second pass): the first 02:30 is past, take the one still ahead
  assert.equal(isoUtc(untilToday(t('2026-10-25T01:10:00Z'), '02:30')), '2026-10-25T01:30:00Z');
  // After the change, ordinary times are CET (UTC+1)
  assert.equal(isoUtc(untilToday(t('2026-10-25T08:00:00Z'), '15:00')), '2026-10-25T14:00:00Z');
  // Day before, CEST (UTC+2)
  assert.equal(isoUtc(untilToday(t('2026-10-24T08:00:00Z'), '15:00')), '2026-10-24T13:00:00Z');
  assert.deepEqual(wallInstants(2026, 10, 25, 2, 30).map(isoUtc), ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z']);
});

test('Indtil: DST start 2026-03-29, missing 02:30 moves forward', () => {
  const now = t('2026-03-28T23:30:00Z'); // 00:30 CET
  const at = untilToday(now, '02:30');
  assert.equal(isoUtc(at), '2026-03-29T01:30:00Z');
  assert.equal(formatClock(at), '03:30');
  assert.deepEqual(wallInstants(2026, 3, 29, 2, 30), []);
});

test('Indtil: default is the next whole hour ≥10 min ahead, else 23:59, else none', () => {
  assert.equal(defaultUntil(t('2026-10-04T12:38:00Z')), '15:00');
  assert.equal(defaultUntil(t('2026-10-04T12:55:00Z')), '16:00');
  assert.equal(defaultUntil(t('2026-10-04T21:30:00Z')), '23:59');
  assert.equal(defaultUntil(t('2026-10-04T21:59:00Z')), null);
});

test('isoUtc drops milliseconds; shortWhen', () => {
  assert.equal(isoUtc(t('2026-10-05T13:00:00.789Z')), '2026-10-05T13:00:00Z');
  const now = t('2026-10-04T12:00:00Z');
  assert.equal(shortWhen(now, t('2026-10-04T13:00:00Z')), '15:00');
  assert.equal(shortWhen(now, t('2026-10-04T23:30:00Z')), 'i morgen 01:30');
});

import { parseHHMM } from '../lib/time.js';
test('parseHHMM accepts the usual ways of typing a time', () => {
  assert.equal(parseHHMM('15'), '15:00');
  assert.equal(parseHHMM('1500'), '15:00');
  assert.equal(parseHHMM('930'), '09:30');
  assert.equal(parseHHMM('15:00'), '15:00');
  assert.equal(parseHHMM('15.30'), '15:30');
  assert.equal(parseHHMM(' 9:05 '), '09:05');
  assert.equal(parseHHMM('9.5'), '09:50');
  assert.equal(parseHHMM('9:3'), '09:30');
  assert.equal(parseHHMM('9.7'), null);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('12:60'), null);
  assert.equal(parseHHMM('abc'), null);
  assert.equal(parseHHMM(''), null);
});
