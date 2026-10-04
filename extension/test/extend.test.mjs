import test from 'node:test';
import assert from 'node:assert/strict';
import { extendOptions, DAY_MS } from '../lib/extend.js';

const NOW = Date.parse('2026-10-04T12:00:00Z');
const MIN = 60000;
const P = [25, 60, 120];
const adds = (o) => o.map((x) => x.add);

test('review N7: 1 h into a 24 h session nothing can be added', () => {
  const since = NOW - 60 * MIN;
  const until = since + DAY_MS;
  assert.deepEqual(extendOptions({ now: NOW, until, activeSince: since, presets: P }), []);
});

test('22 h into a lock with 95 min left: only +25 fits (cap = start + 24 h)', () => {
  const since = NOW - 22 * 60 * MIN;
  const opts = extendOptions({ now: NOW, until: NOW + 95 * MIN, activeSince: since, presets: P });
  assert.deepEqual(adds(opts), [25]);
  assert.equal(opts[0].minutes, 120);
  assert.ok(opts[0].end <= since + DAY_MS);
});

test('a fresh 1 h lock offers everything; minutes sent = remaining + add', () => {
  const opts = extendOptions({ now: NOW, until: NOW + 60 * MIN, activeSince: NOW, presets: P });
  assert.deepEqual(adds(opts), P);
  assert.deepEqual(opts.map((o) => o.minutes), [85, 120, 180]);
});

test('exact boundary: end == start + 24 h is allowed, one minute more is not', () => {
  const since = NOW - 23 * 60 * MIN;
  assert.deepEqual(adds(extendOptions({ now: NOW, until: NOW + 35 * MIN, activeSince: since, presets: [25, 26] })), [25]);
});

test('remaining minutes are rounded up, like the minutes actually sent', () => {
  const since = NOW - 23 * 60 * MIN;
  // 34 min 30 s left → 35 + 25 = 60 min → exactly the cap
  assert.deepEqual(adds(extendOptions({ now: NOW, until: NOW + 34.5 * MIN, activeSince: since, presets: [25] })), [25]);
});

test('no activeSince (older daemon) → cap from now; unlocked → nothing', () => {
  assert.deepEqual(adds(extendOptions({ now: NOW, until: NOW + 23 * 60 * MIN, activeSince: NaN, presets: P })), [25, 60]);
  assert.deepEqual(extendOptions({ now: NOW, until: null, activeSince: NOW, presets: P }), []);
  assert.deepEqual(extendOptions({ now: NOW, until: NOW - 1, activeSince: NOW, presets: P }), []);
});
