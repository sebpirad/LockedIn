// Control page. Changes go to the daemon; the enforced state comes from the service worker.
// The dev mock (?mock=1) only works when the page is served outside the extension
// (no chrome.runtime.id), so no production path can reach it — and pack.sh leaves dev/ out.

import { createApi } from '../lib/api.js';
import {
  formatClock, formatCountdown, formatDuration, weekdayShort, weekdayName, dayDiff, cphParts,
  shortWhen, isoUtc, untilToday,
} from '../lib/time.js';
import { normalizeDomain } from '../lib/domains.js';
import { extendOptions } from '../lib/extend.js';
import { pickList, nextListName, toggleMember, lockedTarget, blockedNow } from '../lib/lists.js';
import { cphDate, periodText, scheduleBody } from '../lib/plan.js';
import {
  nameCommit, deletePrompt, blockPrompt, confirmLine, idleTimer, tileLabel, appLabel, appLetters,
  nameFromDomain, healthMessage, startBlocker, confirmArmed,
} from '../lib/view.js';
import { glyphFor, LOCK_ICON, monogramColor } from './glyphs.js';
import { dropdown } from './dropdown.js';
import { combo } from './combo.js';
import {
  DURATION_CHIPS, durHourOptions, durMinuteOptions, clampDuration, splitDuration,
  untilHourOptions, untilMinuteOptions, defaultUntilQuarter, fixUntilMinute, MINUTE_STEPS,
} from '../lib/clock.js';

const params = new URLSearchParams(location.search);
const HAS_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const MOCK = !HAS_EXT && params.get('mock') === '1';
const LOCK_TIP = 'Kan ikke ændres under en aktiv session';
const BROWSER_TIP = 'Andre browsere lukkes altid under fokus';
const EXTEND_PRESETS = [25, 60, 120];

let api;
let backend;
if (MOCK) {
  const { createMockApi } = await import('../dev/mock-api.js');
  api = await createMockApi(params);
  backend = {
    async refresh() {
      try {
        const status = await api.status();
        const until = status.active && status.activeUntil ? Date.parse(status.activeUntil) : null;
        return { status, reachable: true, locked: !!until && until > Date.now(), lockedUntil: until };
      } catch (e) {
        return { status: ui.view && ui.view.status, reachable: false, lastError: e.message, locked: false, lockedUntil: null };
      }
    },
  };
  document.documentElement.dataset.mock = '1';
} else {
  api = createApi();
  backend = {
    async refresh() {
      if (!HAS_EXT) throw new Error('Åbn siden fra Locked in-udvidelsen.');
      const v = await chrome.runtime.sendMessage({ type: 'refresh' });
      if (!v || v.error) throw new Error((v && v.error) || 'Ingen forbindelse til udvidelsen');
      return v;
    },
  };
}

// Per-viewer conveniences: the last used list (chrome.storage in the extension), the start mode.
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window etc. */ } },
};
async function loadLastList() {
  if (HAS_EXT) {
    try { return (await chrome.storage.local.get('lastList')).lastList || null; } catch { return null; }
  }
  return store.get('li.list');
}
function saveLastList(id) {
  if (HAS_EXT) chrome.storage.local.set({ lastList: id }).catch(() => {});
  else store.set('li.list', id);
}

const ui = {
  view: null,
  mode: store.get('li.mode') === 'until' ? 'until' : 'dur',
  minutes: 60,
  custom: false,       // "Andet" chosen: the hour/minute pickers are shown
  until: null,         // "Indtil": {hour, minute}
  step: 'idle',        // idle | confirm
  extendOpen: false,
  extendAdd: 60,
  busy: false,
  listId: null,
  naming: null,        // null | 'new' | 'rename'
  menuAsk: false,      // "Slet …?" showing in the menu
  shownAt: { tap: 0, del: 0, lock: 0 }, // when each confirm appeared (double-click guard)
  defaultName: '',
  editing: false,      // "✎ Rediger": all icons shown, tap toggles
  pendingAdd: null,    // locked: {kind, id, label} waiting for "Bloker"
  edits: 0,            // list edits in flight (optimistic)
  installed: null,
  icons: {},           // domain → {data} for own sites (cached by the service worker)
  iconsRev: 0,
  plan: { kind: 'date', date: null, weekdays: [1, 2, 3, 4, 5], list: null, start: '09:00', end: '12:00' },
  sigs: {},
};

// ---------- helpers ----------

const $ = (id) => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // static strings only (glyphs.js)
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const show = (id, on) => { $(id).hidden = !on; };

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast';
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 5000);
}

async function act(fn) {
  if (ui.busy) return false;
  ui.busy = true;
  document.body.classList.add('busy');
  try {
    await fn();
    await refresh(true);
    return true;
  } catch (e) {
    toast(e && e.message ? e.message : 'Noget gik galt');
    await refresh(true);
    return false;
  } finally {
    ui.busy = false;
    document.body.classList.remove('busy');
  }
}

