// "Planlæg": the period form (one date or weekly) and how a period reads in a row.

import { cphParts, dayDiff, weekdayShort, parseHHMM, wallInstants, MIN_LEAD_MS } from './time.js';

const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DAY3 = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];
export const day3 = (n) => DAY3[(n - 1 + 7) % 7];

/** Copenhagen calendar date "YYYY-MM-DD", plusDays from now's date. */
export function cphDate(now, plusDays = 0) {
  const p = cphParts(now);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + plusDays));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Instant of a Copenhagen wall time on a date (first occurrence; a time in the spring gap moves forward). */
export function dateTimeInstant(date, hhmm) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  const t = parseHHMM(hhmm);
  if (!m || !t) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const [hh, mm] = t.split(':').map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const c = wallInstants(y, mo, d, hh, mm);
  return c.length ? c[0] : Date.UTC(y, mo - 1, d, hh, mm) - 3600000;
}

export function daysText(days) {
  const d = [...new Set(days || [])].sort((a, b) => a - b);
  if (d.length === 7) return 'Alle dage';
  if (d.join() === '1,2,3,4,5') return 'Hverdage';
  const run = d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return run ? `${weekdayShort(d[0])}–${weekdayShort(d[d.length - 1])}` : d.map(weekdayShort).join(', ');
}

/** "09" for whole hours, else "09:30". */
const shortTime = (hhmm) => (hhmm && hhmm.endsWith(':00') ? hhmm.slice(0, 2) : hhmm);

export function dateText(now, date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return '';
  const noon = Date.UTC(+m[1], +m[2] - 1, +m[3], 11);
  const diff = dayDiff(now, noon);
  if (diff === 0) return 'I dag';
  if (diff === 1) return 'I morgen';
  return `${cap(day3(cphParts(noon).weekday))} ${+m[3]}. ${MONTHS[+m[2] - 1]}`;
}

/** Weekday short for a date: "fre". */
function dayShortOf(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  return m ? day3(cphParts(Date.UTC(+m[1], +m[2] - 1, +m[3], 11)).weekday) : '';
}
const nextWeekday = (n) => (n % 7) + 1;

/**
 * "I morgen 09–12 · Locked In 2", "Hverdage 07–09 · Locked In 1".
 * Overnight periods always show → and both days: "Fre 22 → lør 10", "Hverdage 22 → 07".
 */
export function periodText(sc, lists, now) {
  const overnight = sc.end <= sc.start;
  let text;
  if (sc.date) {
    const when = dateText(now, sc.date);
    if (overnight) {
      const next = cphDate(Date.UTC(+sc.date.slice(0, 4), +sc.date.slice(5, 7) - 1, +sc.date.slice(8, 10), 11), 1);
      text = `${when} ${shortTime(sc.start)} → ${dayShortOf(next)} ${shortTime(sc.end)}`;
    } else {
      text = `${when} ${shortTime(sc.start)}–${shortTime(sc.end)}`;
    }
  } else {
    const days = [...new Set(sc.weekdays || [])].sort((x, y) => x - y);
    if (overnight && days.length === 1) {
      text = `${cap(day3(days[0]))} ${shortTime(sc.start)} → ${day3(nextWeekday(days[0]))} ${shortTime(sc.end)}`;
    } else {
      text = `${daysText(days)} ${shortTime(sc.start)}${overnight ? ' → ' : '–'}${shortTime(sc.end)}`;
    }
  }
  const list = (lists || []).find((l) => l.id === sc.list);
  return `${text}${list ? ' · ' + list.name : ''}`;
}

/**
 * Concrete occurrences of periods between `from` and `to` (ms), in Copenhagen time.
 * → [{sc, date, start, end, skipped}] sorted by start. Disabled periods are left out.
 */
export function occurrences(schedules, from, to) {
  const out = [];
  const firstDay = cphDate(from, -1); // a period may have started yesterday evening
  const days = Math.ceil((to - from) / 86400000) + 2;
  for (const sc of schedules || []) {
    if (!sc || sc.enabled === false) continue;
    const dates = [];
    if (sc.date) dates.push(sc.date);
    else {
      for (let i = 0; i < days; i++) {
        const d = cphDate(Date.parse(firstDay + 'T12:00:00Z'), i);
        const noon = dateTimeInstant(d, '12:00');
        if ((sc.weekdays || []).includes(cphParts(noon).weekday)) dates.push(d);
      }
    }
    for (const date of dates) {
      const start = dateTimeInstant(date, sc.start);
      let end = dateTimeInstant(date, sc.end);
      if (start == null || end == null) continue;
      if (end <= start) end = dateTimeInstant(cphDate(Date.parse(date + 'T12:00:00Z'), 1), sc.end);
      if (end <= from || start >= to) continue;
      out.push({ sc, date, start, end, skipped: (sc.skip || []).includes(date) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * A lock from `start` to `end` cannot stop while a planned period touches it: it continues
 * through every (non-skipped) occurrence that starts at or before the current end.
 * → {end, via: [occurrences it continues into]}
 */
export function chainEnd(start, end, occs) {
  let cur = end;
  const via = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const o of occs) {
      if (o.skipped || via.includes(o)) continue;
      if (o.start <= cur && o.end > cur && o.end > start) { cur = o.end; via.push(o); changed = true; }
    }
  }
  return { end: cur, via };
}

/** The next occurrence that has not ended (skipped ones are skipped). */
export function nextOccurrence(schedules, now, days = 14) {
  return occurrences(schedules, now, now + days * 86400000).find((o) => !o.skipped && o.end > now) || null;
}

/**
 * Form → POST /v1/schedules body, or {error}.
 * form: {kind: 'date'|'weekly', date, weekdays, start, end, list}
 */
export function scheduleBody(form, now) {
  const start = parseHHMM(form.start);
  const end = parseHHMM(form.end);
  if (!start || !end) return { error: 'Vælg tidspunkter' };
  if (start === end) return { error: 'Start og slut er ens' };
  if (!form.list) return { error: 'Vælg en liste' };
  if (form.kind === 'weekly') {
    const weekdays = [...new Set(form.weekdays || [])].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
    if (!weekdays.length) return { error: 'Vælg mindst én dag' };
    return { body: { name: '', list: form.list, start, end, weekdays } };
  }
  const at = dateTimeInstant(form.date, start);
  if (at == null) return { error: 'Vælg en dato' };
  if (at - now < MIN_LEAD_MS) return { error: 'Vælg et senere tidspunkt' };
  return { body: { name: '', list: form.list, start, end, date: form.date } };
}

/**
 * Lanes for a day's blocks so overlapping periods sit side by side instead of hiding each other.
 * items: [{start, end}] → same order, each with {lane, lanes} (lanes = how many its overlap group needs).
 */
export function assignLanes(items) {
  const order = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.start - b.it.start || a.it.end - b.it.end);
  const out = new Array(items.length);
  let group = [];
  let groupEnd = -Infinity;
  const laneEnds = [];
  const flush = () => {
    const n = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) out[g.i] = { ...g.it, lane: g.lane, lanes: n };
    group = [];
    laneEnds.length = 0;
  };
  for (const { it, i } of order) {
    if (it.start >= groupEnd && group.length) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(it.end); } else laneEnds[lane] = it.end;
    group.push({ it, i, lane });
    groupEnd = Math.max(groupEnd === -Infinity ? it.end : groupEnd, it.end);
  }
  if (group.length) flush();
  return out;
}
