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

// ---------- v1.3 Plan page ----------
test('week view: Monday-first weeks, DST-safe days, long dates, lengths', async () => {
  const { weekStart, dayBounds, dateLong, lengthText, addDays } = await import('../lib/plan.js');
  assert.equal(weekStart(Date.parse('2026-10-04T12:00:00Z')), '2026-09-28');       // søndag → that week's Monday
  assert.equal(weekStart(Date.parse('2026-10-05T06:00:00Z'), 1), '2026-10-12');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const { d0, d1 } = dayBounds('2026-10-25');                                       // summer time ends: 25 hours
  assert.equal((d1 - d0) / 3600000, 25);
  assert.equal(dateLong('2026-10-06'), 'Tirsdag 6. okt.');
  assert.equal(lengthText('13:00', '15:00'), '2 t');
  assert.equal(lengthText('09:00', '10:30'), '1 t 30 min');
  assert.equal(lengthText('22:00', '10:00'), 'næste dag · 12 t');
});

test('R2: overlaps cascade like Google Calendar; a skipped day takes part in no cascade', async () => {
  const { dayLayout, cascadeIndent, occurrences } = await import('../lib/plan.js');
  const now = Date.parse('2026-10-05T06:00:00Z');
  const scs = [
    { id: 'a', weekdays: [2], start: '13:00', end: '15:00' },
    { id: 'b', weekdays: [2], start: '14:00', end: '16:00' },
    { id: 'c', weekdays: [2], start: '13:30', end: '14:30', skip: ['2026-10-06'] },
    { id: 'n', weekdays: [1], start: '22:00', end: '10:00' },
  ];
  const occ = occurrences(scs, now, now + 3 * 86400000);
  const tue = dayLayout(occ, '2026-10-06');
  assert.deepEqual(tue.filter((x) => x.o.sc.id !== 'n').map((x) => [x.o.sc.id, x.top, x.bottom, x.level]), [['c', 810, 870, -1], ['a', 780, 900, 0], ['b', 840, 960, 1]]);
  assert.deepEqual(tue.find((x) => x.o.sc.id === 'n').cont, { before: true, after: false });  // monday 22 → tuesday 10
  assert.equal(cascadeIndent(0, 140), 0);
  assert.equal(cascadeIndent(1, 140), 39);   // 28 % of the column
  assert.equal(cascadeIndent(1, 60), 24);    // at least 24 px
  assert.equal(cascadeIndent(3, 60), 30);    // never past the column
});

test('R1: a label never ends in "…": full time, else the start, else nothing; the name only whole', async () => {
  const { labelFit } = await import('../lib/plan.js');
  const t = { timeW: 34, startW: 16, nameW: 70 };
  assert.deepEqual(labelFit({ w: 120, h: 44, ...t }), { time: 'full', name: 'below' });
  assert.deepEqual(labelFit({ w: 120, h: 22, ...t }), { time: 'full', name: 'inline' });   // 34 + 6 + 70 ≤ 120, one line
  assert.deepEqual(labelFit({ w: 80, h: 22, ...t }), { time: 'full', name: null });
  assert.deepEqual(labelFit({ w: 60, h: 44, ...t }), { time: 'full', name: null });         // name does not fit whole
  assert.deepEqual(labelFit({ w: 20, h: 44, ...t }), { time: 'start', name: null });
  assert.deepEqual(labelFit({ w: 12, h: 44, ...t }), { time: null, name: null });
});

test('drag and keyboard slot', async () => {
  const { dragRange, moveSlot } = await import('../lib/plan.js');
  assert.deepEqual(dragRange(785, 899), { start: 780, end: 900 });
  assert.deepEqual(dragRange(899, 785), { start: 780, end: 900 });   // upwards works too
  assert.deepEqual(dragRange(600, 601), { start: 600, end: 615 });   // at least one step
  assert.deepEqual(dragRange(1435, 1500), { start: 1425, end: 1440 });
  const s = { date: '2026-10-06', start: 540, len: 60 };
  assert.deepEqual(moveSlot(s, 'ArrowDown'), { ...s, start: 570 });
  assert.deepEqual(moveSlot(s, 'ArrowUp'), { ...s, start: 510 });
  assert.deepEqual(moveSlot(s, 'ArrowRight'), { ...s, date: '2026-10-07' });
  assert.deepEqual(moveSlot(s, 'ArrowLeft'), { ...s, date: '2026-10-05' });
  assert.deepEqual(moveSlot(s, 'ArrowDown', true), { ...s, len: 90 });
  assert.deepEqual(moveSlot({ ...s, len: 30 }, 'ArrowUp', true), { ...s, len: 30 });   // never shorter than 30 min
  assert.deepEqual(moveSlot({ ...s, start: 1380 }, 'ArrowDown'), { ...s, start: 1380 }); // stays inside the day
  assert.deepEqual(moveSlot(s, 'End'), { ...s, start: 1380 });
});