const status = () => (ui.view && ui.view.status) || null;
const sites = () => (status() && status().sites) || [];
const apps = () => (status() && status().apps) || [];
const lists = () => (status() && status().lists) || [];
const activeListIds = () => (status() && status().active && status().activeLists) || [];
const schedules = () => (status() && status().schedules) || [];
const maxMinutes = () => (status() && status().maxSessionMinutes) || 1440;
const reachable = () => !!(ui.view && ui.view.reachable);
const currentList = () => lists().find((l) => l.id === ui.listId) || null;
const listName = (id) => (lists().find((l) => l.id === id) || {}).name || '';
/** Apps that can be on a list (not "always closed"). */
const listApps = () => apps().filter((a) => !a.blocked);

function lockInfo() {
  const v = ui.view || {};
  const s = v.status;
  let until = v.locked ? v.lockedUntil : null;
  if (s && s.active && s.activeUntil) {
    const t = Date.parse(s.activeUntil);
    if (t > Date.now()) until = Math.max(until || 0, t);
  }
  return { locked: !!until && until > Date.now(), until };
}

/** Planned end of a new session, or null when "Indtil" has no valid time. */
function plannedEnd(now = Date.now()) {
  if (ui.mode === 'until') return ui.until ? untilToday(now, untilText()) : null;
  return now + ui.minutes * 60000;
}

function extendChoices(until, now = Date.now()) {
  const since = status() && status().active && status().activeSince ? Date.parse(status().activeSince) : NaN;
  return extendOptions({ now, until, activeSince: since, presets: EXTEND_PRESETS, maxMinutes: maxMinutes() });
}
function extendTarget(until, now = Date.now()) {
  const opts = extendChoices(until, now);
  return opts.find((o) => o.add === ui.extendAdd) || opts[opts.length - 1] || null;
}

// ---------- hero ----------

const pad2 = (n) => String(n).padStart(2, '0');
const untilText = () => (ui.until ? `${pad2(ui.until.hour)}:${pad2(ui.until.minute)}` : '');

function renderPresets() {
  const chip = (label, on, onclick) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick }, label);
  const isChip = DURATION_CHIPS.some((c) => c.minutes === ui.minutes);
  $('presets').replaceChildren(
    ...DURATION_CHIPS.map((c) => chip(c.label, !ui.custom && ui.minutes === c.minutes, () => { ui.custom = false; setMinutes(c.minutes); })),
    chip('Andet', ui.custom || !isChip, () => openCustom()),
  );
  show('customRow', ui.custom);
  const d = splitDuration(ui.minutes, maxMinutes());
  $('durHVal').textContent = String(d.hours);
  $('durMVal').textContent = pad2(d.minutes);
}

function openCustom() {
  ui.custom = true;
  setMinutes(ui.minutes);
  $('durHBtn').focus();
}

function setMinutes(m) {
  ui.minutes = Math.max(1, Math.min(maxMinutes(), Math.round(m) || 0));
  renderPresets();
  tick();
}

function setDuration(hours, minutes) {
  setMinutes(clampDuration(hours, minutes, maxMinutes()).total);
}

/** Keep "Indtil" on a time that is still later today; default = next quarter hour ≥ 5 min ahead. */
function ensureUntil(now = Date.now()) {
  if (ui.until && untilToday(now, untilText()) != null) return;
  const d = defaultUntilQuarter(now);
  ui.until = d ? { hour: d.hour, minute: d.minute } : null;
}

function renderUntil() {
  $('untHVal').textContent = ui.until ? pad2(ui.until.hour) : '--';
  $('untMVal').textContent = ui.until ? pad2(ui.until.minute) : '--';
  $('untHBtn').disabled = !ui.until;
  $('untMBtn').disabled = !ui.until;
}

function setMode(mode) {
  ui.mode = mode;
  store.set('li.mode', mode);
  if (mode === 'until') { ensureUntil(); renderUntil(); }
  renderHero();
}

