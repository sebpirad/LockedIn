// "Plan": a full page. A week calendar with an hour axis (one day on narrow screens) and a fixed
// detail panel beside it (below it on narrow screens). No popups. Everything works by keyboard:
// the grid moves a 30-minute slot with the arrow keys and Enter starts a period there.
// Only periods in the running lock are frozen. Saving a period that covers "now" locks at once,
// so it asks first, with the same two steps and 500 ms guard as Start → Lås nu on the front page.

import { cphParts, formatClock, shortWhen, dayDiff, weekdayName } from '../lib/time.js';
import {
  cphDate, dateText, periodText, scheduleBody, occurrences, nextOccurrence, addDays, weekStart, dayBounds,
  wallMinutes, dateLong, lengthText, dayLayout, cascadeIndent, labelFit, dragRange, moveSlot, lockIfSaved, weekdayOf,
  slotLength, chainOverLimit, minutesText,
} from '../lib/plan.js';
import { MINUTE_STEPS } from '../lib/clock.js';
import { confirmArmed, confirmLine } from '../lib/view.js';
import { combo } from './combo.js';
import { dropdown } from './dropdown.js';

const DAY = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (min) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
const toMin = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const short = (t) => (t.endsWith(':00') ? t.slice(0, 2) : t);
const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const WD3 = ['man.', 'tir.', 'ons.', 'tor.', 'fre.', 'lør.', 'søn.'];
const WD2 = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
const CARET = '<svg class="caret" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV = '<svg viewBox="0 0 8 12" aria-hidden="true" width="8" height="12"><path d="M2 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
// List colours (the same six as 1.2.0). Blocks use them at 30 % over the page; text on them is 7.4–8.3:1.
export const TINTS = ['#8fb3ff', '#6fd3b5', '#e59cff', '#ffad7a', '#9ad86a', '#ff8fa3'];
const MAX_WEEKS = 8;
const NARROW = '(max-width: 859px)';

