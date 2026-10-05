import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// "Lysere mørkt tema": the tokens in ui/app.css must keep these contrast floors (WCAG 2.x).
const css = readFileSync(new URL('../ui/app.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
const tok = Object.fromEntries([...root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('graphite base, not near-black', () => {
  assert.ok(lum(tok.bg) > lum('#16181c') && lum(tok.bg) < lum('#24282f'), tok.bg);
});

test('text tokens: ≥ 4.5:1 on every surface; secondary text ≥ 7:1 on the page and the panel', () => {
  for (const surface of ['bg', 'surface', 'surface-2', 'raised']) {
    for (const t of ['text', 'idle', 'muted', 'subtle', 'accent', 'bad']) {
      assert.ok(ratio(tok[t], tok[surface]) >= 4.5, `--${t} on --${surface}: ${ratio(tok[t], tok[surface]).toFixed(2)}`);
    }
  }
  for (const surface of ['bg', 'surface']) assert.ok(ratio(tok.muted, tok[surface]) >= 7, `--muted on --${surface}`);
  assert.ok(ratio(tok['accent-ink'], tok.accent) >= 7);
});

test('component edges ≥ 3:1; dividers clearly visible', () => {
  for (const surface of ['bg', 'surface']) {
    assert.ok(ratio(tok['line-2'], tok[surface]) >= 3, `--line-2 on --${surface}`);
    assert.ok(ratio(tok.ring, tok[surface]) >= 3, `--ring on --${surface}`);
  }
  assert.ok(ratio(tok.line, tok.bg) >= 1.9, '--line on --bg');
});
