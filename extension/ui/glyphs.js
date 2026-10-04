// Hand-drawn, simplified glyphs: recognisable by shape and brand colour, not official logo files.
// All strings are static (no user data) — safe to assign to innerHTML.

const G = {
  instagram: `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="gi" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#feda75"/><stop offset=".35" stop-color="#fa7e1e"/><stop offset=".65" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#gi)"/><rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" stroke-width="3"/><circle cx="24" cy="24" r="6.2" fill="none" stroke="#fff" stroke-width="3"/><circle cx="31.6" cy="16.4" r="1.9" fill="#fff"/></svg>`,
  youtube: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#1b1b1b"/><rect x="7" y="13" width="34" height="23" rx="7" fill="#ff0033"/><path d="M21 19.2v10.6l9.2-5.3z" fill="#fff"/></svg>`,
  slack: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#fff"/><g stroke-linecap="round" stroke-width="5.4" fill="none"><path d="M19.5 10.5v13" stroke="#36c5f0"/><path d="M10.5 28.5h13" stroke="#ecb22e"/><path d="M28.5 24.5v13" stroke="#e01e5a"/><path d="M24.5 19.5h13" stroke="#2eb67d"/></g><g><circle cx="10.5" cy="19.5" r="2.7" fill="#36c5f0"/><circle cx="28.5" cy="10.5" r="2.7" fill="#2eb67d"/><circle cx="37.5" cy="28.5" r="2.7" fill="#e01e5a"/><circle cx="19.5" cy="37.5" r="2.7" fill="#ecb22e"/></g></svg>`,
  netflix: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0b0b0b"/><path d="M15 9h6.2l5.6 16.5V9H33v30.4c-2-.3-4.1-.5-6.2-.6L21.2 22.6V38.4c-2.1.1-4.2.4-6.2.7z" fill="#e50914"/><path d="M15 9h6.2L33 39.4c-2-.3-4.1-.5-6.2-.6z" fill="#b20710" opacity=".9"/></svg>`,
  viaplay: `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="gv" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2e7e"/><stop offset="1" stop-color="#5b2cff"/></linearGradient></defs><rect width="48" height="48" rx="12" fill="url(#gv)"/><path d="M18 14.5c0-1.6 1.7-2.5 3-1.7l13.6 8.6c1.3.8 1.3 2.6 0 3.4L21 33.4c-1.3.8-3-.1-3-1.7z" fill="#fff"/></svg>`,
  adversus: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0a3d91"/><path d="M14 27v-3a10 10 0 0 1 20 0v3" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><rect x="11.5" y="25" width="6" height="9" rx="2.5" fill="#5fd1ff"/><rect x="30.5" y="25" width="6" height="9" rx="2.5" fill="#5fd1ff"/><path d="M33.5 34c0 3-3 4.5-7 4.5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  threads: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#000"/><path d="M31.5 21.5c-.6-4.8-3.6-7.5-8.3-7.5-5.6 0-9 4.2-9 10.3 0 6.4 3.6 10.2 9.4 10.2 4.6 0 8.6-2.4 8.6-6.6 0-3.3-2.7-5-6.6-5-3.4 0-5.3 1.6-5.3 3.6 0 1.9 1.6 3.1 3.7 3.1 3.6 0 5.3-2.8 5.3-7.4" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>`,
  tv3: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#e4002b"/><text x="24" y="31" text-anchor="middle" font-family="-apple-system, 'SF Pro Display', 'Helvetica Neue', sans-serif" font-size="17" font-weight="800" fill="#fff" letter-spacing="-.5">TV3</text></svg>`,
  viafree: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#ff3a6e"/><path d="M14 16l7.5 17h1L30 16" fill="none" stroke="#fff" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/><circle cx="34" cy="31" r="2.6" fill="#fff"/></svg>`,
  allente: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#5c1fd1"/><circle cx="22" cy="26" r="7.5" fill="none" stroke="#fff" stroke-width="3.4"/><path d="M29.5 18.5v15" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>`,
  viaplaygroup: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#22114a"/><path d="M11 15l6.5 18h1.4L25 15" fill="none" stroke="#ff2e7e" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/><path d="M38 20.5a7 7 0 1 0 0 7.5h-5" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>`,
};

const KEYS = [
  ['viaplaygroup', /viaplay\s*group|viaplaygroup/],
  ['instagram', /instagram/],
  ['youtube', /youtube/],
  ['slack', /slack/],
  ['netflix', /netflix/],
  ['adversus', /adversus/],
  ['threads', /threads/],
  ['tv3', /tv3|tv 3/],
  ['viafree', /viafree/],
  ['allente', /allente/],
  ['viaplay', /viaplay/],
];

/** Glyph SVG for a site, or null (caller draws a monogram). */
export function glyphFor(site) {
  const hay = `${site.id || ''} ${site.label || ''}`.toLowerCase();
  for (const [k, re] of KEYS) if (re.test(hay)) return G[k];
  return null;
}

export const LOCK_ICON = `<svg viewBox="0 0 16 16" aria-hidden="true" class="lock-ic"><rect x="3" y="7" width="10" height="7.5" rx="1.8" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;

const MONO_COLORS = ['#3a4252', '#46384f', '#2f4a46', '#4d4232', '#33405a', '#503a3a'];
export function monogramColor(text) {
  let h = 0;
  for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MONO_COLORS[h % MONO_COLORS.length];
}
