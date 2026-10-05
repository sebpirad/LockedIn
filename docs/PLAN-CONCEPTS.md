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

---

## Plan-side — specifikation (2026-10-04, replaces the 1.2.0 plan sheet)

**Why.** The owner rejected the 1.2.0 sheet: "Kan ikke lide den kalender pop up. Fandme useriøst bygget. Byg det ordentlig." In a narrow window the sheet was cramped and the clock pickers overflowed the card.

**What he chose.** A real full page, "Plan", built like a proper calendar: the week on the left and a fixed detail panel on the right. There is no modal and no popover anywhere.

**Mockup.** `extension/dev/plan-page/mock.html` (dev only, so `pack.sh` leaves it out). It reuses the real `ui/app.css`, `ui/combo.js`, `ui/dropdown.js`, `ui/glyphs.js` and `lib/plan.js` (`assignLanes`). It is clickable: click a slot, an event, the panel rows, Én gang / Hverdage / Vælg dage, "Spring over", 🗑 → "Fortryd", the tabs and ‹ I dag ›.

**Deep links:**
- `?state=edit|new|skipped|frozen` opens those panel states.
- `?s=locked|empty` opens those scenarios.
- `?view=fokus` opens the Fokus tab.
- `&scroll=panel` scrolls the phone view down to the panel.

**Screenshots** (next to the mockup):

| File | Size | Shows |
|---|---|---|
| `plan-1440-edit.png` | 1440×900 | a weekly occurrence open |
| `plan-1440-locked.png` | 1440×900 | frozen, read-only |
| `plan-1440-fokus.png` | 1440×900 | the tabs on the front page |
| `plan-1280.png` | 1280×720 | resting |
| `plan-1280-new.png` | 1280×720 | a clicked slot |
| `plan-900-edit.png` | 900×700 | week + narrower panel |
| `plan-390.png` | 390×844 | day view |
| `plan-390-edit.png` | 390×844 | panel below the day view |

### 1. Page structure
- **App header** (60 px, hairline below):
  - Tabs **`Fokus | Plan`** on the left (`role=tablist`, 40 px targets, 2 px underline on the active tab), and the gear on the right.
  - The tabs replace the calendar icon (`#calBtn`).
  - Plan is a page state, not a dialog. It lives at `app.html#plan`, so Back, Forward and reload keep it. A new tab (⌘T) always opens Fokus.
- **Fokus** is today's front page, unchanged except for the header. "Næste: i dag 13–15 · Locked In 1 ›" opens Plan with that occurrence selected.
- **Plan** is the calendar (fluid) beside the detail panel (fixed width), both full height under the header.
  - Each part scrolls on its own. On desktop the page itself never scrolls.

### 2. Widths

| Window width | Calendar | Panel |
|---|---|---|
| ≥ 1180 px | Week, 7 columns, 48 px per hour, 52 px hour gutter | 380 px, on the right |
| 860–1179 px | Week, 44 px per hour, 44 px gutter | 344 px, on the right |
| < 860 px | **One day**, plus a 7-day strip (Ma 5 … Sø 11; a dot means the day has periods; 52 px tall). The grid is 56 vh. | **Below** the grid. Selecting something scrolls the panel into view. |

- **Nothing can overflow.** The panel puts one time per row (Fra / Til), so its content needs about 300 px and fits a 320 px phone.
- **‹ ›** move a week on wide screens and a day on narrow ones.

### 3. Calendar
- **Toolbar:** `I dag` (ghost, 40 px), then ‹ › (40 px), then the title in 20 px/600: "5.–11. okt. 2026" for a week, or "Tirsdag 6. okt." for a day.
  - ‹ is disabled on the current week.
  - › goes up to 8 weeks ahead.
  - With the focus outside a field, PageUp/PageDown move a week (a day on narrow screens) and **T** jumps to I dag.
- **Week = mandag–søndag.**
  - The day header shows "man." over the date number.
  - Today has the date in a filled light circle, the weekday in bold, and a column 2.5 % lighter.
- **Hour grid 00–24.**
  - Hour labels are 12 px `--subtle`, tabular figures (5.26:1).
  - Hour lines use `--line`; half-hour lines are fainter.
  - The grid opens scrolled to 07:00, or to the earliest period of the week if that is earlier.
