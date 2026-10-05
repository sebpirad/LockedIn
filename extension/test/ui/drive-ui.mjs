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
  const labels = () => [...document.querySelectorAll('#tiles .tile-label')].map((x) => x.textContent);
  const empty = { name: $('listName').textContent, tom: !$('listEmpty').hidden, disabled: $('start').disabled, row: labels() };
  $('editBtn').click(); await w(100);
  const edit = { count: labels().length, off: !!tile('Instagram') && tile('Instagram').classList.contains('off') };
  tile('Instagram').click(); await w(400);
  const after = { tom: !$('listEmpty').hidden, disabled: $('start').disabled, badge: !!tile('Instagram').querySelector('.badge') };
  $('editDone').click(); await w(100);
  return { empty, edit, after, view: labels(), viewOn: [...document.querySelectorAll('#tiles .tile.off')].length };`);
check(r.empty.name === 'Locked In 3' && r.empty.tom && r.empty.disabled && r.empty.row.join() === 'Rediger', 'empty list: only "✎ Rediger", "Tom liste", Start disabled', JSON.stringify(r.empty));
check(r.edit.count > 10 && r.edit.off, 'Rediger shows every site and app, off ones outlined', JSON.stringify(r.edit));
check(!r.after.tom && !r.after.disabled && r.after.badge, 'tap in edit mode: on the list (lock badge), Start enabled', JSON.stringify(r.after));
check(r.view.join() === 'Instagram,Rediger' && r.viewOn === 0, 'Færdig: the row shows only the list, no dimmed tiles', JSON.stringify(r.view));

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

// ---- v1.1.3: chips + clock-style pickers, driven with real key presses ----
const KEYS = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Backspace: 8 };
async function press(key) {
  const isDigit = /^[0-9]$/.test(key);
  const base = isDigit ? { key, code: 'Digit' + key, windowsVirtualKeyCode: 48 + +key, text: key }
    : { key, code: key, windowsVirtualKeyCode: KEYS[key], ...(key === 'Enter' ? { text: '\r' } : {}) };
  await send('Input.dispatchKeyEvent', { type: isDigit || key === 'Enter' ? 'keyDown' : 'rawKeyDown', ...base }, S);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, S);
  await sleep(60);
}
const typeKeys = async (str) => { for (const ch of str) await press(ch); };
const state = () => js(`const $ = (id) => document.getElementById(id); const f = document.activeElement;
  const menu = f && f.closest('.combo-menu');
  return { big: $('big').textContent, focus: f ? (f.id || f.textContent) : '', open: [...document.querySelectorAll('.combo-menu')].some((m) => !m.hidden),
    visible: menu ? [...menu.querySelectorAll('[role=option]:not([hidden])')].map((b) => b.textContent) : [],
    inView: menu ? (() => { const r = f.getBoundingClientRect(), m = menu.getBoundingClientRect(); return r.top >= m.top - 1 && r.bottom <= m.bottom + 1; })() : null,
    scrollTop: menu ? menu.scrollTop : null,
    durH: $('durHVal').textContent, durM: $('durMVal').textContent, untH: $('untHVal').textContent, untM: $('untMVal').textContent };`);

await open('&r=clock');
r = await js(`localStorage.setItem('li.mode', 'dur'); location.reload(); return 1`).catch(() => 1);
await sleep(1000);
r = await js(`return { chips: [...document.querySelectorAll('#presets .chip')].map((c) => c.textContent + (c.classList.contains('on') ? '*' : '')), big: document.getElementById('big').textContent,
  inputs: document.querySelectorAll('#durInput input, #untilInput input, input[type=time]').length }`);
check(r.chips.join() === '30 min,1 time*,2 timer,4 timer,Andet' && r.big === '01:00:00', 'chips: 30 min · 1 time · 2 timer · 4 timer · Andet; default 1 time', JSON.stringify(r));
check(r.inputs === 0, 'no text boxes and no <input type=time> for duration/time');

await js(`document.getElementById('big').click(); return 1`);
r = await state();
check(r.focus === 'durHBtn' && r.durH === '1' && r.durM === '00', 'tap on the timer opens "Andet" with [1 t] [00 min]', JSON.stringify(r));
await press('Enter');
r = await state();
check(r.open && r.focus === '1' && r.inView, 'Enter opens the hours list on the current value', JSON.stringify(r));
await typeKeys('2');
r = await state();
check(r.visible.join() === '2,20,21,22,23,24' && r.focus === '2', 'typing "2" narrows to 2, 20–24', JSON.stringify(r.visible));
await press('Enter');
r = await state();
check(!r.open && r.big === '02:00:00' && r.focus === 'durHBtn', 'Enter chooses 2 t, closes, timer shows 02:00:00', JSON.stringify(r));

await js(`document.getElementById('durMBtn').focus(); return 1`);
await press('ArrowDown');
await typeKeys('4');
r = await state();
check(r.visible.join() === '40,45' && r.focus === '40', 'minutes: typing "4" → 40, 45', JSON.stringify(r.visible));
await press('ArrowDown');
await press('Enter');
r = await state();
check(r.big === '02:45:00' && r.durM === '45', '↓ then Enter → 2 t 45 min', JSON.stringify(r));

await js(`document.getElementById('durHBtn').focus(); return 1`);
await press('ArrowDown');
await typeKeys('24');
await press('Enter');
r = await state();
check(r.big === '24:00:00' && r.durH === '24' && r.durM === '00', '24 t caps the minutes at 00', JSON.stringify(r));
await js(`document.getElementById('durHBtn').focus(); return 1`);
await press('ArrowDown');
r = await state();
check(r.scrollTop > 0 && r.inView && r.focus === '24', 'opens scrolled to the current value (24)', JSON.stringify(r));
await press('Escape');
r = await state();
check(!r.open && r.focus === 'durHBtn' && r.big === '24:00:00', 'Escape closes without changing anything', JSON.stringify(r));

// mouse/trackpad scrolling inside the list
await js(`document.getElementById('durHBtn').focus(); return 1`);
await press('ArrowUp');
const box = await js(`const m = [...document.querySelectorAll('.combo-menu')].find((x) => !x.hidden).getBoundingClientRect(); return { x: m.x + m.width / 2, y: m.y + m.height / 2 };`);
const before = (await state()).scrollTop;
// Some headless Chromes on a sleeping Mac never acknowledge a wheel event; that is the machine, not the page.
const acked = await Promise.race([send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -300 }, S).then(() => true), sleep(4000).then(() => false)]);
await sleep(300);
const after = (await state()).scrollTop;
if (acked) check(after < before, 'the list scrolls with the mouse wheel', `${before} → ${after}`);
else console.log('SKIP  the list scrolls with the mouse wheel  (this headless Chrome never acknowledged the wheel event)');
await press('Escape');

// Indtil
await js(`document.querySelector('#modeSwitch [data-mode=until]').click(); return 1`);
r = await js(`const opts = (await (async () => { document.getElementById('untHBtn').click(); await new Promise((x) => setTimeout(x, 80));
    const o = [...document.querySelectorAll('#untHMenu [role=option]')].map((b) => +b.textContent); document.getElementById('untHBtn').click(); return o; })());
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const nowMin = +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value;
  const h = +document.getElementById('untHVal').textContent, m = +document.getElementById('untMVal').textContent;
  return { opts, nowHour: Math.floor(nowMin / 60), ahead: h * 60 + m - nowMin, quarter: m % 15 === 0 };`);
if (r.opts.length) {
  check(r.opts[0] >= r.nowHour && r.opts.every((x) => x >= r.nowHour), 'Indtil: earlier hours are not offered', JSON.stringify(r.opts));
  check(r.quarter && r.ahead >= 5 && r.ahead <= 20, 'Indtil default: next whole quarter ≥ 5 min ahead', JSON.stringify(r));
  await js(`document.getElementById('untHBtn').focus(); return 1`);
  await press('ArrowDown');
  await typeKeys('23');
  await press('Enter');
  await js(`document.getElementById('untMBtn').focus(); return 1`);
  await press('ArrowDown');
  await typeKeys('4');
  await press('Enter');
  r = await state();
  const r2 = await js(`const a = document.getElementById('big').textContent; await new Promise((x) => setTimeout(x, 1200)); return { a, b: document.getElementById('big').textContent, start: !document.getElementById('start').disabled }`);
  check(r.untH === '23' && r.untM === '40' && r2.a.endsWith(':00') && r2.a === r2.b && r2.start, 'Indtil: typed 23 : 4 → 23:40, static timer, Start enabled', JSON.stringify({ ...r, ...r2 }));
} else {
  console.log('SKIP  Indtil checks: no time left today');
}
await js(`document.querySelector('#modeSwitch [data-mode=dur]').click(); return 1`);

// ---- M4: locked, a tap on a dimmed tile asks first ----
await open('&locked=1&list=l1&r=m4');
r = await js(`${H}
  const lockedRow = [...document.querySelectorAll('#tiles .tile-label')].map((x) => x.textContent).join();
  $('editBtn').click(); await w(100);
  tile('Netflix').click(); await w(100);
  const ask = { shown: !$('tapConfirm').hidden, text: $('tapText').textContent, on: tile('Netflix').classList.contains('on') };
  $('tapNo').click(); await w(100);
  const cancelled = { shown: !$('tapConfirm').hidden, on: tile('Netflix').classList.contains('on') };
  tile('Netflix').click(); await w(600); $('tapYes').click(); await w(700);
  const instaTag = tile('Instagram').tagName;
  if (lockedRow !== 'Instagram,Slack,Adversus,Rediger') return { lockedRow };
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
await js(`document.getElementById('editBtn').click(); return 1`);
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

