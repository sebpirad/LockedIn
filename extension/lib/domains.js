// Host/domain helpers shared by rule building, tab sweeping and the UI.

// Same pattern the daemon validates against (docs/API.md), after punycode + lower case.
export const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Turn user input ("https://www.Reddit.com/r/x", "ærø.dk") into "reddit.com" / punycode, or null. */
export function normalizeDomain(input) {
  let s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s;
  let host;
  try { host = new URL(s).hostname; } catch { return null; }
  host = host.replace(/\.$/, '').replace(/^www\./, '');
  return DOMAIN_RE.test(host) ? host : null;
}

export function isValidDomain(d) { return typeof d === 'string' && DOMAIN_RE.test(d); }

/** host equals domain or is a subdomain of it — same semantics as DNR requestDomains. */
export function hostUnder(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function hostOf(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.hostname.replace(/\.$/, '').toLowerCase();
  } catch { return null; }
}

function regexHits(url, filters) {
  for (const f of filters || []) {
    try { if (new RegExp(f).test(url)) return true; } catch { /* invalid → ignored, as in buildRules */ }
  }
  return false;
}

/** Returns the blocked site a top-level URL belongs to, or null. Respects allowHosts of all blocked sites. */
export function findBlockedSite(url, sites) {
  const host = hostOf(url);
  if (!host || !Array.isArray(sites)) return null;
  const active = sites.filter((s) => s && s.blocked);
  for (const s of active) {
    for (const a of s.allowHosts || []) if (hostUnder(host, String(a).toLowerCase())) return null;
  }
  for (const s of active) {
    const doms = [...(s.suffixes || []), ...(s.exactHosts || [])];
    if (doms.some((d) => hostUnder(host, String(d).toLowerCase()))) return s;
    if (s.mode !== 'tab' && regexHits(url, s.regexFilters)) return s;
  }
  return null;
}

export { hostOf };