- **Now line.** A 2 px `--accent` line across today's column, with a 10 px dot (11.7:1). It is the same yellow marker as in 1.2.0. Today's time before now is shaded.
- **Events.** One button per occurrence. Each is an opaque block:
  - The list tint at 30 % over `#14161b`, with a 3 px tint bar on the left and an 8 px radius.
  - Text: "13–15" in 13 px/600 `--text`, and the list name in 12 px `#c4c6cc`. A ↻ (12 px) marks a weekly period.
  - Measured with all six 1.2.0 tints: the time is 7.4–8.3:1 and the name 5.2–5.8:1, so both pass AA.
  - **Weekly** periods are drawn on every matching day.
  - **Short** blocks (under 50 min) use one line.
  - **Overlaps** sit side by side in lanes, using `assignLanes`, which is already tested. The label shrinks with the lane width: the full label from 64 px, the start time only from 36 px, nothing below that. The `aria-label` and tooltip always carry the full text.
  - **Over midnight:** the block is split at 24:00. The first part reads "22–10", the next day's part "→ 10", and the edges are flat where it continues.
  - **Skipped** day: transparent fill, a 1.5 px tint outline, and the time and name struck through in `--subtle`. It is still clickable, so the skip can be undone.
  - **Frozen** (part of the running lock): a yellow lock replaces ↻. It is clickable, and opens the read-only panel.
  - **Past:** 50 % opacity.
  - **Selected:** a 2 px `--text` ring.
  - **Draft:** a 14 % white fill with a 1.5 px white outline, labelled "Ny periode". It is drawn live on every day it covers, so choosing "Hverdage" shows five drafts.
- **Creating a period:**
  - **Click an empty slot.** The panel opens "Ny periode" for that day. The start is the half hour clicked, the length is the last one used (`li.lastTimes`, otherwise 1 t), and the list is the one chosen on the front page.
  - **Drag** (mouse only, optional). It snaps to 15 minutes and shows the draft live; releasing opens the same panel. `pointercancel` and `lostpointercapture` reset the drag, which fixes the phantom-ghost bug the challenger found.
  - **Touch:** a tap only, so vertical scrolling stays native.
  - Today, nothing can be created before "now".
- **Keyboard** (a complete path):
  - The grid is one tab stop (`role=grid`, `aria-label` "Uge, timer").
  - ←↑→↓ move a 30-minute slot cursor (a 2 px accent ring inside the slot).
  - Shift+↑/↓ lengthens the slot.
  - Enter opens "Ny periode" for the slot.
  - Tab then goes through the events in time order, and Enter opens one.
  - In the panel, Esc closes it and returns the focus to the event or slot that opened it.

### 4. Detail panel (always on the page, never a popup)

**1. Resting** (nothing selected)
- "+ Ny periode" (44 px, full width).
- Below it, the periods, soonest first. Each row shows:
  - The rule, using `periodText`: "Hverdage 13–15", or "Fre 22 → lør 10".
  - "● Locked In 1".
  - Any skipped dates, struck through.
- A frozen row shows "🔒 Låst til 15:00".
- A row is 56 px. Clicking it moves the calendar to the next occurrence and opens it.
- This is the screen-reader path, and the only place you see periods outside the visible week.
- When there are no periods, only "+ Ny periode" is shown, with no text.

**2. Ny periode / edit** (top to bottom)
- **Title:** "Ny periode", or the rule as text, for example "Hverdage 13–15". × closes it.
- **Hvornår:** a segmented control, `Én gang | Hverdage | Vælg dage`.
  - Én gang shows a date button, for example "Onsdag 7. okt.". It opens the native date picker, and dates before today are blocked.
  - Vælg dage shows 7 toggles, Ma–Sø (each at least 40 px, one row), with the clicked day already on.
- **Fra** `[HH▾]:[MM▾]` and **Til** `[HH▾]:[MM▾]`, each on its own row. These are the approved clock pickers with type-ahead.
  - The length is shown at the right, for example "2 t", or "næste dag · 12 t" for a period over midnight.
  - End times that would make one continuous lock longer than 24 hours are left out. When that cuts the list short, the length reads "maks. 24 t".
