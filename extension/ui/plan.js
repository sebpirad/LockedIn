// "Plan": a read-only week strip (optional mouse drag to start a new period) over the list of
// periods. Tapping a row edits it in place. Only periods in the running lock are frozen.

import { cphParts, formatClock, shortWhen, dayDiff, weekdayName } from '../lib/time.js';
import { cphDate, dateTimeInstant, dateText, periodText, scheduleBody, occurrences, chainEnd, day3, assignLanes } from '../lib/plan.js';
import { MINUTE_STEPS } from '../lib/clock.js';
import { confirmArmed } from '../lib/view.js';
import { combo } from './combo.js';
import { dropdown } from './dropdown.js';

const DAY = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');
const LOCK_TIP = 'Kan ikke ændres under en aktiv session';
const CARET = '<svg class="caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV = '<svg viewBox="0 0 8 12" aria-hidden="true" width="8" height="12"><path d="M2 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// List colours for dots and week blocks (≥ 3:1 on the dark surfaces).
const TINTS = ['#8fb3ff', '#6fd3b5', '#e59cff', '#ffad7a', '#9ad86a', '#ff8fa3'];

export function createPlan(ctx) {
  const { api, act, toast, h, $, lockInfo, siteIcon, appIcon, LOCK_ICON } = ctx;
  const S = () => ctx.status() || {};
  const schedules = () => S().schedules || [];
  const lists = () => S().lists || [];
  const listName = (id) => (lists().find((l) => l.id === id) || {}).name || '';
  const tint = (id) => TINTS[Math.max(0, lists().findIndex((l) => l.id === id)) % TINTS.length];
  const dlg = $('planDlg');

  let weekOffset = 0;
  let openKey = null;      // null | 'new' | schedule id
  let card = null;         // the open editor
  let undoTimer = null;

  const store = {
    get() { try { return JSON.parse(localStorage.getItem('li.lastTimes') || 'null'); } catch { return null; } },
    set(v) { try { localStorage.setItem('li.lastTimes', JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- open / close ----------

  function open(id = null, date = null) {
    if (!dlg.open) dlg.showModal();
    if (id && schedules().some((s) => s.id === id && !s.frozen)) openCard(id, date);
    else if (!id && !schedules().length) openCard('new');
    else closeCard();
    render();
    if (!card) $('newPeriod').focus();
  }

  dlg.addEventListener('close', () => { closeCard(); });
  // Esc closes the open card first, then the panel.
  dlg.addEventListener('cancel', (e) => { if (card) { e.preventDefault(); closeCard(); render(); $('newPeriod').focus(); } });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('planClose').onclick = () => dlg.close();
  $('newPeriod').onclick = () => { openCard('new'); render(); };
  $('weekPrev').onclick = () => { weekOffset = Math.max(0, weekOffset - 1); renderWeek(); };
  $('weekNext').onclick = () => { weekOffset = Math.min(3, weekOffset + 1); renderWeek(); };

  // ---------- week strip ----------

  // Seven days from today (‹ › move a week), so the strip always starts with what is coming.
  function weekStart(now) {
    return cphDate(now, 7 * weekOffset);
  }

  function renderWeek() {
    const now = Date.now();
    const first = weekStart(now);
    const days = Array.from({ length: 7 }, (_, i) => cphDate(Date.parse(first + 'T12:00:00Z'), i));
    const from = dateTimeInstant(days[0], '00:00');
    const to = dateTimeInstant(cphDate(Date.parse(days[6] + 'T12:00:00Z'), 1), '00:00');
    const occ = occurrences(schedules(), from, to);
    const { until } = lockInfo();
    $('weekPrev').disabled = weekOffset <= 0;
    $('weekNext').disabled = weekOffset >= 3;
    $('weekRows').replaceChildren(...days.map((d) => {
      const d0 = dateTimeInstant(d, '00:00');
      const d1 = dateTimeInstant(cphDate(Date.parse(d + 'T12:00:00Z'), 1), '00:00');
      const len = d1 - d0;
      const rail = h('div', { class: 'rail', 'data-date': d });
      const todays = occ.filter((o) => o.end > d0 && o.start < d1).map((o) => ({ o, start: Math.max(o.start, d0), end: Math.min(o.end, d1) }));
      // Overlapping periods sit in lanes, so none hides another.
      for (const { o, start: a, end: b, lane, lanes } of assignLanes(todays)) {
        const frozen = !!o.sc.frozen && until && o.start < until;
        const label = `${periodText(o.sc, lists(), now)}${o.skipped ? ' · springes over' : ''}`;
        const blk = h('button', {
          type: 'button', class: 'blk' + (o.skipped ? ' skipped' : '') + (frozen ? ' frozen' : '') + (o.end <= now ? ' past' : ''),
          tabindex: '-1', // the rows below are the keyboard path
          'aria-label': `${dateText(now, o.date)}: ${label}`, title: frozen ? LOCK_TIP : label,
          'aria-disabled': frozen ? 'true' : null,
          onclick: (e) => { e.stopPropagation(); if (!frozen) { openCard(o.sc.id, o.date); render(); } },
        });
        blk.style.left = `${((a - d0) / len) * 100}%`;
        blk.style.width = `${Math.max(1.2, ((b - a) / len) * 100)}%`;
        blk.style.setProperty('--tint', tint(o.sc.list));
        if (lanes > 1) {
          // hit area: an equal share of the 40 px row; bar: an equal share of a 24 px band
          blk.style.top = `${(lane * 40) / lanes}px`;
          blk.style.height = `${40 / lanes}px`;
          blk.style.setProperty('--bar-top', `${8 + (lane * 24) / lanes - (lane * 40) / lanes + 1}px`);
          blk.style.setProperty('--bar-h', `${24 / lanes - 2}px`);
          blk.dataset.lane = String(lane);
        }
        rail.append(blk);
      }
      if (now >= d0 && now < d1) {
        const n = h('span', { class: 'now' });
        n.style.left = `${((now - d0) / len) * 100}%`;
        rail.append(n);
      }
      wireDrag(rail, d, d0, len);
      const today = dayDiff(now, d0 + DAY / 2) === 0;
      return h('div', { class: 'wrow' + (today ? ' today' : '') },
        h('span', { class: 'wday' }, `${day3(cphParts(d0 + DAY / 2).weekday)} ${+d.slice(8)}.`), rail);
    }));
  }

  // Optional accelerator, mouse only: drag across a day to start a new period. A click does nothing.
  function wireDrag(rail, date, d0, len) {
    let startX = null, ghost = null;
    const snap = (x) => {
      const r = rail.getBoundingClientRect();
      const min = Math.round((Math.max(0, Math.min(1, (x - r.left) / r.width)) * 24 * 60) / 15) * 15;
      return Math.min(24 * 60 - 15, min);
    };
    const reset = () => { startX = null; if (ghost) { ghost.remove(); ghost = null; } };
    rail.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || e.target !== rail) return;
      startX = e.clientX;
      rail.setPointerCapture(e.pointerId);
    });
    rail.addEventListener('pointermove', (e) => {
      if (startX == null) return;
      const a = snap(Math.min(startX, e.clientX)), b = Math.max(a + 15, snap(Math.max(startX, e.clientX)));
      if (!ghost) { ghost = h('span', { class: 'ghost' }); rail.append(ghost); }
      ghost.style.left = `${(a / 1440) * 100}%`;
      ghost.style.width = `${((b - a) / 1440) * 100}%`;
    });
    rail.addEventListener('pointerup', (e) => {
      if (startX == null) return;
      const moved = Math.abs(e.clientX - startX) > 6;
      const a = snap(Math.min(startX, e.clientX)), b = Math.max(a + 15, snap(Math.max(startX, e.clientX)));
      reset();
      if (!moved) return;
      const t = (m) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;
      openCard('new', null, { kind: 'date', date, start: t(a), end: t(b >= 1440 ? 0 : b) });
      render();
    });
    rail.addEventListener('pointercancel', reset);
    rail.addEventListener('lostpointercapture', () => { if (startX != null) reset(); });
  }

  // ---------- rows ----------

  function rowFor(sc, now) {
    if (openKey === sc.id && card) return h('li', { class: 'pcard-li' }, card.el);
    const { until } = lockInfo();
    const frozen = !!sc.frozen && !!until;
    const skipped = (sc.skip || []).filter((d) => d >= cphDate(now, 0) && d <= cphDate(now, 14)).sort();
    const parts = [
      h('span', { class: 'prow-when' }, periodText(sc, [], now)),
      h('span', { class: 'prow-list' }, dot(sc.list), h('span', {}, listName(sc.list))),
      skipped.length ? h('span', { class: 'prow-skips' }, ...skipped.map((d) => h('s', {}, dateText(now, d)))) : null,
      frozen
        ? h('span', { class: 'prow-end locked' }, h('span', { html: LOCK_ICON }), `Låst til ${shortWhen(now, until)}`)
        : h('span', { class: 'prow-end', html: CHEV }),
    ];
    if (frozen) return h('li', { class: 'prow frozen', title: LOCK_TIP }, h('div', { class: 'prow-btn' }, parts));
    return h('li', { class: 'prow' + (sc.enabled === false ? ' dim' : '') },
      h('button', { type: 'button', class: 'prow-btn', onclick: () => { openCard(sc.id); render(); } }, parts));
  }

  function dot(listId) {
    const el = h('span', { class: 'dot' });
    el.style.background = tint(listId);
    return el;
  }

  function sortKey(sc, now) {
    const o = occurrences([sc], now, now + 15 * DAY).find((x) => !x.skipped && x.end > now);
    return o ? o.start : Infinity;
  }

  let frozenOrder = null; // row order is kept while a card is open, so nothing jumps under the pointer
  function render() {
    if (!dlg.open) return;
    const now = Date.now();
    renderWeek();
    if (card) card.refresh();
    let ordered = [...schedules()].sort((a, b) => sortKey(a, now) - sortKey(b, now));
    if (card) {
      if (!frozenOrder) frozenOrder = ordered.map((x) => x.id);
      const pos = (id) => { const i = frozenOrder.indexOf(id); return i < 0 ? Infinity : i; };
      ordered = ordered.sort((a, b) => pos(a.id) - pos(b.id));
    } else {
      frozenOrder = null;
    }
    const rows = ordered.map((sc) => rowFor(sc, now));
    $('planNewSlot').replaceChildren(...(openKey === 'new' && card ? [card.el] : []));
    $('newPeriod').hidden = openKey === 'new';
    $('planList').replaceChildren(...rows);
  }

  // ---------- the editor card ----------

  function closeCard() {
    if (card) card.destroy();
    card = null;
    openKey = null;
  }

  function openCard(key, ctxDate = null, prefill = null) {
    closeCard();
    const now = Date.now();
    let draft;
    let existing = null;
    if (key === 'new') {
      const last = store.get() || { start: '09:00', end: '12:00' };
      draft = { kind: 'date', date: cphDate(now, 1), weekdays: [1, 2, 3, 4, 5], start: last.start, end: last.end, list: ctx.currentListId() || (lists()[0] || {}).id, ...(prefill || {}) };
    } else {
      existing = schedules().find((s) => s.id === key);
      if (!existing) return;
      draft = {
        kind: existing.date ? 'date' : 'weekly', date: existing.date || cphDate(now, 1),
        weekdays: existing.date ? [1, 2, 3, 4, 5] : [...(existing.weekdays || [])],
        start: existing.start, end: existing.end, list: existing.list,
      };
    }
    openKey = key;
    card = makeCard(draft, existing, ctxDate);
  }

  function makeCard(draft, existing, ctxDate) {
    const destroyers = [];
    let pick = !(isToday(draft) || isTomorrow(draft) || isWeekdays(draft));
    let saveShownAt = 0;
    let lastSaveLabel = '';

    function isToday(d) { return d.kind === 'date' && d.date === cphDate(Date.now(), 0); }
    function isTomorrow(d) { return d.kind === 'date' && d.date === cphDate(Date.now(), 1); }
    function isWeekdays(d) { return d.kind === 'weekly' && d.weekdays.join() === '1,2,3,4,5'; }

    const chip = (label, onclick) => h('button', { type: 'button', class: 'chip', onclick }, label);
    const cToday = chip('I dag', () => {
      draft.kind = 'date'; draft.date = cphDate(Date.now(), 0); pick = false;
      // A start that has already passed today moves to the next quarter hour (same length).
      const now = Date.now();
      const at = dateTimeInstant(draft.date, draft.start);
      if (at != null && at <= now + 60000) {
        const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3);
        const len = ((toMin(draft.end) - toMin(draft.start)) + 1440) % 1440 || 60;
        const p = cphParts(now);
        const st = Math.min(23 * 60 + 45, Math.ceil((p.hour * 60 + p.minute + 1) / 15) * 15);
        const en = (st + len) % 1440;
        draft.start = `${pad2(Math.floor(st / 60))}:${pad2(st % 60)}`;
        draft.end = `${pad2(Math.floor(en / 60))}:${pad2(en % 60)}`;
      }
      refresh();
    });
    const cTomorrow = chip('I morgen', () => { draft.kind = 'date'; draft.date = cphDate(Date.now(), 1); pick = false; refresh(); });
    const cWeekdays = chip('Hverdage', () => { draft.kind = 'weekly'; draft.weekdays = [1, 2, 3, 4, 5]; pick = false; refresh(); });
    const cPick = chip('Vælg…', () => { pick = true; refresh(); });
    const when = h('div', { class: 'chips left', role: 'group', 'aria-label': 'Hvornår' }, cToday, cTomorrow, cWeekdays, cPick);

    const dayBtns = [1, 2, 3, 4, 5, 6, 7].map((d) => h('button', {
      type: 'button', class: 'day', 'aria-pressed': 'false',
      onclick: () => {
        if (draft.kind !== 'weekly') { draft.kind = 'weekly'; draft.weekdays = []; }
        draft.weekdays = draft.weekdays.includes(d) ? draft.weekdays.filter((x) => x !== d) : [...draft.weekdays, d].sort();
        refresh();
      },
    }, ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'][d - 1]));
    const onceChip = chip('Kun én dato', () => { draft.kind = 'date'; if (!draft.date) draft.date = cphDate(Date.now(), 1); refresh(); dateInput.focus(); });
    const dateInput = h('input', { type: 'date', class: 'date-in', 'aria-label': 'Dato' });
    dateInput.addEventListener('change', () => { if (dateInput.value) { draft.kind = 'date'; draft.date = dateInput.value; refresh(); } });
    const pickPanel = h('div', { class: 'pick-panel' }, h('div', { class: 'days', role: 'group', 'aria-label': 'Ugedage' }, dayBtns), h('div', { class: 'chips left' }, onceChip, dateInput));

    // times: [HH ▾]:[MM ▾] – [HH ▾]:[MM ▾]
    const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad2(i) }));
    const MINS = MINUTE_STEPS.map((m) => ({ value: m, label: pad2(m) }));
    const valEls = {};
    function picker(key, i, label) {
      const val = h('span', {});
      valEls[key + i] = val;
      const btn = h('button', { type: 'button', class: 'select-btn compact', html: '' }, val);
      btn.insertAdjacentHTML('beforeend', CARET);
      const menu = h('div', { class: 'menu combo-menu', hidden: true });
      const root = h('div', { class: 'dd clock' }, btn, menu);
      const c = combo({
        root, button: btn, menu, label,
        getOptions: () => (i === 0 ? HOURS : MINS),
        getValue: () => +draft[key].split(':')[i],
        onSelect: (v) => { const t = draft[key].split(':'); t[i] = pad2(v); draft[key] = t.join(':'); refresh(); },
      });
      destroyers.push(c.destroy);
      return root;
    }
    const sep = (t) => h('span', { class: 'sep' }, t);
    const times = h('div', { class: 'clock-row left' },
      picker('start', 0, 'Fra, time'), sep(':'), picker('start', 1, 'Fra, minut'), sep('–'),
      picker('end', 0, 'Til, time'), sep(':'), picker('end', 1, 'Til, minut'));

    // list dropdown + what it blocks
    const lName = h('span', {});
    const lBtn = h('button', { type: 'button', class: 'select-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Liste' }, lName);
    lBtn.insertAdjacentHTML('beforeend', CARET);
    const lMenu = h('div', { class: 'menu left', role: 'menu', hidden: true });
    const lRoot = h('div', { class: 'dd' }, lBtn, lMenu);
    const dd = dropdown({
      root: lRoot, button: lBtn, menu: lMenu,
      render: () => lMenu.replaceChildren(...lists().map((l) => h('button', {
        type: 'button', role: 'menuitemradio', 'aria-checked': String(draft.list === l.id), class: 'menu-item' + (draft.list === l.id ? ' current' : ''),
        onclick: () => { draft.list = l.id; dd.close(true); refresh(); },
      }, h('span', { class: 'check' }, draft.list === l.id ? '✓' : ''), l.name))),
    });
    destroyers.push(dd.destroy);
    const icons = h('div', { class: 'mini-icons', 'aria-label': 'Det blokeres' });

    // skip one occurrence (weekly, not frozen)
    const skipLine = h('div', { class: 'chips left skipline' });

    const err = h('p', { class: 'field-err', hidden: true });
    const save = h('button', { type: 'submit', class: 'primary small' }, 'Gem');
    const cancel = h('button', { type: 'button', class: 'ghost small', onclick: () => { closeCard(); render(); $('newPeriod').focus(); } }, 'Annullér');
    const del = existing ? h('button', { type: 'button', class: 'icon-btn trash', 'aria-label': 'Slet perioden', title: 'Slet', html: TRASH, onclick: () => remove(existing) }) : null;
    const form = h('form', { class: 'pcard' }, when, pickPanel, times, h('div', { class: 'list-pick' }, lRoot, icons), skipLine,
      h('div', { class: 'actions left' }, save, cancel, del ? h('span', { class: 'grow' }) : null, del), err);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(e.submitter); });
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=date]')) { e.preventDefault(); submit(null); } });

    function touchesLock() {
      const { locked, until } = lockInfo();
      if (!locked) return null;
      const now = Date.now();
      const r = scheduleBody({ ...draft }, now);
      if (!r.body) return null;
      const occ = occurrences([{ ...r.body, id: existing ? existing.id : 'draft' }], now, until + 2 * DAY);
      if (!occ.some((o) => o.start <= until && o.end > now)) return null;
      const all = occurrences([...schedules().filter((s) => !existing || s.id !== existing.id), { ...r.body, id: 'draft' }], now, until + 2 * DAY);
      return chainEnd(now, until, all).end;
    }

    function refresh() {
      const now = Date.now();
      const sel = (b, on) => { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); };
      sel(cToday, !pick && isToday(draft));
      sel(cTomorrow, !pick && isTomorrow(draft));
      sel(cWeekdays, !pick && isWeekdays(draft));
      sel(cPick, pick);
      pickPanel.hidden = !pick;
      dayBtns.forEach((b, i) => sel(b, draft.kind === 'weekly' && draft.weekdays.includes(i + 1)));
      sel(onceChip, draft.kind === 'date');
      dateInput.hidden = draft.kind !== 'date';
      dateInput.min = cphDate(now, 0);
      if (dateInput.value !== draft.date) dateInput.value = draft.date || '';
      const [sh, sm] = draft.start.split(':'), [eh, em] = draft.end.split(':');
      valEls.start0.textContent = sh; valEls.start1.textContent = sm; valEls.end0.textContent = eh; valEls.end1.textContent = em;
      const l = lists().find((x) => x.id === draft.list) || lists()[0];
      if (l && draft.list !== l.id) draft.list = l.id;
      lName.replaceChildren(dot(draft.list), h('span', {}, l ? l.name : ''));
      icons.replaceChildren(...(l ? [
        ...(S().sites || []).filter((x) => l.sites.includes(x.id)).map((x) => { const i = siteIcon(x, 'glyph small'); i.title = x.label; return i; }),
        ...(S().apps || []).filter((a) => l.apps.includes(a.bundleId)).map((a) => { const i = appIcon(a, 'glyph small'); i.title = a.name; return i; }),
      ] : []));
      renderSkip(now);
      // An addition that becomes part of the running lock says so, and ignores a too-fast click.
      const lockTo = touchesLock();
      const label = lockTo ? `Lås til ${shortWhen(now, lockTo)}` : 'Gem';
      if (label !== lastSaveLabel) { lastSaveLabel = label; save.textContent = label; saveShownAt = performance.now(); }
      save.classList.toggle('guarded', !!lockTo);
    }

    function renderSkip(now) {
      skipLine.replaceChildren();
      const sc = existing && schedules().find((s) => s.id === existing.id);
      if (!sc || sc.date) { skipLine.hidden = true; return; }
      const { until } = lockInfo();
      const occ = occurrences([sc], now, now + 14 * DAY).filter((o) => o.end > now && !(until && o.start < until));
      const target = occ.find((o) => o.date === ctxDate) || occ.find((o) => !o.skipped);
      const bits = [];
      if (target && !target.skipped) {
        bits.push(h('button', { type: 'button', class: 'chip', onclick: () => skip(sc, target.date, true) }, `Spring over ${dateText(now, target.date).toLowerCase()}`));
      }
      for (const o of occ.filter((x) => x.skipped)) {
        bits.push(h('span', { class: 'skipped-day' },
          h('s', {}, dateText(now, o.date)), ' springes over',
          h('button', { type: 'button', class: 'ghost small unskip', onclick: () => skip(sc, o.date, false) }, 'Fortryd spring over')));
      }
      skipLine.hidden = !bits.length;
      skipLine.replaceChildren(...bits);
    }

    async function submit(submitter) {
      if (lastSaveLabel !== 'Gem' && submitter && !confirmArmed(saveShownAt, performance.now(), 0)) return;
      const r = scheduleBody({ ...draft }, Date.now());
      if (r.error) { err.textContent = r.error; err.hidden = false; return; }
      err.hidden = true;
      const ok = await act(() => (existing
        ? api.putSchedule(existing.id, { ...r.body, name: existing.name || '', enabled: existing.enabled !== false })
        : api.addSchedule(r.body)));
      if (ok) {
        store.set({ start: r.body.start, end: r.body.end });
        closeCard();
        render();
        $('newPeriod').focus();
      }
    }

    async function skip(sc, date, on) {
      await act(() => (on ? api.skip(sc.id, date) : api.unskip(sc.id, date)));
      render();
    }

    refresh();
    // Focus the first control so the keyboard path continues straight into the card.
    queueMicrotask(() => { (form.querySelector('.chip.on') || cToday).focus({ preventScroll: false }); });
    return { el: form, refresh, destroy: () => destroyers.forEach((f) => { if (typeof f === 'function') f(); }) };
  }

  // ---------- delete with undo ----------

  async function remove(sc) {
    const copy = { ...sc };
    const ok = await act(() => api.deleteSchedule(sc.id));
    if (!ok) return;
    closeCard();
    render();
    $('newPeriod').focus();
    const box = $('undo');
    $('undoText').textContent = 'Perioden er slettet';
    box.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => { box.hidden = true; }, 5000);
    $('undoBtn').onclick = async () => {
      clearTimeout(undoTimer);
      box.hidden = true;
      const body = { name: copy.name || '', list: copy.list, start: copy.start, end: copy.end, enabled: copy.enabled !== false };
      if (copy.date) body.date = copy.date; else body.weekdays = copy.weekdays;
      const before = new Set(schedules().map((s) => s.id));
      const back = await act(() => api.addSchedule(body));
      if (!back) return; // act() already showed the daemon's message
      const created = schedules().find((s) => !before.has(s.id));
      if (created && (copy.skip || []).length) {
        for (const d of copy.skip) await api.skip(created.id, d).catch(() => {});
        await ctx.refresh(true);
      }
      render();
    };
  }

  return { open, render, isOpen: () => dlg.open };
}

/** Front-page "Næste" text: "Næste: i morgen 09–12 · Locked In 2". */
export function nextLineText(ns, now, listNameOf) {
  if (!ns) return '';
  const start = Date.parse(ns.start), end = Date.parse(ns.end);
  const d = dayDiff(now, start);
  const day = d === 0 ? 'i dag' : d === 1 ? 'i morgen' : weekdayName(cphParts(start).weekday);
  const t = (ms) => { const c = formatClock(ms); return c.endsWith(':00') ? c.slice(0, 2) : c; };
  const name = ns.listName || listNameOf(ns.list);
  return `Næste: ${day} ${t(start)}–${t(end)}${name ? ' · ' + name : ''}`;
}
