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

// ---- v1.2.0: Plan ----
const rowsNow = () => js(`return [...document.querySelectorAll('#planList .prow')].map((li) => li.querySelector('.prow-when').textContent + ' · ' + li.querySelector('.prow-list').textContent + (li.classList.contains('frozen') ? ' [frozen]' : ''))`);
const focusEl = (expr) => js(`(${expr}).focus(); return document.activeElement === (${expr})`);
const pickByKeys = async (expr, digits) => { await focusEl(expr); await press('ArrowDown'); await typeKeys(digits); await press('Enter'); };

await open('&r=plan1');
r = await js(`localStorage.setItem('li.list', 'l2'); localStorage.removeItem('li.lastTimes'); location.reload(); return 1`).catch(() => 1);
await sleep(1000);
r = await js(`const $ = (id) => document.getElementById(id); return { next: $('nextBtn').hidden ? null : $('nextText').textContent, cal: !!$('calBtn'), rail: document.querySelectorAll('.wrow').length }`);
check(r.next === 'Næste: i morgen 09–12 · Locked In 1' && r.cal && r.rail === 0, 'front page: one "Næste" line + calendar icon, no strip', JSON.stringify(r));

// P1: overlapping periods (tomorrow 09–12 in both lists) are both visible and tappable
await js(`document.getElementById('calBtn').click(); return 1`);
await sleep(300);
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms));
  const rail = document.querySelectorAll('.rail')[1];
  const blks = [...rail.querySelectorAll('.blk')];
  const boxes = blks.map((b) => { const r = b.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), lane: b.dataset.lane, tint: b.style.getPropertyValue('--tint') }; });
  const opened = [];
  for (const b of blks) { b.click(); await w(120); opened.push(document.querySelector('.pcard').closest('li') ? document.querySelector('.pcard').closest('li').previousElementSibling ? 'row' : 'first' : 'new');
    opened[opened.length - 1] = [...document.querySelectorAll('#planList > li')].indexOf(document.querySelector('.pcard').closest('li')); }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  return { n: blks.length, boxes, opened }`);
check(r.n === 2 && r.boxes[0].lane !== r.boxes[1].lane && r.boxes[0].top !== r.boxes[1].top && r.boxes.every((b) => b.h >= 20) && r.boxes[0].tint !== r.boxes[1].tint,
  'P1: two overlapping periods sit in two lanes, both visible', JSON.stringify(r.boxes));
check(new Set(r.opened).size === 2, 'P1: each lane opens its own period', JSON.stringify(r.opened));
await js(`document.getElementById('planDlg').close(); return 1`);

// create i morgen 09–12 on Locked In 1 — keyboard only after opening
await js(`document.getElementById('calBtn').click(); return 1`);
await sleep(300);
r = await js(`return document.activeElement.id`);
check(r === 'newPeriod', 'plan opens with focus on "+ Ny periode"', r);
await press('Enter');
await sleep(150);
r = await js(`const c = document.querySelector('.pcard'); return { open: !!c, on: [...c.querySelectorAll('[aria-label=Hvornår] .chip.on')].map((x) => x.textContent), pickHidden: c.querySelector('.pick-panel').hidden, focus: document.activeElement.textContent,
  times: [...c.querySelectorAll('.clock-row .select-btn')].map((x) => x.textContent.trim()).join(' ') }`);
check(r.open && r.on.join() === 'I morgen' && r.pickHidden && r.focus === 'I morgen' && r.times === '09 00 12 00', 'new card: "I morgen" 09:00–12:00, keyboard focus in the card', JSON.stringify(r));
await focusEl(`document.querySelector('.pcard .list-pick .select-btn')`);
await press('ArrowDown');
r = await js(`return document.activeElement.textContent`);
if (r !== '✓Locked In 2') check(false, 'list dropdown opens on the current list', r);
await press('ArrowUp');
await press('Enter');
await focusEl(`document.querySelector('.pcard button[type=submit]')`);
await press('Enter');
await sleep(500);
r = await rowsNow();
check(r.filter((x) => x === 'I morgen 09–12 · Locked In 1').length === 1, 'created "I morgen 09–12 · Locked In 1" (keyboard)', JSON.stringify(r));

// weekly Hverdage 07–09
await js(`document.getElementById('newPeriod').click(); return 1`);
await sleep(150);
await js(`[...document.querySelectorAll('.pcard .chip')].find((x) => x.textContent === 'Hverdage').click(); return 1`);
const tp = (n) => `document.querySelectorAll('.pcard .clock-row .select-btn')[${n}]`;
await pickByKeys(tp(0), '7');
await pickByKeys(tp(2), '9');
await js(`document.querySelector('.pcard button[type=submit]').click(); return 1`);
await sleep(500);
r = await rowsNow();
check(r.some((x) => x.startsWith('Hverdage 07–09 · ')), 'created weekly "Hverdage 07–09"', JSON.stringify(r));

// edit it: end 09 → 10
await js(`[...document.querySelectorAll('#planList .prow')].find((li) => li.textContent.startsWith('Hverdage 07–09')).querySelector('.prow-btn').click(); return 1`);
await sleep(150);
await pickByKeys(tp(2), '10');
await js(`document.querySelector('.pcard button[type=submit]').click(); return 1`);
await sleep(500);
r = await rowsNow();
check(r.some((x) => x.startsWith('Hverdage 07–10 · ')) && !r.some((x) => x.startsWith('Hverdage 07–09')), 'edit in place: 07–09 → 07–10', JSON.stringify(r));

// skip one day from the week strip, then undo the skip
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms));
  const blk = [...document.querySelectorAll('.wrow')].slice(1).flatMap((row) => [...row.querySelectorAll('.blk')]).find((b) => /07–10/.test(b.getAttribute('aria-label')));
  if (!blk) return { error: 'no block' };
  const day = blk.getAttribute('aria-label').split(':')[0];
  blk.click(); await w(150);
  const skipBtn = [...document.querySelectorAll('.pcard .skipline button')].find((b) => b.textContent.startsWith('Spring over'));
  const label = skipBtn ? skipBtn.textContent : null;
  const cardIdx = () => [...document.querySelectorAll('#planList > li')].indexOf(document.querySelector('.pcard').closest('li'));
  const cardTop = () => Math.round(document.querySelector('.pcard').getBoundingClientRect().top);
  const before = { idx: cardIdx(), top: cardTop() };
  if (skipBtn) skipBtn.click(); await w(500);
  const after1 = { idx: cardIdx(), top: cardTop() };
  const struck = [...document.querySelectorAll('.pcard .skipline .skipped-day')].map((b) => b.textContent);
  const strip = document.querySelectorAll('.blk.skipped').length;
  document.querySelector('.pcard .skipline .unskip').click(); await w(500);
  return { day, label, struck, strip, before, after1, after: document.querySelectorAll('.blk.skipped').length, skipBack: [...document.querySelectorAll('.pcard .skipline button')].map((b) => b.textContent) };`);