test('R4: saving a period that covers now locks at once — and says until when', async () => {
  const { lockIfSaved } = await import('../lib/plan.js');
  const now = Date.parse('2026-10-05T08:20:00Z'); // mandag 10:20
  const iso = (t) => new Date(t).toISOString();
  assert.equal(iso(lockIfSaved({ start: '10:00', end: '11:00', weekdays: [1, 2, 3, 4, 5] }, [], now)), '2026-10-05T09:00:00.000Z');
  assert.equal(lockIfSaved({ start: '11:00', end: '12:00', weekdays: [1] }, [], now), null);              // later today: nothing now
  assert.equal(lockIfSaved({ start: '10:00', end: '11:00', weekdays: [2] }, [], now), null);              // another day
  const next = [{ id: 'x', weekdays: [1], start: '11:00', end: '12:30' }];
  assert.equal(iso(lockIfSaved({ start: '10:00', end: '11:00', weekdays: [1] }, next, now)), '2026-10-05T10:30:00.000Z'); // runs into 11–12:30
  // during a lock until 11:00: touching it lengthens the lock, a later period changes nothing now
  const until = Date.parse('2026-10-05T09:00:00Z');
  assert.equal(iso(lockIfSaved({ start: '11:00', end: '13:00', date: '2026-10-05' }, [], now, until)), '2026-10-05T11:00:00.000Z');
  assert.equal(lockIfSaved({ start: '14:00', end: '15:00', date: '2026-10-05' }, [], now, until), null);
  assert.equal(lockIfSaved({ start: '10:00', end: '10:30', weekdays: [1] }, [], now, until), null);         // inside the lock: nothing new
  // editing: the old version of the same period does not count, its skipped days do
  const old = [{ id: 'e', weekdays: [1], start: '10:00', end: '11:00', skip: ['2026-10-05'] }];
  assert.equal(lockIfSaved({ start: '10:00', end: '11:30', weekdays: [1] }, old, now, null, 'e'), null);
});

test('PB1: a click reuses the last length only up to 3 h; otherwise 1 hour', async () => {
  const { slotLength } = await import('../lib/plan.js');
  assert.equal(slotLength(90), 90);
  assert.equal(slotLength(180), 180);
  assert.equal(slotLength(181), 60);
  assert.equal(slotLength(720), 60);   // after a 12-hour period
  assert.equal(slotLength(0), 60);
  assert.equal(slotLength(undefined), 60);
});

test('the 24-hour rule is checked before saving, like the daemon', async () => {
  const { chainOverLimit, minutesText } = await import('../lib/plan.js');
  const now = Date.parse('2026-10-05T05:20:00Z'); // mandag 07:20
  const scs = [{ id: 'a', weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '12:00' }];
  assert.equal(chainOverLimit({ start: '12:00', end: '08:00', weekdays: [1, 2, 3, 4, 5] }, scs, now), null); // 09 → 08 next day = 23 h
  assert.equal(chainOverLimit({ start: '12:00', end: '09:00', weekdays: [2] }, scs, now), 27 * 60);       // tue 09 → wed 12
  assert.equal(minutesText(27 * 60), '27 t');
  // the running lock counts: locked since 06:00, until 08:00; a period 08–07:00 next day makes 25 h
  const lock = { since: Date.parse('2026-10-05T04:00:00Z'), until: Date.parse('2026-10-05T06:00:00Z') };
  assert.equal(chainOverLimit({ start: '08:00', end: '07:00', date: '2026-10-05' }, [], now, lock), 25 * 60);
  assert.equal(chainOverLimit({ start: '08:30', end: '07:00', date: '2026-10-05' }, [], now, lock), null);   // a gap: no chain
  // a chain that already existed without this period does not count (the daemon allows it)
  const long = [{ id: 'x', date: '2026-10-06', start: '00:00', end: '23:30' }, { id: 'y', date: '2026-10-06', start: '23:30', end: '06:00' }];
  assert.equal(chainOverLimit({ start: '02:00', end: '03:00', date: '2026-10-06' }, long, now), null);
  // editing: the old version of the period is not counted
  assert.equal(chainOverLimit({ start: '12:00', end: '08:00', weekdays: [1, 2, 3, 4, 5] }, [...scs, { id: 'e', weekdays: [2], start: '12:00', end: '09:00' }], now, null, 'e'), null);
});

test('a new draft goes on top of what it overlaps, indented — it never hides a block', async () => {
  const { dayLayout, occurrences } = await import('../lib/plan.js');
  const now = Date.parse('2026-10-05T05:00:00Z');
  const scs = [
    { id: 'a', weekdays: [2], start: '09:00', end: '12:00' },
    { id: 'b', date: '2026-10-06', start: '09:00', end: '12:00' },
    { id: '__draft', _draft: true, date: '2026-10-06', start: '07:00', end: '19:00' },
  ];
  const lay = dayLayout(occurrences(scs, now, now + 3 * 86400000), '2026-10-06');
  assert.deepEqual(lay.map((x) => [x.o.sc.id, x.level]), [['a', 0], ['b', 1], ['__draft', 2]]);
  const alone = dayLayout(occurrences([{ ...scs[2], date: '2026-10-07' }], now, now + 3 * 86400000), '2026-10-07');
  assert.equal(alone[0].level, 0);
});