export function createPlan(ctx) {
  const { api, act, h, $, lockInfo, siteIcon, appIcon, LOCK_ICON } = ctx;
  const S = () => ctx.status() || {};
  const schedules = () => S().schedules || [];
  const lists = () => S().lists || [];
  const listName = (id) => (lists().find((l) => l.id === id) || {}).name || '';
  const tint = (id) => TINTS[Math.max(0, lists().findIndex((l) => l.id === id)) % TINTS.length];
  const narrow = () => matchMedia(NARROW).matches;
  const today = () => cphDate(Date.now(), 0);
  const lastDay = () => addDays(weekStart(Date.now(), MAX_WEEKS), 6);
  const lockUntil = () => { const l = lockInfo(); return l.locked ? l.until : null; };

  const st = {
    shown: false,
    week: 0,              // weeks from the current one (wide)
    day: null,            // the day shown on narrow screens
    slot: null,           // keyboard cursor {date, start, len}
    sel: null,            // null | {kind: 'new', date} | {kind: 'edit', id, date}
    draft: null,          // {mode: 'once'|'hv'|'pick', date, weekdays, start, end, list}
    origin: null,         // what gets the focus back when the editor closes
    hoverId: null,
    scrolledOnce: false,
    calSig: '', restSig: '',
  };
  let editor = null;
  let drag = null;
  let undoTimer = null;

  const lastTimes = {
    get() { try { return JSON.parse(localStorage.getItem('li.lastTimes') || 'null'); } catch { return null; } },
    set(v) { try { localStorage.setItem('li.lastTimes', JSON.stringify(v)); } catch { /* ignore */ } },
  };
  const lastLen = () => { const t = lastTimes.get(); return t ? ((toMin(t.end) - toMin(t.start)) + 1440) % 1440 || 1440 : 60; };
  /** A click or the keyboard slot: the last length when it is a normal block (≤ 3 h), else 1 hour. */
  const slotLen = () => slotLength(lastLen());
  /** The running lock as {since, until}, for the 24-hour rule. */
  const runningLock = () => { const u = lockUntil(); return u ? { since: S().activeSince ? Date.parse(S().activeSince) : Date.now(), until: u } : null; };

  // ---------- view range ----------

  function viewDays() {
    if (narrow()) return [st.day || today()];
    const first = weekStart(Date.now(), st.week);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  }
  /** Bring `date` on screen: its week (wide) or the day itself (narrow). */
  function reveal(date) {
    st.day = date;
    const w = Math.round((Date.parse(weekStart(Date.parse(date + 'T12:00:00Z'), 0)) - Date.parse(weekStart(Date.now(), 0))) / (7 * DAY));
    st.week = Math.max(0, Math.min(MAX_WEEKS, w));
  }
  function title(days) {
    if (days.length === 1) return dateLong(days[0]);
    const [a, b] = [days[0], days[6]];
    const da = +a.slice(8), db = +b.slice(8), ma = +a.slice(5, 7), mb = +b.slice(5, 7), ya = a.slice(0, 4), yb = b.slice(0, 4);
    if (ya !== yb) return `${da}. ${MONTHS[ma - 1]} ${ya}–${db}. ${MONTHS[mb - 1]} ${yb}`;
    if (ma !== mb) return `${da}. ${MONTHS[ma - 1]}–${db}. ${MONTHS[mb - 1]} ${yb}`;
    return `${da}.–${db}. ${MONTHS[mb - 1]} ${yb}`;
  }
  function nav(dir) {
    if (narrow()) {
      const d = addDays(st.day || today(), dir);
      if (d < today() || d > lastDay()) return;
      st.day = d;
    } else {
      st.week = Math.max(0, Math.min(MAX_WEEKS, st.week + dir));
    }
    renderCal(true);
  }
  function goToday() {
    st.week = 0;
    st.day = today();
    renderCal(true);
    scrollToFirst();
  }

  // ---------- what is drawn: the saved periods, with the one being edited replaced by its draft ----------

  function draftBody() {
    const d = st.draft;
    if (!d) return null;
    return { kind: d.mode === 'once' ? 'date' : 'weekly', date: d.date, weekdays: d.mode === 'hv' ? [1, 2, 3, 4, 5] : d.weekdays, start: d.start, end: d.end, list: d.list };
  }
  function drawnSchedules() {
    const base = schedules().filter((s) => s.enabled !== false);
    const d = draftBody();
    if (!d || d.start === d.end || (d.kind === 'weekly' && !d.weekdays.length)) return base;
    const asSc = (id, skip) => ({ id, list: d.list, start: d.start, end: d.end, date: d.kind === 'date' ? d.date : null, weekdays: d.kind === 'date' ? [] : [...d.weekdays], skip });
    if (st.sel && st.sel.kind === 'edit') return base.map((s) => (s.id === st.sel.id && !s.frozen ? asSc(s.id, s.skip || []) : s));
    return [...base, { ...asSc('__draft', []), _draft: true }];
  }

  // ---------- calendar ----------

  let measureCtx = null;
  const widths = new Map();
  function textW(text, font) {
    const k = font + '|' + text;
    if (!widths.has(k)) {
      if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
      measureCtx.font = font;
      widths.set(k, Math.ceil(measureCtx.measureText(text).width) + 1);
    }
    return widths.get(k);
  }
  const hourPx = () => parseFloat(getComputedStyle($('planGrid')).getPropertyValue('--hh')) || 48;

  function renderCal(force = false) {
    if (!st.shown || drag) return;
    const now = Date.now();
    const days = viewDays();
    const sig = JSON.stringify([days, schedules(), lists().map((l) => l.id + l.name), lockUntil(), Math.floor(now / 60000), st.draft, st.sel, narrow(), innerWidth, innerHeight]);
    if (!force && sig === st.calSig) { paintSlot(); return; }
    st.calSig = sig;
    const active = document.activeElement;
    const focusKey = active && active.classList && active.classList.contains('ev') ? active.dataset.key : null;

    $('planTitle').textContent = title(days);
    const wide = !narrow();
    $('planPrev').setAttribute('aria-label', wide ? 'Forrige uge' : 'Forrige dag');
    $('planNext').setAttribute('aria-label', wide ? 'Næste uge' : 'Næste dag');
    $('planPrev').disabled = wide ? st.week <= 0 : (st.day || today()) <= today();
    $('planNext').disabled = wide ? st.week >= MAX_WEEKS : (st.day || today()) >= lastDay();

    const from = dayBounds(days[0]).d0, to = dayBounds(days[days.length - 1]).d1;
    const occ = occurrences(drawnSchedules(), from - DAY, to);

    // narrow: the week around the shown day, with a dot where something is planned
    const stripStart = weekStart(Date.parse((st.day || today()) + 'T12:00:00Z'), 0);
    const stripOcc = occurrences(schedules(), dayBounds(stripStart).d0, dayBounds(addDays(stripStart, 6)).d1);
    $('dayStrip').replaceChildren(...Array.from({ length: 7 }, (_, i) => {
      const d = addDays(stripStart, i);
      const on = d === (st.day || today());
      const has = stripOcc.some((o) => !o.skipped && o.date === d);
      return h('button', {
        type: 'button', class: (on ? 'on' : '') + (has ? ' has' : '') + (d === today() ? ' today' : ''), 'aria-pressed': String(on),
        'aria-label': dateLong(d), disabled: d < today() || d > lastDay(), onclick: () => { st.day = d; renderCal(true); },
      }, WD2[i], h('b', {}, String(+d.slice(8))), h('i', { 'aria-hidden': 'true' }));
    }));

    $('planHead').replaceChildren(h('div', { class: 'gutter' }), ...days.map((d) => h('div', { class: 'dh' + (d === today() ? ' today' : '') + (d < today() ? ' past' : '') },
      h('span', {}, WD3[weekdayOf(d) - 1]), h('b', {}, String(+d.slice(8))))));

    const grid = $('planGrid');
    $('planScroll').style.setProperty('--days', String(days.length));
    const hours = h('div', { class: 'hours', 'aria-hidden': 'true' }, ...Array.from({ length: 23 }, (_, i) => {
      const s = h('span', {}, pad2(i + 1));
      s.style.top = `calc(${i + 1} * var(--hh))`;
      return s;
    }));
    const cols = days.map((d) => h('div', { class: 'col' + (d === today() ? ' today' : '') + (d < today() ? ' past' : ''), 'data-date': d }));
    grid.replaceChildren(hours, ...cols, h('div', { id: 'slotCursor', class: 'slot', hidden: true }));

    const hh = hourPx();
    const colW = cols[0].getBoundingClientRect().width || 100;
    const nowMin = wallMinutes(now);
    const allLists = lists();
    const font = getComputedStyle(document.body).fontFamily;
    const fTime = `600 13px ${font}`, fName = `400 12px ${font}`;
    const until = lockUntil();
    const sel = st.sel;

    days.forEach((d, i) => {
      const col = cols[i];
      if (d === today()) {
        // The now-line runs under the (opaque) blocks, so it never crosses text; the dot sits in the gutter edge.
        const y = `${(nowMin / 60) * hh}px`;
        const shade = h('div', { class: 'shade' });
        shade.style.height = y;
        const line = h('div', { class: 'now' });
        line.style.top = y;
        const dot = h('div', { class: 'nowdot' });
        dot.style.top = y;
        col.append(shade, line, dot);
      }
      const prev = addDays(d, -1);
      const items = dayLayout(occ.filter((o) => o.date === d || o.date === prev), d);
      for (const it of items) {
        const { o } = it;
        const sc = o.sc;
        const top = (it.top / 60) * hh;
        const height = Math.max(20, ((it.bottom - it.top) / 60) * hh) - 2;
        const left = it.level > 0 ? cascadeIndent(it.level, colW) : 0;
        const width = colW - left - 4;
        // A higher block that starts just below this one's top covers its right part: fit the label in front of it.
        let labelW = width - 16;
        for (const other of items) {
          if (other.level > it.level && other.top < it.top + (40 / hh) * 60 && other.bottom > it.top) {
            labelW = Math.min(labelW, cascadeIndent(other.level, colW) - left - 14);
          }
        }
        const timeTxt = it.cont.before ? `→ ${short(sc.end)}` : `${short(sc.start)}–${short(sc.end)}`;
        const startTxt = it.cont.before ? `→ ${short(sc.end)}` : short(sc.start);
        const lname = sc._draft ? 'Ny periode' : listName(sc.list);
        const fit = labelFit({ w: labelW, h: height, timeW: textW(timeTxt, fTime), startW: textW(startTxt, fTime), nameW: lname ? textW(lname, fName) : null });
        const frozen = !!sc.frozen && !!until && o.start < until && !o.skipped;
        const past = o.end <= now && !frozen;
        const isSel = sel && sel.kind === 'edit' && sel.id === sc.id;
        const lab = h('span', { class: 'ev-lab' + (fit.name === 'inline' ? ' inline' : '') },
          fit.time ? h('span', { class: 't' }, fit.time === 'full' ? timeTxt : startTxt) : null,
          fit.name ? h('span', { class: 'l' }, lname) : null);
        if (frozen && fit.time === 'full' && labelW >= textW(timeTxt, fTime) + 20) lab.firstChild.insertAdjacentHTML('beforeend', LOCK_ICON);
        const label = `${dateLong(o.date)}: ${periodText(sc, allLists, now)}${o.skipped ? ', springes over' : ''}${frozen ? `, låst til ${formatClock(until)}` : ''}`;
        const cls = 'ev' + (o.skipped ? ' skipped' : '') + (frozen ? ' frozen' : '') + (past ? ' past' : '') + (isSel ? ' sel' : '')
          + (sc._draft ? ' draft' : '') + (it.cont.before ? ' cont-top' : '') + (it.cont.after ? ' cont-bot' : '') + (st.hoverId === sc.id ? ' hl' : '');
        const ev = sc._draft
          ? h('div', { class: cls, 'aria-hidden': 'true' }, lab)
          : h('button', { type: 'button', class: cls, 'data-key': `${sc.id}|${o.date}`, 'data-id': sc.id, 'data-date': o.date, title: label, 'aria-label': label }, lab);
        ev.style.cssText = `--tint:${tint(sc.list)};top:${top + 1}px;height:${height}px;left:${left + 2}px;width:${width}px;z-index:${it.level < 0 ? 2 : 3 + it.level}`;
        col.append(ev);
      }
    });
    paintSlot();
    if (focusKey) { const again = grid.querySelector(`.ev[data-key="${CSS.escape(focusKey)}"]`); if (again) again.focus({ preventScroll: true }); }
  }

  function firstHour() {
    const days = viewDays();
    const occ = occurrences(schedules(), dayBounds(days[0]).d0, dayBounds(days[days.length - 1]).d1)
      .filter((o) => days.includes(o.date) && !o.skipped);
    const earliest = occ.length ? Math.min(...occ.map((o) => Math.floor(wallMinutes(o.start) / 60))) : 7;
    return Math.min(7, earliest);
  }
  /** Open at the first hour of interest, its label clear of the day header. */
  function scrollToFirst() {
    $('planScroll').scrollTop = Math.max(0, firstHour() * hourPx() - 14);
  }
  function scrollToMinute(min, len = 60) {
    const wrap = $('planScroll');
    const head = narrow() ? 0 : $('planHead').offsetHeight;
    const y = (min / 60) * hourPx();
    const bottom = ((min + len) / 60) * hourPx();
    if (y < wrap.scrollTop || bottom > wrap.scrollTop + wrap.clientHeight - head) wrap.scrollTop = Math.max(0, y - hourPx());
  }

  // ---------- keyboard: a 30-minute slot cursor ----------

  function defaultSlot() {
    const days = viewDays();
    const t = today();
    const date = days.includes(t) ? t : days[0];
    let start = 9 * 60;
    if (date === t) start = Math.min(1410, Math.max(start, Math.ceil((wallMinutes(Date.now()) + 1) / 30) * 30));
    return { date, start, len: Math.max(30, Math.min(slotLen(), 1440 - start)) };
  }
  function paintSlot() {
    const el = $('slotCursor');
    if (!el) return;
    const s = st.slot;
    const col = s && document.activeElement === $('planGrid') && $('planGrid').querySelector(`.col[data-date="${s.date}"]`);
    el.hidden = !col;
    if (!col) return;
    const hh = hourPx();
    el.style.top = `${(s.start / 60) * hh}px`;
    el.style.height = `${(s.len / 60) * hh}px`;
    el.style.left = `${col.offsetLeft}px`;
    el.style.width = `${col.offsetWidth}px`;
  }
  function announceSlot() {
    const s = st.slot;
    if (s) $('planLive').textContent = `${dateLong(s.date)} ${hhmm(s.start)}–${s.start + s.len >= 1440 ? '24:00' : hhmm(s.start + s.len)}`;
  }
  function onGridKey(e) {
    if (e.target !== $('planGrid') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (!st.slot) st.slot = defaultSlot();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) {
      e.preventDefault();
      const next = moveSlot(st.slot, k, e.shiftKey);
      if (next.date < today() || next.date > lastDay()) return;
      if (next.date === today() && next.start + 30 <= wallMinutes(Date.now())) return;
      st.slot = next;
      if (!viewDays().includes(next.date)) { reveal(next.date); renderCal(true); }
      paintSlot();
      scrollToMinute(next.start, next.len);
      announceSlot();
    } else if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault();
      const step = narrow() ? 1 : 7;
      const date = addDays(st.slot.date, k === 'PageDown' ? step : -step);
      if (date < today() || date > lastDay()) return;
      st.slot = { ...st.slot, date };
      reveal(date);
      renderCal(true);
      announceSlot();
    } else if (k === 't' || k === 'T') {
      e.preventDefault();
      goToday();
      st.slot = defaultSlot();
      paintSlot();
      announceSlot();
    } else if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      const s = st.slot;
      newAt(s.date, s.start, s.start + s.len, $('planGrid'));
    }
  }

  // ---------- mouse: click a slot, or drag a range; touch: tap ----------

  function minuteAt(col, clientY) {
    const r = col.getBoundingClientRect();
    return ((clientY - r.top) / r.height) * 1440;
  }
  const earliest = (date) => (date === today() ? Math.ceil((wallMinutes(Date.now()) + 1) / 15) * 15 : 0);
  function onPointerDown(e) {
    const col = e.target.closest && e.target.closest('.col');
    if (!col || e.target.closest('.ev') || e.button !== 0 || e.pointerType !== 'mouse') return;
    const date = col.dataset.date;
    const a = minuteAt(col, e.clientY);
    if (date < today() || a < earliest(date) - 15) return;
    e.preventDefault();
    drag = { col, date, a, moved: false, pointerId: e.pointerId };
    col.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const b = minuteAt(drag.col, e.clientY);
    if (!drag.moved && Math.abs(b - drag.a) < 8) return;
    drag.moved = true;
    const min = earliest(drag.date);
    const r = dragRange(Math.max(drag.a, min), Math.max(b, min));
    let g = drag.col.querySelector('.ev.ghost');
    if (!g) { g = h('div', { class: 'ev draft ghost', 'aria-hidden': 'true' }, h('span', { class: 'ev-lab' }, h('span', { class: 't' }))); drag.col.append(g); }
    const hh = hourPx();
    g.style.cssText = `top:${(r.start / 60) * hh + 1}px;height:${Math.max(20, ((r.end - r.start) / 60) * hh) - 2}px;left:2px;width:${drag.col.offsetWidth - 4}px;z-index:40`;
    g.querySelector('.t').textContent = `${short(hhmm(r.start))}–${r.end >= 1440 ? '24' : short(hhmm(r.end))}`;
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    endDrag();
    const min = earliest(d.date);
    if (d.moved) {
      const r = dragRange(Math.max(d.a, min), Math.max(minuteAt(d.col, e.clientY), min));
      newAt(d.date, r.start, r.end, null);
    } else {
      const start = Math.max(min, Math.floor(d.a / 30) * 30);
      if (start < 1440) newAt(d.date, start, Math.min(1440, start + slotLen()), null);
    }
  }
  function endDrag() {
    if (!drag) return;
    const g = drag.col.querySelector('.ev.ghost');
    if (g) g.remove();
    try { drag.col.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    drag = null;
  }
  function onTap(e) {
    if (e.pointerType === 'mouse' || !e.pointerType) return; // mouse: pointer events above; keyboard: the slot
    const col = e.target.closest && e.target.closest('.col');
    if (!col) return;
    const date = col.dataset.date;
    const a = minuteAt(col, e.clientY);
    const min = earliest(date);
    if (date < today() || a < min - 15) return;
    const start = Math.max(min, Math.floor(a / 30) * 30);
    if (start < 1440) newAt(date, start, Math.min(1440, start + slotLen()), null);
  }

  // ---------- panel ----------

  function newAt(date, startMin, endMin, origin) {
    st.draft = {
      mode: 'once', date, weekdays: [weekdayOf(date)], start: hhmm(startMin), end: hhmm(endMin % 1440),
      list: ctx.currentListId() || (lists()[0] || {}).id,
    };
    st.sel = { kind: 'new', date };
    st.origin = origin;
    openEditor();
  }
  const nextDateOf = (sc) => { const o = nextOccurrence([sc], Date.now()); return o ? o.date : today(); };
  function openEdit(id, date, origin) {
    const sc = schedules().find((s) => s.id === id);
    if (!sc) return;
    const hv = !sc.date && (sc.weekdays || []).join() === '1,2,3,4,5';
    const at = date || sc.date || nextDateOf(sc);
    st.draft = {
      mode: sc.date ? 'once' : hv ? 'hv' : 'pick', date: sc.date || at,
      weekdays: sc.date ? [weekdayOf(sc.date)] : [...(sc.weekdays || [])], start: sc.start, end: sc.end, list: sc.list,
    };
    st.sel = { kind: 'edit', id, date: at };
    st.origin = origin;
    openEditor();
  }

  function closeEditor(refocus = true) {
    if (editor) editor.destroy();
    editor = null;
    st.sel = null;
    st.draft = null;
    const origin = st.origin;
    st.origin = null;
    st.restSig = '';
    renderPanel();
    renderCal(true);
    if (!refocus) return;
    let back = origin;
    if (origin && origin.dataset && origin.dataset.key) back = $('planGrid').querySelector(`.ev[data-key="${CSS.escape(origin.dataset.key)}"]`);
    if (origin && origin.dataset && origin.dataset.id && origin.classList.contains('rule')) back = $('planPanel').querySelector(`.rule[data-id="${CSS.escape(origin.dataset.id)}"]`);
    // On a phone the panel sits below the grid: going back also scrolls back up to the block.
    if (back && document.contains(back)) back.focus({ preventScroll: !narrow() });
    else if ($('planNew')) $('planNew').focus({ preventScroll: true });
  }

  function openEditor() {
    if (editor) editor.destroy();
    editor = makeEditor();
    $('planPanel').replaceChildren(editor.el);
    if (st.sel.date) reveal(st.sel.date);
    renderCal(true);
    const d = st.draft;
    scrollToMinute(toMin(d.start), ((toMin(d.end) - toMin(d.start)) + 1440) % 1440 || 60);
    if (narrow()) $('planPanel').scrollIntoView({ block: 'start' });
    queueMicrotask(() => editor && editor.focus());
  }

  function renderPanel() {
    if (!st.shown) return;
    if (editor) { editor.refresh(); return; }
    const now = Date.now();
    const until = lockUntil();
    const rows = schedules().filter((s) => s.enabled !== false)
      .map((sc) => ({ sc, occ: occurrences([sc], now, now + 15 * DAY).filter((o) => o.end > now) }))
      .filter((x) => x.occ.length) // upcoming only: an ended one-off leaves the list
      .map((x) => ({ ...x, next: x.occ.find((o) => !o.skipped) }))
      .sort((a, b) => (a.next ? a.next.start : Infinity) - (b.next ? b.next.start : Infinity));
    const sig = JSON.stringify([rows.map((r) => [r.sc, r.next && r.next.date]), lists().map((l) => l.id + l.name), until, schedules().length]);
    if (sig === st.restSig && $('planNew')) return;
    st.restSig = sig;
    const active = document.activeElement;
    const focusId = active && active.classList && active.classList.contains('rule') ? active.dataset.id : active && active.id === 'planNew' ? '#new' : null;
    const today0 = cphDate(now, 0), last = cphDate(now, 14);
    const lis = rows.map(({ sc, next }) => {
      const frozen = !!sc.frozen && !!until;
      const skips = (sc.skip || []).filter((d) => d >= today0 && d <= last).sort();
      const dot = h('span', { class: 'dot' });
      dot.style.background = tint(sc.list);
      const btn = h('button', {
        type: 'button', class: 'rule' + (st.hoverId === sc.id ? ' hl' : ''), 'data-id': sc.id,
        onclick: (e) => { const d = next ? next.date : nextDateOf(sc); reveal(d); openEdit(sc.id, d, e.currentTarget); },
        onmouseenter: () => setHover(sc.id), onmouseleave: () => setHover(null),
      },
      h('span', { class: 'w' }, periodText(sc, [], now)),
      h('span', { class: 'ln' }, dot, h('span', {}, listName(sc.list)), ...skips.map((d) => h('s', {}, dateText(now, d)))),
      frozen ? h('span', { class: 'end locked' }, h('span', { class: 'lk', html: LOCK_ICON }), `Låst til ${shortWhen(now, until)}`) : h('span', { class: 'end', html: CHEV }));
      return h('li', {}, btn);
    });
    const full = schedules().length >= 50;
    const add = h('button', {
      id: 'planNew', type: 'button', class: 'p-new', disabled: full, title: full ? 'Højst 50 perioder' : null,
      onclick: (e) => {
        const lt = lastTimes.get() || { start: '09:00', end: '12:00' };
        const d = addDays(today(), 1);
        const start = toMin(lt.start);
        reveal(d);
        newAt(d, start, Math.min(1440, start + (lastTimes.get() ? slotLen() : 180)), e.currentTarget);
      },
    }, h('span', { class: 'plus', 'aria-hidden': 'true' }, '+'), 'Ny periode');
    $('planPanel').replaceChildren(...[add, lis.length ? h('ul', { class: 'rules', 'aria-label': 'Perioder' }, ...lis) : null].filter(Boolean));
    if (focusId === '#new') add.focus({ preventScroll: true });
    else if (focusId) $('planPanel').querySelector(`.rule[data-id="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
  }

  function setHover(id) {
    if (st.hoverId === id) return;
    st.hoverId = id;
    for (const el of document.querySelectorAll('#planGrid .ev[data-id]')) el.classList.toggle('hl', !!id && el.dataset.id === id);
    for (const el of document.querySelectorAll('#planPanel .rule')) el.classList.toggle('hl', !!id && el.dataset.id === id);
  }

  function makeEditor() {
    const destroyers = [];
    const d = st.draft;
    const sel = st.sel;
    const existing = sel.kind === 'edit' ? schedules().find((s) => s.id === sel.id) : null;
    const frozen = !!existing && !!existing.frozen && !!lockUntil();
    let confirming = false;
    let confirmAt = 0;

    const titleEl = h('h2', { id: 'planEdTitle' });
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Luk', onclick: () => closeEditor() }, '×');
    const head = h('div', { class: 'ed-head' }, titleEl, close);

    const lName = h('span', { class: 'lbl' });
    const icons = h('div', { class: 'mini-icons', 'aria-label': 'Det blokeres' });
    function paintList() {
      const l = lists().find((x) => x.id === d.list) || lists()[0];
      if (l && d.list !== l.id) d.list = l.id;
      const dot = h('span', { class: 'dot' });
      dot.style.background = tint(d.list);
      lName.replaceChildren(dot, h('span', {}, l ? l.name : ''));
      icons.replaceChildren(...(l ? [
        ...(S().sites || []).filter((x) => l.sites.includes(x.id)).map((x) => { const i = siteIcon(x, 'glyph small'); i.title = x.label; return i; }),
        ...(S().apps || []).filter((a) => l.apps.includes(a.bundleId)).map((a) => { const i = appIcon(a, 'glyph small'); i.title = a.name; return i; }),
      ] : []));
    }

    // "Spring over" (weekly periods): the occurrence that was clicked, or the next one.
    const skipLine = h('div', { class: 'skipline' });
    async function skip(on, date) {
      if (await act(() => (on ? api.skip(existing.id, date) : api.unskip(existing.id, date)))) { renderCal(true); paintSkip(); }
    }
    function paintSkip() {
      skipLine.replaceChildren();
      const sc = existing && schedules().find((s) => s.id === existing.id);
      if (!sc || sc.date) { skipLine.hidden = true; return; }
      const now = Date.now();
      const until = lockUntil();
      const occ = occurrences([sc], now, now + 15 * DAY).filter((o) => o.end > now && !(until && sc.frozen && o.start < until));
      const target = occ.find((o) => o.date === sel.date) || occ.find((o) => !o.skipped);
      skipLine.hidden = !target;
      if (!target) return;
      if (target.skipped) {
        skipLine.append(h('s', {}, dateText(now, target.date)), h('span', { class: 'muted-t' }, 'springes over'),
          h('button', { type: 'button', class: 'ghost small', onclick: () => skip(false, target.date) }, 'Fortryd'));
      } else {
        skipLine.append(h('button', { type: 'button', class: 'ghost small', onclick: () => skip(true, target.date) }, `Spring over ${dateText(now, target.date).toLowerCase()}`));
      }
    }

    if (frozen) {
      // In the running lock: read-only. It says until when; a later day can still be skipped.
      const lockText = h('span', {});
      const timeText = h('span', { class: 'ro-time' });
      const el = h('div', { class: 'ed', role: 'region', 'aria-labelledby': 'planEdTitle' },
        head, h('div', { class: 'locknote' }, h('span', { class: 'lk', html: LOCK_ICON }), lockText),
        h('div', { class: 'ro' }, timeText), h('div', { class: 'ro' }, lName), icons, skipLine);
      const refresh = () => {
        const sc = schedules().find((s) => s.id === existing.id);
        if (!sc) { closeEditor(false); return; }
        if (!sc.frozen || !lockUntil()) { openEditor(); return; } // the lock ended: it can be edited again
        titleEl.textContent = periodText(sc, [], Date.now());
        lockText.textContent = `Låst til ${shortWhen(Date.now(), lockUntil())}`;
        timeText.textContent = `${sc.start} – ${sc.end}`;
        paintList();
        paintSkip();
      };
      refresh();
      return { el, refresh, destroy() {}, focus: () => close.focus({ preventScroll: true }), isConfirming: () => false };
    }

    // Hvornår
    const segBtn = (mode, label) => h('button', { type: 'button', 'data-mode': mode, onclick: () => setMode(mode) }, label);
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Hvornår' }, segBtn('once', 'Én gang'), segBtn('hv', 'Hverdage'), segBtn('pick', 'Vælg dage'));
    function setMode(mode) {
      if (mode === d.mode) return;
      if (mode === 'pick') d.weekdays = d.mode === 'hv' ? [1, 2, 3, 4, 5] : [weekdayOf(d.date)];
      if (mode === 'once') d.date = sel.date && sel.date >= today() ? sel.date : addDays(today(), 1);
      d.mode = mode;
      changed();
    }
    const dateVal = h('span', {});
    const dateIn = h('input', { type: 'date', class: 'date-native', tabindex: '-1', 'aria-hidden': 'true' });
    const dateBtn = h('button', { type: 'button', class: 'select-btn datebtn', 'aria-label': 'Dato' }, dateVal);
    dateBtn.insertAdjacentHTML('beforeend', CARET);
    dateBtn.addEventListener('click', () => { dateIn.min = today(); dateIn.max = lastDay(); dateIn.value = d.date; try { dateIn.showPicker(); } catch { dateIn.focus(); } });
    dateIn.addEventListener('change', () => {
      if (!dateIn.value || dateIn.value < today()) return;
      d.date = dateIn.value;
      sel.date = d.date;
      reveal(d.date);
      changed();
      dateBtn.focus();
    });
    const dateRow = h('div', { class: 'daterow' }, dateBtn, dateIn);
    const dayBtns = [1, 2, 3, 4, 5, 6, 7].map((n) => h('button', {
      type: 'button', class: 'day', onclick: () => { d.weekdays = d.weekdays.includes(n) ? d.weekdays.filter((x) => x !== n) : [...d.weekdays, n].sort(); changed(); },
    }, WD2[n - 1]));
    const daysRow = h('div', { class: 'days', role: 'group', 'aria-label': 'Ugedage' }, ...dayBtns);

    // Fra / Til: the approved clock pickers, one time per row, so nothing can overflow
    const HOURS = Array.from({ length: 24 }, (_, i) => ({ value: i, label: pad2(i) }));
    const MINS = MINUTE_STEPS.map((m) => ({ value: m, label: pad2(m) }));
    const vals = {};
    function picker(key, i, label) {
      const val = h('span', {});
      vals[key + i] = val;
      const btn = h('button', { type: 'button', class: 'select-btn compact', 'data-k': key + i }, val);
      btn.insertAdjacentHTML('beforeend', CARET);
      const menu = h('div', { class: 'menu combo-menu', hidden: true });
      const root = h('div', { class: 'dd clock' }, btn, menu);
      const c = combo({
        root, button: btn, menu, label,
        getOptions: () => {
          const m = key === 'start' ? minStart() : 0;
          if (!m) return i === 0 ? HOURS : MINS;
          if (i === 0) return HOURS.filter((o) => o.value * 60 + 55 >= m);
          const hr = +d.start.slice(0, 2);
          return MINS.filter((o) => hr * 60 + o.value >= m);
        },
        getValue: () => +d[key].split(':')[i],
        onSelect: (v) => {
          const t = d[key].split(':');
          t[i] = pad2(v);
          if (key === 'start') { // moving the start keeps the length
            const len = ((toMin(d.end) - toMin(d.start)) + 1440) % 1440 || 60;
            d.start = t.join(':');
            d.end = hhmm((toMin(d.start) + len) % 1440);
          } else d.end = t.join(':');
          changed();
        },
      });
      destroyers.push(c.destroy);
      return root;
    }
    const lenEl = h('span', { class: 'len' });
    // The 24-hour rule, before Gem: one short line and a disabled button instead of the daemon's refusal.
    const limitEl = h('p', { class: 'limit', role: 'status', hidden: true });
    /** "Én gang" today: the earliest start still ahead (5-minute steps); 0 otherwise. */
    const minStart = () => (d.mode === 'once' && d.date === today() ? Math.ceil((wallMinutes(Date.now()) + 1) / 5) * 5 : 0);
    function fixPastStart() {
      const m = minStart();
      if (!m || toMin(d.start) >= m) return;
      const len = ((toMin(d.end) - toMin(d.start)) + 1440) % 1440 || 60;
      if (m >= 1440) { d.date = addDays(today(), 1); sel.date = d.date; return; }
      d.start = hhmm(m);
      d.end = hhmm((m + len) % 1440);
    }
    const trow = (lab, key, extra) => h('div', { class: 'trow' }, h('span', { class: 'lab' }, lab),
      picker(key, 0, `${lab}, time`), h('span', { class: 'sep' }, ':'), picker(key, 1, `${lab}, minut`), extra || h('span', {}));

    // list
    const lBtn = h('button', { type: 'button', class: 'select-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Liste' }, lName);
    lBtn.insertAdjacentHTML('beforeend', CARET);
    const lMenu = h('div', { class: 'menu left', role: 'menu', hidden: true });
    const lRoot = h('div', { class: 'dd' }, lBtn, lMenu);
    const dd = dropdown({
      root: lRoot, button: lBtn, menu: lMenu,
      render: () => lMenu.replaceChildren(...lists().map((l) => {
        const dot = h('span', { class: 'dot' });
        dot.style.background = tint(l.id);
        return h('button', {
          type: 'button', role: 'menuitemradio', 'aria-checked': String(d.list === l.id), class: 'menu-item' + (d.list === l.id ? ' current' : ''),
          onclick: () => { d.list = l.id; dd.close(true); changed(); },
        }, h('span', { class: 'check' }, d.list === l.id ? '✓' : ''), dot, l.name);
      })),
    });
    destroyers.push(dd.destroy);

    const err = h('p', { class: 'field-err', role: 'alert', hidden: true });
    const save = h('button', { type: 'submit', class: 'primary small', id: 'planSave' }, 'Gem');
    const cancel = h('button', { type: 'button', class: 'ghost small', onclick: () => closeEditor() }, 'Annullér');
    const del = existing ? h('button', { type: 'button', class: 'icon-btn trash', 'aria-label': 'Slet perioden', title: 'Slet', html: TRASH, onclick: () => remove(existing) }) : null;
    const foot = h('div', { class: 'foot' }, save, cancel, h('span', { class: 'grow' }), del);
    // "Lås nu til …" asks once more, like Start → Lås nu: same sentence, same 500 ms / double-click guard.
    const confirmText = h('p', { class: 'confirm-line' });
    const lockNow = h('button', { type: 'button', class: 'primary small', id: 'planLockNow' }, 'Lås nu');
    const back = h('button', { type: 'button', class: 'ghost small', onclick: () => { confirming = false; refresh(); save.focus(); } }, 'Tilbage');
    const confirmBox = h('div', { class: 'pconfirm', hidden: true }, confirmText, h('div', { class: 'actions left' }, lockNow, back));

    const form = h('form', { class: 'ed', 'aria-labelledby': 'planEdTitle' },
      head, seg, dateRow, daysRow, trow('Fra', 'start'), trow('Til', 'end', lenEl), limitEl,
      lRoot, icons, skipLine, err, foot, confirmBox);
    form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });

    const body = () => scheduleBody(draftBody(), Date.now());
    function lockTarget() {
      const r = body();
      return r.body ? lockIfSaved(r.body, schedules(), Date.now(), lockUntil(), existing ? existing.id : null) : null;
    }
    function overLimit() {
      const r = body();
      return r.body ? chainOverLimit(r.body, schedules(), Date.now(), runningLock(), existing ? existing.id : null) : null;
    }
    function submit() {
      if (confirming || overLimit()) return;
      const r = body();
      if (r.error) { err.textContent = r.error; err.hidden = false; return; }
      err.hidden = true;
      if (lockTarget()) { confirming = true; confirmAt = performance.now(); refresh(); lockNow.focus(); return; }
      persist(r.body);
    }
    lockNow.addEventListener('click', (e) => {
      if (!confirmArmed(confirmAt, performance.now(), e.detail)) return;
      const r = body();
      if (r.body) persist(r.body);
    });
    async function persist(b) {
      const ok = await act(() => (existing
        ? api.putSchedule(existing.id, { ...b, name: existing.name || '', enabled: existing.enabled !== false })
        : api.addSchedule(b)));
      if (!ok) { confirming = false; refresh(); return; }
      lastTimes.set({ start: b.start, end: b.end });
      const date = b.date || sel.date || today();
      closeEditor(false);
      // The keyboard continues in the grid, on the period just saved.
      const s = toMin(b.start);
      st.slot = { date, start: Math.floor(s / 30) * 30, len: Math.max(30, Math.min(1440 - Math.floor(s / 30) * 30, ((toMin(b.end) - s) + 1440) % 1440 || 1440)) };
      $('planGrid').focus({ preventScroll: true });
      paintSlot();
    }

    function changed() {
      err.hidden = true;
      confirming = false;
      fixPastStart();
      refresh();
      renderCal(true);
    }

    function refresh() {
      const now = Date.now();
      const sc = existing && schedules().find((s) => s.id === existing.id);
      if (existing && !sc) { closeEditor(false); return; }
      if (sc && sc.frozen && lockUntil()) { openEditor(); return; } // it just became part of the lock
      titleEl.textContent = sc ? periodText(sc, [], now) : 'Ny periode';
      for (const b of seg.querySelectorAll('button')) { const on = b.dataset.mode === d.mode; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
      dateRow.hidden = d.mode !== 'once';
      dateVal.textContent = dateLong(d.date);
      daysRow.hidden = d.mode !== 'pick';
      dayBtns.forEach((b, i) => { const on = d.weekdays.includes(i + 1); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      const [sh, sm] = d.start.split(':'), [eh, em] = d.end.split(':');
      vals.start0.textContent = sh; vals.start1.textContent = sm; vals.end0.textContent = eh; vals.end1.textContent = em;
      lenEl.textContent = d.start === d.end ? '' : lengthText(d.start, d.end);
      paintList();
      paintSkip();
      const over = overLimit();
      limitEl.hidden = !over;
      limitEl.textContent = over ? `Samlet lås ${minutesText(over)} · højst 24 t` : '';
      save.disabled = !!over;
      const to = over ? null : lockTarget();
      save.textContent = to ? `Lås nu til ${shortWhen(now, to)}` : 'Gem';
      if (confirming && !to) confirming = false;
      if (confirming) confirmText.textContent = confirmLine(now, to, listName(d.list));
      foot.hidden = confirming;
      confirmBox.hidden = !confirming;
      for (const el of [seg, dateRow, daysRow, skipLine, ...form.querySelectorAll('.trow, .dd')]) el.toggleAttribute('inert', confirming);
    }

    fixPastStart();
    refresh();
    return {
      el: form, refresh,
      destroy: () => destroyers.forEach((f) => { if (typeof f === 'function') f(); }),
      focus: () => (seg.querySelector('button.on') || seg.querySelector('button')).focus({ preventScroll: true }),
      isConfirming: () => confirming,
      back: () => { confirming = false; refresh(); save.focus(); },
    };
  }

  // ---------- delete with undo ----------

  async function remove(sc) {
    const copy = { ...sc };
    if (!(await act(() => api.deleteSchedule(sc.id)))) return;
    closeEditor(false);
    if ($('planNew')) $('planNew').focus({ preventScroll: true });
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
      if (!(await act(() => api.addSchedule(body)))) return;
      const created = schedules().find((s) => !before.has(s.id));
      if (created && (copy.skip || []).length) {
        for (const day of copy.skip) await api.skip(created.id, day).catch(() => {});
        await ctx.refresh(true);
      }
      st.restSig = '';
      render();
    };
  }

  // ---------- wiring ----------

  const grid = $('planGrid');
  grid.addEventListener('keydown', onGridKey);
  grid.addEventListener('focus', () => { if (!st.slot || !viewDays().includes(st.slot.date)) st.slot = defaultSlot(); paintSlot(); announceSlot(); });
  grid.addEventListener('blur', paintSlot);
  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerup', onPointerUp);
  grid.addEventListener('pointercancel', endDrag);
  grid.addEventListener('lostpointercapture', () => { if (drag) endDrag(); });
  grid.addEventListener('click', (e) => {
    const ev = e.target.closest && e.target.closest('button.ev');
    if (ev) { openEdit(ev.dataset.id, ev.dataset.date, ev); return; }
    onTap(e);
  });
  grid.addEventListener('mouseover', (e) => { const ev = e.target.closest && e.target.closest('.ev[data-id]'); setHover(ev ? ev.dataset.id : null); });
  grid.addEventListener('mouseleave', () => setHover(null));
  $('planToday').onclick = goToday;
  $('planPrev').onclick = () => nav(-1);
  $('planNext').onclick = () => nav(1);
  document.addEventListener('keydown', (e) => {
    if (!st.shown || e.key !== 'Escape' || e.defaultPrevented) return;
    if ($('planPanel').querySelector('.menu:not([hidden])')) return; // an open picker closes first
    if (editor && editor.isConfirming()) { e.preventDefault(); editor.back(); return; }
    if (editor) { e.preventDefault(); closeEditor(); }
  });
  matchMedia(NARROW).addEventListener('change', () => { if (st.shown) renderCal(true); });
  addEventListener('resize', () => { if (st.shown) renderCal(); });

  function render() {
    if (!st.shown) return;
    renderCal();
    renderPanel();
  }

  return {
    /** Show the page; with (scheduleId, date) that period opens in the panel. */
    show(id = null, date = null) {
      st.shown = true;
      if (!st.day) st.day = today();
      if (id && date) reveal(date);
      renderCal(true);
      st.restSig = '';
      renderPanel();
      if (!st.scrolledOnce) { scrollToFirst(); st.scrolledOnce = true; }
      if (id && schedules().some((s) => s.id === id)) openEdit(id, date, null);
    },
    hide() {
      endDrag();
      if (editor) { editor.destroy(); editor = null; st.sel = null; st.draft = null; }
      st.shown = false;
    },
    render,
    isShown: () => st.shown,
  };
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
