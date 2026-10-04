# Locked in — independent review 2

Reviewer: independent (wrote none of the code). Date: 2026-10-04, ~15:00–15:50 local.
Scope: re-test of every REVIEW-1 item plus a regression hunt in the new code (`daemon/Sources/**`, `install/**`, `tools/make-profile.sh`, `tools/build-crx.sh`, `extension/**`, all docs).
Method:
- `swift build` + `CoreTests`: 129/129 pass. `node --test`: 56/56 pass.
- `extension/test/load-in-chrome.sh`: **ALL CHECKS PASSED** (Chrome for Testing 148, fake daemon on a free port).
- New probes in the scratchpad (`review/r2a`–`r2h`), compiled against the current sources. `enforce()` was never called, so nothing was killed.
- The live daemon (old build, unlocked) was only read with `GET /v1/status`.

Note: `manifest.json`, `make-profile.sh`, `build-crx.sh`, `web/` and four docs changed at 15:45, during the review; the URLs now say `LockedIn`. This review covers that state. The daemon sources have been unchanged since 15:32.

Legend: **CONFIRMED** = reproduced with a probe or test run; **PLAUSIBLE** = follows from the code but needs the real Mac.

## Summary
- **REVIEW-1 items:** 16 FIXED (M5 with new regressions), 7 PARTIAL, 0 NOT FIXED.
- **New findings:** 2 high, 3 medium, 6 low.
- **Docs:** 9 false or stale claims.

---

## 1. Re-test of REVIEW-1

