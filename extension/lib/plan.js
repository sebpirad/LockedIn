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

// ---------- Plan page (v1.3): week grid, layout, keyboard, "locks now" ----------

const DAYMS = 86400000;
const noonOf = (date) => Date.parse(date + 'T12:00:00Z');
/** "YYYY-MM-DD" + n days. */
export const addDays = (date, n) => cphDate(noonOf(date), n);
/** Weekday of a date, 1 = mandag … 7 = søndag. */
export const weekdayOf = (date) => cphParts(dateTimeInstant(date, '12:00')).weekday;
/** Monday of the week that contains `now` (Copenhagen), plus `weeks`. */
export function weekStart(now, weeks = 0) {
  const today = cphDate(now, 0);
  return addDays(today, 1 - weekdayOf(today) + 7 * weeks);
}
/** Local midnight → next local midnight (23 or 25 hours on DST days). */
export function dayBounds(date) {
  return { d0: dateTimeInstant(date, '00:00'), d1: dateTimeInstant(addDays(date, 1), '00:00') };
}
/** Minutes since local midnight on the wall clock. */
export function wallMinutes(t) {
  const p = cphParts(t);
  return p.hour * 60 + p.minute;
}
/** "Tirsdag 6. okt." */
export function dateLong(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!m) return '';
  return `${cap(['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'][weekdayOf(date) - 1])} ${+m[3]}. ${MONTHS[+m[2] - 1]}`;
}
const toMin = (hhmm) => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3, 5);
/** "2 t", "1 t 30 min", "45 min"; over midnight: "næste dag · 12 t". */
export function lengthText(start, end) {
  const a = toMin(start), b = toMin(end);
  const len = ((b - a) + 1440) % 1440 || 1440;
  const h = Math.floor(len / 60), m = len % 60;
  const t = h && m ? `${h} t ${m} min` : h ? `${h} t` : `${m} min`;
  return b <= a ? `næste dag · ${t}` : t;
}

/**
 * One day column. occs: occurrences that touch the day. → [{o, top, bottom, level, cont: {before, after}}]
 * top/bottom are wall-clock minutes 0–1440. Overlapping active periods cascade (level 0, 1, 2 …, later ones
 * indented and on top), like Google Calendar. Skipped days take part in no cascade: level -1, drawn underneath.
 */
export function dayLayout(occs, date) {
  const { d0, d1 } = dayBounds(date);
  const items = [];
  for (const o of occs) {
    if (o.end <= d0 || o.start >= d1) continue;
    const top = o.start <= d0 ? 0 : wallMinutes(o.start);
    let bottom = o.end >= d1 ? 1440 : wallMinutes(o.end);
    if (bottom <= top) bottom = Math.min(1440, top + 15);
    items.push({ o, top, bottom, cont: { before: o.start < d0, after: o.end > d1 } });
  }
  const isDraft = (x) => !!(x.o.sc && x.o.sc._draft);
  const active = items.filter((x) => !x.o.skipped && !isDraft(x));
  const lanes = assignLanes(active.map((x) => ({ start: x.top, end: x.bottom })));
  active.forEach((x, i) => { x.level = lanes[i].lane; });
  for (const x of items) if (x.o.skipped) x.level = -1;
  // A new period being drawn is the newest: it goes on top, indented, and never hides what is under it.
  for (const x of items.filter(isDraft)) {
    const under = active.filter((y) => y.top < x.bottom && y.bottom > x.top);
    x.level = under.length ? Math.max(...under.map((y) => y.level)) + 1 : 0;
  }
  return items.sort((a, b) => a.level - b.level || a.top - b.top);
}

/** Left indent of a cascade level, in px, for a column `colW` wide. */
export function cascadeIndent(level, colW) {
  if (level <= 0) return 0;
  const step = Math.max(24, Math.round(colW * 0.28));
  return Math.min(level * step, Math.max(0, colW - 30));
}

/**
 * Which label fits a block — never an ellipsis. Widths are measured text widths in px.
 * w/h: the block's inner width and height. → {time: 'full'|'start'|null, name: 'below'|'inline'|null}
 *   time "13–15" if it fits, else the start "13" if it fits, else nothing (the tint carries the block);
 *   the list name only whole: on its own line when the block is ≥ 40 px tall, else after the time on one line.
 */
export function labelFit({ w, h, timeW, startW, nameW, gap = 6 }) {
  let time = null;
  if (timeW <= w) time = 'full';
  else if (startW <= w) time = 'start';
  let name = null;
  if (time === 'full' && nameW != null) {
    if (h >= 40 && nameW <= w) name = 'below';
    else if (timeW + gap + nameW <= w) name = 'inline';
  }
  return { time, name };
}

