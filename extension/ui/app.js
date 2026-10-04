// Control page. Changes go to the daemon; the enforced state comes from the service worker.
// The dev mock (?mock=1) only works when the page is served outside the extension
// (no chrome.runtime.id), so no production path can reach it — and pack.sh leaves dev/ out.

import { createApi } from '../lib/api.js';
import {
  formatClock, formatCountdown, formatDuration, weekdayShort, weekdayName, dayDiff, cphParts,
  shortWhen, isoUtc, untilToday, defaultUntil, parseHHMM,
} from '../lib/time.js';
import { normalizeDomain } from '../lib/domains.js';
import { glyphFor, LOCK_ICON, monogramColor } from './glyphs.js';

const params = new URLSearchParams(location.search);
const HAS_EXT = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
const MOCK = !HAS_EXT && params.get('mock') === '1';
const LOCK_TIP = 'Kan ikke ændres under en aktiv session';
const PRESETS = [25, 50, 60, 120, 240];
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

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private window etc. */ } },
};

const ui = {
  view: null,
  mode: store.get('li.mode') === 'until' ? 'until' : 'dur',
  minutes: 60,
  step: 'idle',        // idle | confirm
  extendOpen: false,
  extendAdd: 60,
  busy: false,
  editingSched: null,
  installed: null,
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
function toast(msg, kind = 'err') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
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
    await refresh();
    return true;
  } catch (e) {
    toast(e && e.message ? e.message : 'Noget gik galt');
    await refresh();
    return false;
  } finally {
    ui.busy = false;
    document.body.classList.remove('busy');
  }
}

const status = () => (ui.view && ui.view.status) || null;
const sites = () => (status() && status().sites) || [];
const apps = () => (status() && status().apps) || [];
const schedules = () => (status() && status().schedules) || [];
const maxMinutes = () => (status() && status().maxSessionMinutes) || 1440;
const reachable = () => !!(ui.view && ui.view.reachable);

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
  if (ui.mode === 'until') return untilToday(now, parseHHMM($('untilTime').value));
  return now + ui.minutes * 60000;
}

function extendTarget(until, now = Date.now()) {
  const remaining = Math.max(0, Math.ceil((until - now) / 60000));
  const minutes = Math.min(maxMinutes(), remaining + ui.extendAdd);
  return { minutes, end: Math.max(until, now + minutes * 60000) };
}

// ---------- hero ----------

function renderPresets() {
  $('presets').replaceChildren(...PRESETS.map((m) => h('button', {
    type: 'button', class: 'chip' + (ui.minutes === m ? ' on' : ''), 'aria-pressed': String(ui.minutes === m),
    onclick: () => setMinutes(m),
  }, formatDuration(m))));
}

function setMinutes(m, fromInputs) {
  ui.minutes = Math.max(1, Math.min(maxMinutes(), Math.round(m) || 0));
  if (!fromInputs) {
    $('hours').value = Math.floor(ui.minutes / 60);
    $('mins').value = ui.minutes % 60;
  }
  renderPresets();
  tick();
}

function onCustomInput() {
  const hrs = Math.max(0, Math.min(24, parseInt($('hours').value, 10) || 0));
  let mins = Math.max(0, Math.min(59, parseInt($('mins').value, 10) || 0));
  if (hrs === 24) mins = 0;
  setMinutes(hrs * 60 + mins, true);
}

function setMode(mode) {
  ui.mode = mode;
  store.set('li.mode', mode);
  if (mode === 'until' && untilToday(Date.now(), parseHHMM($('untilTime').value)) == null) {
    const d = defaultUntil(Date.now());
    if (d) $('untilTime').value = d;
  }
  renderHero();
}