- **List dropdown** (dot + name), with the list's icons below it (28 px, read-only, with tooltips).
- **Spring over** (only for an existing weekly period): "Spring over i morgen", or "Spring over torsdag 8. okt.", for the occurrence that was clicked (`POST /v1/skip`).
  - A skipped day reads "~~Torsdag 8. okt.~~ springes over [Fortryd]" (`DELETE /v1/skip`).
  - Both take effect at once.
- **Footer:** `[Gem] [Annullér]`, and `[🗑]` at the right.
  - Gem reads **"Lås til 17:00"** when the period joins the running lock, with the 500 ms guard, as in 1.2.0.
  - 🗑 deletes at once. A toast "Perioden er slettet [Fortryd]" stays 5 s at the bottom centre of the page, and Fortryd re-creates the period with its skips.
  - Daemon errors (423, 24 h, 400) show under the footer in `--bad`.

**3. Frozen** (the period is part of the running lock)
- The title, "🔒 Låst til 15:00", the list name and the icons. Nothing can be edited.
- If the clicked occurrence is a *later* one of the same weekly period, "Spring over …" is still offered. The API allows it, because only the occurrence inside the lock is refused.

### 5. Visual rules
- **Same tokens as Fokus** (`app.css`): the same select buttons, chips, segmented control, primary and ghost buttons.
- **New colour:** only the list tints from 1.2.0, used at 30 % inside the blocks.
- **Targets:** at least 40 px everywhere, with one exception. An event block is as tall as its duration, so a 30-minute period is 24 px. Every period is also a 56 px row in the panel, and reachable by keyboard.
- **Text:** no explanatory text anywhere on the page. The only words are the labels Fra and Til, the button labels, "Låst til …" and "springes over".

### 6. Production mapping (step 2)
- **Remove:**
  - `#calBtn`.
  - The `#planDlg` sheet.
  - The week-strip CSS (`.week`, `.rail`, `.blk`, `.plan-sheet`).
  - `wireDrag` on the rails.
- **Keep:**
  - `lib/plan.js` (`occurrences`, `assignLanes`, `chainEnd`, `scheduleBody`, `periodText`, `nextOccurrence`).
  - The editor logic in `ui/plan.js`: when, times, list, skip, the "Lås til" guard and delete + undo. It moves from the card into the panel.
  - `combo` and `dropdown`.
- **New:**
  - `app.html` gets the header tabs and a `<section id="planPage">`.
  - `ui/plan.js` renders the calendar and the panel.
  - `ui/plan.css` holds the page styles.
  - `app.js` handles `#plan` routing and the slot keyboard.
- **Not touched:** `blocked.html`, `ui/blocked.*` and the manifest version.

### 7. Edge cases
- **Summer time ends (25 Oct 2026, a 25-hour day):** the grid keeps 24 rows. Occurrences come from `lib/plan.js` in Copenhagen time, and a time inside the spring gap moves forward, as the daemon does.
- **Daemon down:** the last known plan stays visible. The panel controls are disabled, and the Fokus page's line "Locked in kører ikke lige nu — genstart Mac'en" is shown above the panel.
- **50 periods:** "+ Ny periode" is disabled, with a tooltip.
- **More than 6 lists:** the tints repeat, and the list name is always on the block.

### 8. Click counts (mouse)

| Task | Clicking a slot | With a drag |
|---|---|---|
| **i morgen 09–12 med Locked In 2** | Plan → slot tir 09:00 → Til ▾ → 12 → Liste ▾ → Locked In 2 → Gem = **7**¹ | Plan → drag 09→12 → Liste ▾ → Locked In 2 → Gem = **5** |
| **hver hverdag 07–09** | Plan → slot man 07:00 → Hverdage → Til ▾ → 09 → Gem = **6**¹ | Plan → drag → Hverdage → Gem = **4** |
| Change Hverdage 13–15 to 13–16 | Plan → event → Til ▾ → 16 → Gem = **5** | — |
| Skip tomorrow | Plan → event → "Spring over i morgen" = **3** | — |
| Delete | Plan → event → 🗑 = **3** (Fortryd for 5 s) | — |

¹ With a slot click, the end comes from the last length used. When that length already matches, the click count drops by 2.

