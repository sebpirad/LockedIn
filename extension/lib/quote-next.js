// "Another quote": a double-click / double-tap / → / Space on the quote page shows the next quote from the same
// shuffle bag the page was opened with (lib/shuffle.js, kept by the worker). Pure rules, no DOM.

/**
 * The next quote id that is not the one on screen. `ask()` draws from the bag (the worker's nextQuote, or the
 * dev mock's). The bag never repeats its own last pick, but another tab may have drawn since this page opened, so
 * a draw can be the quote already shown here — then draw again (the bag has now moved past it). Returns null when
 * there is no other quote (one quote in total) or the bag cannot be reached; the page then stays as it is.
 */
export async function nextDifferent(ask, current, tries = 3) {
  for (let k = 0; k < tries; k++) {
    let id;
    try { id = await ask(); } catch { return null; }
    if (id == null) return null;
    if (String(id) !== String(current)) return String(id);
  }
  return null;
}

/**
 * One change per gesture: busy while a change runs, then quiet for `quietMs` — a triple- or quadruple-click
 * (which can fire a second dblclick) or a double-tap that also produces a dblclick never skips two quotes.
 */
export function makeGate(quietMs = 650) {
  let busy = false, last = -Infinity;
  return {
    enter(now) {
      if (busy || now - last < quietMs) return false;
      busy = true; last = now;
      return true;
    },
    leave(now) { busy = false; last = Math.max(last, now); },
    get busy() { return busy; },
  };
}

/**
 * Double-tap on a touch screen: two taps within `ms` and `dist` px. A third tap starts over, so tap-tap-tap is
 * one double-tap, not two.
 */
export function makeDoubleTap(ms = 320, dist = 32) {
  let prev = null;
  return function tap(t, x, y) {
    if (prev && t - prev.t <= ms && Math.hypot(x - prev.x, y - prev.y) <= dist) { prev = null; return true; }
    prev = { t, x, y };
    return false;
  };
}

/** Keys that ask for another quote: → and Space, without modifiers, not auto-repeated. */
export const isNextKey = (e) => !!e && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
  && (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Spacebar');