check(r.label === `Spring over ${r.day.toLowerCase()}` && r.struck.join() === `${r.day} springes overFortryd spring over` && r.strip === 1, 'skip from the week strip: "… springes over · Fortryd spring over", outlined in the strip', JSON.stringify(r));
check(r.before.idx === r.after1.idx && r.before.top === r.after1.top, 'the open card does not move after "Spring over"', JSON.stringify([r.before, r.after1]));
check(r.after === 0 && r.skipBack.some((x) => x.startsWith('Spring over')), 'unskip restores it', JSON.stringify(r));
await js(`[...document.querySelectorAll('.pcard button')].find((b) => b.textContent === 'Annullér').click(); return 1`);

// delete + undo
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms));
  [...document.querySelectorAll('#planList .prow')].find((li) => li.textContent.startsWith('Hverdage 07–10')).querySelector('.prow-btn').click(); await w(150);
  document.querySelector('.pcard .trash').click(); await w(500);
  const gone = ![...document.querySelectorAll('#planList .prow')].some((li) => li.textContent.startsWith('Hverdage 07–10'));
  const undo = !document.getElementById('undo').hidden;
  document.getElementById('undoBtn').click(); await w(600);
  return { gone, undo, back: [...document.querySelectorAll('#planList .prow')].some((li) => li.textContent.startsWith('Hverdage 07–10')) };`);
check(r.gone && r.undo, 'delete is one click and offers "Fortryd"', JSON.stringify(r));
check(r.back, '"Fortryd" re-creates the period', JSON.stringify(r));

// Escape closes the card first, then the panel
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms)); document.getElementById('newPeriod').click(); await w(100); return !!document.querySelector('.pcard')`);
await press('Escape');
r = await js(`return { card: !!document.querySelector('.pcard'), open: document.getElementById('planDlg').open }`);
check(!r.card && r.open, 'Escape closes the card, the panel stays', JSON.stringify(r));
await press('Escape');
r = await js(`return document.getElementById('planDlg').open`);
check(r === false, 'second Escape closes the panel');

