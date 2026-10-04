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
await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: -300 }, S);
await sleep(300);
const after = (await state()).scrollTop;
check(after < before, 'the list scrolls with the mouse wheel', `${before} → ${after}`);
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

r = await js(`${H}
  $('gear').click(); await w(300); $('addPlanBtn').click(); await w(100);
  const before = { name: $('planListName').textContent, icons: $('planIcons').children.length };
  $('planListBtn').click(); await w(50);
  [...document.querySelectorAll('#planListMenu .menu-item')].find((x) => x.textContent.endsWith('Locked In 1')).click(); await w(100);
  const after = { name: $('planListName').textContent, icons: [...$('planIcons').children].map((x) => x.title).join() };
  const times = [$('planSHVal'), $('planSMVal'), $('planEHVal'), $('planEMVal')].map((x) => x.textContent).join('');
  if (times !== '09001200') return { before, after, rows: ['times ' + times] };
  $('planForm').requestSubmit(); await w(600);
  return { before, after, rows: [...document.querySelectorAll('#planList .row-title')].map((x) => x.textContent) };`);
check(r.before.name === 'Locked In 2' && r.before.icons === 6, 'plan form: list dropdown starts on the current list, its icons shown', JSON.stringify(r.before));
check(r.after.name === 'Locked In 1' && r.after.icons === 'Instagram,Slack,Adversus', 'plan form: choosing another list shows what it blocks', JSON.stringify(r.after));
check(r.rows.includes('I morgen 09–12 · Locked In 1'), 'plan row reads "I morgen 09–12 · Locked In 1"', JSON.stringify(r.rows));

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