| Item | Verdict | Evidence |
|---|---|---|
| **C1** CSP | **FIXED** | Keywords are quoted (`manifest.json:62`); `test/manifest.test.mjs` guards it. `load-in-chrome.sh` installs the packed build with no manifest error: redirects, sub-resource blocks, adversus tab-only and the quote page all pass. The `manifest.json` inside `web/locked-in.crx` is also the fixed one. |
| **H1** app-control evasion | **PARTIAL** | Fixed: every `.app` level is judged (`AppPolicy.swift:91-133`). CONFIRMED (r2e): a Google-signed Chrome copy inside `W.app` is killed ("Chrome-kopi"), and so are its helpers. A fake bundle claiming `com.anthropic.claudefordesktop` with an engine framework is killed (team mismatch). A missing `Info.plist` plus an engine framework is killed. Allowed rules are bound to the team id.<br>Not fixed: executables **without any `.app`** are still never judged (`AppControl.swift:229`). Playwright's `chrome-headless-shell` is already on this Mac as a bare Mach-O (`~/Library/Caches/ms-playwright/chromium_headless_shell-1223/...`). Started with `--host-resolver-rules` and `--remote-debugging-port`, it can be driven from the real Chrome's `chrome://inspect` screencast (PLAUSIBLE). See also N8 (spoofed "apple" team). |
| **H2** endless schedules | **FIXED** (with a regression, N3) | CONFIRMED (r2c): Dag 07–22 is accepted and Nat 22–07 is rejected ("En samlet lås kan højst vare 24 timer."). A 24 h timer plus a schedule right after it is rejected. A v1.0 state that already chains is capped by `status()` (lock ≤ 24 h + 60 s). |
| **H3** cached failures | **FIXED** | `bundleFacts` caches only verified results, keyed on the bundle directory, `Info.plist`, the main executable and `CodeResources` (`AppControl.swift:132-161`). The real Chrome is killed only after 60 s of continuous signature failure (`:247-256`). The cached cost per tick is 11 ms for 115 bundled processes (r2h). |
| **H4** fd exhaustion | **FIXED** (residual N6) | CONFIRMED (r2f): under a 6000-connection flood the server stays at ~725 fds, files stay readable and `Shell` works. The cap is 16 connections with a 3 s deadline, and the plist sets `NumberOfFiles` 4096/8192. |
| **M1** unreadable state | **PARTIAL** | Fixed: decoding is tolerant (`Model.swift:31-43, 105-115`). A missing key plus an extra key loads with the timer kept. An unreadable file is never overwritten and writes get 503.<br>Remaining (CONFIRMED, r2g): a single unknown enum value (e.g. `kind:"terminal"` written by a newer build, then a downgrade) still makes the whole file unreadable. While `loadFailed`, app control and pf are not enforced (`main.swift:76-80`), and a hosts block left by a running lock stays until an admin acts, beyond 24 h. |
| **M2** hosts wipe | **FIXED** | CONFIRMED: a non-UTF-8 hosts file returns `.failed` and is left byte-identical; the failure is reported (`main.swift:86-90`). Minor leftover: a symlinked `/etc/hosts` is still replaced by a regular file (CONFIRMED). |
| **M3** allowHosts growth | **FIXED** | `lock.js:37-58` intersects. CONFIRMED by `load-in-chrome.sh` (M3 checks: spoofed status fetched, still locked, instagram still redirected) and `lock.test.mjs`. |
| **M4** port squatting | **FIXED** | Enforcement no longer depends on the server. Bind failure means `lsof` + SIGKILL of listeners on 919, then a retry every 5 s (`main.swift:136-160`). `lsof -sTCP:LISTEN` only matches listeners, so nothing else is killed. Root bind behaviour still needs the real Mac. |
| **M5** heartbeat | **FIXED as built**, with regressions N1 and N2 | — |
| **M6** clock back | **FIXED** | CONFIRMED: a 60-min session with the clock 3 days back ends after 3600 s of monotonic time (`Engine.swift:57-64`). New Low N9 (clock forward at boot). |
| **M7** profile | **PARTIAL** | `RemoteDebuggingAllowed` is removed (owner decision). Still unverified on the Mac: off-store force-install accepted (CBCM/MDM), and no conflict with a cloud `ExtensionInstallForcelist`. GitHub Pages currently answers **404** for `/LockedIn/updates.xml` and `/LockedIn/locked-in.crx` (and the old `/locked-in/` paths), which feeds N2. |
| **M8** admin installs | **PARTIAL** | Fixed: `mergeCatalog` only unions during a lock; CONFIRMED that a shrunk catalog keeps `mode=full`, all suffixes and ⊆ allowHosts.<br>Remaining: ADMIN-TJEKLISTE §4 says "a fresh clone of github.com/sebpirad/LockedIn". The owner controls that repo, so a fresh clone installs whatever he pushed. The admin must install a pinned, reviewed commit. |
| **L1** id collision | **FIXED** | Ids keep the dots: `c-a-b.c.com` and `c-a.b-c.com` are separate sites (CONFIRMED). |
| **L2** system kill list | **FIXED** | loginwindow, Finder and Terminal on the blocked list → `allow` (CONFIRMED). `/System/Applications/*` (e.g. Notes) stays killable by the user's own rule, which is intended. |
| **L3** browsers "Virker" | **FIXED** | `PATCH` Safari `blocked:false` → 400 (CONFIRMED). The UI hides the toggle. |
| **L4** pf | **PARTIAL** | The docs now say connections are not cut. Unchanged: the `pfctl -f /etc/pf.conf` reload, and the pf token lost across restarts. |
| **L5** I/O, log, cache | **PARTIAL** | Saves now happen at most every 30–60 s, and the cache is bounded at 1000. The new newsyslog rule uses flag `N` (no signal), but the daemon keeps launchd's stdout fd: after the first rotation it writes into the rotated, then gzip-deleted, inode. `lockedind.log` stays empty and the space is not freed until restart (PLAUSIBLE). |
| **L6** DNS rebinding | **FIXED** | `Host` must be `127.0.0.1:919` or `localhost:919` (`API.swift:36-38`). |
| **L7** DST edges | **PARTIAL** | The behaviour is unchanged (02:00–03:00 on 2027-03-28 is skipped). Now worse, see N3. |
| **L8** silent degradations | **FIXED** | A missing responsibility API and hosts failures are reported in `problems`/`appControl`. |
| **L9** install hygiene | **FIXED** | Waits for bootout, retries bootstrap, and `INSTALL.md` + `ADMIN-TJEKLISTE.md` exist. |
| **L10** flag list | **FIXED** | `--proxy`, `--host-rules` and `--remote-debugging` are matched as prefixes. |

---

## 2. New findings (regressions)

### HIGH

**N1 — The watchdog closes Chrome on wake from sleep during a session.** CONFIRMED (logic), PLAUSIBLE (timing)
- Where: `main.swift:94`, `AppControl.swift:232`.
- `heartbeatOK` compares the wall-clock age of `lastHeartbeat` with 120 s, and Chrome qualifies once it has run for 120 s. After any lid-closed or idle sleep longer than 2 min inside a lock, the first daemon tick after wake sees a stale heartbeat. That tick fires within 2 s, before Chrome's 30 s alarm has woken the service worker. It then `killTree`s the real Chrome, and PowerLink with it.
- Probe r2c: last heartbeat 12:00, wake 13:00, Chrome started 07:55 → `kill Chrome: true`.
- The same applies to Power Nap / dark wakes (the daemon runs, Chrome is suspended) and possibly to an App-Napped, minimised Chrome.
- Fix: measure the heartbeat gap in daemon-observed awake time. Reset the grace period whenever the tick gap is over 10 s (sleep), or use `CLOCK_UPTIME_RAW`. Also require ≥ 2 consecutive stale ticks spread over 30 s.

