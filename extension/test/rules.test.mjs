import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRules, rulesHash, PRIORITY, ALL_RESOURCE_TYPES } from '../lib/rules.js';
import { findBlockedSite, normalizeDomain } from '../lib/domains.js';

const yt = {
  id: 'youtube', label: 'YouTube', builtin: true, blocked: true, mode: 'full',
  suffixes: ['youtube.com', 'googlevideo.com', 'YouTube.com'], exactHosts: ['youtubei.googleapis.com'],
  regexFilters: [], allowHosts: ['accounts.youtube.com'],
};
const ig = {
  id: 'instagram', label: 'Instagram', blocked: true, mode: 'full',
  suffixes: ['instagram.com', 'cdninstagram.com'], exactHosts: [],
  regexFilters: ['^https?://instagram\\.f[a-z0-9-]+\\.fna\\.fbcdn\\.net/'], allowHosts: [],
};
const adv = {
  id: 'adversus', label: 'Adversus', blocked: true, mode: 'tab',
  suffixes: ['adversus.io', 'app.adversus.io'], exactHosts: [], regexFilters: ['^https://x\\.adversus\\.io/'], allowHosts: [],
};
const off = { id: 'netflix', label: 'Netflix', blocked: false, mode: 'full', suffixes: ['netflix.com'] };

test('full mode: main_frame redirect + block for everything else', () => {
  const rules = buildRules([yt]);
  const redirect = rules.find((r) => r.action.type === 'redirect');
  const block = rules.find((r) => r.action.type === 'block');
  assert.deepEqual(redirect.condition.resourceTypes, ['main_frame']);
  assert.equal(redirect.action.redirect.extensionPath, '/blocked.html');
  assert.deepEqual(redirect.condition.requestDomains, ['googlevideo.com', 'youtube.com', 'youtubei.googleapis.com']);
  assert.deepEqual(block.condition.excludedResourceTypes, ['main_frame']);
  assert.equal(block.condition.resourceTypes, undefined);
  assert.deepEqual(block.condition.requestDomains, redirect.condition.requestDomains);
});

test('full mode: regexFilters become all-type block rules', () => {
  const rules = buildRules([ig]);
  const re = rules.filter((r) => r.condition.regexFilter);
  assert.equal(re.length, 1);
  assert.equal(re[0].action.type, 'block');
  assert.deepEqual(re[0].condition.resourceTypes, ALL_RESOURCE_TYPES);
});

test('tab mode (Adversus): only a main_frame redirect, nothing else', () => {
  const rules = buildRules([adv]);
  assert.equal(rules.length, 1);
  assert.equal(rules[0].action.type, 'redirect');
  assert.deepEqual(rules[0].condition.resourceTypes, ['main_frame']);
  assert.ok(!rules.some((r) => r.action.type === 'block'));
});

test('allowHosts: allow rule with higher priority than any block/redirect, all types', () => {
  const rules = buildRules([yt, ig, adv]);
  const allow = rules.filter((r) => r.action.type === 'allow');
  assert.equal(allow.length, 1);
  assert.deepEqual(allow[0].condition.requestDomains, ['accounts.youtube.com']);
  assert.deepEqual(allow[0].condition.resourceTypes, ALL_RESOURCE_TYPES);
  for (const r of rules.filter((x) => x.action.type !== 'allow')) assert.ok(allow[0].priority > r.priority);
  assert.equal(allow[0].priority, PRIORITY.ALLOW);
});

test('unblocked sites produce no rules; empty → no allow rule either', () => {
  assert.deepEqual(buildRules([off]), []);
  assert.deepEqual(buildRules([{ ...yt, blocked: false }]), []);
  assert.deepEqual(buildRules(null), []);
});

test('invalid domains and regexes are dropped instead of breaking the batch', () => {
  const rules = buildRules([{ id: 'x', blocked: true, mode: 'full', suffixes: ['ok.com', 'bad domain', '*.x.com', ''], regexFilters: ['(['] }]);
  assert.deepEqual(rules[0].condition.requestDomains, ['ok.com']);
  assert.ok(!rules.some((r) => r.condition.regexFilter));
});

test('unknown mode is treated as full (fail closed)', () => {
  const rules = buildRules([{ id: 'x', blocked: true, mode: 'weird', suffixes: ['x.com'] }]);
  assert.equal(rules.length, 2);
});

test('ids are unique and sequential; hash is stable and order independent', () => {
  const a = buildRules([yt, ig, adv]);
  const b = buildRules([adv, ig, yt]);
  assert.deepEqual(a.map((r) => r.id), a.map((_, i) => i + 1));
  assert.equal(rulesHash(a), rulesHash(b));
  assert.notEqual(rulesHash(a), rulesHash(buildRules([yt])));
});

test('findBlockedSite: suffix match, allowHosts win, tab mode matches top-level', () => {
  const sites = [yt, ig, adv, off];
  assert.equal(findBlockedSite('https://www.youtube.com/watch?v=1', sites).id, 'youtube');
  assert.equal(findBlockedSite('https://accounts.youtube.com/x', sites), null);
  assert.equal(findBlockedSite('https://notyoutube.com/', sites), null);
  assert.equal(findBlockedSite('https://app.adversus.io/', sites).id, 'adversus');
  assert.equal(findBlockedSite('https://instagram.fcph1-1.fna.fbcdn.net/v/x.jpg', sites).id, 'instagram');
  assert.equal(findBlockedSite('https://scontent.xx.fbcdn.net/v/x.jpg', sites), null);
  assert.equal(findBlockedSite('https://netflix.com/', sites), null);
  assert.equal(findBlockedSite('chrome://extensions', sites), null);
});

test('normalizeDomain', () => {
  assert.equal(normalizeDomain(' https://www.Reddit.com/r/x '), 'reddit.com');
  assert.equal(normalizeDomain('ærø.dk'), 'xn--r-3fa9c.dk');
  assert.equal(normalizeDomain('localhost'), null);
  assert.equal(normalizeDomain('a b.com'), null);
  assert.equal(normalizeDomain(''), null);
});
