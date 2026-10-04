// DEV ONLY. Shared model + components for the "Planlæg" concept mockups (concept-a/b/c.html).
// Reuses the real product's components: ui/combo.js (clock pickers), ui/dropdown.js (list menu), ui/glyphs.js.
// Nothing here talks to the daemon. Time is modelled as minutes since Monday 5 Oct 2026 00:00 Copenhagen.

import { combo } from '../../ui/combo.js';
import { dropdown } from '../../ui/dropdown.js';
import { glyphFor, LOCK_ICON, monogramColor } from '../../ui/glyphs.js';

export { LOCK_ICON };
export const params = new URLSearchParams(location.search);
export const SCN = ['locked', 'empty'].includes(params.get('s')) ? params.get('s') : 'normal';
document.documentElement.dataset.mock = '1';

export const DAY = 1440;
/** "Now": Monday 5 Oct 10:20 (idle), or 13:40 inside the 13–15 period (locked). */
export const NOW = SCN === 'locked' ? 13 * 60 + 40 : 10 * 60 + 20;
export const FRONT_LIST = 'l1';

export const LISTS = [
  { id: 'l1', name: 'Locked In 1', tint: '--l1', sites: ['instagram', 'slack', 'adversus'], apps: [] },
  { id: 'l2', name: 'Locked In 2', tint: '--l2', sites: ['instagram', 'youtube', 'slack', 'adversus', 'tv2'], apps: ['Spotify'] },
];
export const listById = (id) => LISTS.find((l) => l.id === id) || LISTS[0];

/** date: day index (0 = mandag 5. okt) for one period, null for weekly. end <= start = over midnight. */
export const periods = SCN === 'empty' ? [] : [
  { id: 'p1', list: 'l1', start: 13 * 60, end: 15 * 60, date: null, weekdays: [1, 2, 3, 4, 5] },
  { id: 'p2', list: 'l2', start: 9 * 60, end: 11 * 60 + 30, date: 2, weekdays: [] },
  { id: 'p3', list: 'l2', start: 22 * 60, end: 10 * 60, date: null, weekdays: [5] },
];
window.__periods = periods; // read by the click-count check (dev only)
let seq = 10;
export const newId = () => 'p' + (++seq);

// ---------- formatting (Danish, 24 h) ----------

const WD = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const WDS = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const pad2 = (n) => String(n).padStart(2, '0');
export const wd = (d) => (((d % 7) + 7) % 7) + 1;           // 1 = mandag … 7 = søndag
export const wdName = (n) => WD[n - 1];
export const wdShort = (n) => WDS[n - 1];
const dateOf = (d) => new Date(Date.UTC(2026, 9, 5 + d));
export const dayNum = (d) => dateOf(d).getUTCDate();
export const monthShort = (d) => MONTHS[dateOf(d).getUTCMonth()];
export const hm = (m) => { const x = ((m % DAY) + DAY) % DAY; return `${pad2(Math.floor(x / 60))}:${pad2(x % 60)}`; };
export const short = (m) => { const t = hm(m); return t.endsWith(':00') ? t.slice(0, 2) : t; };
export const range = (s, e) => `${short(s)}–${short(e)}`;
export const hours = (mins) => { const h = Math.floor(mins / 60), r = mins % 60; return h && r ? `${h} t ${r} min` : h ? `${h} t` : `${r} min`; };

