# Locked in — independent review 4 (block lists, v1.2 / extension 1.1.0)

Reviewer: independent (wrote none of the code). Date: 2026-10-04, ~16:20–16:45 local.
Scope: the "lister" feature, i.e. named block lists that replace the per-site/app toggles.
- Daemon: `Model` (`BlockList`, `Schedule.list/date`, `TimerLock.lists`, `State.lists/listsMigrated`), `ScheduleMath` one-off dates, `Engine` list logic, API routes, `main.swift` wiring.
- Catalog additions: tv2, ekstrabladet, seoghoer, facebook.
- Extension 1.1.0.
- The docs.

Method:
- `CoreTests` 161/161, `node --test` 74/74, and `extension/test/load-in-chrome.sh` **ALL CHECKS PASSED** (renders the lock with its list "Locked In 1").
- Probes `review/r4a` (Swift, compiled against the current sources) and `review/r4b.mjs` (the extension reducer).
- The live daemon (1.0, unlocked) was only read with `GET /v1/status`. `/Library/Application Support/LockedIn/state.json` is `0600 root`, so it was **not** read; migration was reasoned from the code plus a state equivalent to the live status.
- `/tmp/lockedin-release` was not touched.

Counts: **1 high, 4 medium, 3 low.** No critical.

---

## HIGH

### L4-1 — Registering an app during a lock un-blocks it. CONFIRMED
- Where: `Engine.swift:296-311`, `API.swift` `POST /v1/apps`.
- In v1.2, `addApp` registers a new app with `blocked = false` ("Tillad") unless it is a browser, and this is allowed **while locked**.
- An unknown web-engine app is closed during a lock by the "unknown engine" rule (`AppPolicy` step 4). Once it is registered, a rule with a matching team exists, so step 3 returns `allow`.
- r4a: a lock is running, and Discord (unknown Electron app) is judged `killAndRecord`. Then `POST /v1/apps {"bundleId":"com.hnc.Discord"}` returns 200, and the judgement becomes **`allow`** for the rest of the lock.
- On this Mac the same works for `PokerStars.app`: it is in `/Applications` and its inner `xcw.app` engine is otherwise killed.
- The UI happens to pass the active list, which closes the app. But the API (and curl, with no `Origin`) does not require a list.
- Fix: while locked, a newly registered app with an engine or browser at any level must be stored as always-closed (`blocked = true`). Or refuse a registration without an active `list` during a lock.

## MEDIUM

### L4-2 — The list of a later period in the same continuous lock can be emptied mid-lock. CONFIRMED
- Where: `Engine.swift:203-211, 285-291, 331-338` ("in use" = `activeListIds`, which counts only the sources active **this second**).
- r4a: a timer 10–11 on list A, chained to a planned period 11–13 on list B, is one lock "until 13:00". At 10:00:
  - `PUT /v1/lists/B {sites: []}` → **200**;
  - re-pointing the period → 423;
  - deleting the period → 423.
- At 11:30 the result is `locked=true, effectiveSites=[]`: still locked, so the user cannot change anything, but nothing is blocked.
- `DELETE /v1/sites/{id}` and `DELETE /v1/apps/{id}` likewise strip B, because they remove from **all** lists.
- Fix: treat as "in use" every list referenced by any interval of the current chain (from `activeSince` to `activeUntil`), for `updateList`, `removeList`, `removeSite` and `removeApp`.

### L4-3 — Upgrading from 1.0 during a running timer lock blocks nothing. CONFIRMED
- Where: `Model.swift` `TimerLock.lists` defaults to `[]`, `Engine.migrateToLists` (`:134-143`), `activeListIds` (`:153-165`).
- `migrateToLists` gives schedules the first list but leaves `timer.lists` empty. `activeListIds` has a fallback for an empty schedule list but not for an empty timer list.
- r4a: a 1.0 state with a running 60-min timer, after migration → `locked=true, Locked In 1=[instagram, youtube], timer.lists=[], effectiveSites=[]`. Hosts and listed apps are lifted while the lock still reports active.
- `install.sh` does not refuse to run during a session. The extension keeps its earlier snapshot, so Chrome stays blocked.
- Fix: in `migrateToLists`, set `timer.lists = [first]` when it is empty, and fall back to the first list for an empty timer in `activeListIds`. Have `install.sh` refuse, or warn, while `active` is true.

