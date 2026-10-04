// Icons for the user's own sites. Order: Chrome's favicon cache → the site's own <link rel=icon> →
// /favicon.ico. Never a third-party favicon service (the block list must not leak), and never a
// URL that is blocked right now (nothing is weakened to fetch an icon).

export const ICON_PX = 64;
export const MAX_SOURCE_PX = 192;
export const MAX_DATA_URL = 32 * 1024;
export const RETRY_MS = 7 * 24 * 60 * 60 * 1000;
/** A page Chrome cannot have a favicon for: its _favicon answer is the generic globe. */
export const SENTINEL_PAGE = 'https://lockedin-no-icon.invalid/';

const attr = (tag, name) => {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

/** <link rel="icon"|"shortcut icon"|"apple-touch-icon" …> → [{url, rel, size}] (size null when unknown). */
export function parseIconLinks(html, pageUrl) {
  const out = [];
  const text = String(html || '').slice(0, 512 * 1024);
  for (const m of text.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (!/(^|\s)(icon|apple-touch-icon|apple-touch-icon-precomposed)(\s|$)/.test(rel)) continue;
    const href = attr(tag, 'href');
    if (!href) continue;
    let url;
    try { url = new URL(href.replace(/&amp;/g, '&'), pageUrl); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue; // no data:, javascript: …
    const type = (attr(tag, 'type') || '').toLowerCase();
    if (type.includes('svg') || /\.svg(\?|$)/i.test(url.pathname)) continue; // workers cannot rasterise SVG
    const sizes = (attr(tag, 'sizes') || '').toLowerCase();
    const nums = [...sizes.matchAll(/(\d+)x(\d+)/g)].map((x) => Math.max(+x[1], +x[2]));
    const size = nums.length ? Math.max(...nums) : (rel.includes('apple-touch-icon') ? 180 : null);
    out.push({ url: url.href, rel, size });
  }
  return out;
}

/** Best first: the largest ≤ 192 px, then unknown sizes, then larger ones (smallest first). */
export function rankIcons(links) {
  const fit = links.filter((l) => l.size != null && l.size <= MAX_SOURCE_PX).sort((a, b) => b.size - a.size);
  const unknown = links.filter((l) => l.size == null);
  const big = links.filter((l) => l.size != null && l.size > MAX_SOURCE_PX).sort((a, b) => a.size - b.size);
  return [...new Set([...fit, ...unknown, ...big].map((l) => l.url))];
}

export function sameBytes(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a), y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/** Whether a stored entry means "nothing to do". Failures are retried after a week. */
export function iconIsFresh(entry, now) {
  if (!entry) return false;
  if (entry.data) return true;
  return now - (entry.at || 0) < RETRY_MS;
}

/** Own sites that need an icon now: not built-in, not cached, and not blocked right now. */
export function sitesNeedingIcons(sites, icons, isBlocked, now) {
  return (sites || [])
    .filter((s) => s && !s.builtin && Array.isArray(s.suffixes) && s.suffixes[0])
    .map((s) => s.suffixes[0])
    .filter((d, i, all) => all.indexOf(d) === i)
    .filter((d) => !iconIsFresh(icons && icons[d], now))
    .filter((d) => !isBlocked(`https://${d}/`) && !isBlocked(`https://www.${d}/`));
}

/**
 * Find an icon for `domain`. All I/O is injected:
 *   isBlocked(url) → bool        never fetch these
 *   faviconCache(pageUrl) → Blob|null   Chrome's cache, generic globe already filtered out
 *   fetchText(url) → string|null
 *   fetchBlob(url) → Blob|null
 *   encode(blob) → dataURL|null  64×64 PNG ≤ 32 KB, null if not an image
 * → {source: 'chrome'|'site'|null, dataUrl?, skipped?: 'blocked'}
 */
export async function findIcon(domain, deps) {
  const pages = [`https://${domain}/`];
  if (!domain.startsWith('www.')) pages.push(`https://www.${domain}/`);
  if (deps.isBlocked(pages[0])) return { source: null, skipped: 'blocked' };

  const tryBlob = async (blob) => (blob ? deps.encode(blob) : null);

  const cached = await tryBlob(await deps.faviconCache(pages[0]).catch(() => null));
  if (cached) return { source: 'chrome', dataUrl: cached };

  const tried = new Set();
  const tryUrl = async (url) => {
    if (tried.has(url) || deps.isBlocked(url)) return null;
    tried.add(url);
    return tryBlob(await deps.fetchBlob(url).catch(() => null));
  };

  for (const page of pages) {
    if (deps.isBlocked(page)) continue;
    const html = await deps.fetchText(page).catch(() => null);
    if (!html) continue;
    for (const url of rankIcons(parseIconLinks(html, page))) {
      const d = await tryUrl(url);
      if (d) return { source: 'site', dataUrl: d };
    }
  }
  for (const page of pages) {
    if (deps.isBlocked(page)) continue;
    const d = await tryUrl(new URL('/favicon.ico', page).href);
    if (d) return { source: 'site', dataUrl: d };
  }
  return { source: null };
}
