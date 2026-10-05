// Lists ("Locked In 1", …): which one is shown, and what tapping an icon does to it.

/** The list to show: the remembered one if it still exists, else the first. */
export function pickList(lists, remembered) {
  if (!Array.isArray(lists) || !lists.length) return null;
  return lists.some((l) => l.id === remembered) ? remembered : lists[0].id;
}

/** "Locked In N" with the first N not already taken. */
export function nextListName(lists) {
  let n = (lists || []).length + 1;
  while ((lists || []).some((l) => l.name === `Locked In ${n}`)) n++;
  return `Locked In ${n}`;
}

/**
 * Tap on an icon: the PUT body for the list with `id` added or removed, or null when not allowed.
 * A list used by the running lock may only grow (the daemon answers 423 otherwise).
 */
export function toggleMember(list, kind, id, listIsActive) {
  if (!list || (kind !== 'sites' && kind !== 'apps')) return null;
  const cur = Array.isArray(list[kind]) ? list[kind] : [];
  const has = cur.includes(id);
  if (has && listIsActive) return null;
  const next = has ? cur.filter((x) => x !== id) : [...cur, id];
  return {
    name: list.name,
    sites: kind === 'sites' ? next : [...(list.sites || [])],
    apps: kind === 'apps' ? next : [...(list.apps || [])],
  };
}

/** During a lock: the active list that icon taps add to (the remembered one if it is active). */
export function lockedTarget(activeLists, remembered) {
  if (!Array.isArray(activeLists) || !activeLists.length) return null;
  return activeLists.includes(remembered) ? remembered : activeLists[0];
}

/** What is blocked right now: sites with blocked=true, apps on an active list. */
export function blockedNow(status) {
  const s = status || {};
  return {
    sites: new Set((s.sites || []).filter((x) => x.blocked).map((x) => x.id)),
    apps: new Set((s.apps || []).filter((x) => x.inActiveList).map((x) => x.bundleId)),
  };
}

/** Apps that can be on a list: not "always closed" and not "never closed" (the daemon drops those from lists). */
export const listableApps = (apps) => (apps || []).filter((a) => !a.blocked && !a.neverClose);

/**
 * The "Lukkes aldrig" section: every registered app, by name; browsers last (always closed, no switch).
 * → [{app, browser}]
 */
export function neverCloseRows(apps) {
  const isBrowser = (a) => a.kind === 'browser';
  const byName = (a, b) => (a.name || a.bundleId).localeCompare(b.name || b.bundleId, 'da');
  const all = [...(apps || [])];
  return [...all.filter((a) => !isBrowser(a)).sort(byName), ...all.filter(isBrowser).sort(byName)]
    .map((app) => ({ app, browser: isBrowser(app) }));
}
