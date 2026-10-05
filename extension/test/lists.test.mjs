import test from 'node:test';
import assert from 'node:assert/strict';
import { pickList, nextListName, toggleMember, lockedTarget, blockedNow } from '../lib/lists.js';

const L1 = { id: 'l1', name: 'Locked In 1', sites: ['slack', 'adversus', 'instagram'], apps: [] };
const L2 = { id: 'l2', name: 'Locked In 2', sites: ['slack', 'adversus', 'instagram', 'youtube', 'tv2'], apps: ['com.spotify.client'] };

test('list picker: remembered list wins, missing/unknown falls back to the first', () => {
  assert.equal(pickList([L1, L2], 'l2'), 'l2');
  assert.equal(pickList([L1, L2], 'gone'), 'l1');
  assert.equal(pickList([L1, L2], null), 'l1');
  assert.equal(pickList([], 'l1'), null);
  assert.equal(pickList(undefined, 'l1'), null);
});

test('new list name: next free "Locked In N"', () => {
  assert.equal(nextListName([L1, L2]), 'Locked In 3');
  assert.equal(nextListName([L1, { ...L2, name: 'Locked In 3' }]), 'Locked In 4');
  assert.equal(nextListName([]), 'Locked In 1');
});

test('in-place edit, unlocked: tap adds and removes sites and apps', () => {
  assert.deepEqual(toggleMember(L1, 'sites', 'youtube', false).sites, ['slack', 'adversus', 'instagram', 'youtube']);
  assert.deepEqual(toggleMember(L1, 'sites', 'slack', false).sites, ['adversus', 'instagram']);
  const b = toggleMember(L2, 'apps', 'com.spotify.client', false);
  assert.deepEqual(b, { name: 'Locked In 2', sites: L2.sites, apps: [] });
  assert.deepEqual(toggleMember(L1, 'apps', 'notion.id', false).apps, ['notion.id']);
});

test('in-place edit, list in the running lock: add only', () => {
  assert.equal(toggleMember(L2, 'sites', 'instagram', true), null);
  assert.equal(toggleMember(L2, 'apps', 'com.spotify.client', true), null);
  assert.deepEqual(toggleMember(L2, 'sites', 'netflix', true).sites, [...L2.sites, 'netflix']);
  assert.equal(toggleMember(L2, 'bogus', 'x', false), null);
  assert.equal(toggleMember(null, 'sites', 'x', false), null);
});

test('during a lock taps go to the remembered list if active, else the first active one', () => {
  assert.equal(lockedTarget(['l1', 'l2'], 'l2'), 'l2');
  assert.equal(lockedTarget(['l1'], 'l2'), 'l1');
  assert.equal(lockedTarget([], 'l2'), null);
});

test('blocked now = sites.blocked ∪ apps.inActiveList', () => {
  const b = blockedNow({
    sites: [{ id: 'a', blocked: true }, { id: 'b', blocked: false }],
    apps: [{ bundleId: 'x', blocked: true, inActiveList: false }, { bundleId: 'y', blocked: false, inActiveList: true }],
  });
  assert.deepEqual([...b.sites], ['a']);
  assert.deepEqual([...b.apps], ['y']);
});

test('Lukkes aldrig: never-close apps are not list members; the section lists every app, browsers last', async () => {
  const { listableApps, neverCloseRows } = await import('../lib/lists.js');
  const apps = [
    { bundleId: 'org.mozilla.firefox', name: 'Firefox', kind: 'browser', blocked: true },
    { bundleId: 'com.anthropic.claudefordesktop', name: 'Claude', kind: 'webengine', blocked: true },
    { bundleId: 'com.spotify.client', name: 'Spotify', kind: 'webengine', blocked: false },
    { bundleId: 'com.wispr.flow', name: 'Wispr Flow', kind: 'webengine', blocked: false, neverClose: true },
  ];
  assert.deepEqual(listableApps(apps).map((a) => a.name), ['Spotify']);
  assert.deepEqual(neverCloseRows(apps).map((r) => `${r.app.name}${r.browser ? ' (browser)' : ''}`), ['Claude', 'Spotify', 'Wispr Flow', 'Firefox (browser)']);
});
