// Clock-style pickers: options for the hour/minute dropdowns in "Andet" (a duration) and "Indtil"
// (a time later today), and the type-to-find filter they share.

import { untilToday, cphParts } from './time.js';

export const MINUTE_STEPS = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5 … 55
const pad = (n) => String(n).padStart(2, '0');

export const DURATION_CHIPS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 time' },
  { minutes: 120, label: '2 timer' },
  { minutes: 240, label: '4 timer' },
];

// ---- Varighed: hours 0–24, minutes 00–55 (total 5 min … 24 t) ----

export function durHourOptions(maxMinutes = 1440) {
  const maxH = Math.floor(maxMinutes / 60);
  return Array.from({ length: maxH + 1 }, (_, h) => ({ value: h, label: String(h) }));
}

export function durMinuteOptions(hours, maxMinutes = 1440) {
  return MINUTE_STEPS
    .filter((m) => hours * 60 + m <= maxMinutes)
    .filter((m) => !(hours === 0 && m === 0))
    .map((m) => ({ value: m, label: pad(m) }));
}

/** Keep a duration valid after one part changed: ≤ 24 t, never 0. */
export function clampDuration(hours, minutes, maxMinutes = 1440) {
  let h = Math.max(0, Math.min(Math.floor(maxMinutes / 60), hours | 0));
  let m = Math.max(0, Math.min(55, Math.round((minutes | 0) / 5) * 5));
  if (h * 60 + m > maxMinutes) m = 0;
  if (h === 0 && m === 0) m = 5;
  return { hours: h, minutes: m, total: h * 60 + m };
}

/** Split any duration into the picker's steps (minutes rounded to 5). */
export function splitDuration(total, maxMinutes = 1440) {
  return clampDuration(Math.floor(total / 60), total % 60, maxMinutes);
}

// ---- Indtil: only times later today (≥ 1 minute ahead), in 5-minute steps ----

export function untilMinuteOptions(hour, now) {
  return MINUTE_STEPS
    .filter((m) => untilToday(now, `${pad(hour)}:${pad(m)}`) != null)
    .map((m) => ({ value: m, label: pad(m) }));
}

export function untilHourOptions(now) {
  const from = cphParts(now).hour;
  const out = [];
  for (let h = from; h <= 23; h++) if (untilMinuteOptions(h, now).length) out.push({ value: h, label: pad(h) });
  return out;
}

/** Default "Indtil": the next whole quarter hour at least 5 minutes ahead, today; else null. */
export function defaultUntilQuarter(now) {
  const p = cphParts(now);
  for (let t = p.hour * 60 + Math.floor(p.minute / 15) * 15 + 15; t < 24 * 60; t += 15) {
    const v = `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
    const at = untilToday(now, v);
    if (at != null && at - now >= 5 * 60000) return { hour: Math.floor(t / 60), minute: t % 60 };
  }
  return null;
}

/** After the hour changed: keep the minute if still allowed, else the first allowed one. */
export function fixUntilMinute(hour, minute, now) {
  const opts = untilMinuteOptions(hour, now).map((o) => o.value);
  if (!opts.length) return null;
  return opts.includes(minute) ? minute : opts[0];
}

// ---- type-to-find: "19" → 19, "4" → 40 and 45, "9" → 09 ----

export function matchOption(label, query) {
  const q = String(query || '').trim();
  if (!q) return true;
  const l = String(label);
  return l.startsWith(q) || String(Number(l)).startsWith(q);
}

export function filterOptions(options, query) {
  return options.filter((o) => matchOption(o.label, query));
}
