# Planlæg: three concepts

Product design, 2026-10-04. These are concepts only, and no production file was changed. The mockups are clickable and live in `extension/dev/plan-concepts/`, which never ships: `extension/tools/pack.sh` copies a whitelist and fails if `dev/` ends up in the package. I checked this by running it on a copy, and 0 dev files were packed.

**Owner's brief:** make "Planlæg" markedly better. That means relevant views (day, week, list: pick the ones that help), easy create, change and overview, and the coming periods shown on the front page. Keep it clean and minimal, with no superfluous clicks, text or functions. The UI is dark and in Danish, with 24-hour Copenhagen times. The user is a salesperson, not a developer.

## What is wrong today

The current form is gear → drawer → "Planlæg".

- **It is hidden.** It sits two levels deep in "Indstillinger". The front page only has a grey "Næste: …" line, and that line cannot be clicked.
- **A period cannot be changed.** You can only delete it with × and build it again, even though the daemon has `PUT /v1/schedules/{id}`.
- **There is no overview.** Rows are flat sentences like "Ma–Fr 09–12 · Locked In 1". Nothing shows when the periods fall, how they relate to each other, or which ones merge into one lock.
- **The labels are jargon.** "Dato | Ugentlig" is a developer's model. The user thinks "i morgen" or "hver hverdag".
- **The 24-hour rule is invisible** until the save fails with a 400 error.
- **Delete is one click with no undo.** The list delete got a confirmation in review M3.
- **The locked state shows padlocks only.** It does not say when editing becomes possible again.

Since 1.1.4, `app.html` is also the new-tab page. The front page is therefore the most-seen screen of the product. That counts both for showing the plan there and for keeping it calm.

## Constraints the concepts respect (from `docs/API.md` and the daemon)

- **Two kinds of period.** A period is either one date (`date`) or weekly (`weekdays`). It has a start and an end, and `end <= start` means it runs over midnight. It has one list. There can be at most 50.
- **Chains.** Overlapping or back-to-back intervals merge into one lock (`Engine.chains`). A chain longer than 24 hours is refused, unless it already existed.
- **Editing during a lock.** `updateSchedule` and `removeSchedule` refuse while **any** lock runs (`isLocked(now)`), not only for the periods in the chain. The mockups follow the code, so every period is read-only while locked. Adding is always allowed. See open question 2.

## How to look at them

Serve the extension folder: `python3 -m http.server 8765 --bind 127.0.0.1 --directory extension`. Then open:

- `http://127.0.0.1:8765/dev/plan-concepts/concept-a.html`
- `http://127.0.0.1:8765/dev/plan-concepts/concept-b.html`
- `http://127.0.0.1:8765/dev/plan-concepts/concept-c.html`

**Scenario switch.** The dashed pill at the bottom left switches between three scenarios:
- **Normal:** Monday 5 Oct, 10:20.
- **Låst:** 13:40, inside "Hverdage 13–15".
- **Tom:** no periods.

**Sample data:**
- Hverdage 13–15 · Locked In 1
- Onsdag 7. okt. 09–11:30 · Locked In 2
- Hver fredag 22–10 (over midnight) · Locked In 2

**Deep links** (used for the screenshots):
- `?demo=task1`, `?demo=task2` and `?demo=edit` open the create and edit states.
- `?demo=limit` shows the 24-hour stop.
- `?demo=chain` (C only) selects "4 timer" so the session runs into the 13–15 period.
- `?s=locked` and `?s=empty` open those scenarios.

The mockups reuse the real `ui/app.css`, `ui/combo.js` (clock pickers), `ui/dropdown.js` and `ui/glyphs.js`. `plan.css` holds only the new pieces: rails, week grid, editor card and list tints. `shared.js` mirrors the daemon's chain and 24-hour maths.

---

## Shared by all three: one period editor

The views differ in how you reach the editor and what it is pre-filled with. The editor is the same everywhere:

```
[ I morgen ▾ ]                         ×      ← "Hvornår"
[09▾]:[00▾] – [12▾]:[00▾]                     ← the approved clock pickers
[● Locked In 1 ▾]                             ← list, with its colour dot
(◉ ◉ ◉)                                       ← what the list blocks, read-only (as approved)
[ Gem ]                                 🗑    ← trash only when editing
```

