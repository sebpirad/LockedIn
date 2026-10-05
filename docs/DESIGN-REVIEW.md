# Locked in: independent design review

Reviewer: independent (did not design or build it). Date: 2026-10-04.
Measured against the owner's brief: minimalist, clear icons, beautiful type, one big timer and one clear "Start Locked in" button, no superfluous text, named lists ("Locked In 1/2") picked at start and edited in place, dark, Danish, Europe/Copenhagen times. The user is a recruiter/salesperson, not a developer.

**How it was tested.** `app.html?mock=1` and `blocked.html?mock=1` on 127.0.0.1:8765, the website on 127.0.0.1:8766. I used the built-in browser at 1280×820, 800×900 and 375×812 (mobile preset), plus 2× headless Chrome captures for icon detail. The states covered: idle Varighed, idle Indtil, list menu, new list, rename, confirmation, locked (`locked=1&mins=95&elapsed=30`), Forlæng panel, settings drawer locked and unlocked, the Planlæg form in Dato and Ugentlig, the "+" sheet for both Hjemmeside and App, daemon down (`down=1`), broken/stale enforcement, the quote page with short, long and extra-long quotes, the quote page's ended state (`ended=1`), and the website in light and dark. Contrast figures are WCAG 2.x ratios computed from the CSS tokens. No files other than this one were changed.

## Overall impression

The core is strong. The 168 px SF Pro Display weight-200 timer with `tabular-nums` is beautiful and stays put while it counts down. The yellow pill is clearly the primary action, Danish copy is natural almost everywhere, times use 24 h, and the quote page is quiet and well set (serif at 28–48 px, about 45–55 characters per line on desktop, licence line out of the way). The timer and the one button already win the hierarchy.

The problems are around the edges. The icon grid's on/off state is ambiguous and nearly invisible. In-place list editing loses input and deletes without asking. The locked state allows accidental, irreversible additions. Small text throughout fails AA.

---

## MUST-FIX

### M1. Tile on/off state is ambiguous, and the "off" icons are almost invisible
**State:** idle (any list) and locked.
**What you see:** In the 2× capture of idle "Locked In 1", Instagram, Slack and Adversus are in full colour. The other 14 tiles are grey ghosts. Netflix's "N", Threads, YouTube, TV 2 and "Viaplay Group" have practically disappeared into the background.
**Problem:**
1. *Contrast.* `.tile.off .glyph { filter: grayscale(1); opacity: .28 }` gives the off glyphs 1.00–1.30:1 against `--bg`: Netflix 1.11, YouTube 1.11, Facebook 1.30, Adversus 1.11. Only white-on-colour marks such as Slack and Threads reach 2.4:1. That is far below the 3:1 needed for graphics that carry meaning (WCAG 1.4.11). The user cannot see what he could add.
2. *Meaning.* Nothing says "bright = will be blocked". In macOS and almost every UI, dimmed means *disabled/unavailable*, so a non-technical user can read a dimmed Netflix as "Netflix is blocked". That is the opposite of what it means. In the locked state the colourful Instagram tile can also read as "Instagram is available".

**Fix:**
- Give the *on* state an explicit mark: a 16 px accent badge with the existing `LOCK_ICON` at the tile's top-right corner.
  ```css
  .tile { position: relative; }
  .tile.on .glyph::after { content: ""; position: absolute; transform: translate(18px, -18px);
    width: 16px; height: 16px; border-radius: 50%; background: var(--accent) url(lock.svg) center/9px no-repeat;
    box-shadow: 0 0 0 2px var(--bg); }
  ```
  (Or append a `<span class="badge">` with `LOCK_ICON` in `renderTiles()`.)
- Make *off* recognisable, not ghostly: `.tile.off .glyph { filter: grayscale(1); opacity: .5 }`. White marks then reach 5.3:1.
- Give every glyph a hairline edge, because the dark brand tiles (YouTube `#1b1b1b`, Netflix `#0b0b0b`, Threads `#000`, TV 2 `#14163a`, VG `#22114a`) are 1.0–1.17:1 against the page even when *on*. Their square disappears and they look smaller than Instagram or Facebook: `.glyph { border-radius: 11px; box-shadow: 0 0 0 1px rgba(255,255,255,.12); }`.
- When the list is empty, show the one-line hint "Tryk på det, der skal blokeres" (see S5).

### M2. Renaming or naming a list silently throws the typed name away when you click elsewhere
**State:** list menu → "Omdøb" (and "Ny liste").
**What you see:** a centred 220 px field with a yellow focus ring and the old name selected. There is no Save button and no hint.
**Problem:** Only Enter saves. On blur, `nameInput` calls `stopNaming()` after 150 ms *without saving*. Verified: I typed "Kold kanvas" and clicked the empty page; the field closed, and the list was still "Locked In 2", with no message. Clicking "Start Locked in" right after typing has the same effect. In-place editing that loses your text is not "smart og brugervenligt".
**Fix:** Save on blur and keep Escape as the cancel: in the `blur` handler, call `submitName()` instead of `stopNaming()` (guard against a double submit with the `ui.naming` check already there). An empty field on blur means cancel. Optionally, widen the field to the name's width + 48 px, so it reads as the same element that turned editable.

### M3. "Slet" deletes the current list in one click, and the menu doesn't say which list
**State:** list menu open while on "Locked In 2".
**What you see:** a menu reading "Locked In 1", then a divider, then "Ny liste", "Omdøb", and a red "Slet". The current list is not in the menu.
**Problem:** The only list name *in* the menu is the other one, sitting right above "Slet", so a user can easily believe he is deleting "Locked In 1". `deleteCurrentList()` runs immediately, with no confirmation and no undo. The same applies to "Omdøb".
**Fix:**
- Show the current list first with a check mark (`✓ Locked In 2`) so the menu reads as a picker.
- Name the target in the label: `Omdøb «Locked In 2»`, `Slet «Locked In 2»`.
- Make "Slet" two-step in place. The first click turns the item into `Slet «Locked In 2»? Ja · Nej`. Alternatively, delete and show a 6-second toast `Listen er slettet · Fortryd`.

### M4. While locked, one stray click adds a site or app to the lock for the rest of the session
**State:** locked (`locked=1`), the tile grid under the timer.
**What you see:** the same 17-tile grid as idle. The blocked tiles are bright and inert. Every dimmed tile is a live button.
**Problem:** Clicking a dimmed tile adds it to the active lock immediately, with no confirmation, and it cannot be undone until the session ends. For this user the list includes work tools (Slack app, Adversus in other lists). A mis-click can cut him off from his dialer or team chat for hours. This is "accidental", which the brief rules out. The full grid also makes the locked screen busier than it needs to be.
**Fix:** In the locked state, render only the tiles that are blocked now (inert), plus the "+" tile. "+" opens the existing sheet, whose submit button reads `Bloker resten af sessionen`. That gives a calmer screen and an explicit, two-step addition. Alternatively, keep the grid but make a tap on an off tile expand inline into `Bloker Netflix til 18:01? Ja / Nej`.

