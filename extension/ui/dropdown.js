// A button that opens a small menu. Keyboard: ↓/↑ open and move, Enter/Space choose, Esc closes.

export function dropdown({ root, button, menu, render }) {
  const items = () => [...menu.querySelectorAll('button:not([disabled])')];
  function open(focus) {
    render();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (focus) (items().find((b) => b.getAttribute('aria-checked') === 'true') || items()[0])?.focus();
  }
  function close(refocus) {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus();
  }
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) open(e.detail === 0); else close(false);
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(true); }
  });
  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    const go = (j) => { e.preventDefault(); list[(j + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close(false);
  });
  // composedPath: a menu click may re-render the menu, so e.target can already be detached.
  const outside = (e) => { if (!e.composedPath().includes(root)) close(false); };
  document.addEventListener('click', outside);
  return { open, close, isOpen: () => !menu.hidden, render, destroy: () => document.removeEventListener('click', outside) };
}