/** "I dag", "I morgen", "Onsdag 7. okt." */
export function dayLabel(d) {
  if (d === 0) return 'I dag';
  if (d === 1) return 'I morgen';
  return `${cap(wdName(wd(d)))} ${dayNum(d)}. ${monthShort(d)}`;
}
/** "I dag", "I morgen", "On 7." */
export function dayShort(d) {
  if (d === 0) return 'I dag';
  if (d === 1) return 'I morgen';
  return `${wdShort(wd(d))} ${dayNum(d)}.`;
}
/** "I dag", "I morgen", "On 7. okt." (rows) */
export function dayMid(d) {
  if (d === 0 || d === 1) return dayLabel(d);
  return `${wdShort(wd(d))} ${dayNum(d)}. ${monthShort(d)}`;
}
export function daysText(days) {
  const s = [...new Set(days)].sort((a, b) => a - b);
  if (s.length === 7) return 'Hver dag';
  if (s.join() === '1,2,3,4,5') return 'Hverdage';
  if (s.join() === '6,7') return 'Weekend';
  if (s.length === 1) return 'Hver ' + wdName(s[0]);
  return s.map(wdShort).join(', ');
}
export const whenText = (p) => (p.date != null ? dayLabel(p.date) : daysText(p.weekdays));
/** Absolute minute → "15:00" today, "i morgen 01:00", "onsdag 09:00". */
export function when(abs) {
  const d = Math.floor(abs / DAY);
  if (d === 0) return hm(abs);
  return `${d === 1 ? 'i morgen' : wdName(wd(d))} ${hm(abs)}`;
}

// ---------- schedule maths (mirrors the daemon: chains merge overlapping/back-to-back intervals) ----------

export function occurrences(p, fromDay, toDay) {
  const out = [];
  for (let d = fromDay - 1; d < toDay; d++) {
    if (p.date != null ? d !== p.date : !p.weekdays.includes(wd(d))) continue;
    const s = d * DAY + p.start;
    const e = d * DAY + p.end + (p.end <= p.start ? DAY : 0);
    if (e > fromDay * DAY && s < toDay * DAY) out.push({ p, s, e });
  }
  return out;
}
export const intervals = (list, fromDay, toDay) => list.flatMap((p) => occurrences(p, fromDay, toDay)).sort((a, b) => a.s - b.s);
export function chains(ivs) {
  const out = [];
  for (const iv of [...ivs].sort((a, b) => a.s - b.s)) {
    const last = out[out.length - 1];
    if (last && iv.s <= last.e) { last.e = Math.max(last.e, iv.e); last.parts.push(iv); }
    else out.push({ s: iv.s, e: iv.e, parts: [iv] });
  }
  return out;
}
const HORIZON = 22;

/** The running lock (locked scenario): the chain that contains "now". */
export function lockInfo() {
  if (SCN !== 'locked') return { locked: false };
  const c = chains(intervals(periods, -1, HORIZON)).find((x) => x.s <= NOW && NOW < x.e);
  return c ? { locked: true, since: c.s, until: c.e } : { locked: false };
}

/** True when saving `cand` would make a continuous lock longer than 24 h (the daemon's 400). */
export function tooLong(cand, excludeId) {
  const others = periods.filter((p) => p.id !== excludeId);
  const before = chains(intervals(others, 0, HORIZON));
  const after = chains(intervals([...others, cand], 0, HORIZON));
  return after.some((c) => c.e > NOW && c.e - c.s > DAY && !before.some((b) => b.s <= c.s && b.e >= c.e));
}
/** Longest allowed length (minutes, 5-min steps) for `cand` from its start; 0 if even 5 min is too long. */
export function maxLen(cand, excludeId) {
  let best = 0;
  for (let len = 5; len < DAY; len += 5) {
    if (tooLong({ ...cand, end: (cand.start + len) % DAY }, excludeId)) break;
    best = len;
  }
  return best;
}
/** The chain a candidate would join (for the joined outline and the length pill). */
export function chainFor(cand, excludeId, occDay) {
  const others = periods.filter((p) => p.id !== excludeId);
  const s = occDay * DAY + cand.start;
  const e = s + ((cand.end - cand.start + DAY) % DAY || DAY);
  const all = chains([...intervals(others, 0, HORIZON), { p: cand, s, e }]);
  return all.find((c) => c.s <= s && c.e >= e) || { s, e, parts: [] };
}