- **"Hvornår" replaces "Dato | Ugentlig".**
  - In A and C it is one dropdown, seeded by the day you dragged on: *I morgen · Hver tirsdag · Hverdage · Hver dag · Vælg dage…*.
  - In B it is a row of chips: *I dag · I morgen · Dato · Hverdage · Dage*.
  - Both read as the user speaks, and "Hverdage" is a single choice.
- **Changing a time keeps the length.** If you move the start, the end follows.
- **End times are listed from the start onwards** (22, 23, 00, 01 …), so a period over midnight reads naturally.
- **Delete takes two steps**, like the list delete: 🗑 → "Slet perioden? [Slet] [Annullér]", with the 500 ms double-click guard.
- **Locked, existing period:** the editor turns into a read-only card ending in "🔒 Kan ændres efter 15:00". It tells you when, instead of a bare padlock.
- **Locked, new period that touches the running lock:** the button reads **"Lås til 17:00"** instead of "Gem". This is the same pattern as the approved "Bloker til 18:19", because that addition cannot be undone.
- **The 24-hour rule is visible without any sentence:**
  1. While you drag, the ghost simply stops growing at the limit.
  2. A small pill shows the length of the whole lock you are making. It reads "3 t", or "24 t" when the period joins another one, and the joined periods are outlined as one.
  3. The end-time picker leaves out every time that would break the rule. This is the approved "Indtil" pattern, where earlier times are left out rather than greyed.
  4. The error text "En samlet lås kan højst vare 24 timer." can only appear if you change the start after picking the end.
- **List tint:** each list gets one muted colour (blue-grey or teal; never yellow, which is reserved for the primary action and the lock badge, and never red). Blocks, rows and the front-page list dropdown carry it as a dot, so a block says which list it is without any text.

---

## Concept A: "Uge" (front-page strip + full-screen week)

**Views.**
- **Front page:** the "Næste" line becomes a strip of the next 3 periods as small cards ("I dag / 13–15" with the list tint at the left edge), plus a calendar button. Clicking a card opens the week with that period's editor open.
- **Plan:** a full-screen week (Ma–Sø, 00–24, opened at 07, ‹ › to change week), like Outlook or Google Calendar.
- **Left out:** the day view (the week contains it, and the strip answers "today") and the list view (the strip is the mini-list).

**Create.** Drag in a day column. The ghost shows the length pill, and the editor opens next to it. A plain click creates one hour.

**Edit and delete.** Click a block; the same editor opens with 🗑.

**Locked.** The running block is brighter and carries the yellow lock badge. Clicking any block gives the read-only card. Dragging still creates.

**Empty.** The front page shows "📅 Planlæg". The week shows one line: "Træk for at planlægge".

**Phone.** All 7 columns stay (30 px/hour; blocks show only the start, "13"). The editor becomes a bottom sheet. On touch, a tap creates one hour (no drag, so vertical scrolling keeps working).

**Strengths and weaknesses.**
- **+** It is the most familiar model for someone who lives in a calendar, and it gives the best view of the week's pattern.
- **−** It is a separate screen, so there is always one click more.
- **−** It is heavy on a phone.
- **−** With 2–5 periods, most of the 7 × 24 grid is empty space.

Screenshots: `concept-a-desktop*.png`, `concept-a-phone*.png`.

## Concept B: "Liste" (Næste line → plan drawer with inline editing)

**Views.**
- **Front page:** unchanged except that "Næste: i dag 13–15 ● Locked In 1 ›" is now a button.
- **Plan:** a drawer named "Plan" holding one list of periods, soonest first. Each row shows *Hvornår · tid · ● liste*, for example "Hverdage 13–15", "On 7. okt. 09–11:30" or "Hver fredag 22–10".
- **Left out:** the week and day views. With few periods a calendar is mostly empty, and a list reads fastest.

**Create.** "+ Ny periode" opens the editor card at the top, pre-filled with I morgen 09–12 and the front-page list.

