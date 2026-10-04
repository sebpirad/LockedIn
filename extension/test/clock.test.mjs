import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DURATION_CHIPS, durHourOptions, durMinuteOptions, clampDuration, splitDuration,
  untilHourOptions, untilMinuteOptions, defaultUntilQuarter, fixUntilMinute, matchOption, filterOptions,
} from '../lib/clock.js';

const T = (iso) => Date.parse(iso);
const vals = (o) => o.map((x) => x.value);
const labels = (o) => o.map((x) => x.label);

test('chips are exactly 30 min, 1 time, 2 timer, 4 timer', () => {
  assert.deepEqual(DURATION_CHIPS.map((c) => c.label), ['30 min', '1 time', '2 timer', '4 timer']);
  assert.deepEqual(DURATION_CHIPS.map((c) => c.minutes), [30, 60, 120, 240]);
});

test('Varighed: hours 0–24, minutes in 5s, total 5 min … 24 t', () => {
  assert.deepEqual(vals(durHourOptions()), Array.from({ length: 25 }, (_, i) => i));
  assert.deepEqual(labels(durMinuteOptions(1)), ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']);
  assert.deepEqual(labels(durMinuteOptions(0))[0], '05');     // 0 t 0 min is not a session
  assert.deepEqual(labels(durMinuteOptions(24)), ['00']);     // 24 t is the cap
  assert.deepEqual(clampDuration(24, 30), { hours: 24, minutes: 0, total: 1440 });
  assert.deepEqual(clampDuration(0, 0), { hours: 0, minutes: 5, total: 5 });
  assert.deepEqual(clampDuration(2, 47), { hours: 2, minutes: 45, total: 165 });
  assert.deepEqual(splitDuration(90), { hours: 1, minutes: 30, total: 90 });
});

test('Indtil: only later times today', () => {
  const now = T('2026-10-04T12:38:20Z'); // 14:38:20 i København
  assert.deepEqual(labels(untilHourOptions(now)), ['14', '15', '16', '17', '18', '19', '20', '21', '22', '23']);
  assert.deepEqual(labels(untilMinuteOptions(14, now)), ['40', '45', '50', '55']);
  assert.deepEqual(labels(untilMinuteOptions(15, now)).length, 12);
  assert.deepEqual(untilMinuteOptions(13, now), []);
  // 14:56 → nothing left in hour 14 → it is not offered
  assert.deepEqual(labels(untilHourOptions(T('2026-10-04T12:56:30Z')))[0], '15');
  // late evening: 23:58 → nothing left today
  assert.deepEqual(untilHourOptions(T('2026-10-04T21:58:00Z')), []);
});

test('Indtil default: next whole quarter ≥ 5 min ahead', () => {
  assert.deepEqual(defaultUntilQuarter(T('2026-10-04T12:38:00Z')), { hour: 14, minute: 45 });
  assert.deepEqual(defaultUntilQuarter(T('2026-10-04T12:41:00Z')), { hour: 15, minute: 0 });  // 14:56 → 15:00
  assert.deepEqual(defaultUntilQuarter(T('2026-10-04T12:57:00Z')), { hour: 15, minute: 15 }); // 14:57 → 15:00 is 3 min
  assert.equal(defaultUntilQuarter(T('2026-10-04T21:50:00Z')), null);                         // 23:50
});

test('Indtil: changing the hour keeps a still-valid minute, else the first valid', () => {
  const now = T('2026-10-04T12:38:20Z');
  assert.equal(fixUntilMinute(15, 10, now), 10);
  assert.equal(fixUntilMinute(14, 10, now), 40);
  assert.equal(fixUntilMinute(13, 10, now), null);
});

test('type-to-find: "19" → 19, "4" → 40/45, "9" → 09', () => {
  const hours = untilHourOptions(T('2026-10-04T05:00:00Z'));
  assert.deepEqual(labels(filterOptions(hours, '19')), ['19']);
  assert.deepEqual(labels(filterOptions(hours, '9')), ['09']);
  assert.deepEqual(labels(filterOptions(durMinuteOptions(1), '4')), ['40', '45']);
  assert.deepEqual(labels(filterOptions(durMinuteOptions(1), '0')), ['00', '05']);
  assert.deepEqual(labels(filterOptions(durHourOptions(), '2')), ['2', '20', '21', '22', '23', '24']);
  assert.equal(matchOption('05', '5'), true);
  assert.equal(matchOption('15', ''), true);
});