### L4-4 — Chrome keeps a list's sites blocked after that list's period ends, including Adversus. CONFIRMED
- Where: `extension/lib/lock.js` (unchanged since review 2: during a lock `blocked` only goes false → true).
- r4b: the timer on "Locked In 1" (Adversus + Instagram) ends at 11:00 and the lock continues on "Locked In 2" (Instagram only). At 11:30 the daemon reports `adversus.blocked=false`, but the extension **still redirects `app.adversus.io`**. It does so until the whole chain ends.
- The owner's stated intent is that the set shrinks when a source ends. ARCHITECTURE says Powermatch-related things are blocked only when the owner chose it, and for that period he chose a list without Adversus (PowerLink's "Åbn i Adversus" tabs).
- This is a deliberate fail-closed trade-off, but it now contradicts the spec.
- Fix (keeps spoof resistance): snapshot each list's members when it becomes active. Release a list's sites only when that list leaves `activeLists` **and** the daemon's `activeSources` dropped the corresponding source. Never accept `allowHosts` growth.

### L4-5 — The docs contradict v1.2
- `API.md:46` still says `sites[].blocked` is the snapshot from session start; in v1.2 it means "blocked now".
- `API.md:55` still documents `PATCH /v1/sites/{id}`, while `:91` says it no longer exists.
- `API.md:60` says `POST /v1/apps` adds with `blocked: true`; it is now `false` for non-browsers, which is L4-1.
- `ARCHITECTURE.md:44` still describes per-element "Virker under fokus / Blokeret" toggles, and the architecture does not mention lists at all.
- `API.md` "En enkelt periode skal ligge i fremtiden": the code only requires its **end** to be in the future, so a one-off for today that has already begun is accepted and locks immediately.
- `API.md` "fjernes automatisk": only while unlocked.

## LOW
- **L4-6 — `PUT /v1/schedules` without `list` re-points the period to the first list** (the `listId` fallback, `Engine.swift:384`), silently, outside a lock. The UI no longer sends PUT, but the API does.
- **L4-7 — Facebook and WhatsApp.** WhatsApp desktop (`~/Desktop/WhatsApp.app`) references `www.facebook.com`, `m.facebook.com`, `web.facebook.com` and `business.facebook.com`. During a session with Facebook on an active list, the first three are sunk in hosts. Core messaging uses `*.whatsapp.net` and is unaffected. `graph.facebook.com` is allowed (not in hosts, plus a DNR allow rule), and `gateway.facebook.com` is not sunk. So expect only peripheral links and features to fail; verify on the Mac.
  - FYI, CONFIRMED: the four new catalog sites (tv2, ekstrabladet, seoghoer, facebook) automatically land in "Locked In 1", on a fresh install and on the 1.0 migration alike, because `mergeCatalog` runs before `migrateToLists` and the catalog marks them blocked. Make sure that is what the owner wants.
- **L4-8 — `dropPastOneOffs` is never saved on its own.** It runs from `advance()` without marking state dirty, so the cleanup is only persisted with the next save. Harmless.

## Checked and fine
- **Active list:** shrinking → 423, deleting → 423, renaming → OK, last list → 400, list used by a period → 400 (r4a).
- **Starting again with another list** adds it (`timer.lists = [A, C]`) and never replaces.
- A custom site on an active list cannot be deleted. Lists only hold registry ids. List ids are random (`newId`), so no reuse.
- Re-pointing or deleting a period during a lock → 423. One-off cleanup runs only while unlocked.
- **Catalog merge during a lock** still only unions. Catalog sites added after migration enter no list.
- An unknown `AppKind` now decodes as `webengine` (the REVIEW-2 M1 residual).
- **Migration of the live 1.0 state** (reasoned plus an equivalent state; no timer, no schedules):
  - "Locked In 1" = the 9 blocked sites + the 4 new ones;
  - `apps: []` on the list;
  - app flags kept: Safari and GoLogin always closed; Claude, Screen Studio, Spark, Todoist and Wispr "Tillad".
