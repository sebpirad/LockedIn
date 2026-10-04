// Compact searchable picker (hour / minute). Same look as the list dropdown.
// Opens scrolled to the current value; typing narrows the list ("19", "4" → 40/45);
// ↑/↓/Home/End move, Enter chooses, Esc closes; the list scrolls with mouse/trackpad.

import { filterOptions } from '../lib/clock.js';

export function combo({ root, button, menu, getOptions, getValue, onSelect, label }) {
  let query = '';
  let typedAt = 0;
  const visible = () => [...menu.querySelectorAll('[role=option]:not([hidden])')];

  function render() {
    const value = getValue();
    menu.replaceChildren(...getOptions().map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.className = 'menu-item opt' + (o.value === value ? ' current' : '');
      b.setAttribute('aria-selected', String(o.value === value));
      b.dataset.value = String(o.value);
      b.textContent = o.label;
      b.addEventListener('click', () => choose(o.value));
      return b;
    }));
  }

  function applyQuery() {
    const opts = getOptions();
    let hits = filterOptions(opts, query);
    if (!hits.length && query.length > 1) { query = query.slice(-1); hits = filterOptions(opts, query); }
    const keep = new Set(hits.map((o) => String(o.value)));
    for (const b of menu.querySelectorAll('[role=option]')) b.hidden = !keep.has(b.dataset.value);
    const first = visible()[0];
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'nearest' }); }
  }

  function open(initialKey) {
    query = '';
    render();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const cur = menu.querySelector('[aria-selected=true]') || visible()[0];
    if (cur) {
      cur.scrollIntoView({ block: 'center' });
      cur.focus({ preventScroll: true });
    }
    if (initialKey) type(initialKey);
  }

  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    query = '';
    if (refocus) button.focus();
  }

  function choose(value) {
    onSelect(value);
    close(true);
  }

  // A digit that matches nothing is ignored: the list and focus stay as they were (design review round 4, R3).
  function type(ch) {
    const now = performance.now();
    const base = now - typedAt > 900 ? '' : query;
    typedAt = now;
    const opts = getOptions();
    if (filterOptions(opts, base + ch).length) query = base + ch;
    else if (filterOptions(opts, ch).length) query = ch;
    else return;
    applyQuery();
  }

  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  if (label) button.setAttribute('aria-label', label);
  menu.setAttribute('role', 'listbox');

  button.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) open(); else close(false); });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); open(e.key); }
  });
  menu.addEventListener('keydown', (e) => {
    const list = visible();
    const i = list.indexOf(document.activeElement);
    const go = (j) => {
      e.preventDefault();
      const el = list[Math.max(0, Math.min(list.length - 1, j))];
      if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest' }); }
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
    else if (e.key === 'Backspace') { e.preventDefault(); query = query.slice(0, -1); applyQuery(); }
    else if (/^[0-9]$/.test(e.key)) { e.preventDefault(); type(e.key); }
  });
  const outside = (e) => { if (!e.composedPath().includes(root)) close(false); };
  document.addEventListener('click', outside);
  const esc = (e) => { if (e.key === 'Escape' && !menu.hidden) { e.preventDefault(); close(true); } };
  document.addEventListener('keydown', esc);
  return {
    open, close, isOpen: () => !menu.hidden,
    destroy: () => { document.removeEventListener('click', outside); document.removeEventListener('keydown', esc); },
  };
}
