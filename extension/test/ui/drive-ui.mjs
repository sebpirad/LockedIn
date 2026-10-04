// CDP driver for test/ui-in-chrome.sh: drives app.html?mock=1 (dev mock, no extension) in real Chrome.
// Usage: node drive-ui.mjs <cdpPort> <httpPort>
const [cdpPort, httpPort] = process.argv.slice(2);
const BASE = `http://127.0.0.1:${httpPort}/app.html?mock=1`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail !== '' ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

let ws;
let seq = 0;
const pending = new Map();
for (let i = 0; i < 80 && !ws; i++) {
  try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json()).webSocketDebuggerUrl); } catch { await sleep(250); }
}
await new Promise((r) => { ws.onopen = r; });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
const send = (method, params = {}, sessionId) => new Promise((r, reject) => {
  const id = ++seq;
  const t = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
  pending.set(id, (d) => { clearTimeout(t); r(d); });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const S = (await send('Target.attachToTarget', { targetId, flatten: true })).result.sessionId;
// Hard stop: nothing in this browser may reach the real daemon on port 919.
const NO_DAEMON = ['*127.0.0.1:919*', '*localhost:919*', '*[::1]:919*'];
await send('Network.enable', {}, S);
await send('Network.setBlockedURLs', { urls: NO_DAEMON }, S);
async function js(expression) {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true }, S);
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
}
async function open(query) {
  await send('Page.navigate', { url: BASE + query }, S);
  await sleep(900);
  // Only ever drive the dev mock. If the page is not in mock mode, stop before any click.
  const mock = await js('return document.documentElement.dataset.mock === "1"');
  if (!mock) { console.log('FAIL  page is not in mock mode — aborting before any interaction'); process.exit(1); }
}
const H = `const $ = (id) => document.getElementById(id); const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const item = (t) => [...document.querySelectorAll('#listMenu .menu-item, #listMenu button')].find((b) => b.textContent.trim().endsWith(t));
  const tile = (l) => [...document.querySelectorAll('#tiles .tile')].find((t) => t.querySelector('.tile-label').textContent === l);`;

// ---- M2: rename saves on blur and Enter, Escape cancels ----
await open('&r=m2');
let r = await js(`${H} localStorage.removeItem('li.list');
  $('listBtn').click(); await w(50); item('Omdøb').click(); await w(50);
  $('nameInput').value = 'Kold kanvas'; $('nameInput').blur(); await w(500);
  const afterBlur = $('listName').textContent;
  $('listBtn').click(); await w(50); item('Omdøb').click(); await w(50);
  $('nameInput').value = 'Skal ikke gemmes'; $('nameInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(500);
  const afterEsc = $('listName').textContent;
  $('listBtn').click(); await w(50); item('Omdøb').click(); await w(50);
  $('nameInput').value = 'Med Enter'; $('nameForm').requestSubmit(); await w(500);
  return { afterBlur, afterEsc, afterEnter: $('listName').textContent, inputHidden: $('nameForm').hidden };`);
check(r.afterBlur === 'Kold kanvas', 'M2: rename saves on blur', r.afterBlur);
check(r.afterEsc === 'Kold kanvas', 'M2: Escape cancels', r.afterEsc);
check(r.afterEnter === 'Med Enter' && r.inputHidden, 'M2: rename saves on Enter', r.afterEnter);

// ---- empty list cannot start ----
r = await js(`${H}
  $('listBtn').click(); await w(50); item('Ny liste').click(); await w(50); $('nameForm').requestSubmit(); await w(600);
  const empty = { name: $('listName').textContent, tom: !$('listEmpty').hidden, disabled: $('start').disabled };
  tile('Instagram').click(); await w(400);
  return { empty, after: { tom: !$('listEmpty').hidden, disabled: $('start').disabled, badge: !!tile('Instagram').querySelector('.badge') } };`);
check(r.empty.name === 'Locked In 3' && r.empty.tom && r.empty.disabled, 'empty list: "Tom liste" and Start disabled', JSON.stringify(r.empty));
check(!r.after.tom && !r.after.disabled && r.after.badge, 'first tap: on the list (lock badge), Start enabled', JSON.stringify(r.after));