// ---- v1.1.1: the list dropdown (keyboard) and the plan form's list + its icons ----
await open('&r=dd');
r = await js(`${H} localStorage.setItem('li.list', 'l1');
  const b = $('listBtn'); b.focus();
  b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await w(50);
  const first = document.activeElement.textContent;
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await w(20);
  const second = document.activeElement.textContent;
  document.activeElement.click(); await w(300);
  const chosen = { name: $('listName').textContent, menuHidden: $('listMenu').hidden, focus: document.activeElement === b,
    row: [...document.querySelectorAll('#tiles .tile-label')].map((x) => x.textContent).join() };
  b.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await w(50);
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await w(50);
  return { first, second, chosen, escClosed: $('listMenu').hidden && document.activeElement === b };`);
check(r.first === '✓Locked In 1' && r.second === 'Locked In 2', 'dropdown: ↓ opens on the current list, ↓ moves', JSON.stringify([r.first, r.second]));
check(r.chosen.name === 'Locked In 2' && r.chosen.menuHidden && r.chosen.focus, 'dropdown: Enter/click selects, closes, focus returns', JSON.stringify(r.chosen));
check(r.chosen.row === 'Instagram,YouTube,Slack,Adversus,TV 2,Spotify,Rediger', 'selecting a list shows only that list\'s icons + Rediger', r.chosen.row);
check(r.escClosed, 'dropdown: Escape closes and returns focus');

