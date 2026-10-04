import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleBody, periodText, cphDate, dateTimeInstant, daysText, occurrences, chainEnd, nextOccurrence } from '../lib/plan.js';

const NOW = Date.parse('2026-10-04T12:38:00Z'); // søndag 14:38 i København
const lists = [{ id: 'l1', name: 'Locked In 1' }, { id: 'l2', name: 'Locked In 2' }];

test('period rows read as specified', () => {
  assert.equal(periodText({ date: '2026-10-05', start: '09:00', end: '12:00', list: 'l2' }, lists, NOW), 'I morgen 09–12 · Locked In 2');
  assert.equal(periodText({ date: null, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00', list: 'l1' }, lists, NOW), 'Hverdage 09–12 · Locked In 1');
  assert.equal(periodText({ date: '2026-10-04', start: '15:30', end: '17:00', list: 'l1' }, lists, NOW), 'I dag 15:30–17 · Locked In 1');
  assert.equal(periodText({ date: '2026-10-06', start: '09:00', end: '12:00', list: 'l1' }, lists, NOW), 'Tir 6. okt. 09–12 · Locked In 1');
  assert.equal(periodText({ weekdays: [1, 3, 5], start: '22:00', end: '06:30', list: 'x' }, lists, NOW), 'Ma, On, Fr 22 → 06:30');
  assert.equal(periodText({ weekdays: [5], start: '22:00', end: '10:00', list: 'l2' }, lists, NOW), 'Fre 22 → lør 10 · Locked In 2');
  assert.equal(periodText({ date: '2026-10-09', start: '22:00', end: '10:00', list: 'l2' }, lists, NOW), 'Fre 9. okt. 22 → lør 10 · Locked In 2');
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

test('occurrences: weekly, single date, overnight, skipped days, disabled', () => {
  const now = Date.parse('2026-10-04T12:00:00Z'); // søndag 14:00
  const scs = [
    { id: 'w', weekdays: [1, 2, 3, 4, 5], start: '13:00', end: '15:00', skip: ['2026-10-06'] },
    { id: 'd', date: '2026-10-05', start: '09:00', end: '12:00' },
    { id: 'n', weekdays: [7], start: '22:00', end: '06:30' },
    { id: 'x', weekdays: [1], start: '08:00', end: '09:00', enabled: false },
  ];
  const occ = occurrences(scs, now, now + 3 * 86400000);
  assert.deepEqual(occ.map((o) => `${o.sc.id} ${o.date}${o.skipped ? ' skip' : ''}`), [
    'n 2026-10-04', 'd 2026-10-05', 'w 2026-10-05', 'w 2026-10-06 skip', 'w 2026-10-07',
  ]);
  const night = occ[0];
  assert.equal(new Date(night.start).toISOString(), '2026-10-04T20:00:00.000Z');
  assert.equal(new Date(night.end).toISOString(), '2026-10-05T04:30:00.000Z');
  assert.equal(nextOccurrence(scs, now).sc.id, 'n');
  assert.equal(nextOccurrence([{ id: 'w', weekdays: [1], start: '13:00', end: '15:00', skip: ['2026-10-05'] }], now).date, '2026-10-12');
});

test('chain: a session that runs into a planned period cannot stop before its end', () => {
  const now = Date.parse('2026-10-05T09:00:00Z'); // man 11:00
  const scs = [{ id: 'w', weekdays: [1, 2, 3, 4, 5], start: '13:00', end: '15:00' }, { id: 'e', weekdays: [1], start: '15:00', end: '16:00' }];
  const occ = occurrences(scs, now, now + 86400000);
  const threeHours = chainEnd(now, now + 3 * 3600000, occ);          // 11–14 runs into 13–15, which touches 15–16
  assert.equal(new Date(threeHours.end).toISOString(), '2026-10-05T14:00:00.000Z'); // 16:00 local
  assert.deepEqual(threeHours.via.map((o) => o.sc.id), ['w', 'e']);
  const fourHours = chainEnd(now, now + 4 * 3600000, occ);           // 11–15 already covers 13–15, touches 15–16
  assert.deepEqual(fourHours.via.map((o) => o.sc.id), ['e']);
  const oneHour = chainEnd(now, now + 3600000, occ);                 // 11–12: untouched
  assert.equal(oneHour.end, now + 3600000);
  assert.deepEqual(oneHour.via, []);
  const skipped = occurrences([{ ...scs[0], skip: ['2026-10-05'] }], now, now + 86400000);
  assert.equal(chainEnd(now, now + 4 * 3600000, skipped).end, now + 4 * 3600000);
});

test('front-page "Næste" line', async () => {
  const { nextLineText } = await import('../ui/plan.js');
  const now = Date.parse('2026-10-04T12:00:00Z');
  const ns = { start: '2026-10-05T07:00:00Z', end: '2026-10-05T10:00:00Z', scheduleId: 'a', list: 'l2', listName: 'Locked In 2' };
  assert.equal(nextLineText(ns, now, () => ''), 'Næste: i morgen 09–12 · Locked In 2');
  assert.equal(nextLineText({ ...ns, start: '2026-10-07T07:30:00Z', listName: '' }, now, () => 'Locked In 1'), 'Næste: onsdag 09:30–12 · Locked In 1');
  assert.equal(nextLineText(null, now, () => ''), '');
});

test('P1: overlapping periods get separate lanes; others keep one', async () => {
  const { assignLanes } = await import('../lib/plan.js');
  // two identical 9–12 periods, 11–14 overlapping both, 13–15 overlapping 11–14
  const r = assignLanes([{ start: 9, end: 12 }, { start: 9, end: 12 }, { start: 13, end: 15 }, { start: 11, end: 14 }]);
  assert.deepEqual(r.map((x) => [x.lane, x.lanes]), [[0, 3], [1, 3], [0, 3], [2, 3]]);
  assert.deepEqual(assignLanes([{ start: 9, end: 12 }, { start: 9, end: 12 }]).map((x) => [x.lane, x.lanes]), [[0, 2], [1, 2]]);
  assert.deepEqual(assignLanes([{ start: 1, end: 2 }, { start: 3, end: 4 }]).map((x) => [x.lane, x.lanes]), [[0, 1], [0, 1]]);
  assert.deepEqual(assignLanes([{ start: 1, end: 3 }, { start: 3, end: 4 }]).map((x) => [x.lane, x.lanes]), [[0, 1], [0, 1]]); // touching ≠ overlapping
});