### 9. For the reviewer to challenge
1. **The resting panel** shows the list of periods. Keep it (keyboard and screen-reader path, periods outside the week), or leave the panel empty until something is selected?
2. **Overlaps at 860–1179 px** lose their labels when the lanes are narrower than 36 px. They still have a tooltip and `aria-label`, and the panel row.
3. **30-minute blocks are 24 px tall**, under the 40 px target rule. The panel row and the keyboard path are the fallback.
4. **Tabs placement:** "Fokus | Plan" sits at the top left as page navigation. Is it clear enough beside the centred "Varighed | Indtil" pill on Fokus?

## Plan-side — udfordring (independent challenger, 2026-10-04)

**How it was tested.** I used `dev/plan-page/mock.html` through a CDP driver with exact viewports at **1440×900, 1280×720 and 900×700 (1×)** and **390×844 (2×, touch)**. I opened the resting, `edit`, `new`, `skipped`, `frozen`, `empty` and `fokus` states. I also clicked a slot (Thursday 10:00), chose "Hverdage" and saved. I compared the result with the spec above. No file other than this section was changed.

**Overall.** At 1440×900 this already looks like a serious calendar:
- Google-like day headers with a filled circle for today;
- a clean hour gutter;
- opaque tinted blocks with a 3 px bar;
- a calm fixed panel that uses the approved controls;
- no popups anywhere.

The phone day view, with its 7-day strip and dots, is good. The panel's edit, skip and frozen states read well. What keeps it below Google/Apple quality is detail at the block level: **ellipses inside blocks, a now-line that strikes through text, and labels that disappear**. One flow is also unsafe. All of these can be fixed in the spec before anything is built.

### Required changes (must be in the build)

1. **No "…" inside an event block, ever.**
   - **Evidence:** at 1440 px, Tuesday's overlaps read "Locke…" and "Kold k…", and the draft reads "Ny per…". At 1280 px "09–1…" appears, and at 900 px nearly every block is truncated ("08–0…", "Locked…").
   - **Rule:** use a label ladder chosen by the measured inner width *w* and height *h*:

     | Condition | Label |
     |---|---|
     | w ≥ 96 and h ≥ 40 | time on line 1, list name on line 2 (the name only if it fits whole) |
     | w ≥ 44 | full time only, for example "13–15" |
     | w ≥ 26 | start hour only, for example "13" |
     | otherwise | nothing; the tint bar carries the block |

     The full text always goes in `aria-label` and `title`.
2. **Overlaps: a cascade instead of equal lanes, as Google Calendar does.**
   - Each later overlapping event is indented by `max(24px, 28 % of the column)` and still runs to the right edge of the column. The later one sits on top, with a 1 px `--bg` outline.
   - **Skipped** occurrences take part in no lane or cascade. They are drawn as an outline *under* active blocks, so they never narrow a real period. Today a skipped Thursday halves the purple block.
3. **The now-line must never cross text.**
   - **Evidence:** in `frozen`, and after saving "Hverdage 10–11", the 2 px yellow line runs through "Locked In 1" and "10–11". It looks exactly like the **strikethrough used for skipped**.
   - **Fix:** put the line on a layer under the event blocks. The opaque blocks cover it. Keep the 10 px dot in the gutter edge of today's column so "now" is still found.
4. **Saving a period that covers *now* starts a lock, and must say so.**
   - **Evidence:** at 10:20 I clicked Thursday 10:00 and chose Hverdage. The draft included today's 10–11, and the button still read "Gem". Saving would lock immediately until 11:00, without the 500 ms guard.
   - **Rule:** extend the spec's "Lås til …" rule. If any occurrence of the draft contains now, or joins the running lock, the primary button reads **"Lås nu til 11:00"**, with the same guard.
5. **Sticky labels for blocks that start above the visible area.**
   - **Evidence:** Saturday's "→ 10" part of "Fre 22 → lør 10" fills 00–10, but at the 07:00 scroll it shows **no label at all**, just a big teal slab.
   - **Fix:** when a block's top is above the scroll edge, pin its label to the visible top (`position: sticky; top: 4px` inside the block).
6. **The empty state renders the word `null`** in the panel under "+ Ny periode". It must render nothing.
7. **Recover vertical space, and stop clipping the first hour label.**
   - Header, toolbar and day header take **194 px**, 27 % of a 720 px window.
   - **On Plan, merge the toolbar into the 60 px app header:** tabs, then `I dag ‹ ›` and the title, with the gear at the right. That saves 72 px, so at 1280×720 the grid shows 07:00–19:00 instead of 07:00–17:30.
   - Open the grid at `firstHour × hh − 14 px`, so the "07" label is not cut in half as it is today.