// ---- v1.3: the Plan page (full page: week grid + fixed panel) ----
const KEYCODES = { Tab: 9, Home: 36, End: 35, PageDown: 34, PageUp: 33, ArrowLeft: 37, ArrowRight: 39 };
async function key(k, opts = {}) {
  const vk = KEYS[k] || KEYCODES[k] || 0;
  const mods = opts.shift ? 8 : 0;
  await send('Input.dispatchKeyEvent', { type: k === 'Enter' ? 'keyDown' : 'rawKeyDown', key: k, code: k, windowsVirtualKeyCode: vk, modifiers: mods, ...(k === 'Enter' ? { text: '\r' } : {}) }, S);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: vk, modifiers: mods }, S);
  await sleep(70);
}
const viewport = (w, hgt, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: 1, mobile }, S);
const P = `const $ = (id) => document.getElementById(id); const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const rules = () => [...document.querySelectorAll('#planPanel .rule')].map((b) => b.querySelector('.w').textContent + ' · ' + b.querySelector('.ln span:not(.dot)').textContent);
  const evs = () => [...document.querySelectorAll('#planGrid .ev')];`;
const rulesNow = () => js(`${P} return rules();`);
const focusEl = (expr) => js(`(${expr}).focus(); return document.activeElement === (${expr})`);
const pickByKeys = async (expr, digits) => { await focusEl(expr); await press('ArrowDown'); await typeKeys(digits); await press('Enter'); };
const mouseAt = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 }, S);

await viewport(1440, 900);
await open('&r=plan1');
r = await js(`localStorage.setItem('li.list', 'l2'); localStorage.removeItem('li.lastTimes'); location.reload(); return 1`).catch(() => 1);
await sleep(1100);
r = await js(`${P} return { next: $('nextBtn').hidden ? null : $('nextText').textContent, tabs: [...document.querySelectorAll('.tab')].map((t) => t.textContent + (t.getAttribute('aria-selected') === 'true' ? '*' : '')),
  cal: !!$('calBtn'), dlg: !!$('planDlg'), plan: !$('planPage').hidden, line: getComputedStyle(document.querySelector('.apphead')).borderBottomWidth }`);
check(r.next === 'Næste: i morgen 09–12 · Locked In 1' && r.tabs.join() === 'Fokus*,Plan' && !r.cal && !r.dlg && !r.plan && r.line === '0px',
  'front page: "Næste" line, tabs "Fokus | Plan", no calendar icon, no plan dialog, no hairline', JSON.stringify(r));

// the "Næste" line opens the Plan tab on that period
await js(`document.getElementById('nextBtn').click(); return 1`);
await sleep(400);
r = await js(`${P} return { hash: location.hash, plan: !$('planPage').hidden, fokus: !$('fokusPage').hidden, title: $('planEdTitle') && $('planEdTitle').textContent,
  tab: $('tabPlan').getAttribute('aria-selected'), sel: evs().filter((e) => e.classList.contains('sel')).length }`);
check(r.hash === '#plan' && r.plan && !r.fokus && r.tab === 'true' && r.title === 'Hverdage 09–12' && r.sel >= 1, '"Næste" opens the Plan tab with that period in the panel', JSON.stringify(r));

// R7: the toolbar is in the 60 px header; the calendar starts right under it
r = await js(`${P} const h = document.querySelector('.apphead').getBoundingClientRect(); const g = $('planScroll').getBoundingClientRect();
  return { head: Math.round(h.height), toolsInHeader: document.querySelector('.apphead').contains($('planToday')), gridTop: Math.round(g.top), title: $('planTitle').textContent }`);
check(r.head <= 61 && r.toolsInHeader && r.gridTop <= 61, 'R7: "I dag ‹ ›" and the title sit in the header; the grid starts under it', JSON.stringify(r));

// Escape closes the panel's editor; the resting panel lists upcoming periods under "+ Ny periode"
await key('Escape');
r = await js(`${P} return { ed: !!$('planEdTitle'), first: $('planPanel').firstElementChild.id, rules: rules(), text: $('planPanel').textContent }`);
check(!r.ed && r.first === 'planNew' && r.rules.length === 2 && !/null|undefined/.test(r.text), 'Esc closes the editor; resting panel: "+ Ny periode" and the periods, no "null"', JSON.stringify(r));

// R1/R2/R3: cascade, no ellipsis, the now-line under the blocks
r = await js(`${P}
  const tomorrow = [...document.querySelectorAll('#planGrid .col')].find((c) => [...c.querySelectorAll('.ev')].length >= 2);
  const blocks = tomorrow ? [...tomorrow.querySelectorAll('.ev')].map((e) => ({ left: e.offsetLeft, width: e.offsetWidth, z: +getComputedStyle(e).zIndex, text: e.textContent })) : [];
  const colW = tomorrow ? tomorrow.offsetWidth : 0;
  const overflow = evs().flatMap((e) => [...e.querySelectorAll('.ev-lab > span')].filter((s) => s.getBoundingClientRect().right > e.getBoundingClientRect().right + 0.5).map(() => e.getAttribute('aria-label')));
  const dots = document.body.textContent.includes('…');
  const now = document.querySelector('#planGrid .now'); const nowZ = now ? +getComputedStyle(now).zIndex : null;
  return { blocks, colW, overflow, dots, nowZ, minEvZ: Math.min(...evs().map((e) => +getComputedStyle(e).zIndex)) }`);
