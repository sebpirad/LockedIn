// Fail-closed lock bookkeeping. Pure: (previous state, daemon status | null, now) → next state.
//
// - lockedUntil = max(previous lockedUntil, status.activeUntil). It only ever grows while a lock runs.
// - While now < lockedUntil the rules stay, whatever the daemon says or if it is unreachable.
// - During a lock every status is merged into the snapshot taken at lock start and can only
//   tighten it (see mergeSites) — a restarted, restored or spoofed daemon cannot weaken Chrome.
// - Only once lockedUntil has passed (and the daemon does not report a newer lock) are rules removed.

// Daemon caps a session at 24 h from now; a little slack, so a corrupt timestamp cannot lock forever.
export const MAX_LOCK_MS = 24 * 60 * 60 * 1000 + 5 * 60 * 1000;

export function emptyLockState() {
  return { lockedUntil: null, lockSites: [], lastStatus: null };
}

function parseTime(v) {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

const union = (a, b) => [...new Set([...(a || []), ...(b || [])])];
const intersect = (a, b) => {
  const keep = new Set((b || []).map(String));
  return [...new Set((a || []).map(String))].filter((x) => keep.has(x));
};
const clone = (sites) => (Array.isArray(sites) ? sites.filter((s) => s && s.id != null).map((s) => ({ ...s })) : []);

/**
 * Merge a status received DURING a lock into the snapshot taken at lock start. Only tightening passes:
 * - sites can be added, never removed; blocked only false → true
 * - mode only tab → full (anything that is not "tab" on either side ends up "full")
 * - suffixes / exactHosts / regexFilters only grow
 * - allowHosts only shrink (intersection). A site that appears mid-lock may only carry
 *   allow hosts that were already allowed at lock start.
 */
export function mergeSites(base, incoming) {
  const out = new Map();
  for (const s of base || []) if (s && s.id != null) out.set(String(s.id), { ...s });
  const allowedAtStart = [...out.values()].filter((s) => s.blocked).flatMap((s) => s.allowHosts || []);
  for (const s of incoming || []) {
    if (!s || s.id == null) continue;
    const prev = out.get(String(s.id));
    if (!prev) {
      out.set(String(s.id), { ...s, allowHosts: intersect(s.allowHosts, allowedAtStart) });
      continue;
    }
    out.set(String(s.id), {
      ...prev,
      label: s.label ?? prev.label,
      blocked: !!(prev.blocked || s.blocked),
      mode: prev.mode === 'tab' && s.mode === 'tab' ? 'tab' : 'full',
      suffixes: union(prev.suffixes, s.blocked ? s.suffixes : []),
      exactHosts: union(prev.exactHosts, s.blocked ? s.exactHosts : []),
      regexFilters: union(prev.regexFilters, s.blocked ? s.regexFilters : []),
      allowHosts: intersect(prev.allowHosts, s.allowHosts),
    });
  }
  return [...out.values()];
}

export function isLocked(state, now) {
  return !!(state && state.lockedUntil && now < state.lockedUntil);
}

/**
 * @param prev   previous persisted state (may be empty/undefined)
 * @param status daemon /v1/status body, or null when unreachable/invalid
 * @param now    ms epoch
 */
export function reduceLock(prev, status, now) {
  prev = { ...emptyLockState(), ...(prev || {}) };
  const wasLocked = isLocked(prev, now);

  let lockedUntil = prev.lockedUntil || null;
  if (status && status.active) {
    let until = parseTime(status.activeUntil);
    if (until != null) {
      until = Math.min(until, now + MAX_LOCK_MS);
      lockedUntil = Math.max(lockedUntil || 0, until);
    }
  }
  const locked = !!(lockedUntil && now < lockedUntil);

  let lockSites = [];
  if (locked) {
    const base = wasLocked ? prev.lockSites || [] : null;
    const incoming = status && Array.isArray(status.sites) ? status.sites : null;
    if (base && base.length) {
      lockSites = incoming ? mergeSites(base, incoming) : base;      // mid-lock: tighten only
    } else if (incoming) {
      lockSites = clone(incoming);                                     // lock start: the snapshot
    } else {
      // Unreachable and no snapshot (should not happen): fall back to the last known list.
      lockSites = clone(prev.lastStatus && prev.lastStatus.sites);
    }
  }

  return {
    lockedUntil: locked ? lockedUntil : null,
    lockSites,
    lastStatus: status || prev.lastStatus || null,
    locked,
  };
}