### Strongly recommended

- **Drop the ↻ from blocks.** Today it appears only when a lane is at least 92 px wide, so Monday has it and Tuesday doesn't. A weekly period already shows as repeated blocks, and the panel title says "Hverdage". One less glyph.
- **Hour height:** 52 px at a width ≥ 1180 px and a height ≥ 860 px; otherwise 48 px. The minimum block height is 20 px, so a 15-minute period is never 12 px.
- **Panel width:** 380 px at ≥ 1180 px, **320 px** at 860–1179 px. The content needs about 300 px. At 900 px wide that gives each day column 85 px instead of 73.
- **Resting list: upcoming only.**
  - A one-off that has ended ("I dag 08–09:30" at 10:20) leaves the list.
  - Hovering a row outlines its blocks in the calendar (1.5 px `--text`).
  - Hovering a block highlights its row.
- **Fokus page:** no hairline under the header. The new-tab page keeps its chrome-free calm, and the tabs alone mark the header.
- **Keyboard path:** the mockup has none. The `role=grid` has `tabindex=0`, but nothing handles arrows, Shift+arrows or Enter, and there is no drag either. Both must be built and tested exactly as specified, plus Esc returning focus, before the build is reviewed.

### Answers to the designer's four questions

1. **Panel at rest:** **keep the list.** It is the keyboard and screen-reader path, and the only view of periods outside the visible week. Show upcoming items only, with hover linking as above. No heading text is needed: "+ Ny periode" above the rows makes clear what they are.
2. **Overlap labels at 860–1179 px:** do not accept label loss caused by equal lanes. Use the **cascade** (change 2) and the **ladder** (change 1). With a 320 px panel, a 900 px window has 85 px columns, so the top event of a pair keeps about 61 px, enough for "13–15".
3. **30-minute blocks of 24 px:** **accept the exception.** The height must stay honest to the duration, which is what Google and Apple do, and the panel row (56 px) plus the keyboard path cover reach. Raise the hour to 52 px where there is room (26 px per half hour), and never draw a block under 20 px.
4. **Tab clarity:** **clear enough.** The underlined page tabs top left and the centred "Varighed | Indtil" pill do different jobs and look different. Make the inactive tab `--muted` 15 px/500 and the active one `--text` 600 with a 2 px `--text` underline (never accent). Use no hairline on Fokus.

### Click counts (my measurement)
These match the spec's table, with one difference:
- a slot click with the right last-used length: "hver hverdag" = Plan → slot → Hverdage → Gem = **4** clicks;
- "i morgen 09–12 · Locked In 2" = **7** when the last length differs.

1.2.0 needed 5 for the same task, so creation got more expensive than the sheet. That is acceptable only if **drag** (mouse) ships in the first build, bringing it back to 5. Do not postpone drag.

## Verdict: **GO WITH CHANGES**

The structure, page model, panel and phone layout are right. Changes 1–7 must be in the build: no ellipses, the cascade, the now-line under blocks, "Lås nu til …" for drafts covering now, sticky labels, no `null`, and the merged header. The keyboard path and drag also have to be built and verified, because the mockup has neither.

---

## Plan-side — bygget (step 2, 2026-10-04)

**Files**
- `extension/app.html`:
  - The header now holds the tabs, the toolbar and the gear.
  - It has two pages: `#fokusPage` and `#planPage`.
  - The calendar icon and `#planDlg` are gone.
- `extension/ui/plan.js`: the page itself (rewritten).
- `extension/ui/plan.css`: new.
- `extension/ui/app.js`: routing to `#plan`, ←/→ on the tabs, the "Næste" line opening that period, and unique glyph ids (see below).
- `extension/ui/app.css`: the header and tabs; the old sheet and week-strip rules are removed.
- `extension/lib/plan.js`, new pure helpers, all covered by `test/plan.test.mjs`:
  - `weekStart`, `dayBounds`, `wallMinutes`, `dateLong`, `lengthText`
  - `dayLayout` (the cascade), `cascadeIndent`
  - `labelFit` (the label rule)
  - `dragRange`, `moveSlot`
  - `lockIfSaved`
- `extension/test/ui/drive-ui.mjs`: the Plan section is rewritten (32 checks, the size check runs at 4 viewports).

