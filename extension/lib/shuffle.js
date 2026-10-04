// Quote rotation: every quote once per round before any repeats, and never the same quote
// twice in a row — not even across a round boundary. Tolerates quotes being added/removed.
//
// state: { seen: string[] (ids shown this round), last: string|null }

export function pickNext(state, ids, rand = Math.random) {
  const all = [...new Set((ids || []).map(String))];
  if (!all.length) return { id: null, state: { seen: [], last: null } };

  const last = state && all.includes(state.last) ? state.last : null;
  let seen = (state && Array.isArray(state.seen) ? state.seen : []).filter((id) => all.includes(id));

  let pool = all.filter((id) => !seen.includes(id));
  if (!pool.length) {
    seen = [];
    pool = all.slice();
  }
  if (pool.length > 1 && last) pool = pool.filter((id) => id !== last);
  // Only one quote in total → it must repeat.
  const id = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return { id, state: { seen: [...seen, id], last: id } };
}