### M5. Small text fails WCAG AA in many places, including the user's own input values
**State:** everywhere.
**Problem:** `--faint #5d616b` is used for text at 12–13 px. It measures 3.18:1 on `--bg` and 2.95:1 on `--surface` (AA needs 4.5:1). It applies to:
- off tile labels (12 px)
- the "Næste: i morgen 09:00 · Locked In 1" line
- the "Forlæng" link (13 px)
- the "t"/"min" units
- the drawer section headers "PLANLÆG"/"APPS" (12 px uppercase)
- `.row-sub`
- the quote page's host line and licence line (`#5f5e5a`, 3.03:1 at 11–12 px)

Worse, `.custom` and `.times` set `color: var(--faint)` and the inputs inherit it. The user's typed values ("1" t, "0" min; "09:00 – 12:00" in Planlæg) are rendered at 2.95:1 and look like placeholders or disabled fields.

**Fix:**
- Add a text-only token and use it for every text use of `--faint`: `--subtle: #80848e;` (5.26:1 on bg, 4.88:1 on surface, 4.56:1 on surface-2). Keep `--faint` for borders and decoration only.
- `.custom input, .times input { color: var(--text); }`
- Quote page: `--faint: #7b7973` (4.52:1) and `.credits { font-size: 12px; }`. The line stays visibly quieter than the 13 px dates and the 15 px name, so it remains the quietest element.

---

## SHOULD-FIX

### S1. Two "Slack" tiles and look-alike app monograms
**State:** idle grid, second and third rows.
**What you see:** the coloured Slack logo (website) on row 1, and a grey "S" tile also labelled "Slack" (the app) on row 2, right next to an identical "S" for Spotify; "T" for Todoist.
**Problem:** The user cannot tell which Slack tile does what, and the letter monograms carry no recognition.
**Fix:** One tile per service. Toggling "Slack" toggles both the site and the app. If the two must stay separate, label the app tile `Slack-app`. For apps, show the real macOS app icon (the daemon knows the bundle path and can export a 64 px PNG via `NSWorkspace.icon(forFile:)`), and keep the monogram only as a fallback.

### S2. Superfluous controls and tiles
**State:** idle Varighed, and the grid.
**Problem:**
- Three ways to set a duration sit stacked under the timer: five chips, a custom "1 t 0 min" row, and the timer itself. The custom row repeats the chips' value and adds two more 36 px fields to a screen meant to have one clear action.
- The grid also has tiles beyond the brief's list. "Viaplay Group" (the corporate site; its "VG" glyph reads as the Norwegian tabloid VG) and "TV3 / Viafree / Allente" (the label truncates to "TV3 / Viafre…" on desktop and "TV3 / Viafr…" on phone).

**Fix:**
- Drop the `.custom` row. Make the big timer itself editable: click on hours or minutes → inline numeric edit, arrow keys ±5 min. Alternatively, add a sixth chip `Andet` that reveals the row only when chosen.
- Merge Viaplay Group's domains into the "Viaplay" tile, and label the TV3 tile just `TV3` (Viafree/Allente domains stay inside it). That leaves 13 site tiles and no truncation.

### S3. The confirmation step hides its one important sentence
**State:** after "Start Locked in" (Locked In 3, 1 t).
**What you see:** the timer, then in grey 16 px "Låst til 17:25 · Locked In 3 · kan ikke stoppes", then the list name again, then "Lås nu" (yellow) and "Tilbage" (outline).
**Problem:** "kan ikke stoppes" is the reason the step exists, and it is the last, greyest fragment of the line. The list name is repeated directly underneath.
**Fix:** Make the line `Kan ikke stoppes før kl. 17:25.` in `--text`, 17 px, weight 500, and drop the list name from it. Leave everything else as it is: the button positions already differ from Start, so a double-click cannot lock by accident.

### S4. In "Indtil" mode the idle timer ticks every second and looks like a running session
**State:** idle, Indtil 17:00.
**What you see:** "00:33:49" counting down with the Start button below.
**Problem:** Ticking seconds are the signature of the locked state. A user glancing at the screen can believe he is already locked in (or that the timer "started by itself").
**Fix:** In idle, render the preview at whole-minute precision (`00:34:00`, refreshed each minute) and tick seconds only while locked. Moving digits then always means "locked".

### S5. A new list starts empty with no guidance, and Start still works
**State:** "Ny liste" → "Locked In 3".
**What you see:** every tile dimmed, the Start button active.
**Problem:** Nothing tells a first-time user to tap the icons. Starting now gives an irreversible session that blocks no sites.
**Fix:** While the selected list is empty, show one line under the list name, `Tryk på det, der skal blokeres` (`--subtle`, 14 px), and disable "Start Locked in". The line disappears at the first tap, so it is not permanent text.

### S6. "Service down" leaves an unexplained, odd-coloured button
**State:** `down=1`.
**What you see:** a red 13 px "Locked in-tjenesten svarer ikke" in the top-left corner. The list picker and the whole grid are gone, and the Start button is a muddy olive (yellow at 35 % opacity).
**Problem:** The explanation is about 800 px away from the control it disables. The olive pill doesn't read as "disabled", and there is no next step for a non-technical user.
**Fix:**
- Put the message directly under the button, in `--text`, 14 px: `Locked in kører ikke lige nu. Genstart Mac'en, og prøv igen.`
- Style the disabled button neutrally: `.primary:disabled { background: var(--surface-2); color: var(--muted); opacity: 1; }`.
- Keep the last known list name visible (greyed) instead of removing it.

### S7. Health alerts are written for a developer
**State:** `broken=1&stale=1`.
**What you see:** "Virker ikke: netværksfilter". The other variants are "app-kontrol" and "Tjenesten har ikke tjekket siden 16:20".
**Fix:** Use plain language plus an action, e.g. `Blokeringen virker kun delvist. Genstart Mac'en.` Put the technical part (`netværksfilter`) in the `title` tooltip only.

### S8. Settings drawer: "Apps" doesn't say what it is; "Tillad" is unclear
**State:** gear → drawer, idle.
**What you see:** an "APPS" header over Firefox and Safari (greyed, padlock) and Electron Fiddle with a "Tillad" button.
**Problem:** The grid also has apps, so "Apps" reads as "your apps". These are actually the apps that are *always* closed during focus, and "Tillad" (allow) doesn't say "remove from always-closed".
**Fix:** Change the header to `Altid lukket under fokus` and the button to `Fjern`. The padlock tooltip on the greyed browsers already explains them.

