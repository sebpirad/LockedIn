import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceLock, mergeSites, MAX_LOCK_MS } from '../lib/lock.js';

const T0 = Date.parse('2026-10-04T10:00:00Z');
const min = 60000;
const site = (id, blocked, extra = {}) => ({ id, label: id, blocked, mode: 'full', suffixes: [id + '.com'], ...extra });
const status = (active, untilMs, sites = [site('instagram', true)]) => ({
  active, activeUntil: untilMs ? new Date(untilMs).toISOString() : null, sites, apps: [], schedules: [],
});

test('active status starts a lock and stores lockedUntil', () => {
  const s = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  assert.equal(s.locked, true);
  assert.equal(s.lockedUntil, T0 + 90 * min);
  assert.equal(s.lockSites.length, 1);
});

test('daemon unreachable before lockedUntil → stay locked with the snapshot', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  const b = reduceLock(a, null, T0 + 30 * min);
  assert.equal(b.locked, true);
  assert.equal(b.lockedUntil, T0 + 90 * min);
  assert.deepEqual(b.lockSites, a.lockSites);
});

test('daemon says inactive before lockedUntil → still locked (fail closed)', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  const b = reduceLock(a, status(false, null, []), T0 + 10 * min);
  assert.equal(b.locked, true);
  assert.equal(b.lockSites[0].id, 'instagram');
  assert.equal(b.lockSites[0].blocked, true);
});

test('lockedUntil never shrinks, but grows with an extension', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  const shorter = reduceLock(a, status(true, T0 + 20 * min), T0 + min);
  assert.equal(shorter.lockedUntil, T0 + 90 * min);
  const longer = reduceLock(shorter, status(true, T0 + 200 * min), T0 + 2 * min);
  assert.equal(longer.lockedUntil, T0 + 200 * min);
});

test('unreachable after lockedUntil → unlocked, rules go', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  const b = reduceLock(a, null, T0 + 90 * min);
  assert.equal(b.locked, false);
  assert.deepEqual(b.lockSites, []);
  assert.equal(b.lockedUntil, null);
});

test('inactive after lockedUntil → unlocked', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  const b = reduceLock(a, status(false, null), T0 + 91 * min);
  assert.equal(b.locked, false);
});

test('never locked + unreachable → nothing blocked', () => {
  const b = reduceLock(undefined, null, T0);
  assert.equal(b.locked, false);
  assert.deepEqual(b.lockSites, []);
});

test('blocked set can only grow during a lock', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min, [site('instagram', true), site('reddit', false)]), T0);
  // daemon now (wrongly) reports instagram unblocked, reddit newly blocked
  const b = reduceLock(a, status(true, T0 + 90 * min, [site('instagram', false), site('reddit', true)]), T0 + min);
  const byId = Object.fromEntries(b.lockSites.map((s) => [s.id, s]));
  assert.equal(byId.instagram.blocked, true);
  assert.equal(byId.reddit.blocked, true);
});

test('a new lock after the old one ended starts from a fresh snapshot', () => {
  const a = reduceLock(undefined, status(true, T0 + 10 * min, [site('instagram', true)]), T0);
  const b = reduceLock(a, status(false, null, [site('instagram', false)]), T0 + 20 * min);
  const c = reduceLock(b, status(true, T0 + 60 * min, [site('instagram', false), site('reddit', true)]), T0 + 21 * min);
  const byId = Object.fromEntries(c.lockSites.map((s) => [s.id, s]));
  assert.equal(byId.instagram.blocked, false);
  assert.equal(byId.reddit.blocked, true);
});

test('absurd activeUntil is clamped to 24 h (+slack)', () => {
  const a = reduceLock(undefined, status(true, T0 + 100 * 24 * 60 * min), T0);
  assert.equal(a.lockedUntil, T0 + MAX_LOCK_MS);
});

test('garbage activeUntil is ignored, previous lock kept', () => {
  const a = reduceLock(undefined, status(true, T0 + 90 * min), T0);
  const b = reduceLock(a, { ...status(true, null), activeUntil: 'nope' }, T0 + min);
  assert.equal(b.lockedUntil, T0 + 90 * min);
});

test('mergeSites: tab+full → full; domains unioned', () => {
  const m = mergeSites([site('a', true, { mode: 'tab', suffixes: ['a.io'] })], [site('a', true, { mode: 'full', suffixes: ['b.io'] })]);
  assert.equal(m[0].mode, 'full');
  assert.deepEqual(m[0].suffixes.sort(), ['a.io', 'b.io']);
});