function renderHero() {
  const { locked, until } = lockInfo();
  const confirm = !locked && ui.step === 'confirm';
  const idle = !locked && !confirm;

  show('modeSwitch', idle);
  for (const b of $('modeSwitch').querySelectorAll('button')) {
    const on = b.dataset.mode === ui.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  show('durInput', idle && ui.mode === 'dur');
  show('untilInput', idle && ui.mode === 'until');
  show('start', idle);
  show('lockNow', confirm);
  show('back', confirm);
  const editable = idle && ui.mode === 'dur';
  $('big').classList.toggle('editable', editable);
  $('big').setAttribute('role', editable ? 'button' : 'timer');
  if (editable) { $('big').tabIndex = 0; $('big').title = 'Vælg en anden varighed'; } else { $('big').removeAttribute('tabindex'); $('big').removeAttribute('title'); }

  const choices = locked ? extendChoices(until) : [];
  if (!choices.length) ui.extendOpen = false;
  else if (!choices.some((o) => o.add === ui.extendAdd)) ui.extendAdd = choices[choices.length - 1].add;
  show('extend', locked && !ui.extendOpen && choices.length > 0);
  show('extendPanel', locked && ui.extendOpen);
  document.body.classList.toggle('is-locked', locked);
  if (!locked) ui.pendingAdd = null;
  if (confirm && ui.editing) { ui.editing = false; ui.sigs.tiles = null; renderTiles(); }

  $('lockNow').disabled = !reachable();
  $('extend').disabled = !reachable();
  if (ui.extendOpen) {
    $('extendChips').replaceChildren(...choices.map((o) => o.add).map((m) => h('button', {
      type: 'button', class: 'chip' + (ui.extendAdd === m ? ' on' : ''), 'aria-pressed': String(ui.extendAdd === m),
      onclick: () => { ui.extendAdd = m; renderHero(); },
    }, '+ ' + formatDuration(m))));
  }
  renderListLine();
  renderTapConfirm();
  tick();
}

let lastLocked = null;
function tick() {
  const now = Date.now();
  const { locked, until } = lockInfo();
  if (lastLocked !== null && lastLocked !== locked) {
    lastLocked = locked;
    ui.editing = false;
    render();
    refresh();
    return;
  }
  lastLocked = locked;

  const big = $('big');
  const sub = $('sub');
  if (locked) {
    $('listEmpty').hidden = true;
    big.textContent = formatCountdown(until - now);
    big.classList.remove('dim');
    sub.textContent = `Låst til ${shortWhen(now, until)}`;
    sub.hidden = false;
    document.title = `${formatCountdown(until - now)} · Locked in`;
    const choices = extendChoices(until, now);
    const offered = ui.extendOpen ? $('extendChips').children.length : (!$('extend').hidden ? 1 : 0);
    if ((choices.length > 0) !== (offered > 0) || (ui.extendOpen && choices.length !== offered)) renderHero();
    if (ui.extendOpen) {
      const t = extendTarget(until, now);
      if (t) $('extendNow').textContent = `Forlæng til ${shortWhen(now, t.end)}`;
      $('extendNow').disabled = !t || !reachable();
    }
    return;
  }

  document.title = 'Locked in';
  if (ui.mode === 'until' && !(ui.until && untilToday(now, untilText()) != null)) { ensureUntil(now); renderUntil(); }
  const end = plannedEnd(now);
  // Idle: a static preview in whole minutes. Only a running lock moves its seconds.
  big.textContent = ui.mode === 'until' ? idleTimer(end == null ? 0 : end - now) : formatCountdown(ui.minutes * 60000);
  big.classList.toggle('dim', end == null);

  const list = currentList();
  const blocker = startBlocker({ reachable: reachable(), end, list, hasLists: lists().length > 0 });
  $('start').disabled = !!blocker;
  $('listEmpty').hidden = blocker !== 'empty' || !!ui.naming;
  if (ui.step === 'confirm') {
    if (end == null) { ui.step = 'idle'; renderHero(); return; }
    sub.textContent = confirmLine(now, end, list ? list.name : '');
    sub.hidden = false;
  } else {
    sub.hidden = true;
  }
}

// ---------- list picker ----------

function selectList(id) {
  ui.listId = id;
  ui.editing = false;
  saveLastList(id);
  ui.sigs.tiles = null;
  closeMenu(true);
  render();
}

function renderListLine() {
  const { locked } = lockInfo();
  const naming = !!ui.naming;
  const confirm = !locked && ui.step === 'confirm';
  $('listLine').hidden = confirm;
  show('listBtn', !locked && !confirm && !naming && !!listName(ui.listId));
  show('nameForm', !locked && !confirm && naming);
  const inForce = activeListIds();
  show('listStatic', locked && inForce.length > 0);
  $('listStatic').textContent = inForce.map(listName).filter(Boolean).join(' + ');
  $('listName').textContent = listName(ui.listId);
  if (locked || confirm) closeMenu();
}

let listDD = null;
function closeMenu(refocus) {
  ui.menuAsk = false;
  if (listDD) listDD.close(refocus);
}

function renderMenu() {
  const cur = currentList();
  const item = (label, onclick, cls = '') => h('button', { type: 'button', role: 'menuitem', class: 'menu-item ' + cls, onclick }, h('span', { class: 'check' }), label);
  if (ui.menuAsk && cur) {
    $('listMenu').replaceChildren(h('div', { class: 'menu-ask' },
      h('div', {}, deletePrompt(cur.name)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'primary small danger-btn', onclick: (e) => { if (confirmArmed(ui.shownAt.del, performance.now(), e.detail)) deleteCurrentList(); } }, 'Slet'),
        h('button', { type: 'button', class: 'ghost small', onclick: () => { ui.menuAsk = false; renderMenu(); } }, 'Annullér'))));
    return;
  }
  const others = lists().filter((l) => l.id !== ui.listId);
  $('listMenu').replaceChildren(
    cur ? h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': 'true', class: 'menu-item current', onclick: () => closeMenu(true) },
      h('span', { class: 'check' }, '✓'), cur.name) : null,
    ...others.map((l) => h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': 'false', class: 'menu-item', onclick: () => selectList(l.id) },
      h('span', { class: 'check' }), l.name)),
    h('div', { class: 'menu-sep' }),
    item('Ny liste', () => startNaming('new')),
    item('Omdøb', () => startNaming('rename')),
    lists().length > 1 ? item('Slet', () => {
      ui.menuAsk = true;
      ui.shownAt.del = performance.now();
      renderMenu();
      $('listMenu').querySelector('.menu-ask button:last-child')?.focus(); // focus "Annullér", the safe choice
    }, 'danger') : null,
  );
}