export function savePeriod(draft) {
  const p = {
    id: draft.id || newId(), list: draft.list, start: draft.start, end: draft.end,
    date: draft.kind === 'date' ? draft.date : null, weekdays: draft.kind === 'date' ? [] : [...draft.weekdays].sort(),
  };
  const i = periods.findIndex((x) => x.id === p.id);
  if (i >= 0) periods[i] = p; else periods.push(p);
  return p;
}
export function deletePeriod(id) {
  const i = periods.findIndex((x) => x.id === id);
  if (i >= 0) periods.splice(i, 1);
}
/** The next start (absolute minute) of a period, or the running occurrence's start. */
export function nextOcc(p) {
  return occurrences(p, 0, HORIZON).find((o) => o.e > NOW) || null;
}
/** Upcoming occurrences (including the one running now), soonest first. */
export const upcoming = (n = 3) => intervals(periods, 0, HORIZON).filter((o) => o.e > NOW).slice(0, n);

export function draftFrom(p) {
  return { id: p.id, list: p.list, start: p.start, end: p.end, kind: p.date != null ? 'date' : 'weekly',
    date: p.date, weekdays: [...p.weekdays], custom: p.date == null && !['1,2,3,4,5', '1,2,3,4,5,6,7'].includes([...p.weekdays].sort().join()) && p.weekdays.length > 1 };
}

// ---------- tiny DOM helper ----------

export const $ = (id) => document.getElementById(id);
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // static strings only
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
export const tintStyle = (listId) => `--lc: var(${listById(listId).tint})`;

export const ICONS = {
  cal: '<svg class="cal-ic" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  rep: '<svg class="rep" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 5.2a4 4 0 0 1 7-1.9M10 6.8a4 4 0 0 1-7 1.9" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M9.6 1.3v2.4H7.2M2.4 10.7V8.3h2.4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4.5h4V6M6 6l.7 10h6.6L14 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  caret: '<svg class="caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chev: '<svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><path d="M2 1l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 8 12" width="8" height="12" aria-hidden="true"><path d="M6 1L1 6l5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
export const lockBadge = () => h('span', { class: 'blk-badge', html: LOCK_ICON });

const SITE_LABEL = { instagram: 'Instagram', youtube: 'YouTube', slack: 'Slack', adversus: 'Adversus', tv2: 'TV 2' };
export function siteGlyph(id, cls = 'glyph') {
  return h('span', { class: cls, title: SITE_LABEL[id], html: glyphFor({ id, label: SITE_LABEL[id] }) });
}
export function appGlyph(name, cls = 'glyph') {
  const m = h('span', { class: 'mono', style: `background:${monogramColor('com.spotify.client')}` }, name.slice(0, 2));
  return h('span', { class: cls, title: name }, m);
}
export const listIcons = (l) => [...l.sites.map((s) => siteGlyph(s, 'glyph small')), ...l.apps.map((a) => appGlyph(a, 'glyph small'))];

// ---------- front page (static replica of app.html's hero) ----------

export function hero({ locked, chips = true, onDuration } = {}) {
  const l = listById(FRONT_LIST);
  const tile = (id) => h('div', { class: 'tile on', title: SITE_LABEL[id] }, siteGlyph(id), h('span', { class: 'tile-label' }, SITE_LABEL[id]));
  const edit = h('button', { type: 'button', class: 'tile tool-tile' }, h('span', { class: 'glyph tool' }, '✎'), h('span', { class: 'tile-label' }, 'Rediger'));
  if (locked) {
    document.body.classList.add('is-locked');
    const left = lockInfo().until - NOW;
    return h('main', { class: 'hero' },
      h('div', { class: 'big' }, `${pad2(Math.floor(left / 60))}:${pad2(left % 60)}:00`),
      h('p', { class: 'sub' }, `Låst til ${hm(lockInfo().until)}`),
      h('div', { class: 'list-line' }, h('span', { class: 'list-static' }, l.name)),
      h('div', { class: 'tiles' }, ...l.sites.map(tile), edit),
      h('div', { class: 'after', style: 'margin-top:-6px' }, h('button', { type: 'button', class: 'quiet' }, 'Forlæng')));
  }
  let minutes = 60;
  const big = h('div', { class: 'big editable' }, '01:00:00');
  const presets = h('div', { id: 'presets', class: 'chips', role: 'group' });
  const renderChips = () => {
    presets.replaceChildren(...[[30, '30 min'], [60, '1 time'], [120, '2 timer'], [240, '4 timer'], [0, 'Andet']].map(([m, t]) =>
      h('button', { type: 'button', class: 'chip' + (m === minutes ? ' on' : ''), onclick: () => { if (!m) return; minutes = m; big.textContent = `${pad2(m / 60 | 0)}:${pad2(m % 60)}:00`; renderChips(); onDuration && onDuration(m); } }, t)));
  };
  renderChips();
  return h('main', { class: 'hero' },
    h('div', { class: 'seg', role: 'group' }, h('button', { type: 'button', class: 'on' }, 'Varighed'), h('button', { type: 'button' }, 'Indtil')),
    big,
    chips ? h('div', { class: 'inputs' }, presets) : null,
    h('div', { class: 'list-line' }, h('button', { type: 'button', class: 'select-btn', style: tintStyle(l.id) },
      h('span', { class: 'lbl' }, h('span', { class: 'dot' }), h('span', {}, l.name)), h('span', { html: ICONS.caret, style: 'display:contents' }))),
    h('div', { class: 'tiles' }, ...l.sites.map(tile), edit),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'primary' }, 'Start Locked in')));
}