**N2 — The watchdog arms on the policy, not on a working extension.** PLAUSIBLE; one precondition CONFIRMED
- Where: `main.swift:54-58, 94`.
- Arming = the forcelist is present in `/Library/Managed Preferences`. If the extension cannot actually install, every Chrome in every session is closed 2 min after start, and the owner loses PowerLink in every session. Reasons it might not install:
  - GitHub Pages is not deployed — it is 404 right now (CONFIRMED);
  - Chrome refuses off-store force-install on a Mac it does not consider managed (M7);
  - the CRX is broken.
- `install.sh` step 5 opens the profile immediately after install.
- Fix, within the owner's rule: additionally require that a heartbeat from this extension has been seen at least once (persist `everHeartbeat`). Add to ADMIN-TJEKLISTE: "chrome://extensions shows Locked in and the menu shows a heartbeat before the first session". Publish Pages **before** installing the profile.

### MEDIUM

**N3 — One over-long chain blocks every new session for about 8 days.** CONFIRMED
- Where: `Engine.swift:116-122, 150, 259, 273`.
- `checkChains` rejects the candidate if **any** chain in the window exceeds 24 h, including one that already exists and has nothing to do with the request.
- Probe r2d: "Lør 12:00–24:00" plus "Søn 00:00–12:00" (exactly 24 h, accepted on 2026-10-05) become 25 h on the fall-back weekend. From Mon 2026-10-19 to that Sunday:
  - `POST /v1/session {"minutes":60}` → **400 "En samlet lås kan højst vare 24 timer."**;
  - every unrelated `POST /v1/schedules` → 400;
  - from 2026-10-26 everything is OK again.