function startNaming(kind) {
  closeMenu();
  ui.naming = kind;
  ui.defaultName = kind === 'new' ? nextListName(lists()) : listName(ui.listId);
  $('nameInput').value = ui.defaultName;
  renderListLine();
  tick();
  $('nameInput').focus();
  $('nameInput').select();
}

function cancelNaming() {
  ui.naming = null;
  renderListLine();
  tick();
}

let committing = false;
/** Enter and blur both save; Escape cancels (cancelNaming runs before the blur). */
async function commitName(via) {
  if (committing || !ui.naming) return;
  committing = true;
  const kind = ui.naming;
  const cur = currentList();
  const c = nameCommit(kind, $('nameInput').value, cur ? cur.name : '', via, ui.defaultName);
  ui.naming = null;
  renderListLine();
  try {
    if (c.op === 'create') {
      const before = new Set(lists().map((l) => l.id));
      if (await act(() => api.addList(c.name, [], []))) {
        const created = lists().find((l) => !before.has(l.id));
        if (created) selectList(created.id);
      }
    } else if (c.op === 'rename' && cur) {
      await act(() => api.putList(cur.id, { name: c.name, sites: cur.sites, apps: cur.apps }));
    }
  } finally {
    committing = false;
    tick();
  }
}

async function deleteCurrentList() {
  const id = ui.listId;
  closeMenu();
  if (await act(() => api.deleteList(id))) selectList(pickList(lists(), null));
}

// ---------- icon row ----------

function siteIcon(site, cls = 'glyph') {
  const glyph = glyphFor(site);
  if (glyph) return h('span', { class: cls, html: glyph });
  const own = !site.builtin && site.suffixes && ui.icons[site.suffixes[0]];
  if (own && own.data && own.data.startsWith('data:image/png;base64,')) {
    return h('span', { class: cls }, h('img', { src: own.data, alt: '', draggable: 'false' }));
  }
  const m = h('span', { class: 'mono' }, (site.label || site.id || '?').trim().charAt(0).toUpperCase());
  m.style.background = monogramColor(site.id || site.label);
  return h('span', { class: cls }, m);
}
function appIcon(a, cls = 'glyph') {
  const m = h('span', { class: 'mono' }, appLetters(a.name || a.bundleId));
  m.style.background = monogramColor(a.bundleId || a.name);
  return h('span', { class: cls }, m);
}
const badge = () => h('span', { class: 'badge', html: LOCK_ICON });

let editChain = Promise.resolve();
/** Optimistic list edit: update the local copy now, send PUTs one after the other. */
function editList(listId, kind, id, listIsActive) {
  const l = lists().find((x) => x.id === listId);
  const body = toggleMember(l, kind, id, listIsActive);
  if (!body) return;
  Object.assign(l, { sites: body.sites, apps: body.apps });
  ui.sigs.tiles = null;
  renderTiles();
  tick();
  ui.edits++;
  editChain = editChain
    .then(() => api.putList(listId, { name: l.name, sites: [...l.sites], apps: [...l.apps] }))
    .catch((e) => toast(e && e.message ? e.message : 'Noget gik galt'))
    .finally(() => { ui.edits--; if (!ui.edits) refresh(true); });
}

function onTileTap(it, list, locked) {
  if (!locked) { editList(list.id, it.kind, it.id, false); return; }
  ui.pendingAdd = { kind: it.kind, id: it.id, label: it.label, list: list.id };
  ui.shownAt.tap = performance.now();
  renderTapConfirm();
}

function renderTapConfirm() {
  const { locked, until } = lockInfo();
  const p = locked ? ui.pendingAdd : null;
  show('tapConfirm', !!p);
  if (p) $('tapText').textContent = blockPrompt(p.label, until, Date.now());
}