// optional mouse drag on a day: pre-fills a new card (a plain click creates nothing)
await js(`document.getElementById('calBtn').click(); return 1`);
await sleep(300);
const railBox = await js(`const r = document.querySelectorAll('.rail')[1].getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width, date: document.querySelectorAll('.rail')[1].dataset.date }`);
const mouse = (type, x, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y: railBox.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra }, S);
await mouse('mousePressed', railBox.x + railBox.w * 0.5);
await mouse('mouseReleased', railBox.x + railBox.w * 0.5);
await sleep(200);
r = await js(`return !!document.querySelector('.pcard')`);
check(r === false, 'a plain click on a day creates nothing');
await mouse('mousePressed', railBox.x + railBox.w * 0.25);
for (const f of [0.3, 0.4, 0.5]) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: railBox.x + railBox.w * f, y: railBox.y, button: 'left', buttons: 1 }, S); await sleep(30); }
await mouse('mouseReleased', railBox.x + railBox.w * 0.5);
await sleep(250);
r = await js(`const c = document.querySelector('.pcard'); return c ? { times: [...c.querySelectorAll('.clock-row .select-btn')].map((x) => x.textContent.trim()).join(' '), date: c.querySelector('.date-in').value } : null`);
check(r && r.times === '06 00 12 00' && r.date === railBox.date, 'drag across a day pre-fills a new card (06–12 that day)', JSON.stringify({ r, date: railBox.date }));
await press('Escape');
await press('Escape');

// the "Næste" line opens the plan on that period's card
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms)); document.getElementById('nextBtn').click(); await w(300);
  const c = document.querySelector('.pcard'); const li = c && c.closest('li'); const rows = [...document.querySelectorAll('#planList > li')];
  return { open: document.getElementById('planDlg').open, card: !!c, rowIndex: rows.indexOf(li) }`);
check(r.open && r.card && r.rowIndex === 0, '"Næste" opens the plan with that period open', JSON.stringify(r));
await js(`document.getElementById('planDlg').close(); return 1`);

// frozen: only periods in the running lock are locked
await open('&locked=1&mins=20&planNow=1&r=frozen');
await js(`document.getElementById('calBtn').click(); return 1`);
await sleep(300);
r = await js(`const w = (ms) => new Promise((x) => setTimeout(x, ms));
  const rows = [...document.querySelectorAll('#planList .prow')];
  const fr = rows.filter((li) => li.classList.contains('frozen'));
  const frozenIsButton = fr.some((li) => li.querySelector('button.prow-btn'));
  const other = rows.find((li) => !li.classList.contains('frozen') && li.textContent.startsWith('Hverdage'));
  other.querySelector('.prow-btn').click(); await w(150);
  document.querySelector('.pcard button[type=submit]').click(); await w(500);
  return { frozen: fr.length, frozenIsButton, frozenText: fr[0] && fr[0].querySelector('.prow-end').textContent, editedOk: !document.querySelector('.pcard'), toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent,
    frozenBlocks: document.querySelectorAll('.blk.frozen').length, sub: document.getElementById('sub').textContent }`);
check(r.frozen === 1 && !r.frozenIsButton && r.frozenBlocks === 1, 'during a lock only the period in it is frozen (lock icon, not editable)', JSON.stringify(r));
check(/^Låst til \d\d:\d\d$/.test(r.frozenText), 'a frozen row says "Låst til HH:MM" visibly', r.frozenText);
check(r.editedOk && !r.toast, 'other periods stay editable during a lock', JSON.stringify(r));
check(r.sub === `${r.sub.split(' · ')[0]} · planlagt`, 'locked by a planned period: "Låst til … · planlagt"', r.sub);

// confirmation warns when the session runs into a planned period
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
