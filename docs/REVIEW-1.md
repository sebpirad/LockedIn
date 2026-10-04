# Locked in — independent review 1

Reviewer: independent (wrote none of the code). Date: 2026-10-04.
Scope: `daemon/` (all targets), `install/`, `tools/`, `config/catalog.json`, `extension/` (incl. `dist/extension`), the Chrome profile.
Method: line-by-line reading, `swift build` + `CoreTests` (115/115 pass), `node --test` (45/45 pass), and throwaway probes in the session scratchpad (`review/p1`–`p7`, fake daemon + headless Chrome for Testing 148 with a copy of the extension). Nothing in the project, `/etc`, pf or the live daemon was changed. The live daemon (pid 18974, unlocked) was only read with `GET /v1/status`.

Legend: **CONFIRMED** = reproduced with a probe; **PLAUSIBLE** = follows from the code and/or platform behaviour but not reproduced end-to-end.

Counts: **1 critical, 4 high, 8 medium, 10 low.**

---

## CRITICAL

### C1 — The extension does not load at all: its CSP uses unquoted `self` / `none` — CONFIRMED
`extension/manifest.json:62` (same in `dist/extension/manifest.json`)
```
"extension_pages": "default-src self; script-src self; ... object-src none; base-uri none; ..."
```
CSP keywords must be quoted (`'self'`, `'none'`). Unquoted, `self` is a *host* named "self". Chrome's MV3 validator rejects it:
> `'content_security_policy.extension_pages': Insecure CSP value "self" in directive 'script-src'.`

Probe: loading `dist/extension` (background stubbed) into a throwaway Chrome for Testing 148 profile → the error above, the extension is not installed. The same copy with only the keywords quoted → installs, and (with a fake daemon) redirects instagram/youtube/threads/app.adversus.io to `blocked.html`, blocks `youtube`/`ytimg` sub-resources, and leaves `journeys.adversus.dk`, `accounts.youtube.com` and adversus XHR untouched. Corroboration from the real Mac: the live daemon reports `"lastHeartbeat": null` — the extension has never talked to it.

Consequence: no Chrome layer. No quote page, no sub-resource blocking, no tab sweep, **Adversus is never blocked** (it is tab-only, so hosts never covers it), and a force-installed CRX with this manifest fails to install.
Fix: quote every keyword: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' http://127.0.0.1:919; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Then add a test that actually loads the packed manifest in Chrome for Testing (the existing tests never touch the manifest).

---

## HIGH

### H1 — App control can be bypassed by a standard user through the bundle layout or the plist — CONFIRMED (logic + Chrome run), PLAUSIBLE (full end-to-end)
`AppControl.swift:68-71` (outermost `.app` only), `:153-154` (no `.app/` in path → never judged), `AppPolicy.swift:75-79` (no bundle id → allow; user list matched before the browser/engine checks), `:99` (any WebKit app outside a user-writable prefix → allow), `:61-62` (`isChromeMain` needs the *outermost* id to be `com.google.Chrome`).

Policy decisions rest on the outermost bundle's `Info.plist`, and the user controls all of these:
1. **Wrapper bundle.** `~/W.app/Contents/Google Chrome.app` (an unmodified, still Google-signed copy) runs. Verified: `W.app/Contents/Google Chrome.app/.../Google Chrome --version` → `Google Chrome 154.0.8037.93`. `outermostApp` = `~/W.app`, which has no plist → `bundleId nil` → `.allow`, and the Chrome flag check never runs. So `--disable-extensions --host-resolver-rules="MAP instagram.com <ip>"` gets around the extension and `/etc/hosts`. The same wrapper hides Firefox (no policy at all; its own DoH to any resolver not on the pf list).
2. **Missing or garbled `Info.plist`** → `id nil` → `.allow` (probe p7: a malformed plist gives `id=nil`).
3. **Borrowed identity.** The user's list is matched on the plist string before any browser or engine test, so a browser whose plist says `com.anthropic.claudefordesktop` (seeded as "Virker") is allowed. The owner's uid owns `/Applications/Claude.app`, `Spark Desktop.app`, `Wispr Flow.app`, `Screen Studio.app`, `GoLogin.app` and `Google Chrome.app` (checked with `ls -ld`). Those files stay his after the downgrade, so he can also rewrite the contents of an allowed bundle in `/Applications`.
4. **WebKit apps in `/Applications` that are not Apple-signed are allowed** (`AppPolicy.swift:99`). This contradicts ARCHITECTURE.md:25 ("WebKit-apps, der hverken er signeret af Apple eller står på listen" are closed).