// ---- M3: a status received during a lock can only tighten ----
import { findBlockedSite } from '../lib/domains.js';
import { buildRules } from '../lib/rules.js';

const ig = () => site('instagram', true, { suffixes: ['instagram.com'], allowHosts: [] });
const yt = () => site('youtube', true, { suffixes: ['youtube.com'], allowHosts: ['accounts.youtube.com'] });
const adv = () => site('adversus', true, { mode: 'tab', suffixes: ['adversus.io'], allowHosts: [] });

test('M3 probe: daemon says inactive and adds allowHosts instagram.com mid-lock → instagram stays blocked', () => {
  const a = reduceLock(undefined, status(true, T0 + 60 * min, [ig(), yt()]), T0);
  const spoof = status(false, null, [{ ...ig(), allowHosts: ['instagram.com'] }, { ...yt(), allowHosts: ['accounts.youtube.com', 'instagram.com'] }]);
  const b = reduceLock(a, spoof, T0 + 5 * min);
  assert.equal(b.locked, true);
  assert.equal(findBlockedSite('https://www.instagram.com/', b.lockSites).id, 'instagram');
  const allow = buildRules(b.lockSites).filter((r) => r.action.type === 'allow');
  assert.deepEqual(allow.map((r) => r.condition.requestDomains), [['accounts.youtube.com']]);
});

test('M3: allowHosts only shrink; a removed allow host stays removed', () => {
  const a = reduceLock(undefined, status(true, T0 + 60 * min, [yt()]), T0);
  const b = reduceLock(a, status(true, T0 + 60 * min, [{ ...yt(), allowHosts: [] }]), T0 + min);
  assert.deepEqual(b.lockSites[0].allowHosts, []);
  const c = reduceLock(b, status(true, T0 + 60 * min, [yt()]), T0 + 2 * min);
  assert.deepEqual(c.lockSites[0].allowHosts, []);
});

test('M3: a site added mid-lock cannot bring new allow hosts', () => {
  const a = reduceLock(undefined, status(true, T0 + 60 * min, [ig(), yt()]), T0);
  const extra = site('reddit', true, { suffixes: ['reddit.com'], allowHosts: ['instagram.com', 'accounts.youtube.com'] });
  const b = reduceLock(a, status(true, T0 + 60 * min, [ig(), yt(), extra]), T0 + min);
  const r = b.lockSites.find((s) => s.id === 'reddit');
  assert.equal(r.blocked, true);
  assert.deepEqual(r.allowHosts, ['accounts.youtube.com']);
  assert.equal(findBlockedSite('https://instagram.com/', b.lockSites).id, 'instagram');
});

test('M3: mode only tab → full, never full → tab', () => {
  const a = reduceLock(undefined, status(true, T0 + 60 * min, [ig(), adv()]), T0);
  const b = reduceLock(a, status(true, T0 + 60 * min, [{ ...ig(), mode: 'tab' }, { ...adv(), mode: 'full' }]), T0 + min);
  const byId = Object.fromEntries(b.lockSites.map((s) => [s.id, s]));
  assert.equal(byId.instagram.mode, 'full');
  assert.equal(byId.adversus.mode, 'full');
  const c = reduceLock(b, status(true, T0 + 60 * min, [ig(), adv()]), T0 + 2 * min);
  assert.equal(c.lockSites.find((s) => s.id === 'adversus').mode, 'full');
});

test('M3: sites never removed, blocked never true → false, domains never shrink', () => {
  const a = reduceLock(undefined, status(true, T0 + 60 * min, [ig(), yt()]), T0);
  const b = reduceLock(a, status(true, T0 + 60 * min, [{ ...yt(), blocked: false, suffixes: [] }]), T0 + min);
  const byId = Object.fromEntries(b.lockSites.map((s) => [s.id, s]));
  assert.ok(byId.instagram && byId.instagram.blocked);
  assert.equal(byId.youtube.blocked, true);
  assert.deepEqual(byId.youtube.suffixes, ['youtube.com']);
});

test('lock start takes the status as the snapshot, allow hosts included', () => {
  const a = reduceLock(undefined, status(true, T0 + 60 * min, [yt()]), T0);
  assert.deepEqual(a.lockSites[0].allowHosts, ['accounts.youtube.com']);
  assert.equal(findBlockedSite('https://accounts.youtube.com/', a.lockSites), null);
});