**All seven of the reviewer's required changes are in**
1. **No ellipsis in a block.** The label ladder uses the measured text width. The full time is shown if it fits, otherwise the start time, otherwise nothing. The list name is shown only if it fits whole: on its own line when the block is at least 40 px tall, otherwise after the time. The full text is always in `aria-label` and the tooltip.
2. **Overlaps cascade.** Each later period is indented `max(24 px, 28 %)`, runs to the right edge and sits on top. A skipped day is drawn underneath and takes part in no cascade.
3. **The now-line runs under the opaque blocks** (z-index 1). Only its 10 px dot is drawn on top, in the gutter edge.
4. **"Lås nu til HH:MM".** This shows whenever saving would start the lock now, or lengthen the lock that is running. Saving then takes the front page's second step: "Kan ikke stoppes før kl. …", then [Lås nu] (with the 500 ms / double-click guard) or [Tilbage].
5. **Sticky labels.** These needed `overflow: clip` (not `hidden`) and a top-aligned flex column, because a button centres its content.
6. **The empty panel** shows only "+ Ny periode".
7. **The toolbar is in the 60 px header**, and the grid opens at `firstHour × hh − 14`.

**Also built**
- Upcoming-only periods in the resting list.
- Hovering a row outlines its blocks; hovering a block highlights its row.
- 52 px per hour at ≥ 1180 × 860, otherwise 48 px. Blocks are never under 20 px.
- No hairline under the header on Fokus.

**Keyboard**
- The grid is one tab stop.
- ←↑→↓ move a 30-minute slot, Shift+↑/↓ change its length, and PageUp/PageDown move a week (a day on narrow screens). **T** jumps to I dag.
- Enter opens "Ny periode" for the slot.
- Tab reaches the events, and Enter opens one.
- Esc closes the editor and gives the focus back to what opened it.
- Saving puts the focus back in the grid, on the saved period.

**Mouse and touch**
- Drag a range with 15-minute snap and a live ghost.
- A click makes a slot from that half hour, with the last length used.
- A drag that is cancelled (`pointercancel` or `lostpointercapture`) leaves nothing behind.
- On touch a tap makes a slot, and vertical scrolling stays native.

**Deviations, for the next review**
- **The panel is 336 px at 860–1179 px, not 320.** The seven 40 px day toggles in "Vælg dage" need 304 px of content.
- **The end-time picker does not leave out times that break the 24-hour rule.** Computing that per option was too slow. The daemon's "En samlet lås kan højst vare 24 timer." shows under the buttons instead.
- **Bug found and fixed in passing:** while the Fokus page was hidden, the Instagram glyph lost its gradient on the Plan page, because two SVGs shared the id `gi`. `siteIcon` now gives every glyph its own ids.

**Tests**
- `node --test test/*.test.mjs`: 134 pass.
- `test/ui-in-chrome.sh`: all 82 checks passed. Later reruns on this Mac hang at the old mouse-wheel step (a wheel event is never acknowledged). The unchanged HEAD build hangs at the same place, and all 81 other checks pass.
- `test/load-in-chrome.sh` (the packed extension, real CSP): passes.
- **Screenshots:** `extension/dev/plan-page/build-*.png` (1440, 1280, 900, 390).

**After review round 1 (2026-10-05)**
- **PB1:** clicks and the keyboard slot reuse the last length only up to 3 h, otherwise 1 h (`slotLength`). Drag sets its own length.
- **The 24-hour rule is checked in the panel** (`chainOverLimit`, the same chain logic as the daemon, including the running lock). It shows "Samlet lås 120 t · højst 24 t" in `--bad` and disables Gem. The dev mock now refuses such chains too.
- **"Én gang" today:** past start times are not offered, and a start that has passed moves to the next 5 minutes, keeping the length.
- **A new draft cascades on top** of what it overlaps (indented), so it never hides a block. The drag ghost is translucent.
- **Verification:**
  - Unit tests: 137 pass.
  - `ui-in-chrome.sh` could not run: a real LockedIn lock was active until 12:00, and the script rightly refuses. The new checks were verified by hand in the built-in browser pane instead: a real mouse click, the keyboard slot, the cascade, the 24 h line and the past start.
  - The wheel step in the driver now reports SKIP instead of hanging when Chrome never acknowledges the event.