Fix: judge **every** bundle level in the executable path (innermost first) and kill if any level is a browser or engine. Identify Chrome and the allow-listed apps by **code signature** (team id + designated requirement captured when the entry is allowed), not by the plist string. Treat a missing or invalid signature, or a missing bundle id, in a user-writable location as "unknown engine" when the bundle carries an engine framework or http(s) URL types. Run the Chrome flag check on any process whose innermost bundle is Google-signed Chrome. Make the WebKit rule match the architecture, or change the architecture to match the code.

### H2 — Schedules can lock the Mac indefinitely; the 24 h cap does not apply to them — CONFIRMED
`Engine.swift:198-207` (add is always allowed, even while locked), `:219-223` (remove → 423), `ScheduleMath.swift:65-76` (chains back-to-back windows), `install/uninstall.sh:5-6` (refuses while active).
Probe p1/P3: "Dag" 07:00–22:00 plus "Nat" 22:00–07:00, every day → `active=true`, `activeUntil` 213 h ahead, still locked after 1, 7, 30 and 365 days, and `removeSchedule` → `locked`. A 24 h timer plus a schedule added during the session → `activeUntil` 2026-10-06T21:00Z, i.e. more than 24 h. A user error (or one tap during a lock) is enough to cause it. There is no exit, and the uninstall script also refuses, so only an admin doing manual surgery can fix it.
Fix: refuse any add or edit (and any timer start) whose merged lock, simulated over the next 8 days together with the current timer, exceeds 24 h, or require a minimum unlocked gap (e.g. ≥ 30 min) between chained windows. Give `uninstall.sh` an explicit admin `--force`.

### H3 — `bundleCache` keeps failed results, so Chrome can be killed in every session (or a browser allowed) until reboot — CONFIRMED (mechanism), PLAUSIBLE (trigger)
`AppControl.swift:87-101`. The cache is keyed on the **top-level bundle directory's mtime**, and a negative result is cached too.
Probe p3: copy Chrome, append a byte to `Contents/Info.plist` → top-level mtime unchanged, fresh check `google=false`. Restore the plist → the cached verdict is **still `false`** (a fresh instance says `true`).
- Fail closed: a single signature check that fails while Chrome updates itself in place, or while fds are exhausted (H4), marks Chrome "ikke signeret af Google". `judge` then kills the whole Chrome bundle (and PowerLink with it) on every tick of every session until the daemon restarts.
- Fail open: a browser first seen while its plist is unreadable is cached as id-less and allowed for the daemon's lifetime.

Fix: never cache a failure. Key the cache on `Info.plist`, the main executable and `_CodeSignature/CodeResources` (inode + mtime + size). Never kill Google-signed-path Chrome on a signature failure alone: re-verify uncached twice ≥ 10 s apart, and skip while GoogleUpdater/ksinstall is running.