export function topBar(...extra) {
  return h('header', { class: 'top' }, ...extra,
    h('button', { type: 'button', class: 'gear', 'aria-label': 'Indstillinger', title: 'Indstillinger', html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.6 7.6 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.4 1 2-3.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' }));
}

export function mockBar(label) {
  if (params.has('shot')) return;
  const link = (s, t) => {
    const q = new URLSearchParams(); if (s !== 'normal') q.set('s', s);
    return h('a', { href: '?' + q.toString(), class: SCN === s ? 'on' : '' }, t);
  };
  document.body.append(h('nav', { class: 'mockbar', 'aria-label': 'Mockup-scenarie' }, h('span', {}, label), link('normal', 'Normal'), link('locked', 'Låst'), link('empty', 'Tom')));
}

// ---------- the period editor ----------
//
// style 'menu' (concepts A, C): "Hvornår" is one dropdown seeded by the day you dragged on.
// style 'chips' (concept B): "Hvornår" is a row of chips, everything visible at once.

const confirmArmed = (shownAt, e) => performance.now() - shownAt >= 500 && !(e && e.detail > 1);

export function editor({ draft, existing = false, style = 'menu', ctxDay = 1, onSave, onDelete, onClose, inline = false }) {
  const d = { ...draft, weekdays: [...(draft.weekdays || [])] };
  if (style === 'chips' && d.kind === 'weekly' && d.weekdays.join() !== '1,2,3,4,5') d.custom = true;
  const lock = lockInfo();
  const readOnly = existing && lock.locked;
  const root = h('div', { class: 'pe' });

  if (readOnly) {
    const p = periods.find((x) => x.id === d.id);
    const l = listById(d.list);
    root.append(...[
      h('div', { class: 'pe-head' }, h('div', { class: 'pe-static' }, whenText(p)), inline ? null : closeBtn(onClose)),
      h('div', { class: 'pe-static time' }, `${hm(d.start)} – ${hm(d.end)}`),
      h('div', { class: 'pe-static', style: tintStyle(l.id) }, h('span', { class: 'dot' }), l.name),
      h('div', { class: 'mini-icons' }, ...listIcons(l)),
      h('div', { class: 'pe-locknote', html: `${LOCK_ICON}<span>Kan ændres efter ${hm(lock.until)}</span>` }),
      inline ? h('div', { class: 'actions left' }, h('button', { type: 'button', class: 'ghost small', onclick: onClose }, 'Luk')) : null].filter(Boolean));
    return { el: root, focus() {} };
  }

  // --- Hvornår ---
  const whenWrap = h('div', { class: 'dd' });
  const daysRow = h('div', { class: 'days', role: 'group', 'aria-label': 'Ugedage' });
  const dateInput = h('input', { type: 'date', min: '2026-10-05', 'aria-label': 'Dato', style: 'border-radius:999px;font-size:14px;color:var(--text)' });
  const renderDays = () => {
    daysRow.hidden = !(d.kind === 'weekly' && d.custom);
    daysRow.replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map((n) => {
      const on = d.weekdays.includes(n);
      return h('button', { type: 'button', class: 'day' + (on ? ' on' : ''), 'aria-pressed': String(on),
        onclick: () => { d.weekdays = on ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n].sort(); changed(); } }, wdShort(n));
    }));
  };
  let whenLabel;
  if (style === 'menu') {
    const ctx = d.kind === 'date' ? d.date : ctxDay;
    const opts = [
      { key: 'once', label: dayLabel(ctx), apply: () => { d.kind = 'date'; d.date = ctx; d.custom = false; }, on: () => d.kind === 'date' },
      { key: 'wd', label: 'Hver ' + wdName(wd(ctx)), apply: () => { d.kind = 'weekly'; d.weekdays = [wd(ctx)]; d.custom = false; }, on: () => d.kind === 'weekly' && !d.custom && d.weekdays.join() === String(wd(ctx)) },
      { key: 'hv', label: 'Hverdage', apply: () => { d.kind = 'weekly'; d.weekdays = [1, 2, 3, 4, 5]; d.custom = false; }, on: () => d.kind === 'weekly' && !d.custom && d.weekdays.join() === '1,2,3,4,5' },
      { key: 'all', label: 'Hver dag', apply: () => { d.kind = 'weekly'; d.weekdays = [1, 2, 3, 4, 5, 6, 7]; d.custom = false; }, on: () => d.kind === 'weekly' && !d.custom && d.weekdays.length === 7 },
      { key: 'custom', label: 'Vælg dage…', apply: () => { if (d.kind !== 'weekly') d.weekdays = [wd(ctx)]; d.kind = 'weekly'; d.custom = true; }, on: () => d.kind === 'weekly' && d.custom },
    ];
    whenLabel = h('span', {});
    const btn = h('button', { type: 'button', class: 'select-btn', 'aria-label': 'Hvornår' }, whenLabel, h('span', { html: ICONS.caret, style: 'display:contents' }));
    const menu = h('div', { class: 'menu left', role: 'menu', hidden: true });
    whenWrap.append(btn, menu);
    const dd = dropdown({ root: whenWrap, button: btn, menu, render: () => {
      menu.replaceChildren(...opts.map((o, i) => [
        i === 1 ? h('div', { class: 'menu-sep' }) : null,
        h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(o.on()), class: 'menu-item' + (o.on() ? ' current' : ''),
          onclick: () => { o.apply(); dd.close(true); changed(); } }, h('span', { class: 'check' }, o.on() ? '✓' : ''), o.label),
      ]).flat().filter(Boolean));
    } });
  } else {
    // chips: I dag · I morgen · Dato · Hverdage · Dage
    const chipRow = h('div', { class: 'chips left' });
    whenWrap.className = 'when-chips';
    whenWrap.append(chipRow);
    whenLabel = null;
    const isOnce = (n) => d.kind === 'date' && d.date === n;
    const chip = (label, on, fn) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: () => { fn(); changed(); } }, label);
    whenWrap.renderChips = () => {
      const other = d.kind === 'date' && d.date > 1;
      const hv = d.kind === 'weekly' && !d.custom;  // "Hverdage" = Ma–Fr without the day buttons
      chipRow.replaceChildren(
        chip('I dag', isOnce(0), () => { d.kind = 'date'; d.date = 0; d.custom = false; }),
        chip('I morgen', isOnce(1), () => { d.kind = 'date'; d.date = 1; d.custom = false; }),
        chip(other ? dayShort(d.date) : 'Dato', other, () => { d.kind = 'date'; d.custom = false; dateInput.hidden = false; try { dateInput.showPicker(); } catch { dateInput.focus(); } }),
        chip('Hverdage', hv && d.weekdays.join() === '1,2,3,4,5', () => { d.kind = 'weekly'; d.weekdays = [1, 2, 3, 4, 5]; d.custom = false; }),
        chip('Dage', d.kind === 'weekly' && d.custom, () => { if (d.kind !== 'weekly') d.weekdays = []; d.kind = 'weekly'; d.custom = true; }));
    };
    dateInput.hidden = true;
    dateInput.addEventListener('change', () => {
      const v = dateInput.value; if (!v) return;
      const idx = Math.round((Date.parse(v + 'T12:00:00Z') - Date.UTC(2026, 9, 5, 12)) / 86400000);
      if (idx >= 0) { d.kind = 'date'; d.date = idx; }
      dateInput.hidden = true; changed();
    });
  }

  // --- times: the product's clock pickers ---
  const part = (id, label) => {
    const val = h('span', {});
    const btn = h('button', { type: 'button', class: 'select-btn compact' }, val, h('span', { html: ICONS.caret, style: 'display:contents' }));
    const menu = h('div', { class: 'menu combo-menu', hidden: true });
    const root = h('div', { class: 'dd clock', 'data-k': id }, btn, menu);
    return { root, btn, menu, val, label };
  };
  const SH = part('sh', 'Fra, time'), SM = part('sm', 'Fra, minut'), EH = part('eh', 'Til, time'), EM = part('em', 'Til, minut');
  const timeRow = h('div', { class: 'clock-row' }, SH.root, h('span', { class: 'sep' }, ':'), SM.root, h('span', { class: 'sep' }, '–'), EH.root, h('span', { class: 'sep' }, ':'), EM.root);
  const occDay = () => (d.kind === 'date' ? d.date : ctxDay);
  const cand = () => ({ id: 'cand', list: d.list, start: d.start, end: d.end, date: d.kind === 'date' ? d.date : null, weekdays: d.kind === 'date' ? [] : d.weekdays });
  const lenNow = () => ((d.end - d.start + DAY) % DAY) || DAY;
  const startMin = () => (d.kind === 'date' && d.date === 0 ? NOW + 5 : 0);
  const allowedEnds = () => {
    const max = d.kind === 'weekly' && !d.weekdays.length ? DAY - 5 : maxLen(cand(), d.id);
    const out = [];
    for (let len = 5; len <= max; len += 5) out.push((d.start + len) % DAY);
    return out;
  };
  const MINS = Array.from({ length: 12 }, (_, i) => i * 5);
  combo({ root: SH.root, button: SH.btn, menu: SH.menu, label: SH.label,
    getOptions: () => Array.from({ length: 24 }, (_, i) => i).filter((hr) => hr * 60 + 55 >= startMin()).map((v) => ({ value: v, label: pad2(v) })),
    getValue: () => Math.floor(d.start / 60), onSelect: (v) => { const len = lenNow(); d.start = Math.max(startMin(), v * 60 + d.start % 60); d.start -= d.start % 5; fitEnd(len); changed(); } });
  combo({ root: SM.root, button: SM.btn, menu: SM.menu, label: SM.label,
    getOptions: () => MINS.filter((m) => Math.floor(d.start / 60) * 60 + m >= startMin()).map((v) => ({ value: v, label: pad2(v) })),
    getValue: () => d.start % 60, onSelect: (v) => { const len = lenNow(); d.start = Math.floor(d.start / 60) * 60 + v; fitEnd(len); changed(); } });
  // End: hours listed from the start onwards (so 23, 00, 01 … reads as "over midnight"); anything that would make
  // one continuous lock longer than 24 h is simply not offered — the same rule "Indtil" uses for earlier times.
  combo({ root: EH.root, button: EH.btn, menu: EH.menu, label: EH.label,
    getOptions: () => { const seen = []; for (const t of allowedEnds()) { const hr = Math.floor(t / 60); if (!seen.includes(hr)) seen.push(hr); } return seen.map((v) => ({ value: v, label: pad2(v) })); },
    getValue: () => Math.floor(d.end / 60),
    onSelect: (v) => { const ok = allowedEnds().filter((t) => Math.floor(t / 60) === v); d.end = ok.includes(v * 60 + d.end % 60) ? v * 60 + d.end % 60 : ok[0]; changed(); } });
  combo({ root: EM.root, button: EM.btn, menu: EM.menu, label: EM.label,
    getOptions: () => allowedEnds().filter((t) => Math.floor(t / 60) === Math.floor(d.end / 60)).map((t) => ({ value: t % 60, label: pad2(t % 60) })),
    getValue: () => d.end % 60, onSelect: (v) => { d.end = Math.floor(d.end / 60) * 60 + v; changed(); } });
  function fitEnd(len) {
    const ends = allowedEnds();
    const want = (d.start + len) % DAY;
    d.end = ends.includes(want) ? want : ends[ends.length - 1] ?? (d.start + 60) % DAY;
  }

  // --- list ---
  const listWrap = h('div', { class: 'dd' });
  const listLbl = h('span', { class: 'lbl' });
  const listBtn = h('button', { type: 'button', class: 'select-btn', 'aria-label': 'Liste' }, listLbl, h('span', { html: ICONS.caret, style: 'display:contents' }));
  const listMenu = h('div', { class: 'menu left', role: 'menu', hidden: true });
  listWrap.append(listBtn, listMenu);
  const listDD = dropdown({ root: listWrap, button: listBtn, menu: listMenu, render: () => {
    listMenu.replaceChildren(...LISTS.map((l) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(l.id === d.list), class: 'menu-item' + (l.id === d.list ? ' current' : ''), style: tintStyle(l.id),
      onclick: () => { d.list = l.id; listDD.close(true); changed(); } }, h('span', { class: 'check' }, l.id === d.list ? '✓' : ''), h('span', { class: 'dot' }), l.name)));
  } });
  const mini = h('div', { class: 'mini-icons', 'aria-label': 'Det blokeres' });

  // --- footer ---
  const err = h('p', { class: 'field-err', hidden: true });
  const save = h('button', { type: 'button', class: 'primary small' }, 'Gem');
  const foot = h('div', { class: 'pe-foot' });
  let askShown = 0;
  const renderFoot = (ask) => {
    if (ask) {
      foot.replaceChildren(h('div', { class: 'pe-ask' }, h('span', {}, 'Slet perioden?'),
        h('button', { type: 'button', class: 'primary small danger-btn', onclick: (e) => { if (confirmArmed(askShown, e)) onDelete && onDelete(d.id); } }, 'Slet'),
        h('button', { type: 'button', class: 'ghost small', onclick: () => renderFoot(false) }, 'Annullér')));
      foot.querySelector('.ghost').focus();
      return;
    }
    foot.replaceChildren(...[
      h('div', { class: 'actions' }, save, inline ? h('button', { type: 'button', class: 'ghost small', onclick: onClose }, 'Annullér') : null),
      existing ? h('button', { type: 'button', class: 'icon-btn trash', 'aria-label': 'Slet', title: 'Slet', html: ICONS.trash, onclick: () => { askShown = performance.now(); renderFoot(true); } }) : null].filter(Boolean));
  };
  save.addEventListener('click', () => {
    if (d.kind === 'weekly' && !d.weekdays.length) return showErr('Vælg mindst én dag');
    if (d.start === d.end) return showErr('Start og slut er ens');
    if (tooLong(cand(), d.id)) return showErr('En samlet lås kan højst vare 24 timer.');
    onSave && onSave(d);
  });
  const showErr = (t) => { err.textContent = t; err.hidden = false; };

  function changed() {
    err.hidden = true;
    if (whenLabel) whenLabel.textContent = d.kind === 'date' ? dayLabel(d.date) : daysText(d.weekdays.length ? d.weekdays : [wd(ctxDay)]);
    if (whenWrap.renderChips) whenWrap.renderChips();
    renderDays();
    SH.val.textContent = pad2(Math.floor(d.start / 60)); SM.val.textContent = pad2(d.start % 60);
    EH.val.textContent = pad2(Math.floor(d.end / 60)); EM.val.textContent = pad2(d.end % 60);
    const l = listById(d.list);
    listLbl.style.cssText = tintStyle(l.id);
    listLbl.replaceChildren(h('span', { class: 'dot' }), h('span', {}, l.name));
    mini.replaceChildren(...listIcons(l));
    // Locked: a new period that touches the running lock extends it, and that cannot be undone — the button says so.
    let label = 'Gem';
    if (lock.locked && !existing && !(d.kind === 'weekly' && !d.weekdays.length)) {
      const c = chainFor(cand(), d.id, occDay());
      if (c.s <= NOW && c.e > lock.until) label = `Lås til ${when(c.e)}`;
    }
    save.textContent = label;
    root.dispatchEvent(new CustomEvent('draftchange', { detail: { ...d } }));
  }

  root.append(...[
    h('div', { class: 'pe-head' }, whenWrap, inline ? null : closeBtn(onClose)),
    style === 'chips' ? dateInput : null,
    daysRow, timeRow,
    listWrap, mini, err, foot].filter(Boolean));
  renderFoot(false);
  changed();
  return { el: root, draft: d, focus: () => { const pop = root.closest('.pe-pop'); (pop || save).focus({ preventScroll: true }); } };
}