- **Extension 1.1.0:** loads in Chrome for Testing, `allowHosts` stays intersect-only, and the UI's `toggleMember` refuses removal from an active list.
- **New catalog entries** contain nothing Powermatch-, Railway- or adversus.dk-related.

Not re-tested this round: the 16:04 changes for REVIEW-3.
- R3-1: the shim now also requires "tiny" = no `Contents/Frameworks` and executable < 2 MB.
- R3-2: `/opt/homebrew` and `/var/tmp` added.
- R3-4: `Shell` now has a 5 s timeout.
- R3-3 (`lsof` port collision) is unchanged.

## Verdict: **FIX FIRST**
L4-1 is a lock weakening reachable with a single API call while locked. L4-2 and L4-3 are weakening paths through the list mechanism itself. L4-4 contradicts the owner's spec in a way that touches Adversus. All four are small, local fixes in `Engine` and `lock.js`.

## Can only be verified on the real Mac
1. Upgrade of the live 1.0 install: `GET /v1/status` shows one list "Locked In 1" with 13 sites, app flags preserved, and no schedules. A 2-min session sinks facebook.com and tv2.dk in hosts.
2. WhatsApp desktop (from `~/Desktop`) and WhatsApp Web during a session with Facebook on the list: messaging, media and login work.
3. Pages serves 1.1.0 (the manifest version is bumped; Pages served 1.0.0 in round 3), and the installed extension updates and talks to the new daemon (list picker, in-place edit, planning form).
4. Still open from earlier rounds: App Nap and wake with the watchdog, a Chrome update during a session, pf, and that the standard account cannot remove the profile or the daemon.

---

# Round 5 (targeted re-test, ~16:50 local)
Method:
- `CoreTests` 167/167 and `node --test` 74/74.
- Probe `review/r5` (Swift, compiled against the current sources). The live daemon was only read.

| Item | Verdict | Evidence |
|---|---|---|
| **L4-1** registering during a lock | **PARTIAL** | Fixed for apps whose **outer** kind is `.webengine`: Discord registered mid-lock → still killed. Not fixed for `kind .app` registrations, see R5-2. |
| **L4-2** chained later period | **FIXED** | Emptying list B of a period chained later → 423. Deleting a custom site that is on B → 423 (`frozenListIds` = every source in the chain + `lockLists`). |
| **L4-3** 1.0 timer after upgrade | **FIXED** | After migration `timer.lists = ["Locked In 1"]` and `effectiveSites = [instagram]`. An already-migrated timer with empty lists falls back to the first list. |
| **L4-4** Chrome and daemon disagree | **FIXED by changing the semantics** | Both the daemon (`lockLists`) and the extension now keep every list of one continuous lock until it ends. The ARCHITECTURE "Lister" section says so ("Én sammenhængende lås blokerer alt fra alle sine lister, til den slutter"). |
| New built-ins on a 1.0 upgrade | **FIXED for upgrades** | A 1.0 state → "Locked In 1" = only what 1.0 blocked; Facebook etc. are not added. **Regression on fresh installs: R5-1.** |
| Docs | **mostly FIXED** | API.md no longer documents `PATCH /v1/sites` or snapshot semantics, and ARCHITECTURE has a "Lister" section. Still stale:<br>• `ARCHITECTURE.md:44` (per-item "Virker under fokus / Blokeret");<br>• `API.md:90` says a one-off must lie in the future, but only its end must. |

## New findings