function renderTiles() {
  const { locked } = lockInfo();
  const target = locked ? lockedTarget(activeListIds(), ui.listId) : ui.listId;
  const list = lists().find((l) => l.id === target);
  const editing = ui.editing && !!list;
  const now = blockedNow(status());
  const sig = JSON.stringify([locked, target, list, editing, ui.step, sites().map((s) => [s.id, s.label, s.blocked]), apps(), ui.edits > 0 ? 'e' : '', ui.iconsRev]);
  if (ui.sigs.tiles === sig) return;
  ui.sigs.tiles = sig;

  const isOn = (kind, id) => (locked ? now[kind].has(id) : !!list && list[kind].includes(id));
  const orderedSites = [...sites().filter((s) => s.builtin), ...sites().filter((s) => !s.builtin)];
  let items = [
    ...orderedSites.map((s) => ({ kind: 'sites', id: s.id, label: tileLabel(s.label || s.id), icon: () => siteIcon(s) })),
    ...listApps().map((a) => ({ kind: 'apps', id: a.bundleId, label: appLabel(a, sites()), icon: () => appIcon(a) })),
  ];
  // Normal view: only what the list blocks (or, locked, what is blocked now). Edit mode: everything.
  if (!editing) items = items.filter((it) => isOn(it.kind, it.id));

  const tiles = items.map((it) => {
    const on = isOn(it.kind, it.id);
    const icon = it.icon();
    if (editing && on) icon.append(badge());
    const cls = 'tile' + (on ? ' on' : ' off');
    const inner = [icon, h('span', { class: 'tile-label' }, it.label)];
    if (!editing || (locked && on)) return h('div', { class: cls, title: it.label }, inner);
    return h('button', {
      type: 'button', class: cls, 'aria-pressed': String(on), title: it.label,
      onclick: () => onTileTap(it, list, locked),
    }, inner);
  });
  if (list && editing) {
    tiles.push(h('button', { type: 'button', class: 'tile add-tile', title: 'Tilføj', 'aria-label': 'Tilføj hjemmeside eller app', onclick: openAdd },
      h('span', { class: 'glyph plus' }, '+'), h('span', { class: 'tile-label' }, 'Tilføj')));
    tiles.push(h('button', { type: 'button', id: 'editDone', class: 'tile tool-tile', onclick: () => setEditing(false) },
      h('span', { class: 'glyph tool' }, '✓'), h('span', { class: 'tile-label' }, 'Færdig')));
  } else if (list && (locked || ui.step !== 'confirm')) {
    tiles.push(h('button', { type: 'button', id: 'editBtn', class: 'tile tool-tile', 'aria-label': `Rediger ${list.name}`, onclick: () => setEditing(true) },
      h('span', { class: 'glyph tool' }, '✎'), h('span', { class: 'tile-label' }, 'Rediger')));
  }
  $('tiles').classList.toggle('editing', editing);
  $('tiles').replaceChildren(...tiles);
}

function setEditing(on) {
  ui.editing = on;
  if (!on) { ui.pendingAdd = null; renderTapConfirm(); }
  ui.sigs.tiles = null;
  renderTiles();
  const focusId = on ? 'editDone' : 'editBtn';
  $(focusId)?.focus({ preventScroll: true });
}

// ---------- "+": own site or app straight onto the list ----------

function addTargetList() {
  const { locked } = lockInfo();
  return locked ? lockedTarget(activeListIds(), ui.listId) : ui.listId;
}

function setAddKind(kind) {
  for (const b of $('addKind').querySelectorAll('button')) b.classList.toggle('on', b.dataset.kind === kind);
  show('addSite', kind === 'site');
  show('addApp', kind === 'app');
  if (kind === 'site') $('siteDomain').focus();
  else { $('pickerSearch').focus(); loadInstalled(); }
}

function openAdd() {
  const { locked, until } = lockInfo();
  $('addSite').reset();
  $('siteErr').hidden = true;
  $('pickerSearch').value = '';
  // Locked: adding blocks for the rest of the session — the button says so.
  $('siteSubmit').textContent = locked ? `Bloker til ${shortWhen(Date.now(), until)}` : 'Tilføj';
  $('addDlg').showModal();
  setAddKind('site');
}

async function loadInstalled() {
  renderPicker();
  try {
    const res = await api.installed();
    ui.installed = Array.isArray(res) ? res : (res && res.apps) || [];
  } catch (e) {
    ui.installed = [];
    toast(e.message);
  }
  renderPicker();
}

function renderPicker() {
  const q = $('pickerSearch').value.trim().toLowerCase();
  const list = lists().find((l) => l.id === addTargetList());
  const onList = new Set(list ? list.apps : []);
  const always = new Set(apps().filter((a) => a.blocked).map((a) => a.bundleId));
  if (!ui.installed) { $('pickerList').replaceChildren(h('li', { class: 'muted' }, '…')); return; }
  const rows = ui.installed
    .filter((a) => a.kind !== 'browser' && !onList.has(a.bundleId) && !always.has(a.bundleId))
    .filter((a) => !q || (a.name || '').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'da'))
    .slice(0, 300);
  $('pickerList').replaceChildren(...rows.map((a) => h('li', {},
    h('button', {
      type: 'button', class: 'pick',
      onclick: async () => { if (await act(() => api.addApp(a.bundleId, addTargetList()))) $('addDlg').close(); },
    }, appIcon(a, 'glyph small'), h('span', { class: 'row-title' }, a.name)))));
}

