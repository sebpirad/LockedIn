// Static checks on manifest.json. The real proof is test/load-in-chrome.sh (Chrome for Testing).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const m = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));

test('CSP keywords are quoted (Chrome rejects bare self/none)', () => {
  const csp = m.content_security_policy.extension_pages;
  const KEYWORDS = ['self', 'none', 'unsafe-inline', 'unsafe-eval', 'wasm-unsafe-eval', 'strict-dynamic'];
  for (const directive of csp.split(';').map((d) => d.trim()).filter(Boolean)) {
    const [name, ...values] = directive.split(/\s+/);
    for (const v of values) {
      assert.ok(!KEYWORDS.includes(v), `unquoted keyword "${v}" in ${name}`);
      if (v.startsWith("'")) assert.match(v, /^'(self|none)'$/, `unexpected keyword ${v} in ${name}`);
    }
  }
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:919(;|$)/);
});

test('key gives the fixed extension id', () => {
  const hex = crypto.createHash('sha256').update(Buffer.from(m.key, 'base64')).digest('hex').slice(0, 32);
  const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.equal(id, 'nildondjeeibacombanbjnokenmhfhie');
});

test('only blocked.html is web-accessible; nothing from dev/ is referenced', () => {
  assert.deepEqual(m.web_accessible_resources, [{ resources: ['blocked.html'], matches: ['<all_urls>'] }]);
  assert.ok(!JSON.stringify(m).includes('dev/'));
  assert.deepEqual(m.host_permissions, ['<all_urls>', 'http://127.0.0.1:919/*']);
});

test('v1.1.4: named "LockedIn", and a new tab shows app.html', () => {
  assert.equal(m.name, 'LockedIn');
  assert.equal(m.action.default_title, 'LockedIn');
  assert.deepEqual(m.chrome_url_overrides, { newtab: 'app.html' });
  const app = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8');
  const blocked = fs.readFileSync(new URL('../blocked.html', import.meta.url), 'utf8');
  assert.match(app, /<title>LockedIn<\/title>/);
  assert.match(blocked, /<title>LockedIn<\/title>/);
  assert.match(app, />Start Locked in</); // the owner's button text stays
  assert.doesNotMatch(app, /\bautofocus\b/); // a new tab keeps focus in the address bar
});