**Edit.** Click a row, and the row itself becomes the editor. Only one is open at a time, and Esc closes it.

**Delete.** 🗑 in the card, then Slet.

**Locked.** Rows show 🔒 instead of ›. The running row has the yellow badge. A click opens the read-only card. "+ Ny periode" still works.

**Empty.** The front page shows "📅 Planlæg". The drawer opens straight on the editor, with no empty-state text.

**Phone.** The drawer is full width and the chips wrap to two rows.

**Strengths and weaknesses.**
- **+** It is the calmest and lowest-risk option, fully keyboard and screen-reader friendly, with no new gestures.
- **+** You can edit in place.
- **−** It does **not** save clicks when creating: the times still cost two clicks each.
- **−** It does not show how periods relate to each other in time, or how they chain.
- **−** The plan is not visible on the front page.

Screenshots: `concept-b-desktop*.png`, `concept-b-phone*.png`.

## Concept C: "Tidslinje" (the plan lives on the front page)

**Views.**
- **Front page:** under "Start Locked in", two quiet 24-hour **rails**, "I dag" and "I morgen". Each shows its periods as blocks in the list tint, a "now" line, and the past hatched. The axis is 06–22 and widens by itself when something falls outside it.
- **Week:** "Uge ▾" unfolds the same rails for 7 days in place, with › for the next week.
- **Left out:** a separate plan screen and the list view.

**Create.**
- Drag along a rail; the ghost and length pill appear and the editor opens under it.
- A click creates one hour.
- On hover, a dashed "+" hour follows the pointer, so the gesture explains itself without text.
- On touch, a horizontal drag works and vertical scrolling is untouched.

**The session ghost.** The duration you pick on the front page is drawn as a dashed ghost from "nu". If it runs into a planned period, both are outlined and the pill says **"til 15:00"**. That is what Start will really do, because one continuous lock blocks until its end. It is the only concept that shows this rule before it surprises you.

**Edit and delete.** Click a block on a rail, then use the editor and 🗑.

**Locked.** The running block is bright and carries the lock badge, and the "now" line runs through it. Blocks give the read-only card. Dragging on free time still creates, with "Lås til …" when it touches the lock.

**Empty.** The rails stay, and the "I dag" rail says "Træk for at planlægge" until the first period exists.

**Phone.** The rails are full width (about 17 px per hour, with the start-only label when the block is narrow). The editor is a bottom sheet, and the page lifts the rail above it.

**Strengths and weaknesses.**
- **+** It has the fewest clicks.
- **+** The plan is seen and changed where he already looks, on every new tab.
- **+** It shows chains and the 24-hour limit.
- **−** The front page gets two more rows.
- **−** Drag is a gesture to discover (mitigated by the hover "+" and the empty-state hint).
- **−** The axis jumps to 00–24 in the week view when there is a period over midnight.
- **−** A keyboard path for creating has to be designed: for example, focus a rail and press Enter to create the next free hour.

Screenshots: `concept-c-desktop*.png` (includes `-chain` and `-week-24h`), `concept-c-phone*.png`.

---

## Click counts

These were measured by driving the mockups with real mouse events in headless Chrome and checking the saved period afterwards. A drag counts as one action. The "today" column is counted from `app.html` / `ui/app.js`.

| Task | Today | A | B | C |
|---|---|---|---|---|
| **i morgen 09–12 med Locked In 2** | 5¹ | 5 | 5¹ | **4** |
| **hver hverdag 07–09** | 8 | 5 | 8 | **4** |
| Change "Hverdage 13–15" to 13–16 | 9 (delete + re-create) | 5 | 5 | **4** |
| Delete a period | 2 (no confirmation) | 4 | 4 | **3**² |

¹ This only works because the form's default happens to be "I morgen 09–12". With any other time, Today and B cost 4 more clicks (two pickers). In A and C the drag sets the time in the same action.
² Measured as 4 for a period on Wednesday, because "Uge" has to be opened first. For today and tomorrow it is 3.