function renderHero() {
  const { locked } = lockInfo();
  const confirm = !locked && ui.step === 'confirm';
  const idle = !locked && !confirm;
  if (!locked) ui.extendOpen = false;

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
  show('extend', locked && !ui.extendOpen);
  show('extendPanel', locked && ui.extendOpen);
  document.body.classList.toggle('is-locked', locked);

  $('lockNow').disabled = !reachable();
  $('extend').disabled = !reachable();
  if (ui.extendOpen) {
    $('extendChips').replaceChildren(...EXTEND_PRESETS.map((m) => h('button', {
      type: 'button', class: 'chip' + (ui.extendAdd === m ? ' on' : ''), 'aria-pressed': String(ui.extendAdd === m),
      onclick: () => { ui.extendAdd = m; renderHero(); },
    }, '+ ' + formatDuration(m))));
  }
  tick();
}

let lastLocked = null;
function tick() {
  const now = Date.now();
  const { locked, until } = lockInfo();
  if (lastLocked !== null && lastLocked !== locked) {
    lastLocked = locked;
    render();
    refresh();
    return;
  }
  lastLocked = locked;

  const big = $('big');
  const sub = $('sub');
  if (locked) {
    big.textContent = formatCountdown(until - now);
    big.classList.remove('dim');
    sub.textContent = `Låst til ${shortWhen(now, until)}`;
    sub.hidden = false;
    document.title = `${formatCountdown(until - now)} · Locked in`;
    if (ui.extendOpen) {
      const t = extendTarget(until, now);
      const can = t.end > until + 30000;
      $('extendNow').textContent = can ? `Forlæng til ${shortWhen(now, t.end)}` : 'Maks 24 t';
      $('extendNow').disabled = !can || !reachable();
    }
    return;
  }

  document.title = 'Locked in';
  const end = plannedEnd(now);
  big.textContent = formatCountdown(end == null ? 0 : end - now);
  big.classList.toggle('dim', end == null);
  $('untilErr').hidden = !(ui.mode === 'until' && end == null && $('untilTime').value !== '');
  $('start').disabled = !reachable() || end == null;
  if (ui.step === 'confirm') {
    if (end == null) { ui.step = 'idle'; renderHero(); return; }
    sub.textContent = `Låst til ${shortWhen(now, end)} · kan ikke stoppes`;
    sub.hidden = false;
  } else {
    sub.hidden = true;
  }
}

// ---------- alert / next ----------

function renderAlert() {
  const v = ui.view;
  let msg = '';
  if (v && !v.reachable) {
    msg = 'Locked in-tjenesten svarer ikke';
  } else if (v && v.status) {
    const e = v.status.enforcement || {};
    const broken = [e.hosts === false && 'hosts', e.pf === false && 'netværksfilter', e.appControl === false && 'app-kontrol'].filter(Boolean);
    const tickAt = e.lastTick ? Date.parse(e.lastTick) : null;
    if (broken.length) msg = `Virker ikke: ${broken.join(', ')}`;
    else if (tickAt && Date.now() - tickAt > 120000) msg = `Tjenesten har ikke tjekket siden ${formatClock(tickAt)}`;
  }
  $('alert').textContent = msg;
  $('alert').hidden = !msg;
}

function renderNext() {
  const ns = status() && status().nextSession;
  const { locked } = lockInfo();
  if (!ns || locked) { $('next').hidden = true; return; }
  const now = Date.now();
  const start = Date.parse(ns.start);
  const d = dayDiff(now, start);
  const day = d === 0 ? 'i dag' : d === 1 ? 'i morgen' : weekdayName(cphParts(start).weekday);
  $('next').textContent = `Næste: ${day} ${formatClock(start)}`;
  $('next').hidden = false;
}

// ---------- site tiles ----------

function siteIcon(site, cls = 'glyph') {
  const glyph = glyphFor(site);
  if (glyph) return h('span', { class: cls, html: glyph });
  const el = h('span', { class: cls + ' mono' }, (site.label || site.id || '?').trim().charAt(0).toUpperCase());
  el.style.background = monogramColor(site.id || site.label);
  return el;
}