/** A pointer drag between two minute positions → a range snapped to `snap` minutes, at least one step, inside the day. */
export function dragRange(a, b, snap = 15) {
  const s = (m) => Math.max(0, Math.min(1440, Math.round(m / snap) * snap));
  let start = s(Math.min(a, b)), end = s(Math.max(a, b));
  if (end - start < snap) end = Math.min(1440, start + snap);
  if (end - start < snap) start = end - snap;
  return { start, end };
}

/**
 * Keyboard slot cursor: {date, start, len} in minutes. ↑/↓ move 30 min, ←/→ a day,
 * Shift+↑/↓ shorten/lengthen by 30 min. The slot always stays inside its day.
 */
export function moveSlot(slot, key, shift = false, step = 30) {
  let { date, start, len } = slot;
  if (shift && key === 'ArrowDown') len = Math.min(1440 - start, len + step);
  else if (shift && key === 'ArrowUp') len = Math.max(step, len - step);
  else if (key === 'ArrowDown') start = Math.min(1440 - len, start + step);
  else if (key === 'ArrowUp') start = Math.max(0, start - step);
  else if (key === 'ArrowRight') date = addDays(date, 1);
  else if (key === 'ArrowLeft') date = addDays(date, -1);
  else if (key === 'Home') start = 0;
  else if (key === 'End') start = 1440 - len;
  return { date, start, len };
}

/**
 * Does saving this period start or lengthen a lock right now? Then it cannot be undone, and the button must say so.
 * body: the POST/PUT body; editingId: the period being edited (its old version is ignored).
 * → the instant the lock would then end, or null when saving changes nothing now.
 */
export function lockIfSaved(body, schedules, now, lockUntil = null, editingId = null) {
  if (!body) return null;
  const old = (schedules || []).find((s) => s.id === editingId);
  const draft = { ...body, id: editingId || '__draft', skip: old ? old.skip || [] : [] };
  const others = (schedules || []).filter((s) => s.id !== editingId);
  const mine = occurrences([draft], now - DAYMS, now + 2 * DAYMS).filter((o) => !o.skipped && o.end > now);
  const all = occurrences([...others, draft], now - DAYMS, now + 3 * DAYMS);
  if (lockUntil && lockUntil > now) {
    if (!mine.some((o) => o.start <= lockUntil)) return null;
    const end = chainEnd(now, lockUntil, all).end;
    return end > lockUntil ? end : null;
  }
  const cur = mine.find((o) => o.start <= now);
  return cur ? chainEnd(now, cur.end, all).end : null;
}

/** Clicks and the keyboard slot reuse the last length only when it is a normal block (≤ 3 h); otherwise 1 h. */
export const slotLength = (last) => (last > 0 && last <= 180 ? last : 60);

/** 1500 → "25 t", 1470 → "24 t 30 min". */
export function minutesText(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} t ${m} min` : h ? `${h} t` : `${m} min`;
}

/**
 * The daemon's 24-hour rule, checked before saving: one continuous lock — the running lock and every period
 * that overlaps or touches it, back to back — may last at most 24 hours. A chain that already existed
 * without this period does not count (as in the daemon). lock: {since, until} of the running lock, or null.
 * → the length in minutes of the longest chain this period would make too long, or null.
 */
export function chainOverLimit(body, schedules, now, lock = null, editingId = null, days = 15) {
  if (!body) return null;
  const all = (schedules || []).filter((s) => s.enabled !== false);
  const old = all.find((s) => s.id === editingId);
  const draft = { ...body, id: editingId || '__draft', skip: old ? old.skip || [] : [] };
  const others = all.filter((s) => s.id !== editingId);
  const from = now - DAYMS, to = now + days * DAYMS;
  const chains = (list) => {
    const ivs = occurrences(list, from, to).filter((o) => !o.skipped).map((o) => ({ s: o.start, e: o.end, mine: o.sc.id === draft.id }));
    if (lock && lock.until > now) ivs.push({ s: Math.min(lock.since || now, now), e: lock.until, mine: false });
    ivs.sort((a, b) => a.s - b.s);
    const out = [];
    for (const iv of ivs) {
      const last = out[out.length - 1];
      if (last && iv.s <= last.e) { last.e = Math.max(last.e, iv.e); last.mine = last.mine || iv.mine; } else out.push({ ...iv });
    }
    return out;
  };
  const before = chains(others);
  let worst = null;
  for (const c of chains([...others, draft])) {
    if (!c.mine || c.e <= now || c.e - c.s <= DAYMS) continue;
    if (before.some((b) => b.s <= c.s && b.e >= c.e)) continue;
    worst = Math.max(worst || 0, c.e - c.s);
  }
  return worst == null ? null : Math.round(worst / 60000);
}