### S9. Planlæg form: stretched segmented control, and yellow used as a selection colour
**State:** drawer → "+ Planlæg", in Dato and Ugentlig.
**What you see:** the "Dato | Ugentlig" switch is 395 px wide with its two pills crowded at the left and an empty right half. In Ugentlig, "Ma Ti On To Fr" are filled yellow, the same yellow as the "Gem" button, while the selected list chip is white.
**Fix:**
- `.inline-form .seg { align-self: flex-start; }`
- `.day.on { background: var(--text); color: var(--bg); border-color: var(--text); }`. Yellow is then reserved for the one primary action on each screen, which is the rule everywhere else.

### S10. Touch/click targets under 40 px
Measured:
- segmented buttons 32 px high
- duration chips and list chips 37 px
- custom inputs 36 px
- list button 36 px
- menu items 37 px
- weekday buttons 36×34
- drawer close "×" and plan-delete "×" 28×28
- "+" sheet close 28×28

**Fix:**
- `.seg button { min-height: 40px; }`
- `.chip, .menu-item, .list-btn, .day { min-height: 40px; }`
- `.icon-btn { min-width: 40px; height: 40px; }` (the glyph can stay 18 px)
- `.day { min-width: 40px; }`

### S11. Glyphs that mislead
**State:** grid, all states.
- **TV 2.** A small red circle with "2" at the top-right of "TV" reads as an iOS/macOS *notification badge* ("TV, 2 unread"), not as TV 2. Draw "TV 2" as one wordmark: `TV` and `2` on the same baseline, same size, white on the dark-navy tile, and drop the badge circle.
- **Viaplay** is a generic white play triangle. In greyscale (off) it is indistinguishable from a video player or YouTube. Add the wordmark initial or keep it, but it then depends on the label (fine once M1's off state is legible).
- **Se og Hør** uses "S&H". The brand uses "og", not "&", so prefer `SH` or a two-line `SE / HØR`.
- **Adversus** is a headset, which reads as "call centre" rather than the brand. That is acceptable for this user, who knows his dialer, and the label carries it.
- **Ekstra Bladet** uses an italic serif "EB" on red. It is recognisable mainly through the red and the label. A heavy upright sans would be closer to a tabloid masthead.
- **Instagram, YouTube, Slack, Netflix, Threads and Facebook** read correctly at 44 px.

---

## NICE

- **N1. Locked state spacing.** The empty `.actions` row still takes a flex gap, leaving about 90 px between "Locked In 1" and the grid. Fix: `.actions:not(:has(> :not([hidden]))) { display: none; }`.
- **N2. "Forlæng".** As the only action while locked it can be a touch more findable: 14 px, `--muted` (in addition to M5).
- **N3. Drawer on phone.** At 375 px the drawer is 337 px wide (the `<dialog>` default `max-width`), leaving a 38 px strip of page. Fix: `.drawer { max-width: 100vw; }`.
- **N4. "+" sheet.** The domain is what matters, but "Navn" comes first and gets focus. Put `domæne.dk` first and focus it. Make Navn optional (`Navn (valgfrit)`) or drop it and derive "Reddit" from `reddit.com`.
- **N5. Fit at 1280×820.** The second tile row and the "Næste" line fall below the fold. `.hero { padding: 4vh 0 32px; gap: 18px; }` keeps everything in one view on a 13" MacBook.
- **N6. Quote page language mix.** The labels are Danish ("Overs.", "Portræt:"), but the data is English ("compiled c. 3rd century BCE", "Book II", "Public domain", "121–180 CE"). Either format the dates in Danish (`f.Kr.`/`e.Kr.`, `ca.`) or switch the two labels to English, so each line is in one language. The q010 creator credit (a long Thai string) makes the licence line wrap to two lines at 1280 px. Use the short creator name from Commons.
- **N7. Quote page portraits.** Bright museum photos on light-grey backgrounds (Marcus Aurelius, Buddha) are the brightest thing on the page and compete with the quote. Try `filter: grayscale(.25) brightness(.88)`.
- **N8. Website quotes page.** It prints raw Commons URLs and "CC BY-SA 4.0" twice per item, and uses "Foto:" where the extension uses "Portræt:". Reuse the extension's credit format: `Portræt: Daniel Martin, CC BY-SA 4.0, Wikimedia Commons`, all linked. "Citater" (h1) + "CITATER" (h2) is a duplicate heading.
- **N9. Website nav links.** They are 26 px tall on phone. Use `nav a { padding: 8px 0; }`.
- **N10. Naming.** The product is "Locked in" (title, button, site) but the lists are "Locked In 1". The owner's brief uses both. Pick one casing for the default list names (`Locked in 1`) unless he wants the capital I.
- **N11. Time input.** `parseHHMM("9.5")` gives 09:05. A Dane may mean 9:30. Treat a single digit after the separator as tens (`9.5` → 09:50), or reject it.

---

## Consistency between pages

The palette (`#0a0b0d`/`#0b0b0c`, the yellow accent), the light tabular timer and the Danish 24 h times are consistent across the control page, the quote page and the website. The website supports a light scheme while the extension is dark-only, which is fine since the brief only asks for dark. The remaining inconsistencies are the credit format (N6, N8), the selection colours (S9) and the name casing (N10).

## Verdict: **CHANGES REQUIRED**

M1–M5 are each small changes: CSS tokens, one blur handler, a two-step delete, and the locked-grid filter. None of them touches the parts that already work well: the timer, the single primary button and the quote page. After M1–M5 and S1–S6, I expect to approve it.

---

# Runde 2 (re-review, 2026-10-04)

**How it was tested.** I used the same method and the same servers (8765 for the extension, 8766 for the website). The built-in browser ran at 1280×820, 800×900 and 375×812, with 2× headless Chrome captures for icon detail. I also ran a DOM scan over the idle page that reports any visible text still coloured `#5d616b` and any control under 40×40 px. I re-checked every state from round 1. No files were edited apart from appending this section.

## Status of round-1 findings

| # | Status | Evidence |
|---|---|---|
| M1 tile on/off | **FIXED** | On tiles carry an 18 px yellow lock badge (Instagram, Slack, Adversus in "Locked In 1"). Off tiles are at 50 % greyscale inside a 1.5 px `#6b6f79` ring (3.9:1), so every white mark reads. Dark brand tiles now have a hairline edge. On and off are told apart at a glance in idle and locked. |
| M2 rename loses text | **FIXED** | I typed "Kold kanvas" and clicked the empty page: the name was saved, and "Næste … · Kold kanvas" updated. I typed "Skal ikke gemmes" and pressed Escape: it was not saved. |
| M3 one-click delete | **FIXED** | The menu now leads with "✓ Locked In 1". "Slet" opens "Slet Locked In 1?" with a red Slet button and Annullér. The confirm button (y≈459) is not where the menu item was (y≈587), so a double-click cannot confirm. |
| M4 accidental add while locked | **PARTIAL** | A single tap opens "Bloker Netflix til 18:19? Bloker / Annullér", and Annullér/Escape leave the lock unchanged. A **double-click bypasses it**: see R1. The "+" sheet's button now reads "Bloker til 18:19". |
| M5 AA text contrast | **FIXED** | The DOM scan found 0 visible text nodes in `#5d616b`. `--subtle #80848e` is used for small text. The custom h/min values and the Planlæg times now render in `--text`. Quote page: host and credits are 12 px `#7b7973` (4.52:1) and the line is still the quietest element. |
| S1 duplicate Slack / monograms | **PARTIAL** (accepted) | The tiles now read "Slack" and "Slack-app", and the monograms are two letters ("Sl", "Sp", "To"). Real app icons are deferred. |
| S2 superfluous controls | **PARTIAL** (accepted) | The h/min row is hidden behind an "Andet" chip (also opened by clicking the timer). "TV3 / Viafree / Allente" now shows as "TV3". Viaplay Group is still a separate tile, deferred; it shows as "Viaplay Gr…" on phone. |
| S3 confirmation line | **FIXED** | "Kan ikke stoppes før kl. 17:44 · Locked In 3" in `--text` at 17 px weight 500. The list button is hidden during confirm, so the name is no longer shown twice. |
| S4 Indtil ticks | **FIXED** | The idle preview read "00:16:00" before and after a 2.5 s wait. The idle colour is `#c9c8c3`; only the locked timer is white and moving. |
| S5 empty list | **FIXED** | A new list shows "Tom liste" beside its name, and Start is disabled (neutral grey). Both clear on the first tap. |
| S6 service down | **FIXED** | "● Locked in kører ikke lige nu — genstart Mac'en" sits directly above a neutral grey disabled button. The olive pill is gone. |
| S7 jargon alerts | **FIXED** | "Blokeringen virker ikke helt — genstart Mac'en". The technical detail is only in `title`. |
| S8 drawer copy | **FIXED** | The header reads "Altid lukket under fokus", and the button reads "Fjern". |
| S9 plan form | **FIXED** | The Dato/Ugentlig switch is compact (67 + 90 px), and the selected weekdays use the white chip fill. |
| S10 targets | **FIXED** | The DOM scan found 0 buttons or inputs under 40×40. Measured: drawer ×, plan ×, weekdays and segmented buttons are all 40 px. |
| S11 glyphs | **FIXED** | TV 2 is a "TV 2" wordmark with a red underline, so there is no badge look. Se og Hør is "SE / HØR" on red. EB is an upright heavy sans. Viaplay is unchanged, which is acceptable. |
| N1 locked spacing | FIXED | The empty actions row is hidden. |
| N2 Forlæng | FIXED | `--muted`, 14 px, 40 px tall. |
| N3 drawer on phone | FIXED | The drawer is 375 of 375 px wide. |
| N4 "+" sheet | FIXED | `domæne.dk` comes first and has focus; the name field reads "Navn (valgfrit)". |
| N5 fit at 1280×820 | FIXED | The whole grid fits without scrolling. |
| N6 credit language | OPEN | Acknowledged. The q010 credit still wraps to 3 lines. |
| N7 portraits | FIXED | `brightness(.88)`. |
| N8, N9 website | OPEN | `web/` is unchanged ("Foto:", raw URLs, 26 px nav links). |
| N10 casing | OPEN | The owner's call. |
| N11 "9.5" | FIXED | Parses as 09:50 (in code). |

## Regressions found

### R1 (MUST-FIX). Double-clicking an off tile while locked blocks it with no real confirmation
**State:** locked, "Locked In 2", desktop 800 px wide.
**Steps:** double-click the Viaplay tile.
**Result:** Viaplay gets the lock badge and is blocked until 18:19.
**Cause:** The confirm bar is inserted *above* the grid (`#tapConfirm` before `#tiles`), so the first click pushes every tile down by about 58 px (about 105 px on phone, where the bar wraps to two lines). The second click then lands on whatever moved under the pointer. In the Viaplay column that is the yellow "Bloker" button. The confirm M4 asked for is defeated by an ordinary double-click.
**Fix (both parts):**
1. *No reflow.* Make the bar an overlay: `.confirm-bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 6; max-width: calc(100vw - 32px); box-shadow: 0 20px 50px -20px #000; }`. Alternatively, reserve its height permanently, toggling it with `visibility` rather than `hidden`.
2. *Ignore fast confirms.* Record `ui.pendingAt = performance.now()` in `onTileTap`. In `tapYes.onclick`, return when `performance.now() - ui.pendingAt < 500` or when `e.detail > 1`. A fixed bar alone is not enough on phone, where a tile can sit right where the bar appears.

### Minor (nice, not blocking)
- **Tom liste.** The hint pushes "Locked In 3 ⌄" off-centre. An action wording, "Tryk på et ikon", says what to do; "Tom liste" only states the problem. Put it on its own line under the name.
- **Confirm step.** The hidden list button leaves an empty 40 px `.list-line` slot between the sub-line and "Lås nu". Hide `#listLine` during confirm.
- **Six chips on phone.** At 375 px, "Andet" wraps alone onto a second row. `.chips { max-width: 300px; margin: 0 auto; }` at ≤560 px gives a balanced 3 + 3.
- **List menu alignment.** "Ny liste / Omdøb / Slet" are not indented under the check column, so they don't line up with the list names. Add `padding-left: 34px`, or give them an empty `.check` span.
- **Ny liste + click away.** This now creates "Locked In N" (save-on-blur). It is harmless because the new list is empty and Start is disabled. Consider cancelling on blur when the default name is untouched.
- **App picker while locked.** Picking an app adds it in one click, without the "Bloker til …" wording the site form has. Show the same wording as a row hint, or ask with the same confirm bar.

## Verdict, round 2: **CHANGES REQUIRED** (one item)

Everything from round 1 is fixed or acceptably deferred (S1 icons, S2 Viaplay Group, N6, N8–N10), and the page is clearly better. Badges and rings make the lists understandable, and the alerts and confirmations read naturally. One regression is left, R1: the locked-state confirm can be passed with a double-click. Once R1's two-part fix is in, this is **APPROVED** from my side with no further round needed. The minor items are optional.

---

# Runde 3 (v1.1.1, list dropdown, 2026-10-04)

**How it was tested.** I used the same method: the built-in browser at 800×900 and 375×812, 1280×820 headless captures, and the DOM scan for `#5d616b` text and controls under 40 px. The scope is the owner's approved sketch: mode switch → timer → duration chips → list dropdown → that list's icons + "✎ Rediger" → Start, and the same dropdown with read-only icons in Planlæg. No files were edited apart from appending this section.

## What I checked

| State | Result |
|---|---|
| **Layout order** | Matches the sketch exactly (1280×820: switch, timer, chips, a 200×44 "Locked In 1 ⌄" dropdown, Instagram/Slack/Adversus + Rediger, Start, "Næste"). The idle screen is now the calmest it has been, with three icons instead of eighteen. |
| **Switching lists** | Choosing "Locked In 2" shows exactly its six icons (YouTube, Slack, Adversus, Netflix after my edit, TV 2, Spotify) + Rediger. Ny liste / Omdøb / Slet are still in the same menu, now aligned under the check column. |
| **Keyboard** | ↓ opens the menu with focus on "✓ Locked In 1"; ↓ moves; Enter selects and returns focus to the button; Esc closes and refocuses. In the drawer, Esc closes only the plan dropdown, not the drawer. |
| **Rediger mode** | It shows every tile with lock badges on the members, then "+ Tilføj" and "✓ Færdig". Toggling worked (Netflix on, Instagram off, applied at once). Færdig returns to the filtered view and puts focus back on Rediger. |
| **Empty list** | "Tom liste" now sits on its own centred line under the dropdown (my round-2 nit is fixed). Only "Rediger" is shown and Start is neutral grey, so the next step is obvious. |
| **Locked** | The timer, "Låst til 18:50", "Locked In 2" and only the blocked icons + Rediger. That is calm and unambiguous. |
| **R1 (round 2)** | **FIXED.** In locked Rediger mode, double-clicking Viaplay showed the confirm bar as a fixed overlay at the bottom. Nothing moved, and Viaplay stayed *off*. A deliberate single click on "Bloker" (after 0.5 s) blocked it. The same 500 ms / `detail > 1` guard is on "Lås nu" and on the delete confirm. Double-clicking where Start was did not lock. |
| **Planning form** | The "Locked In 1" dropdown is followed by 28 px read-only icons with tooltips. Switching to "Locked In 2" by keyboard updated them to six. |
| **Phone (375)** | No horizontal scroll. The chips wrap 4 + 2 (balanced). The dropdown is centred. The idle screen fits. |
| **Contrast / targets** | The DOM scan in idle and Rediger mode found 0 text nodes in `#5d616b` and 0 controls under 40×40. |
| **Earlier approved items** | M1–M5, S3–S11 and the round-2 fixes all still hold. Service-down and broken alerts are unchanged and still sit right above Start. |

## Findings

**R2 (should-fix, small).** After "Start Locked in", the confirm step keeps showing a live "✎ Rediger" tile for up to 5 s, until the next refresh. `start.onclick` clears `ui.sigs.tiles` but never calls `renderTiles()`. Clicking that tile opens the full edit grid *inside* the confirmation step. This is not harmful (unlocked edits are reversible), but the step should be a read-only summary. Fix: call `renderTiles()` in `start.onclick`, as `back.onclick` already does.

**Nice (optional):**
- **Phone, Rediger mode.** The grid pushes "Færdig" and Start below the fold (Start top at 888 px on an 812 px screen). Also let a tap on the dropdown, or Esc, leave edit mode, or put Færdig right after the dropdown on narrow screens.
- **Dropdown accessible name.** The button's accessible name is "Liste", which hides the visible value "Locked In 1" from screen readers (WCAG 2.5.3). Use `aria-label="Liste: Locked In 1"`, or `aria-labelledby` pointing at a hidden "Liste" plus `#listName`.
- **Planning form, empty list.** An empty list shows no icons and no text, so a user can schedule a session that blocks nothing. Show "Tom liste" in `#planIcons`, as on the main page.
- **Færdig tile.** The ✓ in the same ringed tile style reads a little like another toggle. A ghost text button `Færdig` would separate "done" from "choices". This is optional and the owner's sketch is respected either way.

## Verdict, round 3: **APPROVED**

The dropdown matches the owner's sketch, works with mouse and keyboard, and makes the main screen markedly simpler. The round-2 regression R1 is fixed and none of the earlier fixes regressed. R2 is a one-line polish item that does not block release.

---

# Runde 4 (v1.1.3, clock-style pickers, 2026-10-04)

**How it was tested.** I used the same method: the built-in browser at 800×900 and 375×812 with real key presses (not inserted text), the DOM scan, and a node check of `lib/clock.js` for late-evening times (Copenhagen). The test ran at 18:15 local time. No files were edited apart from appending this section.

## What I checked

| Area | Result |
|---|---|
| **Chips** | Exactly "30 min · 1 time · 2 timer · 4 timer · Andet". On phone they wrap 3 + 2. |
| **Andet** | Shows `[1 t ▾] [00 min ▾]` (44 px tall, the same `select-btn` style as the list dropdown) with focus on the hours. Typing "2" filtered to 2, 20–24; Enter chose 2. Tab to minutes and typing "4" gave 40/45; ↓ and Enter chose 45, giving a timer of 02:45:00. Edge cases: 24 t leaves only "00"; 0 t drops "00" and moves to 05. |
| **Indtil** | Shows `[18 ▾] : [30 ▾]` with a default of the next quarter hour. The hours list held only 18–23, and the minutes for 18 only 20–55: earlier times are *left out* rather than greyed, which is cleaner and still meets "only later times today". Typing "19" filtered to just 19; Enter gave 19:30 (timer 01:14:00, static in whole minutes). |
| **Planlæg** | Shows `[09 ▾]:[00 ▾] – [12 ▾]:[00 ▾]` on one line, also at 375 px (330 px wide). Typing "7" gave 07. |
| **Keyboard / wheel** | ↑/↓/Home/End move, Enter chooses and refocuses the button, Esc closes. The mouse wheel scrolled the 25-hour list (scrollTop 0 → 300) without scrolling the page (`overscroll-behavior: contain`). Each list opens scrolled to and focused on the current value. |
| **Contrast / targets** | The DOM scan with pickers open found 0 text in `#5d616b` and 0 controls under 40×40. Options are 40 px rows. The "t" and "min" units and the ":" separator use `--muted` (6.2:1). |
| **Consistency** | Same button, border, caret and menu as the list dropdown. The current option is marked with a filled row and bold text instead of ✓, which suits a narrow numeric list. Acceptable. |
| **Regressions** | None. The list dropdown keyboard path, R1 (a double-click on Viaplay while locked still leaves it *off*), and the round-3 R2 (the confirm step now shows only Instagram/Slack/Adversus, with no Rediger) all hold. |

## Findings

### R3 (MUST-FIX). Typing a digit with no match turns the picker into an empty box that Esc cannot close
**Reproduce:**
- Indtil hour picker at 18:15: press "9" (09 is gone and nothing else starts with 9).
- Andet minute picker: press "7".
- Planlæg minute pickers: press "7".

**Result:** the menu shrinks to an empty 14 px sliver under the button and focus drops to `<body>`, because the focused option was hidden. Esc, Enter and Tab no longer reach the menu's key handler, so the sliver stays open until the user clicks elsewhere. This breaks the keyboard path the owner asked for. "Typing filters/jumps" must never leave the user with nothing.
**Fix (`ui/combo.js`):** never apply a filter with zero hits.
```js
function type(ch) {
  const now = performance.now();
  const base = now - typedAt > 900 ? '' : query;
  typedAt = now;
  const opts = getOptions();
  if (filterOptions(opts, base + ch).length) query = base + ch;
  else if (filterOptions(opts, ch).length) query = ch;
  else return;                        // no match: ignore the key, keep the current list and focus
  applyQuery();
}
```
As a safety net, put the `Escape` handling on `root` (or `document` while the menu is open), not only on `menu`, so a lost focus can never strand an open picker.

### Nice (optional)
- **23:40–23:54.** `defaultUntilQuarter()` returns `null` once the next quarter hour is under 5 minutes away. The pickers then show "-- : --" disabled even though 23:45/23:50/23:55 are still valid in the lists. Fall back to the first available option. When nothing is left today, show a one-line `Ikke flere tider i dag — brug Varighed` under the pickers instead of silent "--".
- **Accessible names.** The pickers' accessible names are "Timer", "Minutter" and "Indtil kl., time", which hide the visible value from screen readers. This is the same issue as the list dropdown. Use e.g. `aria-label="Timer: 2"`.
- **No visible query.** Nothing on screen shows what has been typed. That is fine for one or two digits; no change needed unless the owner asks.

## Verdict, round 4: **CHANGES REQUIRED** (one item)

The pickers are what the owner asked for: compact, clean, consistent with the list dropdown, fully usable with mouse, wheel and keyboard, and limited to later times today. One defect blocks approval: R3, where a non-matching digit leaves an empty, un-closable box. With the small `type()` change above it is **APPROVED** from my side without another full round.

---

# Planlæg — runde 1 (bygget, extension 1.2.0, 2026-10-04)

**How it was tested.** I used the real `app.html?mock=1`, driven by real mouse and keyboard input through a small Chrome DevTools driver (headless Chrome, 1× desktop 1280×820 and 2× phone 390×844 with touch emulation). I also used the built-in browser for spot checks. Scenarios came from the mock's `planSoon=1`, `planNow=1` and `locked=1` options. I judged it against my B+ spec in `docs/PLAN-CONCEPTS.md` and the owner's decisions (only periods in the running lock are frozen; "Spring over" per day; delete is one click plus a 5 s Fortryd; the front page has one line and a calendar icon). No files were edited apart from appending this section.

## What works (verified by use)

| Task | Real clicks | Result |
|---|---|---|
| **i morgen 09–12 · Locked In 2** | **5**: 📅 → + Ny periode → list ▾ → Locked In 2 → Gem | Saved. The card pre-fills "I morgen" with the last-used 09–12; with other last-used times it is 9 clicks. |
| **Ma–Fr 07–09** | **4** via drag: 📅 → drag 07–09 on "tir 6." → Hverdage → Gem. **8** via the form. | Saved as "Hverdage 07–09". Drag snaps to 15 minutes (24 px per hour); a deliberately sloppy drag of ±3 px still gave exactly 07–09. |
| **Edit the next period** (09–12 → 09–13) | **4**: "Næste …" line → end hour ▾ → 13 → Gem | The line opens the panel with that rule's card already open. |
| **Spring over / fortryd** | **2**: row → "Spring over i morgen"; unskip: struck "~~I morgen~~" chip | It takes effect at once. The week strip shows the skipped occurrence as an outline. A double-click (80/250 ms) skipped only one day. |
| **Delete + Fortryd** | **3**: 📅 → row → 🗑, then Fortryd | The toast reads "Perioden er slettet · Fortryd" for 5 s, and the period came back. |
| **Frozen during a lock** (`locked=1&planNow=1`) | — | The running period's row has a padlock and is not clickable; its block is hatched. Other rows stay editable, and "+ Ny periode" works. The sub-line reads "Låst til 21:55 · planlagt". |
| **Confirm-step overlap** (`planSoon=1`) | — | "Kan ikke stoppes før kl. 22:30 — fortsætter i den planlagte 21:30–22:30 · Locked In 1". |
| **Keyboard only** | 15 keys | Tab → 📅, Enter, Enter (+ Ny), Tab, Space (Hverdage), Tab ×2, "7" Enter, Tab ×2, "9" Enter, Tab ×3, Enter. That saved "Hverdage 07–09", and focus returned to "+ Ny periode". |
| **Empty state** | — | The front page shows only the 📅 icon next to the gear, with no line and no text. The panel opens straight on a ready card. |
| **New-tab clutter** | — | One quiet "Næste: i morgen 09–12 · Locked In 1 ›" line under Start. No chart, no drag target, no hover effects. Drag is mouse-only (`pointerType === 'mouse'`) and lives only in the panel, so the touch/scroll accident from concept C cannot happen. |
| **Phone 390×844** | — | The panel is full screen with no horizontal overflow. Rows are 56 px tall, and the card fits with the chips wrapping to two rows. |

This is the B+ spec, built faithfully. The front page is calm, everything is reachable by keyboard, and the click counts match the spec.

## MUST-FIX

### P1. Overlapping periods hide each other in the week strip
**Evidence:** with the mock's two periods ("Hverdage 09–12 · Locked In 1" and "I morgen 09–12 · Locked In 2"), Monday's rail shows **only** the teal Locked In 2 block. The weekly blue occurrence is drawn underneath and is invisible. This is the implementer's acknowledged deviation. The strip is the overview, and an overview that drops a period is wrong exactly when lists are combined.
**Fix:** when occurrences overlap on a day, give the rail two lanes. Draw each block at half height (`top: 0` / `top: 50%`, `height: 50%`), assigning each to the first free lane. Alternatively, draw the later one inset by 3 px with a 1 px `--bg` outline. The row height does not change.

### P2. The idle timer contradicts the selected chip, with no explanation
**Evidence:** with `planSoon=1`, "1 time" is selected but the big timer reads **01:34:00** on the front page (and the new-tab page), with nothing beside it. A non-technical user reads that as a bug. The explanation only appears after pressing Start. My spec asked for the real total, but that only works with a cue.
**Fix:** while idle and chained, show the existing `.sub` line (muted, 15 px): `1 time + planlagt 21:30–22:30`, or shorter, `Til 22:30 · planlagt periode følger`. It disappears as soon as the chosen duration no longer reaches a period.

## SHOULD-FIX

- **The confirm line names the wrong list for the chained part.** "… fortsætter i den planlagte 21:30–22:30 · Locked In 1": Locked In 1 is the session's list, but the planned period blocks **Locked In 2** (YouTube, TV 2, Spotify), and the icons shown are only Locked In 1's. Write `… fortsætter i den planlagte 21:30–22:30 (Locked In 2)` and append that list's extra icons after a thin separator. On a phone the line already wraps to two lines, so drop the trailing session list name.
- **Frozen rows only explain themselves in a `title` tooltip,** which is invisible on touch. Replace the chevron with `🔒 til 21:55` (`--subtle`, 13 px) as specced ("Kan ændres efter …").
- **The open card jumps after "Spring over".** The list re-sorts by next occurrence while the card is open. In my run "Hverdage" moved below "I morgen", and the panel scrolled under the pointer. Freeze the row order while a card is open and re-sort on close.
- **The skip line mixes save models without saying so.** Skip and unskip apply at once, while everything else in the card waits for "Gem". The undo affordance is a struck "~~I morgen~~" chip whose meaning is only in `title`. Move the skip line outside the form fields, directly above the action row with a hairline above it, and label the skipped state `I morgen springes over · Fortryd`.

## NICE

- **Duplicates.** An identical "I morgen 09–12 · Locked In 2" was saved twice without comment. When an identical period exists, open it instead, or show `Findes allerede` under Gem.
- **"Næste" with two periods at the same time.** It names one list (Locked In 1) while the strip shows the other on top. Use `· Locked In 1 + Locked In 2`.
- **"I dag" chip.** With last-used 09–12 after 09:00, choosing "I dag" pre-fills a past time, and Gem then errors. Move the start to the next quarter hour when it is already past.
- **The strip shows no ghost of the draft** while the card is open after a drag. Draw the draft as a dashed block so the drag result stays visible.
- **The vertical grid lines** at 06, 12 and 18 are drawn over the blocks. Put the grid under the blocks.
- **Strip blocks are tab stops** before "+ Ny periode", one per occurrence. Make them `tabindex="-1"`, since the rows are the keyboard path. Short blocks are 13 px wide on a phone, so tapping them is luck; the rows remain the reliable target.
- **Phone layout.** The strip takes about 45 % of the first screen. 28 px rails on narrow screens would bring the list up.

## Verdict: **CHANGES REQUIRED** (two small items)

The build matches the B+ spec and the owner's decisions:
- the new-tab page is calm;
- create, edit, skip and delete work at the specced click counts;
- the keyboard path is complete;
- touch cannot create anything by accident;
- frozen-during-lock, delete with Fortryd and the overlap warning all behave.

Two things mislead the user and must be fixed before release:
- **P1:** the overview hides overlapping periods.
- **P2:** the big timer silently disagrees with the chosen chip.

Both are small and local. With P1 and P2 fixed, this is **APPROVED** from my side. The should-fix items are strongly recommended, and the confirm-line list name and the frozen-row text in particular are one-liners.

---

# Planlæg — runde 2 (recheck, extension 1.2.0, 2026-10-04)

**How it was tested.** I used the same CDP driver with real mouse and keyboard input on `app.html?mock=1` at 1280×820 and 390×844 (2×, touch), plus `planSoon=1` and `locked=1&planNow=1`. No files were edited apart from appending this section.

| Item | Status | Evidence |
|---|---|---|
| **P1: overlaps** | **FIXED** | Monday now draws two lanes, 20 px each: "Hverdage 09–12 · Locked In 1" on top and "I morgen 09–12 · Locked In 2" below. Both are visible on desktop and phone. |
| **P2: idle timer** | **FIXED** | With `planSoon=1` and "1 time" selected, the timer reads **01:00:00**, the same as the chip. The chain is explained only in the confirm step, which is the place my spec intended. |
| Confirm line names the planned list | **FIXED** | "Kan ikke stoppes før kl. 22:35 — fortsætter i den planlagte 21:35–22:35 **(Locked In 2)**". The confirm icons add YouTube, TV 2 and Spotify after a thin separator. |
| Frozen row explains itself | **FIXED** | The row reads "I dag 20:35–22:05 · Locked In 2 · 🔒 Låst til 22:05" as visible text, which also works on touch. |
| No jump after "Spring over" | **FIXED** | The row order stayed fixed while the card was open (I dag / [card] / I morgen before and after the skip). It re-sorted only after Esc. |
| Skip line | **FIXED** | It sits below a hairline, separate from the fields: "Spring over tir 6. okt. · ~~I morgen~~ springes over · [Fortryd spring over]". "Fortryd spring over" restored "Spring over i morgen". |
| **Regressions** | none | No horizontal overflow at 390 px. The confirm step still shows no Rediger tile. The front page is unchanged (one "Næste" line and 📅). |

**Nice (optional):** on a phone, the confirm icons wrap after Adversus, which leaves the list separator at the end of the first row. Put the separator at the start of the second group, or hide it when the groups wrap.

## Verdict: **APPROVED**

---

# Plan-side — bygget, runde 1 (extension 1.3.0, 2026-10-05)

**How it was tested.** I used the real `app.html?mock=1` in the built-in browser, in my own tab, at **1440×900, 1280×720, 900×700 and 375×812** (mobile preset), with real clicks, a real drag and real key presses. I also used the `locked=1&planNow=1` scenario, ran DOM checks for overflow and "…", and checked z-index and sticky labels. Test time: Monday 07:22–07:35. No files were edited apart from appending this section.

## The 7 required changes from "Plan-side — udfordring"

| # | Status | Evidence |
|---|---|---|
| 1 No "…" in blocks | **DONE** | The DOM scan at 1440, 1280 and 900 found 0 ellipses and 0 overflowing spans. The ladder works: at 1440 "09–12 / Locked In 1"; at 900 (74 px columns) "09–12"; a cascaded 46 px block "09"; a fully covered block shows nothing. |
| 2 Cascade | **DONE** | Tuesday's "I morgen 09–12" sits cascaded over the weekly 09–12 (indent `max(24 px, 28 %)`, running to the right edge), and the block underneath keeps a visible "09". A skipped Wednesday is drawn as an outline and takes no lane. |
| 3 Now-line under blocks | **DONE** | The line has z-index 1 and the blocks 3 or more. Under the frozen "06:55–08:25" and the 07–08 draft the line disappears, with the dot in the gutter. No more fake strikethrough. |
| 4 "Lås nu til …" | **DONE** | A weekly 07:00–08:00 draft at 07:27 → "Lås nu til 08:00" → the two-step "Kan ikke stoppes før kl. 08:00 · Locked In 1" with [Lås nu] [Tilbage]. |
| 5 Sticky labels | **DONE** | Saturday's "→ 10 / Locked In 1" (the 00–10 part of "Fre 22 → lør 10") is pinned at the visible top (label at y 125, header bottom 122). |
| 6 No `null` | **DONE** | After deleting all periods the panel shows only "+ Ny periode". |
| 7 Merged header | **DONE** | Tabs, I dag, ‹ ›, title and gear sit in one 60 px row. At 1280×720 the grid shows **12.5 hours** (07:00–19:30), and the "07" label is not clipped. |

## Verified by use (all pass)

- **Fokus | Plan.**
  - Fokus has no hairline (0 px); Plan has one.
  - The tabs are 15 px, 600 active / 500 `--muted` inactive, and 40 px tall. ← and → switch them.
  - `#plan` survives reload, and Back returns to Fokus.
- **"Næste: i dag 09–12 · Locked In 1 ›"** opens Plan with "Hverdage 09–12" in the panel, and its five occurrences are ringed. That shows the scope of an edit well.
- **Empty slot → panel.**
  - Wednesday 13:00 → "Ny periode, Onsdag 7. okt., 13–14".
  - Changing Fra to 10 keeps the length (10–11) and moves the draft live.
  - A slot before now does nothing.
- **Drag-select:** Thursday 14→16 → "Torsdag 8. okt. 14–16 · 2 t", saved with one click.
- **Overnight:** Vælg dage Fr, 22 → 10 → "næste dag · 12 t" → the row reads "Fre 22 → lør 10".
- **Skip:** "Spring over ons 7. okt." → the block is struck through and outlined, and the panel reads "~~Ons 7. okt.~~ springes over [Fortryd]".
- **Frozen:** the block has a lock and is hatched. The row reads "🔒 Låst til 08:25" and cannot be opened.
- **Delete + Fortryd:** the toast reads "Perioden er slettet [Fortryd]" (fixed, z 60, hit-testable), and Fortryd restored the period.
- **Keyboard:**
  - grid → ←/→/↓ moves a visible 2 px accent slot ring, with the live region reading "Onsdag 7. okt. 09:30–…";
  - Shift+↓ lengthens it;
  - Enter opens "Ny periode";
  - Esc returns focus to the grid;
  - Tab walks the events in time order, Enter opens one, and Esc returns focus to that event.
- **Phone (375 px):** the header wraps to two rows (108 px). The day strip has dots. The day view has no horizontal overflow (scrollWidth 375). Tapping an event scrolls the panel into view (panel top at 296 px).
- **Overflow:** none at any size (scrollWidth equals the viewport), and nothing inside the panel overflows.

This is now a real calendar page: Google-grade structure, honest block heights, and no popups. It answers the owner's "Byg det ordentlig".

## MUST-FIX

### PB1. Slot clicks and the keyboard slot inherit the last saved length, uncapped
- **Evidence:** after saving the overnight "Fre 22 → lør 10" (12 h), clicking today 07:45 produced **07:30–19:30**, and the keyboard slot on Wednesday became **09:30–22:00** ("12 t 30 min"). A recruiter who once plans a working day (08–17) gets 9-hour drafts from every later click. That is exactly the "sløset" feeling the owner rejected.
- **Cause:** `ui/plan.js` `lastLen()` (line 65) feeds `newAt(…)` (lines 366 and 385) and the cursor (line 272).
- **Fix:** for clicks and the keyboard slot, use `lastLen()` only when it is **≤ 180 minutes**; otherwise use 60. Drag is unaffected, because it sets its own length.

## SHOULD-FIX

- **The 24-hour rule** (known deviation). The end picker offers times that make one continuous lock longer than 24 hours.
  - In the mock, "Fre 22 → lør 10" plus "Lø 10–23" (25 h) was even **saved**. Production will only show the daemon's error after Gem.
  - `chainEnd()` is already in `lib/plan.js`. Compute the chain for the draft as it changes. When it is over 24 h, show `Samlet lås 25 t · højst 24 t` in `--bad` next to the length (where "maks. 24 t" was specced) and disable Gem.
  - That is one line of text and no round trip, and it matches the approved "Indtil" pattern.
- **"Én gang" today with a start already past** (07:00 at 07:27) keeps "Gem" and fails at the daemon, because a single period must lie in the future. For today's date, leave past start times out of the Fra picker (the approved Indtil pattern). "Lås nu til …" stays the path for weekly periods that cover now.
- **The draft is drawn full width at level 0,** so it hides the blocks under it. A 07–19 draft covered Monday's 09–12 completely. Cascade the draft like any event (it is the newest, so it goes on top and indented), or give it 60 % opacity.
- **Panel 336 px at 860–1179 px** (known deviation): **accepted.** At 900 px the columns are 74 px against the 76 px I asked for; the label ladder copes, and nothing overflows.

## Verdict: **CHANGES REQUIRED** (one small item)

All 7 required changes are in, every flow works by mouse, drag, keyboard and touch, and nothing overflows at any size. **PB1** must be fixed before release: it is the default length of the most common action, and it is a one-line cap. The 24-hour pre-check and the past-start rule are strongly recommended in the same pass. With PB1 fixed, this is **APPROVED** from my side.

---

# Plan-side — bygget, runde 2 (recheck, 2026-10-05)

**How it was tested.** I used the mock at 1440×900, 900×700 and 375×812 (mobile preset), with real clicks and keys. Test time was Monday 07:46–07:50. No files were edited apart from appending this section.

| Item | Status | Evidence |
|---|---|---|
| **PB1: slot length** | **FIXED** | Last-used 22→10 (12 h): a click on Thursday 14:00 gave **14–15 (1 t)**. Last-used 13–15 (2 h): the same click gave **14–16 (2 t)**, and the keyboard slot was 09:30–11:30. On the phone, last-used 08–17 (9 h): a tap at 15:00 gave **15–16 (1 t)**, and the panel scrolled into view. |
| 24-hour chain | **FIXED** | After saving "Fre 22 → lør 10", a draft "Lø 10–23" shows **"Samlet lås 25 t · højst 24 t"** in `--bad` under Til, and **Gem is disabled**. Changing Til to 21 (23 h in total) clears the message and enables Gem. |
| No past starts for "Én gang" today | **FIXED** | At 07:47 the Fra hours start at **07**, and the minutes for 07 are only **50, 55**. |
| Draft on top and indented | **FIXED** | A 10–11 draft on Wednesday is placed at left 42 px, z 40, over the weekly 09–12, which stays readable at full width ("09–12 / Locked In 1"). |
| **Regressions** | none | 0 ellipses and 0 overflowing labels at 900 px. No horizontal overflow at 900 or 375 px. Earlier behaviour still holds: slots before now do nothing, Esc returns focus, and the header is merged. |

## Verdict: **APPROVED**