// ---- M3: delete asks once, names the current list ----
r = await js(`${H}
  $('listBtn').click(); await w(50);
  const first = document.querySelector('#listMenu .menu-item').textContent;
  item('Slet').click(); await w(50);
  const ask = $('listMenu').hidden ? 'menu closed' : document.querySelector('#listMenu .menu-ask div').textContent;
  const countBefore = document.querySelectorAll('#listMenu .menu-item').length;
  [...document.querySelectorAll('#listMenu button')].find((b) => b.textContent === 'Annullér').click(); await w(50);
  const stillThere = $('listMenu').hidden ? 'menu closed' : $('listName').textContent;
  item('Slet').click(); await w(600);
  [...document.querySelectorAll('#listMenu .menu-ask button')].find((b) => b.textContent === 'Slet').click(); await w(600);
  $('listBtn').click(); await w(50); const names = [...document.querySelectorAll('#listMenu .menu-item')].map((b) => b.textContent); $('listBtn').click();
  return { first, ask, countBefore, stillThere, after: $('listName').textContent, names };`);
check(r.first === '✓Locked In 3', 'M3: menu starts with the current list, checked', r.first);
check(r.ask === 'Slet Locked In 3?', 'M3: delete asks and names the current list', r.ask);
check(r.stillThere === 'Locked In 3', 'M3: Annullér keeps the list', r.stillThere);
check(r.after === 'Med Enter' && !r.names.includes('Locked In 3'), 'M3: Slet → Slet deletes it', JSON.stringify(r));

// ---- Indtil idle does not tick seconds ----
r = await js(`${H} document.querySelector('#modeSwitch [data-mode=until]').click(); await w(50);
  const a = $('big').textContent; await w(1300); const b = $('big').textContent;
  document.querySelector('#modeSwitch [data-mode=dur]').click();
  return { a, b };`);
check(r.a.endsWith(':00') && r.a === r.b, 'Indtil idle: static whole minutes', `${r.a} → ${r.b}`);

// ---- Andet: custom duration via chip or the timer ----
r = await js(`${H} $('big').click(); await w(50);
  const shown = !$('customRow').hidden; $('hours').value = '2'; $('mins').value = '15'; $('hours').dispatchEvent(new Event('input')); await w(50);
  return { shown, big: $('big').textContent, andet: [...document.querySelectorAll('#presets .chip.on')].map((c) => c.textContent) };`);
check(r.shown && r.big === '02:15:00' && r.andet.join() === 'Andet', 'tap on timer opens "Andet"', JSON.stringify(r));

// ---- M4: locked, a tap on a dimmed tile asks first ----
await open('&locked=1&list=l1&r=m4');
r = await js(`${H}
  tile('Netflix').click(); await w(100);
  const ask = { shown: !$('tapConfirm').hidden, text: $('tapText').textContent, on: tile('Netflix').classList.contains('on') };
  $('tapNo').click(); await w(100);
  const cancelled = { shown: !$('tapConfirm').hidden, on: tile('Netflix').classList.contains('on') };
  tile('Netflix').click(); await w(600); $('tapYes').click(); await w(700);
  const instaTag = tile('Instagram').tagName;
  return { ask, cancelled, added: tile('Netflix').classList.contains('on'), hidden: $('tapConfirm').hidden, instaTag };`);
check(r.ask.shown && /^Bloker Netflix til \d\d:\d\d\?$/.test(r.ask.text) && !r.ask.on, 'M4: tap asks "Bloker Netflix til HH:MM?" and adds nothing yet', r.ask.text);
check(!r.cancelled.shown && !r.cancelled.on, 'M4: Annullér adds nothing');
check(r.added && r.hidden, 'M4: Bloker adds it to the running lock');
check(r.instaTag === 'DIV', 'M4: blocked tiles cannot be tapped');