function closeBtn(onClose) {
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Luk', onclick: onClose }, '×');
}

/** Show an editor as a popover next to `anchor` (a DOMRect); on phone CSS turns it into a bottom sheet. */
export function popover(content, anchor, onDismiss, prefer = 'side', scroller = null) {
  closePopover();
  const scrim = h('div', { class: 'pe-scrim', onclick: () => onDismiss && onDismiss() });
  const pop = h('div', { class: 'pe-pop', role: 'dialog', 'aria-label': 'Periode', tabindex: '-1' }, content);
  document.body.append(scrim, pop);
  const W = pop.offsetWidth, H = pop.offsetHeight, vw = innerWidth, vh = innerHeight;
  let x = anchor.right + 12, y = anchor.top - 8;
  if (x + W > vw - 16) x = anchor.left - 12 - W;
  if (x < 16 || prefer === 'below') {
    x = Math.max(16, Math.min(vw - W - 16, anchor.left + anchor.width / 2 - W / 2));
    y = anchor.bottom + 10 + H > vh - 16 && anchor.top - 10 - H > 16 ? anchor.top - 10 - H : anchor.bottom + 10;
  }
  y = Math.max(16, Math.min(vh - H - 16, y));
  pop.style.left = x + 'px';
  pop.style.top = y + 'px';
  // Phone: the editor is a bottom sheet. Make room under the content and lift the block being edited above it.
  if (matchMedia('(max-width: 560px)').matches) {
    const sc = scroller || document.scrollingElement;
    sc.style.paddingBottom = H + 'px';
    const over = anchor.bottom + 16 - (vh - H);
    if (over > 0) sc.scrollBy({ top: over });
    pop._unpad = () => { sc.style.paddingBottom = ''; };
  }
  const onKey = (e) => { if (e.key === 'Escape' && !pop.querySelector('.menu:not([hidden])')) { e.preventDefault(); onDismiss && onDismiss(); } };
  document.addEventListener('keydown', onKey);
  pop._cleanup = () => document.removeEventListener('keydown', onKey);
  return pop;
}
export function closePopover() {
  for (const el of document.querySelectorAll('.pe-pop, .pe-scrim')) { if (el._cleanup) el._cleanup(); if (el._unpad) el._unpad(); el.remove(); }
}