function setupAdd() {
  for (const b of $('addKind').querySelectorAll('button')) b.onclick = () => setAddKind(b.dataset.kind);
  $('addClose').onclick = () => $('addDlg').close();
  $('addDlg').addEventListener('click', (e) => { if (e.target === $('addDlg')) $('addDlg').close(); });
  $('pickerSearch').addEventListener('input', renderPicker);
  $('addSite').addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = normalizeDomain($('siteDomain').value);
    if (!domain) { $('siteErr').textContent = 'Ugyldigt domæne'; $('siteErr').hidden = false; return; }
    const label = $('siteLabel').value.trim() || nameFromDomain(domain);
    if (await act(() => api.addSite(label, domain, addTargetList()))) {
      $('addDlg').close();
      requestIcon(domain);
    }
  });
}

// ---------- icons for own sites ----------

function setIcons(map) {
  ui.icons = map || {};
  ui.iconsRev++;
  ui.sigs.tiles = null;
  renderTiles();
}

/** Ask for an icon right after adding a site. The service worker skips blocked sites. */
function requestIcon(domain) {
  if (MOCK) { if (api.fetchIcon) api.fetchIcon(domain).then(() => setIcons(api.icons())).catch(() => {}); return; }
  if (HAS_EXT) chrome.runtime.sendMessage({ type: 'fetchIcon', domain }).catch(() => {});
}

async function setupIcons() {
  if (MOCK) {
    if (!api.icons) return;
    setIcons(api.icons());
    setInterval(() => { const m = api.icons(); if (JSON.stringify(m) !== JSON.stringify(ui.icons)) setIcons(m); }, 1000);
    return;
  }
  if (!HAS_EXT) return;
  try { setIcons((await chrome.storage.local.get('icons')).icons); } catch { /* none yet */ }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.icons) setIcons(changes.icons.newValue);
  });
}

// ---------- settings: Planlæg + always-closed apps ----------

function lockMark(tip = LOCK_TIP) { return h('span', { class: 'lock', title: tip, html: LOCK_ICON }); }

function renderPlanList(locked) {
  const now = Date.now();
  $('planList').replaceChildren(...schedules().map((sc) => h('li', { class: 'row' + (sc.enabled === false ? ' dim' : '') },
    h('span', { class: 'row-title' }, periodText(sc, lists(), now)),
    locked ? lockMark() : h('button', {
      type: 'button', class: 'icon-btn', 'aria-label': 'Slet', title: 'Slet', disabled: ui.busy,
      onclick: () => act(() => api.deleteSchedule(sc.id)),
    }, '×'))));
}

function renderAppList(locked) {
  const always = apps().filter((a) => a.blocked);
  $('appsSection').hidden = !always.length;
  $('appList').replaceChildren(...always.map((a) => {
    if (a.kind === 'browser') {
      return h('li', { class: 'row fixed', title: BROWSER_TIP },
        appIcon(a, 'glyph small'), h('span', { class: 'row-title' }, a.name || a.bundleId), lockMark(BROWSER_TIP));
    }
    return h('li', { class: 'row' },
      appIcon(a, 'glyph small'), h('span', { class: 'row-title' }, a.name || a.bundleId),
      locked ? lockMark() : h('button', {
        type: 'button', class: 'ghost small', disabled: ui.busy,
        onclick: () => act(() => api.setAppBlocked(a.bundleId, false)),
      }, 'Fjern'));
  }));
}

function renderPlanForm() {
  const p = ui.plan;
  for (const b of $('planKind').querySelectorAll('button')) b.classList.toggle('on', b.dataset.kind === p.kind);
  show('planDate', p.kind === 'date');
  show('planDays', p.kind === 'weekly');
  const now = Date.now();
  for (const b of $('planDate').querySelectorAll('[data-day]')) b.classList.toggle('on', p.date === cphDate(now, +b.dataset.day));
  $('planDateInput').min = cphDate(now, 0);
  if ($('planDateInput').value !== (p.date || '')) $('planDateInput').value = p.date || '';
  $('planDateInput').classList.toggle('on', !!p.date && p.date !== cphDate(now, 0) && p.date !== cphDate(now, 1));
  $('planDays').replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map((d) => {
    const on = p.weekdays.includes(d);
    return h('button', {
      type: 'button', class: 'day' + (on ? ' on' : ''), 'aria-pressed': String(on),
      onclick: () => { p.weekdays = on ? p.weekdays.filter((x) => x !== d) : [...p.weekdays, d].sort(); renderPlanForm(); },
    }, weekdayShort(d));
  }));
  if (!lists().some((l) => l.id === p.list)) p.list = ui.listId || pickList(lists(), null);
  const l = lists().find((x) => x.id === p.list);
  $('planListName').textContent = l ? l.name : '';
  // What this period will block, read-only.
  const mini = l ? [
    ...sites().filter((x) => l.sites.includes(x.id)).map((x) => [siteIcon(x, 'glyph small'), tileLabel(x.label)]),
    ...apps().filter((a) => l.apps.includes(a.bundleId)).map((a) => [appIcon(a, 'glyph small'), a.name]),
  ] : [];
  $('planIcons').replaceChildren(...mini.map(([icon, label]) => { icon.title = label; return icon; }));
  renderPlanTimes();
}

