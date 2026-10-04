import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nameCommit, deletePrompt, blockPrompt, confirmLine, idleTimer, tileLabel, appLabel, appLetters,
  nameFromDomain, healthMessage, startBlocker, confirmArmed, CONFIRM_DELAY_MS,
} from '../lib/view.js';

const NOW = Date.parse('2026-10-04T12:00:00Z'); // 14:00 i København

test('M2: Enter and blur commit the typed name; empty or unchanged does nothing', () => {
  assert.deepEqual(nameCommit('rename', ' Kold kanvas ', 'Locked In 2'), { op: 'rename', name: 'Kold kanvas' });
  assert.deepEqual(nameCommit('rename', 'Locked In 2', 'Locked In 2'), { op: 'none' });
  assert.deepEqual(nameCommit('rename', '   ', 'Locked In 2'), { op: 'none' });
  assert.deepEqual(nameCommit('new', 'Locked In 3', ''), { op: 'create', name: 'Locked In 3' });
  assert.deepEqual(nameCommit(null, 'x', ''), { op: 'none' }); // already cancelled (Escape) → blur does nothing
  assert.equal(nameCommit('new', 'x'.repeat(60), '').name.length, 40);
});

test('M3: the delete question names the current list', () => {
  assert.equal(deletePrompt('Locked In 2'), 'Slet Locked In 2?');
});

test('M4: adding during a lock asks with the end time', () => {
  assert.equal(blockPrompt('Netflix', Date.parse('2026-10-04T13:00:00Z'), NOW), 'Bloker Netflix til 15:00?');
  assert.equal(blockPrompt('Netflix', Date.parse('2026-10-04T23:30:00Z'), NOW), 'Bloker Netflix til i morgen 01:30?');
});

test('confirmation line puts "kan ikke stoppes" first', () => {
  assert.equal(confirmLine(NOW, Date.parse('2026-10-04T13:00:00Z'), 'Locked In 2'), 'Kan ikke stoppes før kl. 15:00 · Locked In 2');
  assert.equal(confirmLine(NOW, Date.parse('2026-10-04T23:30:00Z'), ''), 'Kan ikke stoppes før kl. 01:30 i morgen');
});

test('idle preview shows whole minutes only', () => {
  assert.equal(idleTimer(33 * 60000 + 45000), '00:34:00');
  assert.equal(idleTimer(34 * 60000), '00:34:00');
  assert.equal(idleTimer(-1), '00:00:00');
});

test('tile labels: short catalog labels, distinct app tiles', () => {
  assert.equal(tileLabel('TV3 / Viafree / Allente'), 'TV3');
  const sites = [{ label: 'Slack' }, { label: 'TV 2' }];
  assert.equal(appLabel({ name: 'Slack' }, sites), 'Slack-app');
  assert.equal(appLabel({ name: 'Spotify' }, sites), 'Spotify');
  assert.equal(appLetters('Slack'), 'Sl');
  assert.equal(appLetters('Spotify'), 'Sp');
  assert.equal(appLetters('1Password 7'), '1p');
  assert.equal(appLetters(''), '?');
  assert.equal(nameFromDomain('reddit.com'), 'Reddit');
});

test('health line is plain Danish; detail only in the tooltip', () => {
  assert.equal(healthMessage({ reachable: false }, NOW).text, "Locked in kører ikke lige nu — genstart Mac'en");
  const m = healthMessage({ reachable: true, status: { enforcement: { pf: false, lastTick: new Date(NOW).toISOString() } } }, NOW);
  assert.equal(m.text, "Blokeringen virker ikke helt — genstart Mac'en");
  assert.match(m.title, /netværksfilter/);
  assert.equal(healthMessage({ reachable: true, status: { enforcement: { hosts: true, pf: true, appControl: true, lastTick: new Date(NOW).toISOString() } } }, NOW), null);
  assert.match(healthMessage({ reachable: true, status: { enforcement: { lastTick: new Date(NOW - 600000).toISOString() } } }, NOW).title, /13:50/);
});

test('Start is blocked when down, without a time, without a list, or with an empty list', () => {
  const list = { sites: ['slack'], apps: [] };
  assert.equal(startBlocker({ reachable: false, end: 1, list, hasLists: true }), 'down');
  assert.equal(startBlocker({ reachable: true, end: null, list, hasLists: true }), 'time');
  assert.equal(startBlocker({ reachable: true, end: 1, list: null, hasLists: true }), 'nolist');
  assert.equal(startBlocker({ reachable: true, end: 1, list: { sites: [], apps: [] }, hasLists: true }), 'empty');
  assert.equal(startBlocker({ reachable: true, end: 1, list: { sites: [], apps: ['a'] }, hasLists: true }), null);
  assert.equal(startBlocker({ reachable: true, end: 1, list: null, hasLists: false }), null); // daemon without lists
});

test('R1: confirms ignore the first 500 ms and double-clicks', () => {
  assert.equal(confirmArmed(1000, 1000 + CONFIRM_DELAY_MS - 1, 1), false);
  assert.equal(confirmArmed(1000, 1000 + CONFIRM_DELAY_MS, 1), true);
  assert.equal(confirmArmed(1000, 1000 + 5000, 2), false); // 2nd click of a double-click
  assert.equal(confirmArmed(1000, 1000 + 5000, 0), true);  // Enter/space after the window
  assert.equal(confirmArmed(1000, 1100, 0), false);        // Enter inside the window
  assert.equal(confirmArmed(undefined, 5000, 1), false);
});

test('Ny liste: clicking away from the untouched default creates nothing; Enter does', () => {
  assert.deepEqual(nameCommit('new', 'Locked In 3', '', 'blur', 'Locked In 3'), { op: 'none' });
  assert.deepEqual(nameCommit('new', 'Locked In 3', '', 'enter', 'Locked In 3'), { op: 'create', name: 'Locked In 3' });
  assert.deepEqual(nameCommit('new', 'Dybt arbejde', '', 'blur', 'Locked In 3'), { op: 'create', name: 'Dybt arbejde' });
});