function renderTiles() {
  const { locked } = lockInfo();
  const list = locked ? sites().filter((s) => s.blocked) : sites();
  const sig = JSON.stringify([locked, ui.busy, list.map((s) => [s.id, s.label, s.blocked])]);
  if (ui.sigs.tiles === sig) return;
  ui.sigs.tiles = sig;
  const ordered = [...list.filter((s) => s.builtin), ...list.filter((s) => !s.builtin)];
  $('tiles').replaceChildren(...ordered.map((s) => {
    const cls = 'tile' + (s.blocked ? ' on' : ' off');
    const inner = [siteIcon(s), h('span', { class: 'tile-label' }, s.label || s.id)];
    if (locked) return h('div', { class: cls }, inner);
    return h('button', {
      type: 'button', class: cls, disabled: ui.busy, 'aria-pressed': String(!!s.blocked),
      title: s.blocked ? `${s.label}: blokeret` : `${s.label}: tilladt`,
      onclick: () => act(() => api.setSiteBlocked(s.id, !s.blocked)),
    }, inner);
  }));
}

// ---------- settings ----------

function lockMark() { return h('span', { class: 'lock', title: LOCK_TIP, html: LOCK_ICON }); }

function toggle(on, attrs) {
  return h('button', { type: 'button', role: 'switch', 'aria-checked': String(!!on), class: 'switch' + (on ? ' on' : ''), ...attrs },
    h('span', { class: 'knob' }));
}