function renderPlanTimes() {
  const [sh, sm] = ui.plan.start.split(':');
  const [eh, em] = ui.plan.end.split(':');
  $('planSHVal').textContent = sh; $('planSMVal').textContent = sm;
  $('planEHVal').textContent = eh; $('planEMVal').textContent = em;
}

function renderPlanMenu() {
  const p = ui.plan;
  $('planListMenu').replaceChildren(...lists().map((l) => h('button', {
    type: 'button', role: 'menuitemradio', 'aria-checked': String(p.list === l.id), class: 'menu-item' + (p.list === l.id ? ' current' : ''),
    onclick: () => { p.list = l.id; planDD.close(true); renderPlanForm(); },
  }, h('span', { class: 'check' }, p.list === l.id ? '✓' : ''), l.name)));
}
let planDD = null;

function renderSettings() {
  if (!$('settings').open) return;
  const { locked } = lockInfo();
  const sig = JSON.stringify([locked, ui.busy, schedules(), lists().map((l) => [l.id, l.name]), apps()]);
  if (ui.sigs.settings === sig) return;
  ui.sigs.settings = sig;
  renderPlanList(locked);
  renderAppList(locked);
  if (!$('planForm').hidden) renderPlanForm();
}

function setupSettings() {
  const dlg = $('settings');
  $('gear').onclick = () => { ui.sigs.settings = null; dlg.showModal(); renderSettings(); };
  $('settingsClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  const form = $('planForm');
  const close = () => { form.hidden = true; $('addPlanBtn').hidden = false; $('planErr').hidden = true; };
  $('addPlanBtn').onclick = () => {
    ui.plan = { kind: 'date', date: cphDate(Date.now(), 1), weekdays: [1, 2, 3, 4, 5], list: ui.listId, start: '09:00', end: '12:00' };
    $('planErr').hidden = true;
    form.hidden = false;
    $('addPlanBtn').hidden = true;
    renderPlanForm();
  };
  for (const b of $('planKind').querySelectorAll('button')) b.onclick = () => { ui.plan.kind = b.dataset.kind; renderPlanForm(); };
  for (const b of $('planDate').querySelectorAll('[data-day]')) b.onclick = () => { ui.plan.date = cphDate(Date.now(), +b.dataset.day); renderPlanForm(); };
  $('planDateInput').addEventListener('change', () => { ui.plan.date = $('planDateInput').value || null; renderPlanForm(); });
  // Start/end: the same hour:minute pickers as "Indtil" (any time of day).
  const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad2(i) }));
  const MINS = MINUTE_STEPS.map((m) => ({ value: m, label: pad2(m) }));
  const part = (key, i) => +ui.plan[key].split(':')[i];
  const setPart = (key, i, v) => { const t = ui.plan[key].split(':'); t[i] = pad2(v); ui.plan[key] = t.join(':'); renderPlanTimes(); };
  for (const [id, key, i, opts, label] of [['planSH', 'start', 0, HOURS, 'Fra, time'], ['planSM', 'start', 1, MINS, 'Fra, minut'],
    ['planEH', 'end', 0, HOURS, 'Til, time'], ['planEM', 'end', 1, MINS, 'Til, minut']]) {
    combo({ root: $(id), button: $(id + 'Btn'), menu: $(id + 'Menu'), label,
      getOptions: () => opts, getValue: () => part(key, i), onSelect: (v) => setPart(key, i, v) });
  }
  form.querySelector('[data-cancel]').onclick = close;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = scheduleBody({ ...ui.plan }, Date.now());
    if (r.error) { $('planErr').textContent = r.error; $('planErr').hidden = false; return; }
    if (await act(() => api.addSchedule(r.body))) close();
  });
}

// ---------- alert / next ----------

function renderAlert() {
  const m = healthMessage(ui.view, Date.now());
  $('alert').textContent = m ? m.text : '';
  $('alert').title = m ? m.title : '';
  $('alert').hidden = !m;
}

function renderNext() {
  const ns = status() && status().nextSession;
  const { locked } = lockInfo();
  if (!ns || locked) { $('next').hidden = true; return; }
  const now = Date.now();
  const start = Date.parse(ns.start);
  const d = dayDiff(now, start);
  const day = d === 0 ? 'i dag' : d === 1 ? 'i morgen' : weekdayName(cphParts(start).weekday);
  const name = ns.listName || listName(ns.list);
  $('next').textContent = `Næste: ${day} ${formatClock(start)}${name ? ' · ' + name : ''}`;
  $('next').hidden = false;
}

// ---------- wiring ----------

function render() {
  const picked = pickList(lists(), ui.listId);
  if (picked !== ui.listId && picked) { ui.listId = picked; }
  renderAlert();
  renderHero();
  renderTiles();
  renderNext();
  renderSettings();
}

let refreshing = null;
async function refresh(force) {
  if (ui.edits && !force) return null; // don't overwrite an optimistic edit with an older status
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      ui.view = await backend.refresh();
    } catch (e) {
      ui.view = { ...(ui.view || {}), reachable: false, lastError: e.message };
    }
    render();
  })().finally(() => { refreshing = null; });
  return refreshing;
}