const [b0, b1] = r.blocks;
check(r.blocks.length === 2 && b1.left - b0.left >= 24 && b1.left + b1.width >= r.colW - 6 && b1.width > r.colW / 2 && b1.z > b0.z && b0.text.length > 0,
  'R2: overlapping periods cascade (later indented ≥ 24 px, to the right edge, on top); the first keeps a label', JSON.stringify(r.blocks));
check(r.overflow.length === 0 && !r.dots, 'R1: no label runs past its block and no "…" anywhere', JSON.stringify(r.overflow));
r = await js(`${P} $('planToday').click(); await w(200);
  const col = document.querySelector('#planGrid .col.today'); const now = col && col.querySelector('.now'); const dot = col && col.querySelector('.nowdot');
  return { now: !!now, nowZ: now && +getComputedStyle(now).zIndex, dotZ: dot && +getComputedStyle(dot).zIndex, minEvZ: Math.min(...evs().map((e) => +getComputedStyle(e).zIndex)), title: $('planTitle').textContent }`);
check(r.now && r.nowZ < r.minEvZ && r.dotZ > r.minEvZ, 'R3: the now-line runs under the blocks; only its dot sits on top, in the gutter edge', JSON.stringify(r));
await js(`document.getElementById('planNext').click(); return 1`);

// skip tomorrow from the grid; the skipped block leaves the cascade; then undo
r = await js(`${P}
  const blk = evs().find((e) => e.dataset.id === 'ab12' && e.closest('.col').querySelectorAll('.ev').length >= 2);
  if (!blk) return { error: 'no block' };
  const date = blk.dataset.date; blk.click(); await w(250);
  const btn = [...document.querySelectorAll('#planPanel .skipline button')].find((b) => b.textContent.startsWith('Spring over'));
  const label = btn && btn.textContent; btn.click(); await w(600);
  const col = document.querySelector('#planGrid .col[data-date="' + date + '"]');
  const sk = col.querySelector('.ev.skipped'); const other = [...col.querySelectorAll('.ev')].find((e) => !e.classList.contains('skipped'));
  const res = { label, skipped: !!sk, skZ: sk && +getComputedStyle(sk).zIndex, otherLeft: other && other.offsetLeft, otherZ: other && +getComputedStyle(other).zIndex,
    line: $('planPanel').querySelector('.skipline').textContent };
  [...document.querySelectorAll('#planPanel .skipline button')].find((b) => b.textContent === 'Fortryd').click(); await w(600);
  res.after = col.isConnected ? document.querySelectorAll('#planGrid .ev.skipped').length : document.querySelectorAll('#planGrid .ev.skipped').length;
  return res;`);
check(r.label === 'Spring over i morgen' && r.skipped && r.skZ < r.otherZ && r.otherLeft <= 3 && /springes over/.test(r.line), 'skip: "Spring over i morgen" → struck outline under the other period, which takes the full width', JSON.stringify(r));
check(r.after === 0, 'skip: "Fortryd" restores it', JSON.stringify(r));
await key('Escape');

// R4: a period that covers "now" says "Lås nu til …" and asks once more, with the 500 ms guard
r = await js(`${P} $('planNew').click(); await w(200);
  [...document.querySelectorAll('#planPanel .seg button')].find((b) => b.textContent === 'Vælg dage').click(); await w(100);
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.find((x) => x.type === 'weekday').value);
  const hour = +p.find((x) => x.type === 'hour').value;
  const days = [...document.querySelectorAll('#planPanel .days .day')];
  days.forEach((d, i) => { if (d.classList.contains('on') !== (i === wd)) d.click(); });
  await w(100);
  return { hour, wd, on: days.map((d) => d.classList.contains('on')).join() };`);
await pickByKeys(`document.querySelector('#planPanel [data-k=start0]')`, String(r.hour).padStart(2, '0'));
await pickByKeys(`document.querySelector('#planPanel [data-k=end0]')`, String((r.hour + 1) % 24).padStart(2, '0'));
r = await js(`${P} const save = $('planSave'); const label = save.textContent; save.click(); await w(150);
  const box = document.querySelector('#planPanel .pconfirm'); const confirmText = document.querySelector('#planPanel .confirm-line').textContent;
  $('planLockNow').click(); await w(400); const fast = { ed: !!$('planEdTitle'), confirm: !box.hidden };
  await w(300); $('planLockNow').click(); await w(700);
  return { label, shown: !box.hidden, confirmText, fast, after: rules().length, ed: !!$('planEdTitle') }`);
check(/^Lås nu til \d\d:\d\d$/.test(r.label), 'R4: covering now, the button reads "Lås nu til HH:MM"', r.label);
check(r.shown && /^Kan ikke stoppes før kl\. \d\d:\d\d/.test(r.confirmText), 'R4: it asks like the front page: "Kan ikke stoppes før kl. …"', r.confirmText);
check(r.fast.ed && r.fast.confirm && r.after === 3 && !r.ed, 'R4: "Lås nu" ignores a click within 500 ms, then saves', JSON.stringify(r));

