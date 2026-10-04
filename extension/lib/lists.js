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
