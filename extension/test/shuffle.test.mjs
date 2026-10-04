import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNext } from '../lib/shuffle.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test('every quote once per round, never the same twice in a row (many rounds, many seeds)', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  for (let seed = 1; seed < 200; seed++) {
    const rand = seeded(seed);
    let st = null;
    const seq = [];
    for (let i = 0; i < ids.length * 6; i++) {
      const r = pickNext(st, ids, rand);
      st = r.state;
      seq.push(r.id);
    }
    for (let round = 0; round < 6; round++) {
      const chunk = seq.slice(round * ids.length, (round + 1) * ids.length);
      assert.deepEqual([...chunk].sort(), ids, `seed ${seed} round ${round}`);
    }
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `seed ${seed} pos ${i}`);
  }
});

test('refill boundary: the first pick of a new round is never the last of the previous', () => {
  // rand() → 0 always picks the first candidate; force the case where it equals last
  const ids = ['a', 'b'];
  let st = { seen: ['b', 'a'], last: 'a' };
  const r = pickNext(st, ids, () => 0);
  assert.equal(r.id, 'b');
});

test('two quotes alternate', () => {
  let st = null, prev = null;
  for (let i = 0; i < 50; i++) {
    const r = pickNext(st, ['x', 'y'], Math.random);
    assert.notEqual(r.id, prev);
    prev = r.id; st = r.state;
  }
});

test('single quote repeats; empty list gives null', () => {
  let r = pickNext(null, ['only']);
  r = pickNext(r.state, ['only']);
  assert.equal(r.id, 'only');
  assert.equal(pickNext(null, []).id, null);
});

test('added quotes join the current round, removed ones are forgotten', () => {
  const seq = [];
  let st = null;
  const step = (ids) => { const r = pickNext(st, ids, () => 0); st = r.state; seq.push(r.id); };
  step(['a', 'b', 'c']);
  step(['a', 'b', 'c']);
  step(['a', 'c', 'd']); // b removed, d added; a already seen this round
  step(['a', 'c', 'd']);
  step(['a', 'c', 'd']); // round over → refill, but not d again
  assert.deepEqual(seq, ['a', 'b', 'c', 'd', 'a']);
});

test('corrupt state is tolerated', () => {
  const r = pickNext({ seen: 'nope', last: 42 }, ['a', 'b']);
  assert.ok(['a', 'b'].includes(r.id));
});