// keyboard only: grid → slot to tomorrow 14:00 → Enter → Tab to Gem → Enter
r = await js(`localStorage.removeItem('li.lastTimes'); return 1`);
await js(`document.getElementById('planGrid').focus(); return 1`);
r = await js(`${P} return { slot: !$('slotCursor').hidden, live: $('planLive').textContent }`);
check(r.slot && /^\S+ \d+\. \S+ \d\d:\d\d–\d\d:\d\d$/.test(r.live), 'keyboard: focusing the grid shows a slot and announces it', JSON.stringify(r));
await key('t');
await key('ArrowRight');
await key('Home');
for (let i = 0; i < 28; i++) await key('ArrowDown');
await key('ArrowDown', { shift: true });
r = await js(`return document.getElementById('planLive').textContent`);
const slotText = r;
await key('Enter');
await sleep(200);
r = await js(`${P} return { title: $('planEdTitle') && $('planEdTitle').textContent, focus: document.activeElement.textContent,
  times: [...document.querySelectorAll('#planPanel .trow .select-btn')].map((b) => b.textContent).join(' '), date: document.querySelector('#planPanel .datebtn').textContent }`);
const [, kbStart, kbEnd] = /(\d\d:\d\d)–(\d\d:\d\d)$/.exec(slotText) || [];
const kbShort = (t) => (t && t.endsWith(':00') ? t.slice(0, 2) : t);
check(r.title === 'Ny periode' && r.focus === 'Én gang' && kbStart === '14:00' && r.times === `${kbStart.replace(':', ' ')} ${kbEnd.replace(':', ' ')}` && r.date === (await js(`return document.querySelector('#planPanel .datebtn').textContent`)),
  'keyboard: ↓ moves, Shift+↓ lengthens, Enter opens "Ny periode" for the slot, focus in the panel', JSON.stringify({ ...r, slotText }));
for (let i = 0; i < 9; i++) await key('Tab');
r = await js(`return document.activeElement.id`);
check(r === 'planSave', 'keyboard: Tab reaches Gem through the panel', r);
await key('Enter');
await sleep(600);
r = await js(`${P} return { rules: rules(), focusGrid: document.activeElement === $('planGrid'), ed: !!$('planEdTitle') }`);
const kbRule = `I morgen ${kbShort(kbStart)}–${kbShort(kbEnd)}`;
check(r.rules.some((x) => x.startsWith(kbRule + ' · ')) && r.focusGrid && !r.ed, `keyboard: saved "${kbRule}"; focus back in the grid`, JSON.stringify(r));

// keyboard edit: Tab from the grid to an event, Enter, change the end, save
await key('Tab');
r = await js(`return document.activeElement.classList.contains('ev') ? document.activeElement.getAttribute('aria-label') : document.activeElement.id`);
const evLabel = r;
await key('Enter');
await sleep(200);
r = await js(`return document.getElementById('planEdTitle') ? document.getElementById('planEdTitle').textContent : null`);
check(/: /.test(evLabel) && !!r, 'keyboard: Tab reaches the events, Enter opens one', JSON.stringify({ evLabel, title: r }));
await key('Escape');
r = await js(`return document.activeElement.classList.contains('ev')`);
check(r === true, 'Esc returns the focus to the event that opened the panel');

// mouse: drag a range on a day next week; a plain click makes a slot with the last length
await js(`document.getElementById('planNext').click(); return 1`);
await sleep(200);
const colBox = await js(`const c = document.querySelectorAll('#planGrid .col')[2]; c.scrollIntoView({ block: 'nearest' }); const g = document.getElementById('planScroll'); g.scrollTop = 12 * parseFloat(getComputedStyle(c).getPropertyValue('--hh'));
  const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, top: r.top, h: r.height, date: c.dataset.date }`);
const yOf = (min) => colBox.top + (min / 1440) * colBox.h;
await mouseAt('mousePressed', colBox.x, yOf(13 * 60) + 2);
for (const m of [13.5, 14, 14.5, 15]) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: colBox.x, y: yOf(m * 60), button: 'left', buttons: 1 }, S); await sleep(30); }
r = await js(`const g = document.querySelector('#planGrid .ev.ghost'); return g ? g.textContent : null`);
const ghost = r;
await mouseAt('mouseReleased', colBox.x, yOf(15 * 60));
await sleep(250);
r = await js(`${P} return { title: $('planEdTitle') && $('planEdTitle').textContent, times: [...document.querySelectorAll('#planPanel .trow .select-btn')].map((b) => b.textContent).join(' '),
  draft: !!document.querySelector('#planGrid .ev.draft:not(.ghost)'), date: document.querySelector('#planPanel .datebtn').textContent }`);
check(ghost === '13–15' && r.title === 'Ny periode' && r.times === '13 00 15 00' && r.draft, 'drag: 13→15 shows a live ghost, then "Ny periode" 13:00–15:00 with the draft drawn', JSON.stringify({ ghost, ...r }));
await key('Escape');
await mouseAt('mousePressed', colBox.x, yOf(16 * 60 + 10));
await mouseAt('mouseReleased', colBox.x, yOf(16 * 60 + 10));
await sleep(250);
r = await js(`const t = JSON.parse(localStorage.getItem('li.lastTimes')); const m = (x) => +x.slice(0, 2) * 60 + +x.slice(3);
  const len = (m(t.end) - m(t.start) + 1440) % 1440; const e = 960 + len; const p = (n) => String(n).padStart(2, '0');
  return { got: [...document.querySelectorAll('#planPanel .trow .select-btn')].map((b) => b.textContent).join(' '), want: '16 00 ' + p(Math.floor(e / 60) % 24) + ' ' + p(e % 60) }`);
