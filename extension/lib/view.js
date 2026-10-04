// Small presentational decisions for the control page, kept pure so they can be tested in node.

import { formatClock, formatCountdown, shortWhen, dayDiff, dayLabel } from './time.js';

/**
 * Rename/new list: what a commit (Enter or blur) does. Escape never calls this.
 * A new list is not created by clicking away from an untouched default name.
 */
export function nameCommit(kind, typed, currentName, via = 'enter', defaultName = '') {
  const name = String(typed || '').trim().slice(0, 40);
  if (!name || !kind) return { op: 'none' };
  if (kind === 'new') return via === 'blur' && name === defaultName ? { op: 'none' } : { op: 'create', name };
  if (kind === 'rename') return name === currentName ? { op: 'none' } : { op: 'rename', name };
  return { op: 'none' };
}

export const deletePrompt = (listName) => `Slet ${listName}?`;

/** Locked: adding is irreversible for the session, so it is asked first. */
export const blockPrompt = (label, until, now) => `Bloker ${label} til ${shortWhen(now, until)}?`;

/**
 * Confirmation line before locking. When the session runs into a planned period it cannot stop
 * before that period ends: `via` is the last period it continues into ({start, end}) and
 * `viaLists` names the list(s) that period blocks.
 */
export function confirmLine(now, end, listName, via, viaLists) {
  const d = dayDiff(now, end);
  const when = `kl. ${formatClock(end)}${d === 0 ? '' : ' ' + dayLabel(now, end)}`;
  if (via) {
    const names = (viaLists || []).filter(Boolean);
    return `Kan ikke stoppes før ${when} — fortsætter i den planlagte ${shortRange(via.start, via.end)}${names.length ? ` (${names.join(' + ')})` : ''}`;
  }
  return `Kan ikke stoppes før ${when}${listName ? ' · ' + listName : ''}`;
}

/** "13–15", "09:30–11" (Copenhagen). */
export function shortRange(start, end) {
  const t = (ms) => { const c = formatClock(ms); return c.endsWith(':00') ? c.slice(0, 2) : c; };
  return `${t(start)}–${t(end)}`;
}

/** Idle preview of a duration: whole minutes only — moving seconds mean "locked". */
export const idleTimer = (ms) => formatCountdown(Math.ceil(Math.max(0, ms) / 60000) * 60000);

/** Catalog labels like "TV3 / Viafree / Allente" show as "TV3". */
export const tileLabel = (label) => String(label || '').split(' / ')[0].trim();

/** An app tile must not share a label with a site tile ("Slack" → "Slack-app"). */
export function appLabel(app, sites) {
  const name = app.name || app.bundleId || '';
  const clash = (sites || []).some((s) => tileLabel(s.label).toLowerCase() === name.toLowerCase());
  return clash ? `${name}-app` : name;
}

/** Two letters so Slack ("Sl") and Spotify ("Sp") differ. */
export function appLetters(name) {
  const letters = [...String(name || '?').replace(/[^\p{L}\p{N}]/gu, '')];
  if (!letters.length) return '?';
  return (letters[0].toUpperCase() + (letters[1] || '').toLowerCase());
}

/** "reddit.com" → "Reddit" when no name is given. */
export function nameFromDomain(domain) {
  const first = String(domain || '').split('.')[0] || domain;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : domain;
}

/**
 * The one alert line (plain Danish), or null. Technical detail goes in `title` only.
 * view: {reachable, status: {enforcement}}
 */
export function healthMessage(view, now) {
  if (!view) return null;
  if (!view.reachable) return { text: 'LockedIn kører ikke lige nu — genstart Mac\'en', title: '' };
  const e = (view.status && view.status.enforcement) || {};
  const broken = [e.hosts === false && 'hosts', e.pf === false && 'netværksfilter', e.appControl === false && 'app-kontrol'].filter(Boolean);
  const tickAt = e.lastTick ? Date.parse(e.lastTick) : null;
  const stale = tickAt && now - tickAt > 120000;
  if (!broken.length && !stale) return null;
  const title = [broken.length ? `Fejl i: ${broken.join(', ')}` : '', stale ? `Sidste tjek kl. ${formatClock(tickAt)}` : '']
    .filter(Boolean).join(' · ');
  return { text: 'Blokeringen virker ikke helt — genstart Mac\'en', title };
}

/** Why "Start Locked in" is disabled (or null when it can start). */
export function startBlocker({ reachable, end, list, hasLists }) {
  if (!reachable) return 'down';
  if (end == null) return 'time';
  if (hasLists && !list) return 'nolist';
  if (list && !(list.sites || []).length && !(list.apps || []).length) return 'empty';
  return null;
}

/** Confirm buttons ignore a click within 500 ms of appearing, and the 2nd click of a double-click. */
export const CONFIRM_DELAY_MS = 500;
export function confirmArmed(shownAt, now, clickDetail = 0) {
  if (clickDetail > 1) return false;
  return typeof shownAt === 'number' && now - shownAt >= CONFIRM_DELAY_MS;
}
