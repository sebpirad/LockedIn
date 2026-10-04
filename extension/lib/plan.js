// "Planlæg": the period form (one date or weekly) and how a period reads in a row.

import { cphParts, dayDiff, weekdayName, weekdayShort, parseHHMM, wallInstants, MIN_LEAD_MS } from './time.js';

const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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
  return `${cap(weekdayName(cphParts(noon).weekday))} ${+m[3]}. ${MONTHS[+m[2] - 1]}`;
}

/** "I morgen 09–12 · Locked In 2" / "Ma–Fr 09–12 · Locked In 1". */
export function periodText(sc, lists, now) {
  const when = sc.date ? dateText(now, sc.date) : daysText(sc.weekdays);
  const list = (lists || []).find((l) => l.id === sc.list);
  return `${when} ${shortTime(sc.start)}–${shortTime(sc.end)}${list ? ' · ' + list.name : ''}`;
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