**The exact sequences:**
- **A:** 📅 → drag → (Liste ▾ → Locked In 2 | Hvornår ▾ → Hverdage) → Gem.
- **B:** Næste → + Ny periode → (Liste ▾ → Locked In 2 | Hverdage → 09▾ → 07 → 12▾ → 09) → Gem.
- **C:** drag on the "I morgen" rail → (Liste ▾ → Locked In 2 | Hvornår ▾ → Hverdage) → Gem.

## Trade-offs at a glance

| | A Uge | B Liste | C Tidslinje |
|---|---|---|---|
| Plan visible on front page | next 3 as cards | one line | today + tomorrow on a time axis |
| Overview of the week | best (classic calendar) | rules only | good (7 rails, compact) |
| Chains / 24-hour rule visible | yes, while dragging | only through omitted end times | yes, while dragging **and** for "Start" |
| New concepts to learn | none (calendar) | none | drag on a rail |
| Phone | cramped but works | best | good |
| Keyboard / screen reader | needs a create path | complete | needs a create path |
| Front-page calm | +1 row of cards | unchanged | +2 quiet rails |
| Build size (estimate) | largest (grid, scroll, overlay) | smallest | medium |

## Recommendation: C, "Tidslinje"

It answers the three things the owner asked for in the place he already looks. He sees today and tomorrow every time he opens a tab. He changes a period with one click on the block, and he creates one with one drag. It has the fewest clicks on every task, and it is the only concept that makes "one continuous lock" visible before it bites, both for planned periods and for the session he is about to start.

It also keeps the approved hierarchy: the big timer and the one yellow button stay on top, and the rails sit under them in surface grey.

**To build it well:**
1. Make the rails quieter than anything above them. Keep the current tokens; the only new colour is the list tints.
2. Add the keyboard path for creating.
3. Show the "til 15:00" pill only when the session actually joins a planned period, as the mockup does.
4. Move "Planlæg" out of the gear drawer, which then keeps only "Altid lukket under fokus".

**Fallbacks.**
- If the reviewer finds the rails too busy for a new-tab page, A's strip + week is the fallback.
- B is the safe option, but it is essentially today's form made editable, and it does not reduce clicks.

## Open questions for the owner

