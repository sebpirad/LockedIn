# Locked in — independent review 3 (targeted)

Reviewer: independent (wrote none of the code). Date: 2026-10-04, ~15:55–16:20 local.
Scope: re-test of the REVIEW-2 findings against the new sources (daemon 15:49–15:52, `extension/lib/extend.js` + `ui/app.js` 15:53), a deliberate attack on the new mechanisms, and the corrected docs.
Method:
- `CoreTests` 139/139, `node --test` 63/63, and `extension/test/load-in-chrome.sh` **ALL CHECKS PASSED**.
- Probes `review/r3a`–`r3d` in the scratchpad, compiled against the current sources. `enforce()` was never called and the live daemon (old build, unlocked) was only read.
- **GitHub Pages is live (CONFIRMED):** `/LockedIn/updates.xml` → 200 (version 1.0.0, codebase `/LockedIn/locked-in.crx`), `/LockedIn/locked-in.crx` → 200, 14.4 MB. Its `manifest.json` has the quoted CSP and update_url `https://sebpirad.github.io/LockedIn/updates.xml`.

Counts:
- **REVIEW-2 findings:** 7 FIXED, 3 PARTIAL (N4, N10, H1-rest), 3 accepted by the owner (N6, N9, N11).
- **New findings:** 0 critical, 0 high, 2 medium, 5 low.

---

## 1. Re-test of REVIEW-2

| Item | Verdict | Evidence |
|---|---|---|
| **N1** watchdog after wake | **FIXED** | Heartbeat age is now measured in `CLOCK_UPTIME_RAW` (sleep excluded). A tick gap over 10 s restarts the grace period, so the first tick after any sleep or dark wake resets it (`main.swift:124`). Being "stale" also requires HID idle < 60 s, never true during a dark wake, and then 30 s of continuous staleness (`:126-134`). Wake, dark wake, slow service-worker start and extension auto-update all fit easily inside 120 + 30 s. App Nap remains a real-Mac item. |
| **N2** armed without a working extension | **FIXED** | Arms only when the forcelist is present **and** `lastHeartbeat != nil` (a verified heartbeat has been seen at least once, `:126`). ADMIN-TJEKLISTE now says to open Locked in once before the watchdog counts. Pages is live. Accepted by the owner's rule: "ever seen" never expires, so an extension that breaks later still gets Chrome closed in sessions until an admin acts. |
| **N3** existing chain blocks sessions | **FIXED** | CONFIRMED (r3c): with the 25 h DST weekend chain present, Mon 2026-10-19 "60-min session" → OK and an unrelated schedule → OK. Growing it at either end → 400; adding inside it → OK. **No step-by-step growth:** every candidate chain over 24 h must lie inside one existing chain (`Engine.swift:121-127`), so a chain can never get longer. Residual R3-5. |
| **N4** PWA shims killed | **PARTIAL** | A real shim → `allow` (CONFIRMED). But the exemption is **spoofable** (R3-1). |
| **N5** deep-verify kills | **FIXED** | CONFIRMED (r3d) with LibreOffice.app (fails a full check, -67054): 1st failure → not failed; +30 s → not due; +61 s, 2nd failure → failed and named in `problems`; the unlock reset clears it. |
| **N6** API starvation | accepted | See R3-4 for a related cost. |
| **N7** Forlæng offers rejected extensions | **FIXED in source** | `lib/extend.js` caps at `activeSince + 24 h` (the daemon allows +60 s, so the UI is conservative). Tests pass. The published CRX does **not** contain it yet (R3-6). Tiny residual: an extension that bridges to a later schedule can still be offered and then rejected. |
| **N8** spoofed "apple" team | **FIXED** | A signature whose identifier ≠ `CFBundleIdentifier` counts as unsigned (`AppControl.swift:174`). No false positives on this Mac: the plist id equals the code identifier for every app in `/Applications`, `~/Applications`, `~/Desktop` and Claude Code's bundled `claude.app`. `judgeWebContentOwner` no longer trusts `apple` in user-writable paths. |
| **N9** clock forward at boot | accepted | Re-confirmed: a +1 day clock at reboot → unlocked. |
| **N10** heartbeat unauthenticated | **PARTIAL** | The `lsof` peer check stops a plain curl loop (CONFIRMED: an ephemeral port maps to the curl process). It is spoofable by a source-port collision (R3-3). |
| **N11** v1.0 endless chains | accepted | — |
| **H1-rest** bare executables | **PARTIAL** | `judgeBare` kills Playwright's `chrome-headless-shell` with `--remote-debugging-port` (CONFIRMED). Gaps and false positives in R3-2. |
| **L5** log | **FIXED** | Truncated in place at 5 MB (hourly check); `newsyslog` removed, and the old conf is deleted by `uninstall.sh`. |