### H4 — An unprivileged local process can exhaust the daemon's file descriptors — CONFIRMED
`HTTP.swift:79-84` (no limit on concurrent connections; each one is held 10 s), `install/dk.lockedin.daemon.plist` (no `SoftResourceLimits`; launchd's soft limit is 256).
Probe p4: `LocalServer` under `ulimit -n 256`, with a client holding 6000 idle connections → the server holds ~2570 fds, and during the flood `Info.plist` reads fail (`bundleId=nil`), `Process` spawns fail (`Shell` → -1, so pfctl and dscacheutil cannot run), and the Chrome signature check returns `false`. The listener itself stays up.
Effect during a lock: hosts and pf cannot be applied at lock start (and the report still says `hosts: true`, see M2), new browsers are cached as allowed and Chrome as unsigned (H3), and state saves fail. A standard user can do this with a ten-line script.
Fix: cap concurrent connections (e.g. 16, close extras immediately), use a 2 s header deadline, set `SoftResourceLimits/NumberOfFiles` high, and keep failure results out of every cache.

---

## MEDIUM

### M1 — An unreadable `state.json` (including any future schema change) silently disables enforcement, then wipes the lock — CONFIRMED
`Store.swift:47-57`, `lockedind/main.swift:63-68`, `Model.swift:66-77`.
Swift's synthesized `Decodable` ignores property defaults. Probe p1/P5: removing one key (`appsSeeded`) from `state.json` and `.bak` → `loadFailed=true`, timer gone. So any release that adds a field breaks every existing state file.
While `loadFailed`:
- `tick()` returns before app control and pf.
- The API answers `active:false` and accepts edits that are **never saved** (`save()` is only reached after the early return).
- The first SIGTERM (shutdown) writes the fresh empty state over the old one. After a reboot the lock, lists and schedules are gone (fail open).

Fix: hand-written `init(from:)` with `decodeIfPresent` defaults plus `schemaVersion` migration. Move an unreadable file aside instead of overwriting it, keep enforcing a persisted "last enforced blocks" snapshot, and answer 503 to writes while in this state.

### M2 — `/etc/hosts` is rewritten from an empty string when it cannot be read as UTF-8 — CONFIRMED
`Hosts.swift:63-71`. `try? String(contentsOfFile:encoding:.utf8)` → `""` on any read error or a single non-UTF-8 byte, and the rename then replaces the file with only the managed section. Probe p1/P4: a hosts file with one Latin-1 `é` → after the lock it contains only our section; after the unlock it is **0 bytes** (the `localhost` and `broadcasthost` lines are gone). It also replaces a symlinked `/etc/hosts` (hosts-switcher apps) with a regular file.
Also, `main.swift:73` sets `report.hostsOK = true` unconditionally, and `appControlOK` is never set false. Failures are invisible in the UI.
Fix: read and write bytes (`Data`); if the read fails, do not write; report the real result of `apply`.

### M3 — The extension's "only grows" lock accepts new `allowHosts` during a lock — CONFIRMED
`extension/lib/lock.js:42` (`allowHosts: union(prev, s)`), `:31` (new site objects accepted as-is).
Probe (CfT + fake daemon): a lock is running; the daemon then answers `active:false` and adds `allowHosts:["instagram.com"]` to one site → `https://www.instagram.com/` **loads** while `youtube.com` is still redirected (so the extension still considers itself locked). Any daemon answer can weaken Chrome mid-lock this way: a spoof (M4), a restored backup, or a catalog change.
Fix: freeze `allowHosts` at lock start (take the intersection, never the union), and ignore `allowHosts`/`mode` widening from status during a lock.

### M4 — Port 919 is not root-only for wildcard binds, and the daemon exits when the port is taken — CONFIRMED (non-root wildcard bind; bind failure with same uid), PLAUSIBLE (root case)
`lockedind/main.swift:101-105` (`exit(1)` on bind or listener failure), `HTTP.swift:64-71`. The claim in `docs/API.md:3` and ARCHITECTURE.md:39 is wrong.
Probe: as a non-root user, `bind 0.0.0.0:918` → **BOUND**, `127.0.0.1:918` → EACCES (macOS ≥ 10.14 only checks reserved ports for specific addresses). With a wildcard socket held on a port, `LocalServer` fails to bind `127.0.0.1` on it (EADDRINUSE, same-uid probe p6), and the daemon `exit(1)`s → KeepAlive loop → **no enforcement at all**, while the squatter answers the extension and the menu app (and can feed M3).
Window: any daemon restart while the user is logged in (reinstall or upgrade by the admin, crash, boot race against a user LaunchAgent).
Fix: never exit on listener failure. Enforcement must not depend on the API, so keep ticking and retry the bind. Correct the docs. Longer term, authenticate the daemon to the extension (or use a root-owned Unix socket via a native-messaging host).

### M5 — The heartbeat rule (ARCHITECTURE.md:28) is not implemented
`Engine.swift:225`, `main.swift`: `lastHeartbeat` is stored but nothing acts on it, so a Chrome without a working Locked in extension (today: always, see C1) is never closed.
Fix: implement with a grace period (e.g. 2 min after Chrome start, never during an extension update). Ship it only **after** C1 is fixed, or it will close Chrome constantly.

### M6 — A wall clock set backwards stretches a timer lock for days; the "24 h cap" never applies — CONFIRMED
`Engine.swift:55-61`. The cap is re-applied on every evaluation (`min(endWall-now, 24h)`), so it never runs out. Probe p1/P2: a 60-min session, then the clock goes 3 days back → still locked after 48 h of real (monotonic) time; it ends only when the wall clock reaches the old `endWall`. A standard user cannot set the clock, but an NTP or RTC fault (or an admin) can.
Fix: bound the timer by monotonic elapsed time. Store the session's monotonic budget and use `remaining = min(max(wall, mono), mono + small slack)`.

### M7 — The Chrome profile can disturb the cloud policy and dev tooling — PLAUSIBLE, verify on the Mac
`tools/make-profile.sh:32-39`.
- (a) A platform/machine `ExtensionInstallForcelist` **replaces** any cloud-delivered `ExtensionInstallForcelist` (TESTLOG T1: no merge). PowerLink survives only because it comes via `ExtensionSettings`. Any extension that powermatch.dk forces through the Forcelist would be uninstalled. Check chrome://policy for an existing `ExtensionInstallForcelist` before installing.
- (b) On macOS, off-store force-install requires MDM/MCX or Chrome Enterprise Core enrolment. A hand-installed profile is not MDM, so this works only if the machine itself is CBCM-enrolled (as PowerLink's rollout suggests).
- (c) `RemoteDebuggingAllowed=false` is permanent, not just during sessions. It blocks Playwright/Puppeteer `channel:'chrome'` and chrome-devtools-mcp against the installed Chrome. Google's policy text covers only `--remote-debugging-port/-pipe`, so Claude in Chrome (`chrome.debugger`) should keep working — verify.

### M8 — Admin re-installs run code from the standard user's writable repo as root
`install/install.sh:19-21,29-35`. The admin's `sudo ./install/install.sh` builds with SwiftPM in a user-owned tree, runs `tools/build-catalog.py` from it, then installs whatever binary and catalog is there as root. After the downgrade the owner can plant a weakened daemon or catalog for the admin to install. A reinstall during a lock also replaces `catalog.json`, which `mergeCatalog` applies even while locked (`Engine.swift:234-243`).
Fix: the admin installs only from a fresh clone at a reviewed commit (or a signed release), built in a root-owned temp dir. Refuse catalog shrink while locked.

---

## LOW

- **L1 — Site id collision drops a domain silently — CONFIRMED.** `Engine.swift:119-124`. `a-b.c.com` and `a.b-c.com` both map to id `c-a-b-c-com`; the second `POST /v1/sites` returns 200 but is never blocked. Use a collision-free id (hash) or match on the suffix only.
- **L2 — System processes can be put on the kill list.** `AppPolicy.swift:78-79`, `Validation.swift:6`. Rules match the id string only. A ~/Applications stub with `CFBundleIdentifier=com.apple.loginwindow` (or `com.apple.dock`, `com.apple.finder`) makes `POST /v1/apps` accept it, and the daemon then kills the real one every 2 s for the whole lock (logout loop). Never kill Apple-signed binaries under `/System`, and check `isSystemPath` before the rules.
- **L3 — Browsers can be marked "Virker".** `PATCH /v1/apps/com.apple.Safari {"blocked":false}` outside a session makes Safari/Firefox run during every session, while ARCHITECTURE says other browsers are always closed. Decide, and either forbid it or warn in the UI.
- **L4 — pf details.** `PF.swift:37` reloads `/etc/pf.conf` (flushing any third-party main ruleset) when the com.apple anchor is missing. No `pfctl -k` at lock start, although ARCHITECTURE.md:22 says existing connections are cut. The token is lost on restart, which leaks a pf reference (harmless).
- **L5 — I/O and memory.** `main.swift:93` saves state plus a backup copy every 2 s while locked (~130k file ops per locked day). The log grows without limit. `bundleCache` has no bound (App Translocation creates a new path per launch). `pendingKill` is fine.
- **L6 — DNS rebinding can read GET endpoints.** `API.swift:33-38`: same-origin GETs carry no `Origin` and the `Host` header is not checked, so `/v1/status` and `/v1/installed` are readable by a rebinding page (Chrome's local-network prompt mitigates). Require `Host: 127.0.0.1:919`.
- **L7 — DST edges.** `ScheduleMath.swift:53`. A 02:00–03:00 schedule silently does not run on 2027-03-28 (both ends become 03:00). A 02:30–02:15 window on 2026-10-25 lasts 24 h 45 min (CONFIRMED, probe p1/P6). The documented rules otherwise hold (the tests pass).
- **L8 — Silent degradations.** If `responsibility_get_pid_responsible_for_pid` is missing, WebKit checks are skipped silently (`AppControl.swift:147`). It resolved fine as a user here. JXA/WKWebView launched from Terminal is attributed to Terminal (Apple) and therefore allowed.
- **L9 — Install/uninstall hygiene.** `install.sh:24,42`: `bootout` immediately followed by `bootstrap` can fail (EIO) under `set -e`, and any failure after step 2 leaves no daemon running. `docs/INSTALL.md` and `docs/ADMIN-TJEKLISTE.md` are referenced but do not exist. `uninstall.sh:13-24` rewrites hosts non-atomically. Cold Turkey Blocker and ExpressVPN are still installed on this Mac (Cold Turkey is running a WebKit view); install only warns.
- **L10 — Chrome flag list is narrower than ARCHITECTURE's `--proxy*`.** `AppPolicy.swift:48-51`. Proxy flags are neutralised by `ProxyMode=direct` anyway; consider the prefix `--proxy` and `--host-rules`.

---

## Verified OK (no finding)
- **API lock invariant.** No API call weakens a running lock. Checked: PATCH with extra fields, `{"blocked":0}`, PUT changing only `enabled`, percent-encoded ids, chunked bodies (ignored), and > 64 KB bodies (rejected). Requests are serialised on one queue.
- **CSRF guard.** `X-LockedIn` plus the Origin check holds. The extension service worker sends no Origin on GET and the extension origin on POST (seen by the fake daemon).
- **Monotonic clock and reboot handling.** `CLOCK_MONOTONIC` includes sleep (man page), and the boot-time subtraction of powered-off time is correct.
- **Hosts temp file.** The predictable `/private/etc/hosts.lockedin.tmp` is safe: the directory is root-owned 755, so a standard user cannot plant a symlink.
- **PowerLink is untouched.**
  - Its domains are absent from catalog, hosts and pf.
  - The pf DoH IPs do not overlap app.powermatch.dk (45.32.185.143), journeys.adversus.dk / app.adversus.io (62.69.152.8) or Railway (69.46.46.96).
  - Tab mode blocks only the main frame (CONFIRMED in Chrome for Testing).
- **The mock cannot ship.** `dist/extension` equals the sources, `dev/` is excluded, and `MOCK` requires `!chrome.runtime.id`. The manifest key maps to `nildondjeeibacombanbjnokenmhfhie`.
- **CPU cost.** A dry run of app control on this Mac (394 processes): first pass 0.34 s, cached pass 5 ms. With today's list it would kill nothing that is currently running.

## Verdict: **FIX FIRST**
C1 alone means the Chrome half of the product does not exist. H1–H4 are bypasses or fail-closed traps that hit PowerLink (Chrome killed) or the owner (endless lock). Minimum before shipping: C1, H1, H2, H3, H4, M1, M2, M4 (stop exiting), and M3.

## Can only be verified on the real Mac
1. After the C1 fix: Chrome 154 force-installs the CRX through the profile; chrome://extensions shows it; chrome://policy shows no error or conflict on `ExtensionInstallForcelist`; PowerLink and all cloud-forced extensions are still present (M7a/b).
2. Claude in Chrome still works with `RemoteDebuggingAllowed=false` (M7c).
3. As the standard account: the profile cannot be removed; `dk.lockedin.daemon` and the menu agent cannot be switched off under Login Items → "Allow in the Background"; `/etc/hosts` and the clock cannot be changed.
4. Chrome auto-updating during a session is not killed (watch the log for "Chrome er ikke signeret af Google") (H3).
5. Root `lockedind` cannot bind `127.0.0.1:919` while a standard user holds `0.0.0.0:919` (needs the admin, maintenance window) (M4).
6. pf really drops `https://1.1.1.1` during a session, and the anchor survives a reboot.
7. DNR redirect, tab sweep and bfcache re-check in Chrome 154 itself (verified only in headless CfT 148).
8. The menu item "Åbn Locked in" really opens the `chrome-extension://` URL.
9. The TESTLOG open items (profile survives reboot; policy applies to a `--user-data-dir` Chrome).