check(r.got === r.want, 'click: a slot from the half hour, with the last length used', JSON.stringify(r));
await key('Escape');
// PB1: after a long period (12 h) a click drafts one hour, not twelve
await js(`localStorage.setItem('li.lastTimes', JSON.stringify({ start: '22:00', end: '10:00' })); return 1`);
await mouseAt('mousePressed', colBox.x, yOf(16 * 60 + 10));
await mouseAt('mouseReleased', colBox.x, yOf(16 * 60 + 10));
await sleep(250);
r = await js(`return [...document.querySelectorAll('#planPanel .trow .select-btn')].map((b) => b.textContent).join(' ')`);
check(r === '16 00 17 00', 'PB1: after a 12-hour period, a click drafts 1 hour (the last length is reused only up to 3 h)', r);
await key('Escape');

// the 24-hour rule before saving: a line and a disabled Gem instead of the daemon's refusal
await js(`localStorage.setItem('li.lastTimes', JSON.stringify({ start: '09:00', end: '10:00' })); return 1`);
r = await js(`${P} $('planNew').click(); await w(200);
  const col = document.querySelector('#planGrid .ev.draft') && document.querySelector('#planGrid .ev.draft').closest('.col');
  const blocks = col ? [...col.querySelectorAll('.ev')].map((e) => ({ draft: e.classList.contains('draft'), left: e.offsetLeft, z: +getComputedStyle(e).zIndex })) : [];
  return blocks;`);
const dr = r.find((b) => b.draft), others = r.filter((b) => !b.draft);
check(dr && others.length >= 1 && others.every((b) => dr.left > b.left && dr.z > b.z) && others.some((b) => b.left <= 3),
  'a new draft goes on top, indented past the blocks it overlaps; they keep their place', JSON.stringify(r));
await js(`[...document.querySelectorAll('#planPanel .seg button')].find((b) => b.textContent === 'Hverdage').click(); return 1`);
await pickByKeys(`document.querySelector('#planPanel [data-k=start0]')`, '12');
await pickByKeys(`document.querySelector('#planPanel [data-k=end0]')`, '09');
r = await js(`${P} const l = document.querySelector('#planPanel .limit'); return { shown: !l.hidden, text: l.textContent, disabled: $('planSave').disabled }`);
check(r.shown && /^Samlet lås \d+ t( \d+ min)? · højst 24 t$/.test(r.text) && r.disabled, '24 h: "Hverdage 12 → 09" says "Samlet lås … · højst 24 t" and Gem is disabled', JSON.stringify(r));
await pickByKeys(`document.querySelector('#planPanel [data-k=end0]')`, '08');
r = await js(`${P} const l = document.querySelector('#planPanel .limit'); return { shown: !l.hidden, disabled: $('planSave').disabled }`);
check(!r.shown && !r.disabled, '24 h: "Hverdage 12 → 08" (23 h) is allowed again', JSON.stringify(r));
await key('Escape');

// "Én gang" today: no start time that has passed
r = await js(`${P} const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const nowMin = +p.find((x) => x.type === 'hour').value * 60 + +p.find((x) => x.type === 'minute').value;
  if (nowMin > 23 * 60 + 30) return { skip: true };
  localStorage.setItem('li.lastTimes', JSON.stringify({ start: '00:00', end: '01:00' }));
  $('planNew').click(); await w(200);
  const input = document.querySelector('#planPanel .date-native');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen' }).format(new Date());
  input.value = today; input.dispatchEvent(new Event('change')); await w(150);
  const [h, m] = [...document.querySelectorAll('#planPanel [data-k^=start]')].map((b) => +b.textContent);
  document.querySelector('#planPanel [data-k=start0]').click(); await w(100);
  const hours = [...document.querySelectorAll('#planPanel [data-k=start0] + .menu [role=option]')].map((o) => +o.textContent);
  document.querySelector('#planPanel [data-k=start0]').click(); await w(50);
  return { nowMin, start: h * 60 + m, firstHour: hours[0], date: document.querySelector('#planPanel .datebtn').textContent }`);
if (r.skip) console.log('SKIP  "Én gang" today: too close to midnight');
else check(r.start > r.nowMin && r.firstHour === Math.floor(r.nowMin / 60) + (r.nowMin % 60 >= 55 ? 1 : 0), '"Én gang" today: the start moves past now, and past hours are not offered', JSON.stringify(r));
await key('Escape');

// R5: a block whose top is above the visible area keeps its label at the top
r = await js(`${P} const g = $('planScroll'); const blk = evs().find((e) => e.offsetHeight > 120 && !e.classList.contains('skipped'));
  if (!blk) return { error: 'no tall block' };
  g.scrollTop = blk.offsetTop + 60; await w(80);
  const lab = blk.querySelector('.ev-lab').getBoundingClientRect(); const head = $('planHead').getBoundingClientRect();
  return { labTop: Math.round(lab.top), headBottom: Math.round(head.bottom), blkTop: Math.round(blk.getBoundingClientRect().top), visible: lab.bottom < blk.getBoundingClientRect().bottom }`);
check(r.blkTop < r.headBottom && r.labTop >= r.headBottom && r.labTop <= r.headBottom + 6 && r.visible, 'R5: the label sticks under the day header when the block starts above', JSON.stringify(r));

// delete with undo
r = await js(`${P} const rule = [...document.querySelectorAll('#planPanel .rule')].find((b) => b.textContent.startsWith('${'I morgen 14'}'));
  rule.click(); await w(250); document.querySelector('#planPanel .trash').click(); await w(600);
  const gone = !rules().some((x) => x.startsWith('I morgen 14')); const undo = !$('undo').hidden;
  $('undoBtn').click(); await w(700);
  return { gone, undo, back: rules().some((x) => x.startsWith('I morgen 14')) }`);