1. **Front page.** Should the plan be on the new-tab page itself (C), or one click away (A's cards / B's line)?
2. **Editing during a lock.** Today the daemon freezes **all** periods while any lock runs. Should periods that are *not* part of the running lock stay editable? That needs a daemon change; the UI is ready for either.
3. **"Spring over i morgen".** Do you want to skip one occurrence of a weekly period without deleting it (for example, a meeting in tomorrow's 13–15)? The API cannot do this today; it needs a daemon exception list.
4. **List colours.** Is one muted colour per list (shown as a dot in the list dropdown) OK, or should blocks stay neutral grey with the name only?
5. **The session ghost (C).** Do you want the dashed "what Start will do" on today's rail, or should the rail show planned periods only?
6. **Delete.** Two steps ("Slet perioden?"), or instant delete with a "Fortryd" toast?

## Files

- **Mockups:** `extension/dev/plan-concepts/concept-a.html`, `concept-b.html`, `concept-c.html`, plus `shared.js` (model, editor, hero replica) and `plan.css`.
- **Screenshots** (1280×820 desktop, 375×812 phone at 2×):
  - `concept-a-{desktop,desktop-create,desktop-24h,desktop-locked,desktop-empty,phone,phone-create}.png`
  - `concept-b-{desktop,desktop-plan,desktop-create,desktop-locked,desktop-empty,phone,phone-edit}.png`
  - `concept-c-{desktop,desktop-create,desktop-chain,desktop-week-24h,desktop-locked,desktop-empty,phone,phone-create}.png`

---

## Planlæg — udfordring (independent challenger, 2026-10-04)

**How it was tested.** I used all three mockups in the built-in browser at 1280×820 and 375×812, with real mouse clicks, drags and hovers. I added 1× headless captures of C in the Låst, chain, limit (24 h) and Tom states, and synthetic touch `PointerEvent`s for the scroll case. I read the source of `concept-a/b/c.html` and `shared.js`. No file other than this section was changed.

### Ranking (as delivered)

1. **B "Liste"**: the only one a non-technical user can read in 2 seconds and operate fully by keyboard. It is still too thin to meet the brief on its own.
2. **A "Uge"**: a familiar calendar that lives on its own screen, so the new-tab page stays calm. But creating is drag/click-only, and it is heavy on a phone.
3. **C "Tidslinje"**: the strongest idea (chain visibility) in the worst place (the new-tab page). It has the most risks I could actually trigger.

The recommendation of C does not hold up once it is used rather than measured.

### C: concrete weaknesses (evidence)

1. **New-tab clutter.**
   - Every new tab now carries an axis, two hatched and gridded rails, a "now" pin, a dashed session ghost and "Uge ⌄". That is about 140 px of chart under the one yellow button.
   - In the **Tom** state it shows "Træk for at planlægge" on every new tab, forever, for a user who never plans. That is exactly the "superfluous text" the brief rules out.
   - The mouse-hover "+" ghost follows the pointer whenever it crosses the rails on the way to Start or the address bar.
2. **Accidental creation.**
   - One stray click on a rail opens the create editor as a popover over the hero. I clicked "I morgen" once and got a 19:45–20:45 draft, with the popover covering "Locked In 1", the icons and Start.
   - **Touch bug, reproduced:** a touch that starts on a rail and turns into a vertical scroll (`pointercancel`) leaves a phantom ghost. The *next* `pointerup` anywhere, for example tapping Start, opens the editor. `concept-a` has the same un-handled `pointercancel`.
3. **Drag is not precise enough to deliver the click counts.**
   - At 1280 px a rail gives about 36 px per hour (9 px per 15-minute snap). My drag landed on 15:15–17:00, not a round range.
   - On a phone it is **17.7 px per hour, 4.4 px per snap**. A finger cannot hit "09–12", so the user ends up in the pickers anyway (+2–4 clicks). The table's "4 clicks" assumes a perfect drag.
4. **No keyboard path to create.** `.rail` has `tabIndex = -1` and no role; only existing blocks are focusable. The same is true of A's `.wk-col`.
5. **Readability with several lists.**
   - Blocks carry no list name, only two muted tints (blue-grey and teal). With three or more lists they become guesswork.
   - Narrow blocks show only "13", and my 15:15–17:00 block lost its label entirely in the week view.
6. **The axis jumps.** Opening "Uge" with the Friday 22–10 period switches every rail, including today's, to 00–24. All labels shrink to start hours, and the page grows to 1060 px, below the fold of a new tab.
7. **Periods beyond tomorrow are invisible** on the front page. "Onsdag 7. okt. 09–11:30" and "Hver fredag 22–10" do not appear until "Uge" is opened.
8. **The chain truth is in the wrong place.** With "4 timer" selected, the timer says **04:00:00** while a small pill on the rail says **"til 15:00"**. The big number is wrong, and the correction is the smallest thing on the page.
9. **Occurrence vs rule.** Clicking Wednesday's "13" edits *all* weekdays. Someone who sees a calendar expects to edit that one day. A has the same problem.

### A: concrete weaknesses
- **No create path without a mouse or touch,** because day columns are not focusable.
- **Clicking an empty cell creates** a 1-hour draft. This is less risky than C because it happens inside a dedicated screen.
- **Mostly empty space.** With 3 rules the 7×24 grid is about 90 % empty. The Saturday half of "22–10" shows as an unlabelled block when scrolled to 05.
- **Weak front-page strip.**
  - The 3 cards repeat one weekly rule ("I dag 13–15", "I morgen 13–15") and push out the rest; the Friday period never shows.
  - The cards have no list name and nothing that says they are *focus* periods rather than meetings.
- **Phone:** 7 columns of 40 px with labels cut to "13". The bottom sheet covers half the grid.

### B: concrete weaknesses
- **No overview.** You cannot see that Wednesday has 09–11:30 *and* 13–15, or which periods merge into one lock.
- **No click saving.** Without the lucky default (I morgen 09–12), creating costs 9 clicks.
- **Confusing chips.** "Dato" and "Dage" look nearly identical and mean different things.
- **"Hver fredag 22–10"** can be read as Friday 10:00–22:00 or as a period ending the same morning.
- **The 24-hour rule** only shows up as times silently missing from the end picker.

### The hybrid I would build: "B+", list first, with a week strip in the panel and the front page kept calm

**Views: two, both in one Plan panel.** The panel is a centred 720 px sheet on desktop and full screen on a phone.

1. **"Uge" strip** at the top.
   - Seven thin day rails, Ma–Sø, 14 px tall.
   - A **fixed** 00–24 axis, so nothing ever jumps.
   - The current week, with ‹ ›.
   - It is a read-only overview: tap a block to open its rule below.
   - **On desktop with a mouse only**, a drag on a rail is an *optional accelerator*. It pre-fills a new card, with no popover over the hero.
2. **Rule list**, as in B: "Hverdage 13–15 ● Locked In 1", "Ons 7. okt. 09–11:30 ● Locked In 2", "Fre 22 → lør 10 ● Locked In 2".
   - Overnight periods are always written with **→ and both days**.
   - Tapping a row edits it in place, with the B card.
   - There is no day view and no 7×24 grid.

**Front page: nothing new in the hero.**
- A calendar icon sits next to the gear (40 px, always present, the only path when there are no periods).
- When periods exist, **one line** under Start replaces "Næste": `Næste: i dag 13–15 ● Locked In 1 ›`. It shows the soonest occurrence only, it is clickable, and it opens the panel with that rule's card already open.
- When there are no periods, the line is not shown and nothing else is drawn.
- During a lock that came from the plan, the sub-line reads `Låst til 15:00 · planlagt`.
- **Chain truth goes in the existing confirm step**, not on a chart: `Kan ikke stoppes før kl. 15:00 — fortsætter i den planlagte 13–15`. In idle, the big timer shows the real total (04:40:00) when the chosen duration runs into a planned period. This is the most important rule, so it gets the most important place.

**Editor** (the shared card, cleaned up):
- **Hvornår chips:** `I dag · I morgen · Hverdage · Vælg…`. "Vælg…" opens weekday toggles plus "Kun én dato" with the date picker, which replaces "Dato" and "Dage".
- **Times:** the approved clock pickers with type-ahead. A new card is pre-filled with the times of the **most recently edited period** (people repeat their blocks), not a fixed 09–12.
- **List:** the front-page list, with name and dot.
- **24 hours:** invalid end times are left out, plus **one line only when that truncation happens**: `Højst 24 timer i træk`.
- **Locked:** keep the designer's read-only card "🔒 Kan ændres efter 15:00", and "Lås til …" for an addition that touches the running lock, with the 500 ms guard.
- **Delete:** 🗑 → `Slet perioden?`, the same two-step as list delete.
- **Every create and edit is fully reachable by keyboard:** calendar icon → "+ Ny periode" → chips → pickers (type "9" Enter) → Gem.

**Click counts (mouse; drag = 1):**

| Task | C (designer) | **B+** form path | **B+** with drag accelerator |
|---|---|---|---|
| i morgen 09–12, Locked In 2 | 4 (perfect drag) / 6 realistic | 9 (5 if the last-used times match) | **5** |
| hver hverdag 07–09 | 4 / 6 realistic | 8 | **4** (open, drag on Mon, "Hverdage" chip, Gem) |
| Next period 13–15 → 13–16 | 4 | **4** (Næste line opens its card → end hour ▾ → 16 → Gem) | — |
| Any other period → change | 4–5 | **5** | — |
| Delete | 3–4 | **4** | — |

**Why B+ beats all three.**
- It keeps the new-tab page as calm as approved: one optional line and one icon, and zero drag targets under the primary button.
- It has a complete keyboard and touch path.
- It reads in 2 seconds as text with the list name.
- It still gives the week overview and the drag speed to those who want them, at +1 click versus C's best case.
- It puts the chain rule into the confirm step, where it actually stops a surprise.

**Build size:** smaller than C. The strip is a read-only rendering of `intervals()`, plus one drag handler that can be cut without loss.