The docs are corrected for almost all of REVIEW-2 §3. ARCHITECTURE now says "bygget og installeret", that the port is not protected, that state loading is tolerant, the honest wording on updates and the empty-extension limit, and lists the accepted N6/N9/N11. Remaining overclaims are under R3-3 and R3-7.

---

## 2. New findings

### MEDIUM

**R3-1 — The Chrome-app-shim exemption lets any browser in.** CONFIRMED (logic)
- Where: `AppPolicy.swift:86-88, 129`.
- A shim is recognised only by the id prefix `com.google.Chrome.app.` and the path containing `/Applications/Chrome Apps.localized/`. Step 2 then skips **every** check for that level: the Chrome-copy check, `knownBrowsers` and `kind == .browser`. Step 4 only catches `.webengine`, while a bundle that keeps its http(s) URL types is classified `.browser`.
- r3c: a Firefox copy at `~/Applications/Chrome Apps.localized/F.app` with plist id `com.google.Chrome.app.ffff` → `allow`, and so are its content processes.
- That folder is user-writable. A re-signed (ad-hoc) copy runs, Firefox ignores Chrome's policy, and its own DoH gets past hosts.
- Fix: exempt a shim only from `isChromeId`, never from the browser or engine checks. Also require `CFBundleExecutable == "app_mode_loader"`, no `Contents/Frameworks`, and no http(s) URL types.

**R3-2 — `judgeBare` misses user-owned locations, is easy to evade, and is inconsistent.** CONFIRMED (logic)
- Where: `AppPolicy.swift:72-74, 92-103`, `AppControl.swift:255-261`.
- **Locations:** `isUserWritable` is a prefix list. `/opt/homebrew` (owned by `sebastianpirad` on this Mac) and `/private/var/tmp` (world-writable) are not on it. `chrome-headless-shell --remote-debugging-port --host-resolver-rules` in either place → `allow`.
- **Evasion:** rename the binary and use flags that are not on the list. `~/bin/x --single-process --proxy-server=socks5://… --dump-dom https://instagram.com` → `allow`.
- **False positives during sessions:** any bare process under `/Users` with `--headless` or `--user-data-dir` in its argv is killed **with its children**. Examples: `~/.pyenv/.../python3 scrape.py --headless`, `node server.js --user-data-dir=…`, `chromedriver`. The same python under `/opt/homebrew` survives. Claude Code itself (a signed `claude.app` in `~/Library/Application Support/Claude/claude-code/…`), git and plain node are not affected; the dry run on this Mac (r3b) would kill nothing currently running.
- Fix:
  - decide "user-writable" by ownership (`stat` the file and its parent directories: owned by the console user, or a world-writable directory), not by prefixes;
  - identify Chromium/Firefox builds by content next to the binary (`icudtl.dat`, `*.pak`, `omni.ja`, `libEGL.dylib`), not by name;
  - add `--proxy-server`, `--proxy-pac-url` and `--single-process`;
  - write in the docs that this is best effort.

### LOW