check(r.gone && r.undo && r.back, 'delete is one click, "Fortryd" brings it back', JSON.stringify(r));

// tabs by keyboard: ← / → switch pages
await js(`document.getElementById('tabPlan').focus(); return 1`);
await key('ArrowLeft');
r = await js(`return { hash: location.hash, fokus: !document.getElementById('fokusPage').hidden, focus: document.activeElement.id }`);
check(r.hash === '' && r.fokus && r.focus === 'tabFokus', 'tabs: ← goes to Fokus', JSON.stringify(r));
await key('ArrowRight');
r = await js(`return { hash: location.hash, plan: !document.getElementById('planPage').hidden }`);
check(r.hash === '#plan' && r.plan, 'tabs: → goes to Plan', JSON.stringify(r));

// sizes: nothing overflows, targets ≥ 40 px (blocks excepted, as agreed)
for (const [vw, vh, mobile] of [[1440, 900], [1280, 720], [900, 700], [390, 844, true]]) {
  await viewport(vw, vh, mobile);
  await sleep(300);
  r = await js(`${P} const r0 = $('planNew') || null; if ($('planEdTitle')) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await w(100);
    (evs().find((e) => e.dataset.id === 'ab12' && !e.classList.contains('past')) || $('planNew')).click(); await w(250);
    [...document.querySelectorAll('#planPanel .seg button')].find((b) => b.textContent === 'Vælg dage')?.click(); await w(150);
    const days = document.querySelectorAll('#planPanel .days .day').length;
    const panel = $('planPanel').getBoundingClientRect();
    const out = [...$('planPanel').querySelectorAll('*')].filter((e) => e.offsetParent && e.getBoundingClientRect().right > panel.right + 0.5).map((e) => e.className || e.tagName);
    const small = [...document.querySelectorAll('.apphead button, #planPanel button, #dayStrip button')].filter((e) => e.offsetParent)
      .filter((e) => { const b = e.getBoundingClientRect(); return b.height < 40 || b.width < 40; }).map((e) => e.textContent.trim() || e.getAttribute('aria-label'));
    const lab = evs().flatMap((e) => [...e.querySelectorAll('.ev-lab > span')].filter((s) => s.getBoundingClientRect().right > e.getBoundingClientRect().right + 0.5));
    const minH = Math.min(...evs().map((e) => e.offsetHeight));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await w(100);
    return { scrollW: document.documentElement.scrollWidth, out, small, lab: lab.length, minH, days: document.querySelectorAll('#planGrid .col').length, toggles: days }`);
  check(r.scrollW <= vw && r.out.length === 0 && r.small.length === 0 && r.lab === 0 && r.minH >= 18 && r.days === (vw < 860 ? 1 : 7) && r.toggles === 7,
    `${vw}×${vh}: ${vw < 860 ? 'one day + panel below' : 'week + panel'}, no overflow, targets ≥ 40 px, no clipped labels`, JSON.stringify(r));
}
await viewport(1280, 900);

// frozen: only periods in the running lock; read-only panel that says until when
await open('&locked=1&mins=20&planNow=1&r=frozen');
await js(`location.hash = 'plan'; return 1`);
await sleep(500);
r = await js(`${P} const fr = evs().filter((e) => e.classList.contains('frozen')); fr[0] && fr[0].click(); await w(250);
  return { frozen: fr.length, lock: !!(fr[0] && fr[0].querySelector('.lock-ic')), note: document.querySelector('#planPanel .locknote') && document.querySelector('#planPanel .locknote').textContent,
    save: !!$('planSave'), rows: [...document.querySelectorAll('#planPanel .rule .end.locked')].length }`);
check(r.frozen === 1 && /^Låst til \d\d:\d\d$/.test(r.note) && !r.save, 'frozen: the period in the lock opens read-only, "Låst til HH:MM", no Gem', JSON.stringify(r));
await key('Escape');
r = await js(`${P} const other = [...document.querySelectorAll('#planPanel .rule')].find((b) => b.textContent.startsWith('Hverdage')); other.click(); await w(250);
  $('planSave').click(); await w(600); return { ok: !$('planEdTitle'), toast: $('toast').hidden ? '' : $('toast').textContent }`);
check(r.ok && !r.toast, 'frozen: other periods stay editable during a lock', JSON.stringify(r));
r = await js(`return document.getElementById('sub').textContent`);
check(/ · planlagt$/.test(r), 'locked by a planned period: "Låst til … · planlagt"', r);

// the empty state renders nothing but "+ Ny periode"
await open('&r=empty');
await js(`location.hash = 'plan'; return 1`);
await sleep(500);
r = await js(`${P} for (const id of ['ab12', 'cd34']) { const b = [...document.querySelectorAll('#planPanel .rule')].find((x) => x.dataset.id === id); if (b) { b.click(); await w(200); document.querySelector('#planPanel .trash').click(); await w(500); } }
  return { kids: [...$('planPanel').children].map((c) => c.id || c.tagName), text: $('planPanel').textContent.trim() }`);
check(r.kids.join() === 'planNew' && r.text === '+Ny periode', 'empty: the panel shows only "+ Ny periode" (no "null")', JSON.stringify(r));