// ---- R1: real double-clicks (CDP mouse events) never confirm ----
async function dblclick(selectorExpr) {
  const box = await js(`const el = ${selectorExpr}; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
  for (const clickCount of [1, 2]) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount }, S);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount }, S);
    await sleep(60);
  }
  await sleep(700);
}
const tileExpr = (l) => `[...document.querySelectorAll('#tiles .tile')].find((t) => t.querySelector('.tile-label').textContent === '${l}')`;

await open('&locked=1&list=l2&r=dbl');
for (const l of ['Netflix', 'Viaplay', 'Viafree', 'Threads', 'Facebook']) {
  const exists = await js(`return !!${tileExpr(l)};`);
  if (!exists) continue;
  const before = await js(`const el = ${tileExpr(l)}; return { y: el.getBoundingClientRect().y }`);
  await dblclick(tileExpr(l));
  r = await js(`const el = ${tileExpr(l)}; return { on: el.classList.contains('on'), y: el.getBoundingClientRect().y, ask: !document.getElementById('tapConfirm').hidden }`);
  check(!r.on && r.y === before.y, `R1: double-click on ${l} while locked does not block it, tiles stay put`, JSON.stringify({ ...r, before: before.y }));
  await js(`document.getElementById('tapNo').click(); return 1`);
}
// The overlay's own button: a double-click right after it appears is ignored too.
await js(`${tileExpr('Netflix')}.click(); return 1`);
await dblclick(`document.getElementById('tapYes')`);
r = await js(`return ${tileExpr('Netflix')}.classList.contains('on')`);
check(r === false, 'R1: double-click on "Bloker" right as it appears is ignored');
await js(`document.getElementById('tapNo').click(); return 1`);

await open('&r=dbl2');
await dblclick(`document.getElementById('start')`);
r = await js(`return { locked: document.body.classList.contains('is-locked'), confirm: !document.getElementById('lockNow').hidden }`);
check(!r.locked && r.confirm, 'double-click on Start shows the confirmation but does not lock', JSON.stringify(r));
await open('&r=dbl2b');
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms)); const $ = (id) => document.getElementById(id);
  $('start').click(); await w(100); $('lockNow').click(); await w(300);
  return { locked: document.body.classList.contains('is-locked'), confirm: !$('lockNow').hidden }`);
check(!r.locked && r.confirm, 'Lås nu ignores a click (or Enter) within 500 ms', JSON.stringify(r));
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms)); await w(600); document.getElementById('lockNow').click(); await w(700); return document.body.classList.contains('is-locked')`);
check(r === true, 'Lås nu works after 500 ms');

await open('&r=dbl3');
await js(`document.getElementById('listBtn').click(); return 1`);
await dblclick(`[...document.querySelectorAll('#listMenu .menu-item')].find((b) => b.textContent.trim().endsWith('Slet'))`);
r = await js(`return { name: document.getElementById('listName').textContent, menuOpen: !document.getElementById('listMenu').hidden }`);
check(r.name === 'Locked In 1', 'double-click on "Slet" does not delete', JSON.stringify(r));

// ---- daemon down: one line above Start, neutral disabled button ----
await open('&down=1&r=down');
r = await js(`${H} const a = $('alert'); const s = $('start');
  return { text: a.textContent, hidden: a.hidden, before: a.nextElementSibling.contains(s), disabled: s.disabled, bg: getComputedStyle(s).backgroundColor };`);
check(!r.hidden && r.before && r.disabled && r.text === "Locked in kører ikke lige nu — genstart Mac'en", 'down: one line directly above a disabled Start', r.text);
check(r.bg === 'rgb(25, 28, 33)', 'down: disabled Start is neutral grey', r.bg);

// ---- touch targets ----
await open('&r=t');
r = await js(`${H} $('listBtn').click(); await w(50);
  const small = [...document.querySelectorAll('button, input')].filter((e) => e.offsetParent && !e.closest('dialog'))
    .map((e) => [e.id || e.className || e.textContent.trim().slice(0, 12), Math.round(e.getBoundingClientRect().height), Math.round(e.getBoundingClientRect().width)])
    .filter(([, hgt, wid]) => hgt < 40 || wid < 40);
  return small;`);
check(r.length === 0, 'touch targets ≥ 40 px on the front page', JSON.stringify(r));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