**R5-1 (HIGH) — A fresh install's "Locked In 1" contains only Instagram.** CONFIRMED
- Where: `Engine.mergeCatalog` (`Engine.swift`, new branch `if !state.listsMigrated && !state.sites.isEmpty { n.blocked = false }`).
- The condition is evaluated **inside** the loop. On a fresh install `state.sites` is empty only for the first catalog entry. Every built-in after it is marked unblocked, and `migrateToLists` then takes only the blocked ones.
- With the real `config/catalog.json` (13 built-ins): `Locked In 1 = ["instagram"]`. YouTube, Slack, Adversus, Netflix, Threads and the rest are not blocked.
- The same happens after `uninstall.sh` + reinstall, because uninstall deletes `state.json`.
- The owner's 1.0 → 1.2 upgrade is **not** affected: his sites already exist and keep their flags.
- Fix: compute `let upgrading = !state.listsMigrated && !state.sites.isEmpty` once, before the loop. Add a CoreTest for the fresh-install contents.

**R5-2 (MEDIUM) — Registering during a lock still turns kill into allow for `kind .app` bundles.** CONFIRMED
- `addApp` makes a new app always-closed only if `app.kind == .webengine`. But `installed()` reports the **outer** bundle's kind, so two cases slip through:
  - **PokerStars** (in `/Applications`; outer kind `.app`, engine in its inner `xcw.app`): `killAndRecord` before; after `POST /v1/apps` during the lock → **`allow`** (blocked=false).
  - **A WKWebView app in `~/Applications`** (kind `.app`): `judgeWebContentOwner` gives `killAndRecord` before; after registering during the lock → **`allow`**.
- Fix: while locked, register **every** new app as always-closed unless it is added to an active list (which closes it anyway). Allowing it remains possible after the lock with "Tillad".

**R5-3 (LOW) — `lockLists` leaks into the next, separate lock when no unlocked tick happens between them.** CONFIRMED
- The clearing happens only on a tick that sees "unlocked".
- Probe: lock 1 is a timer 10–11 on "Locked In 1"; the Mac sleeps 10:10–14:30; lock 2 is a separate period 14–15 on list B. The first tick after wake runs inside lock 2 → `activeLists = ["Locked In 1", "B"]`, effective sites include lock 1's list. "Locked In 1" is also frozen (shrink → 423).
- The same happens across a daemon restart: `lockLists` is persisted and `boot()` does not clear it. It can also happen with back-to-back locks less than 2 s apart.
- With ticks in the gap, lock 2 correctly has only `["B"]`.
- Effect: over-blocking for the second lock (fail closed). If "Locked In 1" holds Adversus, PowerLink's Adversus tabs stay blocked during a lock whose list does not include Adversus.
- Fix: store the chain's `activeSince` together with `lockLists` and reset when the current chain's `activeSince` differs.
- Other regression questions:
  - Deleted lists: no, `activeListIds` filters to existing lists.
  - Surviving an unlock: no, cleared on the first unlocked tick.
  - An ended lock's list frozen while unlocked: no, `frozenListIds` is empty when unlocked.

## Round 5 verdict: **FIX FIRST**
R5-1 is a one-line bug with a big default effect (fresh or re-installs block only Instagram). R5-2 leaves the L4-1 weakening open for apps whose engine sits in a nested bundle, and for WKWebView apps. R5-3 is minor.

---

# Final check v1.1 (daemon API 1.2.0 + extension 1.1.0, ~17:05 local)
Method:
- All suites pass:
  - `CoreTests` **170/170**;
  - `node --test` **97/97**;
  - `test/load-in-chrome.sh` **ALL CHECKS PASSED**;
  - `test/ui-in-chrome.sh` **ALL CHECKS PASSED**.
