import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleBody, periodText, cphDate, dateTimeInstant, daysText } from '../lib/plan.js';

const NOW = Date.parse('2026-10-04T12:38:00Z'); // søndag 14:38 i København
const lists = [{ id: 'l1', name: 'Locked In 1' }, { id: 'l2', name: 'Locked In 2' }];

test('period rows read as specified', () => {
  assert.equal(periodText({ date: '2026-10-05', start: '09:00', end: '12:00', list: 'l2' }, lists, NOW), 'I morgen 09–12 · Locked In 2');
  assert.equal(periodText({ date: null, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00', list: 'l1' }, lists, NOW), 'Ma–Fr 09–12 · Locked In 1');
  assert.equal(periodText({ date: '2026-10-04', start: '15:30', end: '17:00', list: 'l1' }, lists, NOW), 'I dag 15:30–17 · Locked In 1');
  assert.equal(periodText({ date: '2026-10-06', start: '09:00', end: '12:00', list: 'l1' }, lists, NOW), 'Tirsdag 6. okt. 09–12 · Locked In 1');
  assert.equal(periodText({ weekdays: [1, 3, 5], start: '22:00', end: '06:30', list: 'x' }, lists, NOW), 'Ma, On, Fr 22–06:30');
  assert.equal(daysText([7, 1, 2, 3, 4, 5, 6]), 'Alle dage');
});

test('form, single date: I dag / I morgen / picked date', () => {
  const base = { kind: 'date', start: '09:00', end: '12:00', list: 'l2' };
  assert.deepEqual(scheduleBody({ ...base, date: cphDate(NOW, 1) }, NOW).body,
    { name: '', list: 'l2', start: '09:00', end: '12:00', date: '2026-10-05' });
  assert.equal(scheduleBody({ ...base, date: cphDate(NOW, 0) }, NOW).error, 'Vælg et senere tidspunkt'); // 09:00 today is past
  assert.equal(scheduleBody({ ...base, date: cphDate(NOW, 0), start: '1600', end: '17' }, NOW).body.start, '16:00');
  assert.equal(scheduleBody({ ...base, date: '2026-10-20' }, NOW).body.date, '2026-10-20');
  assert.equal(scheduleBody({ ...base, date: '' }, NOW).error, 'Vælg en dato');
  assert.equal(scheduleBody({ ...base, date: '2026-02-31' }, NOW).error, 'Vælg en dato');
});

test('form, weekly', () => {
  const r = scheduleBody({ kind: 'weekly', weekdays: [5, 1, 3, 3], start: '9', end: '12', list: 'l1' }, NOW);
  assert.deepEqual(r.body, { name: '', list: 'l1', start: '09:00', end: '12:00', weekdays: [1, 3, 5] });
  assert.equal(scheduleBody({ kind: 'weekly', weekdays: [], start: '09:00', end: '12:00', list: 'l1' }, NOW).error, 'Vælg mindst én dag');
});

test('form errors: times, same start/end, list', () => {
  assert.equal(scheduleBody({ kind: 'weekly', weekdays: [1], start: 'x', end: '12', list: 'l1' }, NOW).error, 'Vælg tidspunkter');
  assert.equal(scheduleBody({ kind: 'weekly', weekdays: [1], start: '12', end: '12:00', list: 'l1' }, NOW).error, 'Start og slut er ens');
  assert.equal(scheduleBody({ kind: 'weekly', weekdays: [1], start: '09', end: '12', list: '' }, NOW).error, 'Vælg en liste');
});

test('dates in Copenhagen, across DST', () => {
  assert.equal(cphDate(Date.parse('2026-10-04T22:30:00Z')), '2026-10-05'); // 00:30 local
  assert.equal(cphDate(Date.parse('2026-12-31T12:00:00Z'), 1), '2027-01-01');
  assert.equal(new Date(dateTimeInstant('2026-10-25', '09:00')).toISOString(), '2026-10-25T08:00:00.000Z');
  assert.equal(new Date(dateTimeInstant('2026-10-24', '09:00')).toISOString(), '2026-10-24T07:00:00.000Z');
});
