// "Another quote" (lib/quote-next.js) against the real shuffle bag (lib/shuffle.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextDifferent, makeGate, makeDoubleTap, isNextKey } from '../lib/quote-next.js';
import { pickNext } from '../lib/shuffle.js';

/** A worker-like bag shared by every tab: draw() = the worker's nextQuote. */
function bag(ids, seed = 1) {
  let state = null, x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  return { draw: async () => { const r = pickNext(state, ids, rand); state = r.state; return r.id; } };
}

const IDS = Array.from({ length: 12 }, (_, i) => `q${i}`);

test('another quote: never the one on screen, and a round shows every quote once (one tab)', async () => {
  for (let seed = 1; seed <= 40; seed++) {
    const b = bag(IDS, seed);
    let current = await b.draw();
    const shown = [current];
    for (let k = 0; k < IDS.length - 1; k++) {
      const id = await nextDifferent(b.draw, current);
      assert.notEqual(id, current);
      shown.push(id); current = id;
    }
    assert.equal(new Set(shown).size, IDS.length, 'one full round, no repeats');
    const again = await nextDifferent(b.draw, current); // next round: still never the current one
    assert.ok(again && again !== current);
  }
});

test('another quote: never the current one even when other tabs draw from the same bag in between', async () => {
  for (let seed = 1; seed <= 60; seed++) {
    const b = bag(IDS.slice(0, 3), seed);
    let mine = await b.draw();
    for (let k = 0; k < 30; k++) {
      if ((seed + k) % 2) await b.draw(); // another tab opened (its draw becomes the bag's "last")
      const id = await nextDifferent(b.draw, mine);
      assert.ok(id && id !== mine, `seed ${seed} step ${k}`);
      mine = id;
    }
  }
});

test('another quote: one quote in total, or the bag unreachable → stay (null)', async () => {
  const one = bag(['only']);
  const cur = await one.draw();
  assert.equal(await nextDifferent(one.draw, cur), null);
  assert.equal(await nextDifferent(async () => { throw new Error('worker gone'); }, 'a'), null);
  assert.equal(await nextDifferent(async () => null, 'a'), null);
});

test('gate: one change per gesture — a quadruple click or a tap + its dblclick never skips two', () => {
  const g = makeGate(650);
  assert.equal(g.enter(0), true);
  assert.equal(g.enter(10), false, 'busy');
  g.leave(200);
  assert.equal(g.enter(450), false, 'second dblclick of the same burst');
  assert.equal(g.enter(851), true, 'a new double-click later');
  g.leave(900);
});

test('double-tap: two taps close in time and place; a third tap starts over', () => {
  const tap = makeDoubleTap(320, 32);
  assert.equal(tap(0, 100, 100), false);
  assert.equal(tap(200, 110, 104), true);
  assert.equal(tap(300, 110, 104), false, 'tap-tap-tap is one double-tap');
  assert.equal(tap(1000, 110, 104), false);
  assert.equal(tap(1400, 110, 104), false, 'too slow');
  assert.equal(tap(1500, 200, 104), false, 'too far');
});

test('keys: → and Space, not repeated, no modifiers', () => {
  assert.ok(isNextKey({ key: 'ArrowRight' }));
  assert.ok(isNextKey({ key: ' ' }));
  assert.ok(!isNextKey({ key: ' ', repeat: true }));
  assert.ok(!isNextKey({ key: 'ArrowRight', metaKey: true }));
  assert.ok(!isNextKey({ key: 'ArrowLeft' }));
  assert.ok(!isNextKey({ key: 'Enter' }));
});
