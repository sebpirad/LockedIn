// All user-facing times: Europe/Copenhagen, 24-hour, Danish.
// Absolute instants are always Date/ms (UTC); only formatting is zoned.

export const TZ = 'Europe/Copenhagen';

const WEEKDAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const SHORT_WEEKDAYS = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  weekday: 'short', hourCycle: 'h23',
});
const WD_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts in Copenhagen. weekday: 1 = mandag … 7 = søndag. */
export function cphParts(date) {
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(new Date(date))) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
    weekday: WD_INDEX[p.weekday],
  };
}

const pad = (n) => String(n).padStart(2, '0');

/** "14:30" */
export function formatClock(date) {
  const p = cphParts(date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Calendar-day difference between two instants as seen in Copenhagen. */
export function dayDiff(now, date) {
  const a = cphParts(now), b = cphParts(date);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}

export function weekdayName(n) { return WEEKDAYS[(n - 1 + 7) % 7]; }
export function weekdayShort(n) { return SHORT_WEEKDAYS[(n - 1 + 7) % 7]; }

/** "i dag" / "i morgen" / "i går" / weekday name. */
export function dayLabel(now, date) {
  const d = dayDiff(now, date);
  if (d === 0) return 'i dag';
  if (d === 1) return 'i morgen';
  if (d === -1) return 'i går';
  return weekdayName(cphParts(date).weekday);
}

/** "kl. 14:30 (i dag)" */
export function formatUntil(now, date) {
  return `kl. ${formatClock(date)} (${dayLabel(now, date)})`;
}

/** Remaining ms → "HH:MM:SS" (never negative). */
export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

/** 150 → "2 t 30 min", 60 → "1 t", 25 → "25 min". */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60), r = m % 60;
  if (h && r) return `${h} t ${r} min`;
  if (h) return `${h} t`;
  return `${r} min`;
}

/** "tirsdag 09:00–12:00" (or "i dag …"/"i morgen …"). */
export function formatWindow(now, start, end) {
  const d = dayDiff(now, start);
  const day = d === 0 ? 'i dag' : d === 1 ? 'i morgen' : weekdayName(cphParts(start).weekday);
  return `${day} ${formatClock(start)}–${formatClock(end)}`;
}

/** "15:00" today, "i morgen 01:30", "tirsdag 09:00". */
export function shortWhen(now, date) {
  const d = dayDiff(now, date);
  if (d === 0) return formatClock(date);
  return `${dayLabel(now, date)} ${formatClock(date)}`;
}

/** ISO 8601 UTC without milliseconds ("2026-10-05T13:00:00Z"), as docs/API.md shows. */
export function isoUtc(ms) {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * All instants at which Copenhagen's wall clock reads y-m-d hh:mm (0, 1 or 2 of them).
 * Copenhagen is UTC+1 or UTC+2, so only those two offsets need checking.
 */
export function wallInstants(y, m, d, hh, mm) {
  const out = [];
  for (const offH of [2, 1]) {
    const t = Date.UTC(y, m - 1, d, hh, mm) - offH * 3600000;
    const p = cphParts(t);
    if (p.year === y && p.month === m && p.day === d && p.hour === hh && p.minute === mm) out.push(t);
  }
  return out.sort((a, b) => a - b);
}

export const MIN_LEAD_MS = 60000;

/**
 * "Indtil" mode: the instant for wall time "HH:MM" later *today* in Copenhagen.
 * Returns ms, or null when the time is invalid, not at least 1 minute ahead, or not today.
 * Twice-occurring time (DST end): the first occurrence still ahead. Missing time (DST start):
 * moved forward by the gap, as the daemon does.
 */
export function untilToday(now, hhmm) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  const { year, month, day } = cphParts(now);
  let cands = wallInstants(year, month, day, hh, mm);
  if (!cands.length) cands = [Date.UTC(year, month - 1, day, hh, mm) - 3600000]; // in the spring gap
  const t = cands.find((c) => c - now >= MIN_LEAD_MS);
  if (t == null || dayDiff(now, t) !== 0) return null;
  return t;
}

/** Sensible default for "Indtil": the next whole hour at least 10 min ahead, else 23:59, else null. */
export function defaultUntil(now) {
  const p = cphParts(now);
  for (let h = p.hour + 1; h <= 23; h++) {
    const v = `${pad(h)}:00`;
    const t = untilToday(now, v);
    if (t != null && t - now >= 10 * 60000) return v;
  }
  return untilToday(now, '23:59') != null ? '23:59' : null;
}

/** Lenient clock input → "HH:MM" or null: "15", "1500", "15:00", "15.00", "9.5" (= 09:50) are accepted. */
export function parseHHMM(input) {
  const s = String(input ?? '').trim().replace(/\s+/g, '');
  let m = /^(\d{1,2})(?:[:.](\d{1,2}))?$/.exec(s);
  if (!m) {
    const d = /^(\d{1,2})(\d{2})$/.exec(s);
    if (!d) return null;
    m = [s, d[1], d[2]];
  }
  // One digit after the separator means tens, as a Dane writes it: "9.5" = 09:50.
  const hh = +m[1], mm = m[2] == null ? 0 : (m[2].length === 1 ? +m[2] * 10 : +m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${pad(mm)}`;
}