// confirmation on the front page warns when the session runs into a planned period
await open('&planSoon=1&r=soon');
await js(`localStorage.setItem('li.list', 'l1'); localStorage.setItem('li.mode', 'dur'); location.reload(); return 1`).catch(() => 1);
await sleep(1000);
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms));
  document.querySelector('#modeSwitch [data-mode=dur]').click(); await w(50);
  [...document.querySelectorAll('#presets .chip')].find((c) => c.textContent === '1 time').click(); await w(50);
  const big = document.getElementById('big').textContent;
  const idleSub = document.getElementById('sub').hidden ? '' : document.getElementById('sub').textContent;
  document.getElementById('start').click(); await w(150);
  const sub = document.getElementById('sub').textContent;
  const extra = [...document.querySelectorAll('#tiles .tile.planned .tile-label')].map((x) => x.textContent);
  const sep = !!document.querySelector('#tiles .tile-sep');
  document.getElementById('back').click(); await w(100);
  return { big, idleSub, sub, extra, sep, sepAfterBack: !!document.querySelector('#tiles .tile-sep') }`);
check(r.big === '01:00:00' && r.idleSub === '', 'P2: idle timer shows the chosen 1 time, nothing silently changed', JSON.stringify(r));
check(/^Kan ikke stoppes før kl\. \d\d:\d\d — fortsætter i den planlagte \S+ \(Locked In 2\)$/.test(r.sub), 'confirmation names the planned period and its own list', r.sub);
check(r.sep && r.extra.length > 0 && !r.sepAfterBack, 'confirmation shows what the planned list adds, after a separator', JSON.stringify(r));

// ---- v1.3: "Lukkes aldrig" (apps LockedIn never closes) ----
await viewport(1280, 900);
await open('&r=never');
const NV = `${H} const rows = () => [...document.querySelectorAll('#appList li')].map((li) => li.querySelector('.row-title').textContent + ':' + (li.querySelector('.switch') ? li.querySelector('.switch').getAttribute('aria-checked') : 'browser'));
  const sw = (name) => [...document.querySelectorAll('#appList li')].find((li) => li.querySelector('.row-title').textContent === name).querySelector('.switch');`;
r = await js(`${NV} $('gear').click(); await w(250); return { title: $('neverTitle').textContent, rows: rows(), add: !$('neverAdd').hidden }`);
check(r.title === 'Lukkes aldrig' && r.rows.includes('Claude:false') && r.rows.includes('Wispr Flow:true') && r.rows.slice(-2).every((x) => x.endsWith(':browser')) && r.add,
  'settings: one "Lukkes aldrig" switch per app; browsers last, greyed, no switch', JSON.stringify(r));
r = await js(`${NV} sw('Claude').click(); await w(600); return { claude: sw('Claude').getAttribute('aria-checked'), rows: rows() }`);
check(r.claude === 'true', 'switching Claude on: never closed', JSON.stringify(r));
r = await js(`${NV} $('settingsClose').click(); await w(150); $('editBtn').click(); await w(250);
  const labels = [...document.querySelectorAll('#tiles .tile-label')].map((x) => x.textContent); $('editDone').click(); await w(100);
  return { claude: labels.includes('Claude'), wispr: labels.includes('Wispr Flow'), spotify: labels.includes('Spotify') }`);
check(!r.claude && !r.wispr && r.spotify, '"✎ Rediger" does not offer never-close apps as toggles', JSON.stringify(r));
r = await js(`${NV} $('gear').click(); await w(250); $('neverAdd').click(); await w(500);
  const seg = !$('addKind').hidden; const pick = [...document.querySelectorAll('#pickerList .pick')].find((b) => b.textContent.includes('Spark'));
  const offered = [...document.querySelectorAll('#pickerList .pick')].map((b) => b.textContent);
  if (!pick) return { error: 'no Spark', offered };
  pick.click(); await w(700);
  return { seg, wisprOffered: offered.some((t) => t.includes('Wispr')), dlg: $('addDlg').open, rows: rows() }`);
check(!r.seg && !r.wisprOffered && !r.dlg && r.rows.includes('Spark:true'), '"+ App": picking Spark makes it never closed; apps already never closed are not offered', JSON.stringify(r));
await js(`document.getElementById('settingsClose').click(); return 1`);

// during a lock: an app that is closed right now cannot be switched on — the daemon's message shows
await open('&locked=1&list=l2&r=never2');
r = await js(`${NV} $('gear').click(); await w(250); sw('Spotify').click(); await w(700);
  return { spotify: sw('Spotify').getAttribute('aria-checked'), toast: $('toast').hidden ? '' : $('toast').textContent, add: !$('neverAdd').hidden }`);
check(r.spotify === 'false' && r.toast === 'Kan ikke ændres under en aktiv session.' && !r.add, 'locked: Spotify (closed now) cannot be switched on; the daemon\'s 423 message shows; no "+ App"', JSON.stringify(r));
r = await js(`${NV} sw('Todoist').click(); await w(700); return sw('Todoist').getAttribute('aria-checked')`);
check(r === 'true', 'locked: an app that is not closed now can still be switched on, right after a refused one', r);
await js(`document.getElementById('settingsClose').click(); return 1`);

// ---- daemon down: one line above Start, neutral disabled button ----
await open('&down=1&r=down');
r = await js(`${H} const a = $('alert'); const s = $('start');
  return { text: a.textContent, hidden: a.hidden, before: a.nextElementSibling.contains(s), disabled: s.disabled, bg: getComputedStyle(s).backgroundColor };`);
check(!r.hidden && r.before && r.disabled && r.text === "LockedIn kører ikke lige nu — genstart Mac'en", 'down: one line directly above a disabled Start', r.text);
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