- Probe `review/r6`. The live daemon (the owner's 1.1.0, unlocked) was read only with `GET /v1/status`.
- `/tmp/lockedin-release` and PowerLink were not touched.

## 1. Round 5 items
| Item | Verdict | Evidence |
|---|---|---|
| **R5-1** fresh install | **FIXED** | `upgrading` is decided once, before the loop. A fresh install with the real catalog gives Locked In 1 **13/13** built-ins. |
| **R5-2** registering during a lock | **FIXED** | Any app registered during a lock is always-closed. PokerStars (engine in a nested `xcw.app`) registered mid-lock → `kill`. |
| **R5-3** `lockLists` leak | **NOT FIXED** (sleep case) | See below. |

**R5-3 detail (LOW, CONFIRMED).**
- `Engine.advance()` calls `rememberLockLists(now)` **before** it applies the monotonic delta.
- After a sleep, the expired timer therefore still looks alive (stale `monoRemaining`, about 50 min in the probe). The old timer's list is recorded, and `lockListsUntil` is set to wake + that stale budget (probe: `lockListsUntil = 13:20Z` for a wake at 12:30Z).
- `sameLock` then holds, and the next, separate lock still gets the old list: `activeLists = ["Locked In 1", "B"]`.
- Effect: over-blocking. If "Locked In 1" holds Adversus, it stays blocked during a later lock whose list does not.
- Fix: call `rememberLockLists` only after the timer update in `advance()` (drop the first call), or compute it with the advanced timer.

## 2. Extension changes
- **Favicons (OK).**
  - Order: Chrome's own cache via `chrome-extension://…/_favicon/` (needs the `"favicon"` permission, no network), then the site's own `<link rel=icon>`, then `/favicon.ico`. No third-party service.
  - Sites blocked right now are skipped, and so are blocked icon hosts.
  - `credentials: 'omit'`, 6 s timeout, size caps (1 MB HTML, 512 KB image).
  - Output is a 64×64 PNG data URL ≤ 32 KB, rendered only if it starts with `data:image/png;base64,` (CSP `img-src data:`).
  - *Minor:* `fetch` follows redirects before the final URL is checked, so a redirect to a blocked host is still *requested* (the response is discarded). Use `redirect: 'manual'` and check each hop.
- **R1 confirm overlay with 500 ms guards, Danish credit line (OK).** UI only; nothing site-controlled is written as HTML (`innerHTML` only for static glyphs).
- **No test can reach 127.0.0.1:919 (OK).**
  - The unit tests replace `fetch`.
  - Both Chrome for Testing drivers block `*127.0.0.1:919*`, `*localhost:919*` and `*[::1]:919*` in the browser. The fake daemon refuses port 919, and the load test checks that the test copy differs from the shipped build only in the port.
  - The only contact is a read-only `GET /v1/status`, used to refuse to start Chrome for Testing while a real lock runs.

## 3. install.sh and the owner's upgrade
- **Copying the extension to a root-owned folder is correct.** `pack.sh` runs as the user, then `rm -rf` + `cp -R` into `"$SUPPORT/extension"`, `chown -R root:wheel`, `chmod -R go-w`. Paths are quoted. BSD `cp -R`, `chown -R` and `chmod -R` do not follow symlinks inside the tree.
- **The owner's migration (CONFIRMED).** The state was rebuilt from the live `GET /v1/status` (`state.json` is root-only) and round-tripped as a 1.1.0 file without list keys.
  - "Locked In 1" = the 9 built-ins + **c-x.com** + c-tv2.dk + c-ekstrabladet.dk (12).
  - The new built-ins (tv2, ekstrabladet, seoghoer, facebook) are offered but not on the list.
  - His period "Mandag locked in" → Locked In 1, and Monday 07:30 locks 12 sites.
  - Always-closed apps are kept: GoLogin, Safari, Chrome for Testing.
  - Cosmetic: built-in `tv2`/`ekstrabladet` now sit next to his own `c-tv2.dk`/`c-ekstrabladet.dk` (duplicates in the UI).
- **Consequence of T3 (MEDIUM, docs).** The extension is now loaded unpacked, with Developer mode on, so Chrome's policy does not protect it.
  - The owner can remove or disable it, or load an edited copy with the same `key` (same id, same heartbeats) at any time, including during a session.
  - The watchdog (still armed: the forcelist sits in Managed Preferences even though Chrome blocks it, and a heartbeat has been seen) only catches removal or disabling: Chrome is closed after ~2.5 min of activity.
  - An edited copy that keeps sending heartbeats switches off the whole Chrome layer: quote page, sub-resource blocking, and the **Adversus tab block, which has no other layer**. Hosts, pf and app control remain.
  - This is the owner's interim choice until the Web Store, but the docs must say it.

## 4. Docs
- Consistent: TESTLOG T3/T3b/T4, INSTALL step 3 (unpacked load), API "Lister", ARCHITECTURE "Lister".
- Stale or false:
  - `INSTALL.md:17` "Profilen tvinger Locked in-udvidelsen ind i Chrome": contradicts `:20` and T3.
  - `ADMIN-TJEKLISTE.md:39` "installeret af politik": it is now unpacked.
  - `ARCHITECTURE.md:83` the watchdog condition "konfigurationsprofilen tvinger udvidelsen ind". The code only checks that the forcelist is present. ARCHITECTURE also never mentions the unpacked install and its limitation (§3 above) under "Kendte begrænsninger".
  - `ARCHITECTURE.md:44` per-item "Virker under fokus / Blokeret" (stale since v1.2; flagged in round 5).
  - `API.md:90` "En enkelt periode skal ligge i fremtiden": only its end must (flagged in round 5).

## Verdict: **SHIP** — on condition that the five doc lines above are corrected in the same release
No code blocker remains. Round 5's R5-1 and R5-2 are fixed, and nothing found weakens a running lock or touches PowerLink. R5-3 (a one-line fix, over-blocking only) and the favicon redirect hop can follow in 1.1.1. The doc corrections matter because the unpacked extension makes the Chrome layer, and with it the Adversus tab block, voluntary, and the admin checklist currently tells the admin to expect a policy install.

### Real-Mac only
1. Run the upgrade on the live 1.1.0: `GET /v1/status` shows `lists = [Locked In 1]` with 12 sites and "Mandag locked in" on it. A 2-min session blocks `x.com` and leaves facebook.com open.
2. "Opdater" the unpacked extension at `chrome://extensions` after install; heartbeats keep arriving (`lastHeartbeat` moves).
3. Favicons appear for `x.com` and do not trigger a request to a blocked host during a session (check the extension's service-worker network log).
4. Still open from earlier rounds: App Nap and wake with the watchdog, a Chrome auto-update during a session, pf after a reboot, and the standard account vs. the profile and "Allow in the Background".

---

# v1.1.4 check (extension, diff since f29aa72, ~17:30 local)
Method:
- `node --test` 104/104.
- The live daemon (1.2.0) answered `active:false`, so `test/load-in-chrome.sh` was run: **ALL CHECKS PASSED**, including "new tab (⌘T) shows the LockedIn page" (`chrome://newtab/` → `chrome-extension://…/app.html`) and no manifest errors.

**Changes.** The name "LockedIn" (manifest, titles, messages; the button still says "Start Locked in") and `"chrome_url_overrides": {"newtab": "app.html"}`. **No new permissions:** the permission list is unchanged and an override is not a permission.

| Concern | Verdict | Evidence |
|---|---|---|
| Manifest valid | OK | Loads in Chrome for Testing; `manifest.test.mjs` asserts the override, the names and that `app.html` has no `autofocus`. |
| Toolbar icon open/focus | OK | `tabs.query({url: app.html*})` does not match new tabs (their tab URL stays `chrome://newtab/`), so the icon still opens or focuses its own control tab. |
| blocked.html / DNR redirects | OK | Unchanged. `blockedSiteFor` ignores the extension origin and non-http URLs, and the sweep skips `chrome://newtab/`. |
| bfcache content script | OK | Not injected into `chrome://` or extension pages; nothing changed. |
| PowerLink | OK (not read) | Its traffic and DNR rules are untouched. Only one extension can own the new-tab page; if another one already overrides it, Chrome keeps one. I did not open PowerLink's files (rule). |
| Omnibox focus | OK in code | No `autofocus`, and every `.focus()` call in `app.js` follows a user action. Chrome gives the address bar focus first on overridden new tabs. Headless cannot prove it; real-Mac item. |
| Polling per page | OK, with a **LOW** note | `setInterval(refresh, 5000)` lives in each open `app.html` and dies when the tab is closed or navigated (typing a URL in the new tab stops it). |

**LOW note on polling.** Each `refresh` calls `sync()` in the worker. `sync()` coalesces the status GETs but sends **one heartbeat per call, uncoalesced**. In the daemon every heartbeat runs `lsof` plus a full `tick()`.
- N idle new-tab pages therefore cost about N heartbeats and N extra ticks per 5 s. Throttling of hidden tabs lowers this after a while.
- Not a storm for a handful of tabs, but wasteful now that every ⌘T is an app page.
- Fix: skip `refresh` while `document.hidden`, and rate-limit `heartbeat()` in the worker to one per 10–20 s whoever asks.

### Verdict: **SHIP**
No blocker. The polling note can follow.

### Real-Mac only
1. ⌘T in Chrome 154: the address bar has focus and you can type a URL at once.
2. Chrome's "Is this the new tab page you expected? Keep / Change back" bubble. For a non-policy extension, **"Change back" disables LockedIn**. During a session the watchdog then closes Chrome after ~2.5 min of activity. Check whether the bubble appears for the unpacked install, and tell the owner to choose "Keep".
3. With 5–10 idle new tabs open, `/Library/Logs/LockedIn/lockedind.log` and Activity Monitor show no noticeable daemon CPU.

---

# Round 6 (Planlæg) — daemon API 1.3.0 + extension 1.2.0 (~17:55 local, uncommitted working tree on top of 038292c)
Method:
- All suites pass:
  - `CoreTests` **175/175**;
  - `node --test` **108/108**;
  - `load-in-chrome.sh` **ALL CHECKS PASSED**;
  - `ui-in-chrome.sh` **ALL CHECKS PASSED**.
- The live daemon (1.2.0) was checked `active:false` before the Chrome for Testing runs; it was only read with GET.
- Probe `review/r7` (Swift, compiled against the current sources).

## Trying to weaken a running lock (all CONFIRMED refused)
| Attempt | Result |
|---|---|
| Timer 10–11 + period 11–12 **starting exactly at the timer's end**: delete it / skip today / move it to 11:30 | `frozen=true`, all three → **423** (`chains()` merges `start <= end`, so it is in the chain). |
| Period later today with a 1-min gap (not chained) | `frozen=false`, delete OK. Intended by the owner: not part of the running lock. |
| **Overnight** period (Sun 22:00 → Mon 11:00) whose previous-day occurrence is running, Mon 10:00 | `frozen=true`. Delete → 423; skip by its start day 2026-10-04 → 423; skip 2026-10-05 → 400 (no occurrence that day); still locked. |
| **DST** fall-back night 2026-10-25: Sat 23:00–02:30 + Sun 02:30–04:00, now inside the first | Locked until 03:00Z. Both periods frozen; delete of the second → 423. |
| **Skip** of a frozen period's later, unchained occurrence (e.g. tomorrow) | Allowed: `occ.start > activeUntil`, so it is not part of this lock. Correct. |
| **Unskip** that would rebuild a chain over 24 h (Mon 22 → Tue 23:59) | **400** "En samlet lås kan højst vare 24 timer" (`unskipOccurrence` runs `checkChains`). |

Not a weakening, but noted:
- **R6-1 (LOW) — a skip that silently does nothing.** `POST /v1/skip` accepts `"2026-10-5"` (unpadded; `ScheduleMath.day` parses it), but occurrences compare against `"2026-10-05"`, so the skip has no effect while the UI could show it as skipped. Fails safe (the period still runs). The UI always sends padded dates. Fix: store `fmt.string(from: day)` instead of the raw input.
- **R6-2 (LOW) — mixed calendars in `skipOccurrence`.** It uses `Calendar.current` (system time zone) as an alternative when it picks the occurrence. It can only pick an *earlier* occurrence, which refuses more, never less. Use `ScheduleMath.calendar` only.

## Performance — LOW, worst case only (R6-3)
The 14-day window with 50 weekly periods × 7 days (the maximum, with `skip` set): `status()` takes **22 ms**, and the engine work per locked 2 s tick takes **~355 ms**, about 18 % of one core. That is because `status()` / `allOccurrences` is recomputed ~15 times per tick (`isLocked`, `activeListIds`, `chainSources`, `rememberLockLists` ×2, `effectiveSites`, `effectiveAppRules`, `frozenListIds` …). `occurrences()` also builds a new `DateFormatter` per call. With the few periods a real user has, this is negligible. Fix if wanted: compute the intervals once per tick (or memoise on `(state hash, minute)`), and make the formatter static.

## Extension (Planlæg)
- **Overlap warning (`plan.js` `occurrences` + `chainEnd`)** uses the daemon's rules: a chain continues through every non-skipped occurrence with `start <= current end`, and skipped ones are excluded. It does not apply the 24 h cap; the daemon then answers 400 with its own message, which is acceptable.
- **Delete + undo** re-creates the period through `POST /v1/schedules` (new id) and re-applies its skips. Re-creating can only add a lock. A re-applied skip that is refused (the re-created period is already running) is ignored, so the period runs, which fails safe.
- **Fail-closed reducer:** `lib/lock.js` is unchanged.

## Docs
`API.md` §Lister documents `frozen`, `skip`, `POST/DELETE /v1/skip` and the 14-day window, and it matches the code.

## Round 6 verdict: **SHIP**
No way found to shorten or end a running lock through editing, deleting, skipping or unskipping. R6-1/2/3 are low and can follow.

---

# Round 7 (neverClose / "Lukkes aldrig") — daemon API 1.4.0 (working tree on bb580c5)
Method:
- `CoreTests` **180/180**, `node --test` **144/144**.
- The Chrome for Testing suites were **not** run, because a real lock was running (until 10:00Z) and the daemon would close Chrome for Testing.
- Probe `review/r8`. The live daemon was not contacted beyond earlier GETs.

| Attempt during a lock | Result |
|---|---|
| neverClose ON for an app on an **active** list | **423** (CONFIRMED) |
| neverClose ON for an "always closed" unknown engine (Discord) | **423** (CONFIRMED) |
| neverClose ON for a browser (Safari), even unlocked | **400** (CONFIRMED) |
| An app in `lockLists` (a list that was active earlier in this lock) | 423: `activeListIds` includes the remembered lists, so `closedNow` is true (code) |
| Bundle-id spoof of a neverClose app (unsigned copy claiming `com.readdle.SparkDesktop`) | `killAndRecord`: the team check still applies, because `effectiveAppRules` keeps `teamId` (CONFIRMED). neverClose web-engine apps are still deep-verified (`blocked=false`, `kind=webengine`). |
| neverClose ON for an app that is only on the list of a **later period chained to the running lock** | **Allowed, a weakening (R7-1)** |

**R7-1 (MEDIUM, CONFIRMED) — neverClose strips an app from a frozen list mid-lock.**
- Where: `Engine.setNeverClose`.
- The guard only asks whether the app is closed **right now** (`effectiveAppRules`, i.e. the lists active this second). The lists frozen for the whole running chain (`frozenListIds`, L4-2) are not consulted, and turning neverClose on then **removes the app from every list**, frozen ones included.
- Probe: a timer 10–11 on list A is chained to a period 11–13 on list B, which contains Spark.
  - At 10:00, a direct shrink of B → 423.
  - But `PATCH /v1/apps/com.readdle.SparkDesktop {"neverClose":true}` → **200**, and `B.apps = []`.
  - At 11:30 the lock is still running, and Spark is judged **`allow`**.
- This re-opens the L4-2 hole through a side door.
- Fix: during a lock, refuse neverClose ON if the app is in **any** list in `frozenListIds(now)` (or is always-closed). And never remove it from frozen lists; strip list memberships only when unlocked.

**R7-2 (LOW) — a neverClose app can still be put on a list.** `cleanList` refuses list membership for neverClose apps, but `addApp(…, list:)` still appends them (CONFIRMED: Spark ends up on the list). Nothing is weakened, since neverClose wins in `effectiveAppRules`, but the UI then shows an app on a list that will never be closed. Apply the same filter in `addApp`.

## Round 7 verdict: **FIX FIRST**
R7-1 is a one-condition fix in `setNeverClose`. Everything else holds:
- the owner's use (Spark, Wispr Flow, Claude set before a lock) is safe;
- browsers cannot be exempted;
- spoofed bundle ids are still caught by the team check.