- A single overnight schedule ≥ 23 h 01 min does the same, and so does any v1.0 state that still chains.
- On the DST Sunday itself the lock ends at 10:01Z instead of 11:00Z (the cap), which is acceptable.
- Fix: reject only chains that the change creates or lengthens (compare with the current state's chains), and leave DST overruns to the `status()` cap.

**N4 — Installed Chrome web apps (PWA shims) are killed as "Chrome-kopi".** CONFIRMED (logic)
- Where: `AppPolicy.swift:81, 107-109`.
- `isChromeId` matches every `com.google.Chrome.*` id. Chrome's app shims in `~/Applications/Chrome Apps.localized/*.app` have id `com.google.Chrome.app.<hash>` and live outside `/Applications/Google Chrome.app`, so they get `.kill`.
- Since RemoteCocoa, a PWA's windows are drawn by the shim process. Any installed web app (Gmail, Calendar, a Powermatch app) would be closed every 2 s during sessions. The folder exists on this Mac but is empty today.
- Fix: allow `com.google.Chrome.app.*` shims in `~/Applications/Chrome Apps.localized/` (they render nothing themselves; DNR applies in their windows).

**N5 — A failed deep signature check kills an allowed app for ≥ 15 min, under a misleading reason.** CONFIRMED (mechanism), PLAUSIBLE (trigger)
- Where: `AppControl.swift:23-51, 182, 237-243`.
- A failure marks the outer bundle untrusted until a re-check, and re-checks are scheduled only for running apps, at most every 900 s. The app is killed within 2 s of each launch, so a transient failure (e.g. a Squirrel update caught mid-swap) blocks a "Virker" tool such as Claude, Spark or Wispr Flow for at least 15 min. The reason shown is "Ukendt app med indbygget browser". `deepFailed` also survives across sessions until restart.
- Real apps do fail full checks: `~/Applications/LibreOffice.app` returns -67054 (sealed resource invalid), CONFIRMED. All five apps the live rules allow pass today in 0.1–0.5 s.
- Fix: re-check a failed bundle within 60 s and require two failures. Show "Appens signatur er ændret" in `problems`. Clear `deepFailed` at unlock.

### LOW
- **N6 — The API is trivially starved by a local process.** CONFIRMED, r2f: with a process cycling about 16–40 idle connections, **0 of 14** well-formed requests succeeded. Not a bypass, but with N1/N2 it lets any local process make the daemon close Chrome (missed heartbeats).
- **N7 — "Forlæng" offers extensions the daemon rejects.** `app.js:136` computes from `now`, while the daemon counts the chain from `startWall`. 1 h into a 24 h session, "+25 min" → 400 (CONFIRMED). Compute the remaining room from `activeUntil` and the chain start.
- **N8 — Spoofed "apple" team.** `AppControl.swift:165-177`: a bundle whose main executable is an Apple platform binary (e.g. a copied `/usr/bin/osascript`) validates as `anchor apple`, because its signature does not bind `Info.plist`. It gets `teamId "apple"` (CONFIRMED, r2e: `Fake.app team=apple`). `judgeWebContentOwner` then allows it as "Apple-signed" (`AppPolicy.swift:145`), so a JXA WKWebView browser launched via LaunchServices passes. Require the code-directory identifier to match `CFBundleIdentifier`, and do not trust `apple` for user-writable paths.
- **N9 — A clock forward at boot ends the lock.** CONFIRMED: a 10 h session, then a reboot with the clock +1 day, gives `locked=false`, even after NTP corrects. `boot()` subtracts the wall gap from the monotonic budget. A standard user cannot set the clock; RTC or NTP faults can.
- **N10 — Heartbeat is unauthenticated.** Any local process can `POST /v1/heartbeat` (no Origin needed), so an "empty extension" plus a curl loop satisfies the watchdog. This contradicts ADMIN-TJEKLISTE §5.
- **N11 — v1.0 states with endless chains lock in a daily window.** The `status()` cap is measured from the occurrence window's first start, so instead of one 24 h lock the user gets a lock every night 02:00–07:01 local (CONFIRMED, r2c). Only affects states written by v1.0.

### Checked and fine
- **Nothing legitimate is killed today.** Level-by-level judging was dry-run over all 392 running processes and over every executable in every app in `/Applications`, `~/Applications`, `~/Library` and `/Library/Application Support` (r2a), with the live rules plus their recorded teams. Nothing running would be killed. The installed hits are only GoLogin, Safari, Chrome for Testing (Playwright) and PokerStars' inner `xcw.app` (unknown engine). The real Chrome, its helpers, GoogleUpdater, Claude desktop, Spark, Todoist, Wispr Flow, Screen Studio, LibreOffice and the `Locked in.app` menu are all `allow`.
- **Deep-verify thread safety.** All shared state sits behind `deepLock`, and the work runs on its own queue.
- **Port-squatter eviction** only targets LISTEN sockets on 919.
- **Until mode** works up to the 24 h mark (from `startWall`).
- **Enabling a disabled schedule** goes through `checkChains`.

---

## 3. Docs: claims that promise more than the code
- `ARCHITECTURE.md:3` "Ikke bygget endnu" — stale.
- `ARCHITECTURE.md:17` "valideres strengt" — loading is now deliberately tolerant.
- `ARCHITECTURE.md:35` still lists `RemoteDebuggingAllowed=false`; the profile no longer sets it.
- `ARCHITECTURE.md:39` and `:48` still say port 919 is root-only and "kan ikke forfalskes". `API.md` correctly says the opposite.
- `ARCHITECTURE.md:26-27` "Andre browsere end Google-signeret Chrome lukkes" — not bare executables (H1 remainder). `HVORDAN-DET-VIRKER.md` is honest about this.
- `ARCHITECTURE.md:82` "så en opdatering **aldrig** lukker Chrome" — only if the bundle is invalid for less than 60 s.
- `ADMIN-TJEKLISTE.md:51` "Daemonen lukker dog Chrome, hvis udvidelsen ikke svarer" — false against an empty extension that still heartbeats, or a curl loop (N10).
- `ADMIN-TJEKLISTE.md` §4 — a fresh clone of the owner's own repo is not a safeguard (M8). The checklist also lacks "verify the extension is installed and heartbeating" (N2).
- Minor:
  - `API.md` example `version` is "1.0.0" (now 1.1.0);
  - `/v1/installed` is documented with a `path` field it does not return;
  - `INSTALL.md` "Fejler noget, installeres intet" holds only for build/test failures, not after step 2.

## Verdict: **FIX FIRST**
REVIEW-1's critical and high items are fixed or reduced. But the new watchdog (N1, N2) can close Chrome and PowerLink on every wake from sleep, or on every Chrome start if the extension is missing — and GitHub Pages is not deployed yet. N3 can disable "Start Locked in" for a week. Minimum before shipping: N1, N2, N3 and N4. N5 and the doc corrections should follow.

## Can only be verified on the real Mac
1. Wake from a ≥ 5 min sleep during a session: Chrome stays open (after the N1 fix). Also check a Power Nap night and a minimised Chrome for 10 min.
2. Pages is live; `chrome://extensions` shows Locked in force-installed from `https://sebpirad.github.io/LockedIn/updates.xml`; `chrome://policy` shows no conflict on `ExtensionInstallForcelist`; PowerLink and other cloud-forced extensions are still present.
3. The root daemon evicts a user process holding `0.0.0.0:919` and binds `127.0.0.1:919`, without killing anything else.
4. A Chrome auto-update during a session does not close Chrome; the log shows at most "tjekker igen".
5. Deep verify of Claude, Spark and Wispr Flow passes as root, including just after each app self-updates.
6. The standard account cannot remove the profile or turn off `dk.lockedin.daemon` under "Allow in the Background".
7. pf really blocks `https://1.1.1.1` during a session, and the anchor survives a reboot.
8. Log rotation: after newsyslog rotates, new lines still appear in `lockedind.log` (L5).
9. The open TESTLOG items (profile survives reboot; policy applies to a `--user-data-dir` Chrome).