/** Trailing control: delete button, or a lock while a session runs. */
function trailing(locked, label, onDelete) {
  if (locked) return lockMark();
  if (!onDelete) return h('span', { class: 'spacer' });
  return h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Fjern ${label}`, title: 'Fjern', disabled: ui.busy, onclick: onDelete }, '×');
}

function renderSiteList(locked) {
  $('siteList').replaceChildren(...sites().map((s) => h('li', { class: 'row' },
    siteIcon(s, 'glyph small'),
    h('span', { class: 'row-title' }, s.label || s.id),
    toggle(s.blocked, {
      disabled: (locked && s.blocked) || ui.busy, title: locked && s.blocked ? LOCK_TIP : null, 'aria-label': `Bloker ${s.label}`,
      onclick: () => act(() => api.setSiteBlocked(s.id, !s.blocked)),
    }),
    trailing(locked && (s.blocked || !s.builtin), s.label, s.builtin ? null : () => act(() => api.deleteSite(s.id))),
  )));
}

const BROWSER_TIP = 'Andre browsere lukkes altid under fokus';

function renderAppList(locked) {
  $('appList').replaceChildren(...apps().map((a) => {
    // Other browsers are always closed during a session: no choice offered.
    if (a.kind === 'browser') {
      return h('li', { class: 'row fixed', title: BROWSER_TIP },
        h('span', { class: 'app-ic' }, (a.name || '?').charAt(0).toUpperCase()),
        h('span', { class: 'row-title' }, a.name || a.bundleId),
        toggle(true, { disabled: true, 'aria-label': `${a.name}: ${BROWSER_TIP}` }),
        h('span', { class: 'lock', html: LOCK_ICON }));
    }
    return h('li', { class: 'row' },
      h('span', { class: 'app-ic' }, (a.name || '?').charAt(0).toUpperCase()),
      h('span', { class: 'row-title' }, a.name || a.bundleId),
      toggle(a.blocked, {
        disabled: (locked && a.blocked) || ui.busy, title: locked && a.blocked ? LOCK_TIP : null, 'aria-label': `Bloker ${a.name}`,
        onclick: () => act(() => api.setAppBlocked(a.bundleId, !a.blocked)),
      }),
      trailing(locked, a.name, () => act(() => api.deleteApp(a.bundleId))));
  }));
}

function daysText(days) {
  const d = [...new Set(days || [])].sort((a, b) => a - b);
  if (d.length === 7) return 'Alle dage';
  const run = d.length >= 3 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return run ? `${weekdayShort(d[0])}–${weekdayShort(d[d.length - 1])}` : d.map(weekdayShort).join(', ');
}

function renderSchedList(locked) {
  $('schedList').replaceChildren(...schedules().map((sc) => h('li', { class: 'row' + (sc.enabled ? '' : ' dim') },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, sc.name || 'Fast tid'),
      h('span', { class: 'row-sub' }, `${daysText(sc.weekdays)} · ${sc.start}–${sc.end}`)),
    locked ? null : h('button', { type: 'button', class: 'icon-btn text', disabled: ui.busy, onclick: () => openSchedForm(sc) }, 'Ret'),
    toggle(sc.enabled, {
      disabled: locked || ui.busy, title: locked ? LOCK_TIP : null, 'aria-label': `${sc.name} aktiv`,
      onclick: () => act(() => api.putSchedule(sc.id, { name: sc.name, weekdays: sc.weekdays, start: sc.start, end: sc.end, enabled: !sc.enabled })),
    }),
    trailing(locked, sc.name, () => act(() => api.deleteSchedule(sc.id))),
  )));
}

function renderSettings() {
  if (!$('settings').open) return;
  const { locked } = lockInfo();
  const sig = JSON.stringify([locked, ui.busy, sites(), apps(), schedules()]);
  if (ui.sigs.settings === sig) return;
  ui.sigs.settings = sig;
  renderSiteList(locked);
  renderAppList(locked);
  renderSchedList(locked);
  renderPicker();
}

function setupAddSite() {
  const form = $('addSite');
  const close = () => { form.hidden = true; $('addSiteBtn').hidden = false; form.reset(); $('siteErr').hidden = true; };
  $('addSiteBtn').onclick = () => { form.hidden = false; $('addSiteBtn').hidden = true; $('siteLabel').focus(); };
  form.querySelector('[data-cancel]').onclick = close;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const domain = normalizeDomain($('siteDomain').value);
    if (!domain) { $('siteErr').textContent = 'Ugyldigt domæne'; $('siteErr').hidden = false; return; }
    const label = $('siteLabel').value.trim() || domain;
    if (await act(() => api.addSite(label, domain))) close();
  });
}

function closePicker() { $('picker').hidden = true; $('addAppBtn').hidden = false; }

function renderPicker() {
  if ($('picker').hidden) return;
  const q = $('pickerSearch').value.trim().toLowerCase();
  const have = new Set(apps().map((a) => a.bundleId));
  if (!ui.installed) { $('pickerList').replaceChildren(h('li', { class: 'muted' }, '…')); return; }
  const list = ui.installed
    .filter((a) => !have.has(a.bundleId) && a.kind !== 'browser')
    .filter((a) => !q || (a.name || '').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'da'))
    .slice(0, 300);
  $('pickerList').replaceChildren(...list.map((a) => h('li', {},
    h('button', {
      type: 'button', class: 'pick',
      onclick: async () => { if (await act(() => api.addApp(a.bundleId))) closePicker(); },
    }, h('span', { class: 'app-ic' }, (a.name || '?').charAt(0).toUpperCase()), h('span', { class: 'row-title' }, a.name)))));
}

function setupPicker() {
  $('addAppBtn').onclick = async () => {
    $('pickerSearch').value = '';
    $('picker').hidden = false;
    $('addAppBtn').hidden = true;
    renderPicker();
    $('pickerSearch').focus();
    try {
      const res = await api.installed();
      ui.installed = Array.isArray(res) ? res : (res && res.apps) || [];
    } catch (e) {
      ui.installed = [];
      toast(e.message);
    }
    renderPicker();
  };
  $('pickerSearch').addEventListener('input', renderPicker);
  $('pickerClose').onclick = closePicker;
}

let formDays = [];
function renderFormDays() {
  $('schedDays').replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map((d) => {
    const on = formDays.includes(d);
    return h('button', {
      type: 'button', class: 'day' + (on ? ' on' : ''), 'aria-pressed': String(on),
      onclick: () => { formDays = on ? formDays.filter((x) => x !== d) : [...formDays, d].sort(); renderFormDays(); },
    }, weekdayShort(d));
  }));
}

function openSchedForm(sc) {
  ui.editingSched = sc || 'new';
  $('schedName').value = sc ? sc.name : '';
  $('schedStart').value = sc ? sc.start : '09:00';
  $('schedEnd').value = sc ? sc.end : '12:00';
  formDays = sc ? [...sc.weekdays] : [1, 2, 3, 4, 5];
  $('schedSave').textContent = sc ? 'Gem' : 'Tilføj';
  $('schedErr').hidden = true;
  renderFormDays();
  $('schedForm').hidden = false;
  $('addSchedBtn').hidden = true;
  $('schedName').focus();
}

function setupSchedForm() {
  const form = $('schedForm');
  const close = () => { form.hidden = true; $('addSchedBtn').hidden = false; ui.editingSched = null; };
  $('addSchedBtn').onclick = () => openSchedForm(null);
  form.querySelector('[data-cancel]').onclick = close;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const editing = ui.editingSched;
    const body = {
      name: $('schedName').value.trim(),
      weekdays: formDays,
      start: parseHHMM($('schedStart').value) || '',
      end: parseHHMM($('schedEnd').value) || '',
      enabled: editing === 'new' ? true : !!editing.enabled,
    };
    const err = !body.name ? 'Mangler navn'
      : !body.weekdays.length ? 'Vælg mindst én dag'
        : !/^\d{2}:\d{2}$/.test(body.start) || !/^\d{2}:\d{2}$/.test(body.end) ? 'Vælg tidspunkter'
          : body.start === body.end ? 'Start og slut er ens' : '';
    if (err) { $('schedErr').textContent = err; $('schedErr').hidden = false; return; }
    const ok = await act(() => (editing === 'new' ? api.addSchedule(body) : api.putSchedule(editing.id, body)));
    if (ok) close();
  });
}

function setupSettings() {
  const dlg = $('settings');
  $('gear').onclick = () => { ui.sigs.settings = null; dlg.showModal(); renderSettings(); };
  $('settingsClose').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  setupAddSite();
  setupPicker();
  setupSchedForm();
}

// ---------- wiring ----------

function render() {
  renderAlert();
  renderHero();
  renderTiles();
  renderNext();
  renderSettings();
}

let refreshing = null;
async function refresh() {
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

function setup() {
  setMinutes(60);
  const d = defaultUntil(Date.now());
  if (d) $('untilTime').value = d;
  for (const b of $('modeSwitch').querySelectorAll('button')) b.onclick = () => setMode(b.dataset.mode);
  $('hours').addEventListener('input', onCustomInput);
  $('mins').addEventListener('input', onCustomInput);
  for (const id of ['hours', 'mins']) $(id).addEventListener('change', () => setMinutes(ui.minutes));
  $('untilTime').addEventListener('input', tick);
  for (const id of ['untilTime', 'schedStart', 'schedEnd']) {
    $(id).addEventListener('change', () => { const v = parseHHMM($(id).value); if (v) $(id).value = v; tick(); });
  }
  $('untilTime').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('start').click(); });

  $('start').onclick = () => { if (plannedEnd() != null) { ui.step = 'confirm'; renderHero(); $('lockNow').focus(); } };
  $('back').onclick = () => { ui.step = 'idle'; renderHero(); };
  $('lockNow').onclick = async () => {
    let call;
    if (ui.mode === 'until') {
      const at = untilToday(Date.now(), parseHHMM($('untilTime').value));
      if (at == null) { toast('Vælg et senere tidspunkt i dag.'); ui.step = 'idle'; renderHero(); return; }
      call = () => api.startUntil(isoUtc(at));
    } else {
      const minutes = ui.minutes;
      call = () => api.startSession(minutes);
    }
    if (await act(call)) ui.step = 'idle';
    renderHero();
  };
  $('extend').onclick = () => { ui.extendOpen = true; renderHero(); };
  $('extendBack').onclick = () => { ui.extendOpen = false; renderHero(); };
  $('extendNow').onclick = async () => {
    const { until } = lockInfo();
    if (!until) return;
    if (await act(() => api.startSession(extendTarget(until).minutes))) ui.extendOpen = false;
    renderHero();
  };
  setupSettings();

  render();
  refresh();
  setInterval(refresh, 5000);
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
}

setup();