**R3-3 — The heartbeat peer check can be spoofed by a source-port collision.** CONFIRMED
- Where: `main.swift:172-176`.
- `lsof -iTCP:<port>` matches that port as the local **or** remote port, on **any** address, and `.first` takes the lowest pid other than the daemon's.
- r3a (with a local stand-in server, never the daemon):
  - a client bound to source port **5228** (Chrome's GCM connection to `74.125.205.188:5228`), or to one of Chrome's own local ports (e.g. 55968 on `192.168.0.42`), makes `lsof` return Chrome's network service (pid 30601, `…/Google Chrome Helper.app`) first, so it would be accepted as Chrome;
  - an ordinary ephemeral port correctly maps to the client.
- Related: `/Applications/Google Chrome.app` is owned by `sebastianpirad` (rwxrwxr-x). Any binary he drops inside it passes `isRealChromePid` (path prefix + a signature check that skips resources) — PLAUSIBLE.
- Impact is limited (an empty extension already satisfies the watchdog, as the docs now say). But `API.md:69` ("kun når forbindelsen kommer fra den rigtige Chrome") and ARCHITECTURE:84 overclaim.
- Fix: identify the exact socket. Use `proc_pidfdinfo(PROC_PIDFDSOCKETINFO)`, or `lsof -F` with `-iTCP@127.0.0.1:<port>`, and require local `127.0.0.1:<port>` → remote `127.0.0.1:919`.

**R3-4 — `lsof` runs synchronously, unauthenticated and without a timeout.** PLAUSIBLE
- Where: `main.swift:182-189`.
- Every request whose path starts with `/v1/heartbeat` runs `lsof` on the daemon's only queue, **before** the `X-LockedIn`/`Host`/`Origin` checks, with no timeout.
- A local process can keep the queue busy (ticks slow down, so app-control latency grows).
- An `lsof` that hangs (it can block on an unresponsive network mount) freezes every tick. Enforcement stops, and a running lock's hosts block outlives the session (fail closed, past 24 h).
- Measured cost today: ~10 ms as a user.
- Fix: authenticate first, add a timeout (or use libproc in-process), and rate-limit.

**R3-5 — A session started in the capped tail of an over-long chain silently does not lock.** CONFIRMED (r3c)
- On the DST Sunday after the 24 h cap (11:30 local), "20 min" → 200 OK, but `locked=false, activeUntil=nil`; "60 min" → 400. Rare.
- Fix: return 400 "Der er allerede en lås på 24 timer i dag" instead of a no-op 200.

**R3-6 — The published CRX is stale and unversioned.** CONFIRMED
- Pages serves 1.0.0 **without** `lib/extend.js` (N7) and with an older `ui/app.js`. The source manifest is also still 1.0.0.
- Republishing without a version bump will not update installed Chromes.
- Fix: bump the version, rebuild with `tools/build-crx.sh`, and redeploy before installing the profile on the real Mac.

**R3-7 — The ownership assumption behind the fast signature check is false on this Mac.** CONFIRMED
- `AppControl.swift:186` says resources are not hashed because "root-owned /Applications covers resources, see docs/ADMIN-TJEKLISTE.md". The checklist has no such step.
- Chrome, Claude, Spark, Wispr Flow, Screen Studio and GoLogin in `/Applications` are owned by `sebastianpirad`, so the owner can still change their resources after the downgrade.
- Allowed web-engine apps are caught by deep verify. Chrome is not deep-verified (and see R3-3).
- Fix: add a checklist step, `sudo chown -R root:wheel` for those apps, with a note that Chrome then needs its system-level updater ("Set up automatic updates for all users"). Or deep-verify Chrome too.

### Info
- An app run from a user-writable place that renders web pages is closed and recorded during sessions (by design since round 2). On this Mac: `~/Desktop/WhatsApp.app` (Catalyst, team 57T9237FN3) — verify whether it spawns WebKit content; if it does, move it to `/Applications`.

---

## 3. Trying to break the watchdog — summary
- **Wake / dark wake / Power Nap:** not reproducible from the code. Grace restarts on any tick gap over 10 s, and HID idle ≥ 60 s blocks staleness.
- **Slow service-worker start, extension auto-update:** a margin of 150 s against a 30 s alarm.
- **App Nap of a hidden or minimised Chrome while the user works elsewhere:** depends on whether Chrome's alarm timer is throttled. Real-Mac test.
- **Satisfied by something other than the real Chrome:** yes, by port collision (R3-3), by a binary inside the user-owned Chrome.app (R3-7), or by the owner's own extension code (documented). None of them can weaken hosts, pf or app control.
- **`lsof` failure:** returns 403, then possibly a watchdog close after 150 s of active use. A hang freezes the daemon (R3-4).

## Verdict: **FIX FIRST** (small)
No critical or high item remains, and nothing that harms PowerLink was found. Before shipping, fix **R3-1** (a one-line widening of the exemption into a real bypass) and **R3-6** (the CRX on Pages lacks the latest UI and has no version bump). **R3-2** should at least cover `/opt/homebrew` and `/private/var/tmp` and be documented as best effort. R3-3, R3-4, R3-5 and R3-7 can follow.

## Can only be verified on the real Mac
1. App Nap: Chrome hidden or minimised for 10 min during a session while working in another app → no "Locked in-udvidelsen svarer ikke" in the log.
2. Wake after ≥ 5 min of sleep, plus one Power Nap night, during a session → Chrome untouched.
3. After the profile is installed: `chrome://extensions` shows Locked in (from Pages); the daemon accepts its heartbeats as root (`lsof` peer lookup works for Chrome's network service); PowerLink and cloud-forced extensions are intact; `chrome://policy` shows no conflict.
4. A Chrome auto-update during a session does not close Chrome.
5. The root daemon evicts a user process on `0.0.0.0:919` and binds `127.0.0.1:919`.
6. pf blocks DoH during a session, and the anchor survives a reboot.
7. The standard account cannot remove the profile or switch off `dk.lockedin.daemon` under "Allow in the Background".
8. WhatsApp from `~/Desktop` during a session (Info item).
