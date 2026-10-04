// "Forlæng": which extensions the daemon will accept.
//
// POST /v1/session {minutes} sets end = max(current end, now + minutes), and the daemon caps ONE
// continuous lock at 24 h counted from its start (status.activeSince). So an extension of `add`
// minutes past the current end is offered only if now + minutes ≤ activeSince + 24 h.

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {{add:number, minutes:number, end:number}[]} the presets that fit, in preset order
 */
export function extendOptions({ now, until, activeSince, presets, maxMinutes = 1440 }) {
  if (!until || until <= now) return [];
  const start = Number.isFinite(activeSince) ? activeSince : now; // older daemon: cap from now
  const cap = start + DAY_MS;
  const remaining = Math.ceil((until - now) / 60000);
  const out = [];
  for (const add of presets) {
    const minutes = remaining + add;
    const end = now + minutes * 60000;
    if (minutes >= 1 && minutes <= maxMinutes && end <= cap) out.push({ add, minutes, end });
  }
  return out;
}
