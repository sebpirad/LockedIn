import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIconLinks, rankIcons, findIcon, sitesNeedingIcons, iconIsFresh, sameBytes, RETRY_MS } from '../lib/icons.js';
import { findBlockedSite } from '../lib/domains.js';

const PAGE = 'https://x.com/';
const HTML = `<html><head>
  <link rel="shortcut icon" href="//abs.twimg.com/favicons/twitter.3.ico">
  <link rel="icon" type="image/png" sizes="32x32" href="/fav-32.png">
  <link rel="icon" sizes="16x16 48x48" href="/fav-48.png">
  <link rel="apple-touch-icon" sizes="192x192" href="https://abs.twimg.com/icons/apple-touch-icon-192x192.png">
  <link rel="icon" sizes="512x512" href="/big.png">
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
  <link rel="icon" href="data:image/png;base64,AAAA">
  <link rel="stylesheet" href="/x.css">
</head></html>`;

test('parses rel=icon / apple-touch-icon links, skips SVG, data: and stylesheets', () => {
  const links = parseIconLinks(HTML, PAGE);
  assert.deepEqual(links.map((l) => [l.url, l.size]), [
    ['https://abs.twimg.com/favicons/twitter.3.ico', null],
    ['https://x.com/fav-32.png', 32],
    ['https://x.com/fav-48.png', 48],
    ['https://abs.twimg.com/icons/apple-touch-icon-192x192.png', 192],
    ['https://x.com/big.png', 512],
  ]);
  assert.equal(parseIconLinks('<link rel="apple-touch-icon" href="/a.png">', PAGE)[0].size, 180);
});

test('ranks the largest ≤ 192 px first, unknown sizes next, oversize last', () => {
  assert.deepEqual(rankIcons(parseIconLinks(HTML, PAGE)), [
    'https://abs.twimg.com/icons/apple-touch-icon-192x192.png',
    'https://x.com/fav-48.png',
    'https://x.com/fav-32.png',
    'https://abs.twimg.com/favicons/twitter.3.ico',
    'https://x.com/big.png',
  ]);
});

function deps(over = {}) {
  const calls = [];
  const d = {
    calls,
    isBlocked: () => false,
    faviconCache: async (u) => { calls.push(['cache', u]); return null; },
    fetchText: async (u) => { calls.push(['text', u]); return null; },
    fetchBlob: async (u) => { calls.push(['blob', u]); return null; },
    encode: async (b) => (b && b.ok ? 'data:image/png;base64,OK' : null),
    ...over,
  };
  return d;
}

test('order 1: Chrome favicon cache wins, nothing is fetched from the site', async () => {
  const d = deps({ faviconCache: async () => ({ ok: true }) });
  const r = await findIcon('x.com', d);
  assert.equal(r.source, 'chrome');
  assert.deepEqual(d.calls.filter(([k]) => k !== 'cache'), []);
});

test('order 2: the site\'s own <link> icons, best first', async () => {
  const d = deps({
    fetchText: async (u) => { d.calls.push(['text', u]); return u === PAGE ? HTML : null; },
    fetchBlob: async (u) => { d.calls.push(['blob', u]); return u.endsWith('fav-48.png') ? { ok: true } : { ok: false }; },
  });
  const r = await findIcon('x.com', d);
  assert.equal(r.source, 'site');
  assert.deepEqual(d.calls.filter(([k]) => k === 'blob').map(([, u]) => u), [
    'https://abs.twimg.com/icons/apple-touch-icon-192x192.png', 'https://x.com/fav-48.png',
  ]);
});

test('order 3: www. page, then /favicon.ico; nothing found → letter tile', async () => {
  const d = deps();
  const r = await findIcon('example.org', d);
  assert.equal(r.source, null);
  assert.deepEqual(d.calls.map(([k, u]) => `${k} ${u}`), [
    'cache https://example.org/',
    'text https://example.org/', 'text https://www.example.org/',
    'blob https://example.org/favicon.ico', 'blob https://www.example.org/favicon.ico',
  ]);
  const ico = deps({ fetchBlob: async (u) => (u.endsWith('favicon.ico') ? { ok: true } : null) });
  assert.equal((await findIcon('example.org', ico)).source, 'site');
});

test('never fetch a blocked site: nothing at all is requested', async () => {
  const sites = [{ id: 'c-x-com', blocked: true, mode: 'full', suffixes: ['x.com'] }];
  const d = deps({ isBlocked: (u) => !!findBlockedSite(u, sites) });
  const r = await findIcon('x.com', d);
  assert.deepEqual(r, { source: null, skipped: 'blocked' });
  assert.deepEqual(d.calls, []);
});

test('never fetch a blocked URL found in the page (e.g. an icon on a blocked CDN)', async () => {
  const blocked = [{ id: 'twimg', blocked: true, mode: 'full', suffixes: ['twimg.com'] }];
  const d = deps({
    isBlocked: (u) => !!findBlockedSite(u, blocked),
    fetchText: async (u) => (u === PAGE ? HTML : null),
    fetchBlob: async (u) => { d.calls.push(['blob', u]); return null; },
  });
  await findIcon('x.com', d);
  assert.ok(d.calls.every(([, u]) => !u.includes('twimg.com')), JSON.stringify(d.calls));
  assert.ok(d.calls.some(([, u]) => u === 'https://x.com/fav-48.png'));
});

test('which own sites still need an icon', () => {
  const now = Date.now();
  const sites = [
    { id: 'instagram', builtin: true, suffixes: ['instagram.com'] },
    { id: 'c-x-com', builtin: false, suffixes: ['x.com'] },
    { id: 'c-reddit-com', builtin: false, suffixes: ['reddit.com'] },
    { id: 'c-a-dk', builtin: false, suffixes: ['a.dk'] },
    { id: 'c-b-dk', builtin: false, suffixes: ['b.dk'] },
  ];
  const icons = { 'reddit.com': { data: 'data:…', at: now }, 'a.dk': { none: true, at: now - 1000 }, 'b.dk': { none: true, at: now - RETRY_MS - 1 } };
  const blocked = [{ id: 'c-x-com', blocked: true, suffixes: ['x.com'] }];
  assert.deepEqual(sitesNeedingIcons(sites, icons, (u) => !!findBlockedSite(u, blocked), now), ['b.dk']);
  assert.deepEqual(sitesNeedingIcons(sites, icons, () => false, now), ['x.com', 'b.dk']);
});

test('helpers', () => {
  assert.equal(iconIsFresh({ data: 'x', at: 0 }, Date.now()), true);
  assert.equal(iconIsFresh(undefined, 0), false);
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer), true);
  assert.equal(sameBytes(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer), false);
  assert.equal(sameBytes(null, new Uint8Array([1]).buffer), false);
});
