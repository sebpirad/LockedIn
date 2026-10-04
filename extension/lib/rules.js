// Builds declarativeNetRequest dynamic rules from status.sites.
//
//  mode "full": main_frame → /blocked.html, every other resource type blocked, regexFilters blocked (all types)
//  mode "tab":  main_frame → /blocked.html only (Adversus: PowerLink's background calls must keep working)
//  allowHosts:  one allow rule above everything else
// Unknown modes are treated as "full" (fail closed). Invalid domains are dropped so one bad
// entry cannot make updateDynamicRules reject the whole batch.

import { isValidDomain } from './domains.js';

export const PRIORITY = { ALLOW: 100, BLOCK: 10 };
export const BLOCKED_PAGE = '/blocked.html';

export const ALL_RESOURCE_TYPES = [
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font', 'object',
  'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket', 'webtransport', 'webbundle', 'other',
];

const uniqDomains = (list) =>
  [...new Set((list || []).map((d) => String(d).trim().toLowerCase()))].filter(isValidDomain).sort();

function regexCompiles(re) {
  if (typeof re !== 'string' || !re || re.length > 2000) return false;
  try { new RegExp(re); return true; } catch { return false; }
}

export function buildRules(sites) {
  const rules = [];
  const allow = new Set();
  let id = 1;
  const blocked = (Array.isArray(sites) ? sites : [])
    .filter((s) => s && s.blocked)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const site of blocked) {
    const domains = uniqDomains([...(site.suffixes || []), ...(site.exactHosts || [])]);
    const tabOnly = site.mode === 'tab';
    if (domains.length) {
      rules.push({
        id: id++, priority: PRIORITY.BLOCK,
        action: { type: 'redirect', redirect: { extensionPath: BLOCKED_PAGE } },
        condition: { requestDomains: domains, resourceTypes: ['main_frame'] },
      });
      if (!tabOnly) {
        rules.push({
          id: id++, priority: PRIORITY.BLOCK,
          action: { type: 'block' },
          condition: { requestDomains: domains, excludedResourceTypes: ['main_frame'] },
        });
      }
    }
    if (!tabOnly) {
      for (const re of [...new Set(site.regexFilters || [])].filter(regexCompiles)) {
        rules.push({
          id: id++, priority: PRIORITY.BLOCK,
          action: { type: 'block' },
          condition: { regexFilter: re, resourceTypes: ALL_RESOURCE_TYPES },
        });
      }
    }
    for (const h of uniqDomains(site.allowHosts)) allow.add(h);
  }

  if (allow.size && rules.length) {
    rules.push({
      id: id++, priority: PRIORITY.ALLOW,
      action: { type: 'allow' },
      condition: { requestDomains: [...allow].sort(), resourceTypes: ALL_RESOURCE_TYPES },
    });
  }
  return rules;
}

/** Short stable fingerprint (FNV-1a 32) of a rule set, used to skip no-op rebuilds. */
export function rulesHash(rules) {
  const s = JSON.stringify(rules);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + ':' + rules.length;
}