async function setup() {
  ui.listId = await loadLastList();
  setMinutes(60);
  ensureUntil();
  renderUntil();
  for (const b of $('modeSwitch').querySelectorAll('button')) b.onclick = () => setMode(b.dataset.mode);
  const cur = () => splitDuration(ui.minutes, maxMinutes());
  combo({ root: $('durH'), button: $('durHBtn'), menu: $('durHMenu'), label: 'Timer',
    getOptions: () => durHourOptions(maxMinutes()), getValue: () => cur().hours,
    onSelect: (h) => setDuration(h, cur().minutes) });
  combo({ root: $('durM'), button: $('durMBtn'), menu: $('durMMenu'), label: 'Minutter',
    getOptions: () => durMinuteOptions(cur().hours, maxMinutes()), getValue: () => cur().minutes,
    onSelect: (m) => setDuration(cur().hours, m) });
  combo({ root: $('untH'), button: $('untHBtn'), menu: $('untHMenu'), label: 'Indtil kl., time',
    getOptions: () => untilHourOptions(Date.now()), getValue: () => ui.until && ui.until.hour,
    onSelect: (hr) => { const m = fixUntilMinute(hr, ui.until ? ui.until.minute : 0, Date.now()); if (m != null) ui.until = { hour: hr, minute: m }; renderUntil(); tick(); } });
  combo({ root: $('untM'), button: $('untMBtn'), menu: $('untMMenu'), label: 'Indtil kl., minut',
    getOptions: () => (ui.until ? untilMinuteOptions(ui.until.hour, Date.now()) : []), getValue: () => ui.until && ui.until.minute,
    onSelect: (m) => { if (ui.until) ui.until = { hour: ui.until.hour, minute: m }; renderUntil(); tick(); } });
  $('big').addEventListener('click', () => { if ($('big').classList.contains('editable')) openCustom(); });
  $('big').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && $('big').classList.contains('editable')) { e.preventDefault(); openCustom(); } });

  listDD = dropdown({ root: $('listLine'), button: $('listBtn'), menu: $('listMenu'), render: () => { ui.menuAsk = false; renderMenu(); } });
  planDD = dropdown({ root: $('planDD'), button: $('planListBtn'), menu: $('planListMenu'), render: renderPlanMenu });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeMenu();
    if (ui.pendingAdd) { ui.pendingAdd = null; renderTapConfirm(); }
  });
  $('nameForm').addEventListener('submit', (e) => { e.preventDefault(); commitName('enter'); });
  $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); cancelNaming(); } });
  $('nameInput').addEventListener('blur', () => { commitName('blur'); });

  $('tapYes').onclick = (e) => {
    if (!confirmArmed(ui.shownAt.tap, performance.now(), e.detail)) return;
    const p = ui.pendingAdd;
    ui.pendingAdd = null;
    renderTapConfirm();
    if (p && lockInfo().locked) editList(p.list, p.kind, p.id, true);
  };
  $('tapNo').onclick = () => { ui.pendingAdd = null; renderTapConfirm(); };

  $('start').onclick = () => {
    if ($('start').disabled) return;
    ui.step = 'confirm';
    ui.editing = false;
    ui.sigs.tiles = null;
    ui.shownAt.lock = performance.now();
    renderHero();
    renderTiles();   // the confirmation is a read-only summary: no "Rediger" (design review round 3, R2)
    $('lockNow').focus();
  };
  $('back').onclick = () => { ui.step = 'idle'; ui.sigs.tiles = null; renderHero(); renderTiles(); };
  $('lockNow').onclick = async (e) => {
    if (!confirmArmed(ui.shownAt.lock, performance.now(), e.detail)) return;
    const list = ui.listId;
    let call;
    if (ui.mode === 'until') {
      const at = ui.until ? untilToday(Date.now(), untilText()) : null;
      if (at == null) { toast('Vælg et senere tidspunkt i dag.'); ui.step = 'idle'; renderHero(); return; }
      call = () => api.startUntil(isoUtc(at), list);
    } else {
      const minutes = ui.minutes;
      call = () => api.startSession(minutes, list);
    }
    if (list) saveLastList(list);
    if (await act(call)) ui.step = 'idle';
    renderHero();
  };
  $('extend').onclick = () => { ui.extendOpen = true; renderHero(); };
  $('extendBack').onclick = () => { ui.extendOpen = false; renderHero(); };
  $('extendNow').onclick = async () => {
    const { until } = lockInfo();
    const t = until && extendTarget(until);
    if (!t) return;
    // Pass a list already in force: without one the daemon would add its first list to the lock.
    const list = lockedTarget(activeListIds(), ui.listId) || undefined;
    if (await act(() => api.startSession(t.minutes, list))) ui.extendOpen = false;
    renderHero();
  };
  setupAdd();
  setupSettings();
  setupIcons();

  render();
  refresh();
  setInterval(refresh, 5000);
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

setup();
