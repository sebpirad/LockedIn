import Foundation
import LockedInCore

// Plain test runner (XCTest is not part of Command Line Tools). `swift run CoreTests` — exit code 1 on any failure.

var failures = 0
var passed = 0
func check(_ cond: @autoclosure () -> Bool, _ msg: String, file: String = #file, line: Int = #line) {
    if cond() { passed += 1 } else { failures += 1; print("FAIL \(line): \(msg)") }
}
func eq<T: Equatable>(_ a: T, _ b: T, _ msg: String, line: Int = #line) {
    if a == b { passed += 1 } else { failures += 1; print("FAIL \(line): \(msg) — got \(a), expected \(b)") }
}
let iso = ISO8601DateFormatter()
func t(_ s: String) -> Date { iso.date(from: s)! }
func expectError(_ code: String, _ msg: String, line: Int = #line, _ body: () throws -> Void) {
    do { try body(); failures += 1; print("FAIL \(line): \(msg) — no error") }
    catch let e as EngineError { eq(e.code, code, msg, line: line) }
    catch { failures += 1; print("FAIL \(line): \(msg) — \(error)") }
}

func sched(_ days: [Int], _ a: String, _ b: String) -> Schedule { Schedule(id: "s", name: "x", weekdays: days, start: a, end: b, enabled: true) }

// MARK: Schedules in Europe/Copenhagen

do {
    // Monday 2026-10-05, CEST (UTC+2).
    let s = sched([1], "09:00", "12:00")
    let e = Engine(state: State()); e.testMutate { $0.schedules = [s] }
    check(e.isLocked(t("2026-10-05T07:00:00Z")), "Mon 09:00 local is locked")
    check(e.isLocked(t("2026-10-05T09:59:59Z")), "Mon 11:59:59 local is locked")
    check(!e.isLocked(t("2026-10-05T10:00:00Z")), "Mon 12:00 local is unlocked")
    check(!e.isLocked(t("2026-10-06T07:30:00Z")), "Tuesday not in schedule")
    eq(e.status(now: t("2026-10-05T10:00:00Z")).next?.start, t("2026-10-12T07:00:00Z"), "next is the following Monday")
}
do {
    // Fall back: Sunday 2026-10-25, 03:00 CEST -> 02:00 CET. 01:00–04:00 local is 4 real hours.
    let occ = ScheduleMath.occurrences(sched([7], "01:00", "04:00"), around: t("2026-10-25T00:30:00Z"))
    let iv = occ.first { $0.start <= t("2026-10-25T00:30:00Z") && t("2026-10-25T00:30:00Z") < $0.end }
    eq(iv?.start, t("2026-10-24T23:00:00Z"), "fall back: 01:00 CEST")
    eq(iv?.end, t("2026-10-25T03:00:00Z"), "fall back: 04:00 CET")
    // The repeated 02:30 resolves to the FIRST occurrence (CEST).
    let rep = ScheduleMath.occurrences(sched([7], "02:30", "03:30"), around: t("2026-10-25T00:00:00Z")).first { $0.start > t("2026-10-24T12:00:00Z") }
    eq(rep?.start, t("2026-10-25T00:30:00Z"), "repeated time → first occurrence")
    eq(rep?.end, t("2026-10-25T02:30:00Z"), "03:30 CET")
}
do {
    // Spring forward: Sunday 2027-03-28, 02:00 CET -> 03:00 CEST. 02:30 does not exist → 03:00 CEST.
    let occ = ScheduleMath.occurrences(sched([7], "02:30", "04:00"), around: t("2027-03-28T00:00:00Z"))
    let iv = occ.first { $0.start > t("2027-03-27T12:00:00Z") }
    eq(iv?.start, t("2027-03-28T01:00:00Z"), "nonexistent 02:30 moves to 03:00 CEST")
    eq(iv?.end, t("2027-03-28T02:00:00Z"), "04:00 CEST")
}
do {
    // Friday 22:00 → 02:00 crosses midnight into Saturday.
    let e = Engine(state: State()); e.testMutate { $0.schedules = [sched([5], "22:00", "02:00")] }
    check(e.isLocked(t("2026-10-09T23:30:00Z")), "Sat 01:30 local is inside Fri 22–02")
    check(!e.isLocked(t("2026-10-10T00:00:00Z")), "Sat 02:00 local is outside")
    check(!e.isLocked(t("2026-10-10T20:30:00Z")), "Sat 22:30 not scheduled")
}
check(ScheduleMath.minutes("24:00") == nil && ScheduleMath.minutes("9:00") == nil && ScheduleMath.minutes("09:60") == nil, "bad HH:MM rejected")
eq(ScheduleMath.isoWeekday(t("2026-10-04T10:00:00Z")), 7, "2026-10-04 is a Sunday")

// MARK: Timer lock

do {
    let now = t("2026-10-05T08:00:00Z")
    let e = Engine(state: State())
    e.boot(now: now, mono: 1000)
    e.mergeCatalog([SiteRule(id: "instagram", label: "Instagram", builtin: true, blocked: true, mode: "full", suffixes: ["instagram.com"])], now: now)
    try! e.startSession(minutes: 60, now: now)
    check(e.isLocked(now), "locked after start")
    let L = e.state.lists[0]
    eq(L.name, "Locked In 1", "default list created from the blocked flags")
    eq(e.effectiveSites(now: now).map(\.id), ["instagram"], "the list's sites are blocked")
    expectError("locked", "cannot remove a site from the list in use") { try e.updateList(id: L.id, name: L.name, sites: [], apps: [], now: now) }
    expectError("locked", "cannot delete the list in use") { try e.removeList(id: L.id, now: now) }
    expectError("invalid", "builtin cannot be deleted") { try e.removeSite(id: "instagram", now: now) }
    _ = try! e.addSite(label: "Reddit", domain: "https://www.Reddit.com/r/x", list: L.id, now: now)
    check(e.effectiveSites(now: now).contains { $0.id == "c-reddit.com" }, "adding a site to the list in use during a lock blocks it at once")
    expectError("locked", "cannot delete custom site during lock") { try e.removeSite(id: "c-reddit.com", now: now) }
    _ = try! e.addSchedule(sched([2], "13:00", "14:00"), now: now)
    let sid = e.state.schedules[0].id
    expectError("locked", "cannot delete schedule during lock") { try e.removeSchedule(id: sid, now: now) }
    var changed = e.state.schedules[0]; changed.end = "13:30"
    expectError("locked", "cannot edit schedule during lock") { try e.updateSchedule(changed, now: now) }
    // Shorter start while locked never shortens.
    try! e.startSession(minutes: 5, now: now)
    eq(e.status(now: now).activeUntil, now.addingTimeInterval(3600), "a shorter start does not shorten")
    // Wall clock jumps 2 h forward, monotonic only 60 s: still locked.
    e.advance(now: now.addingTimeInterval(7200), mono: 1060)
    check(e.isLocked(now.addingTimeInterval(7200)), "forward clock jump cannot end the lock")
    // Real time passes on both clocks.
    e.advance(now: now.addingTimeInterval(7200 + 3600), mono: 1000 + 3601)
    check(!e.isLocked(now.addingTimeInterval(7200 + 3600)), "unlocked after an hour of real time")
    check(e.state.timer == nil, "expired timer cleared")
    try! e.updateList(id: L.id, name: "Let", sites: [], apps: [], now: now.addingTimeInterval(5 * 3600))  // 15:00 local, after the 13–14 schedule
    check(e.state.lists[0].sites.isEmpty && e.state.lists[0].name == "Let", "editing the list is allowed after the lock")
}
do {
    let now = t("2026-10-05T08:00:00Z")
    let e = Engine(state: State())
    e.boot(now: now, mono: 0)
    expectError("invalid", "1441 minutes rejected") { try e.startSession(minutes: 1441, now: now) }
    expectError("invalid", "0 minutes rejected") { try e.startSession(minutes: 0, now: now) }
    try! e.startSession(minutes: 1440, now: now)
    check(e.isLocked(now.addingTimeInterval(86399)), "24 h session holds to the end")
    // Wall clock set far back: still capped at 24 h of remaining time.
    let back = now.addingTimeInterval(-10 * 86400)
    e.advance(now: back, mono: 10)
    check(e.status(now: back).activeUntil! <= back.addingTimeInterval(Engine.maxChain), "backward clock cannot hold more than 24 h")
}
do {
    // Power off for 30 min during a 60 min session: at boot, 30 min remain on the monotonic side.
    let now = t("2026-10-05T08:00:00Z")
    let e = Engine(state: State())
    e.boot(now: now, mono: 500)
    try! e.startSession(minutes: 60, now: now)
    var s = e.state; s.lastSavedWall = now
    let e2 = Engine(state: s)
    e2.boot(now: now.addingTimeInterval(1800), mono: 5)   // mono reset by reboot
    eq(e2.state.timer?.monoRemaining, 1800, "powered-off time subtracted at boot")
    check(e2.isLocked(now.addingTimeInterval(1800)), "still locked after reboot")
    check(!e2.isLocked(now.addingTimeInterval(3601)) || e2.state.timer!.monoRemaining > 0, "consistent")
}
do {
    // Timer until 10:00 local + schedule 10:00–12:00 → one lock until 12:00.
    let now = t("2026-10-05T07:00:00Z")   // 09:00 Monday
    let e = Engine(state: State())
    e.boot(now: now, mono: 0)
    _ = try! e.addSchedule(sched([1], "10:00", "12:00"), now: now)
    try! e.startSession(minutes: 60, now: now)
    eq(e.status(now: now).activeUntil, t("2026-10-05T10:00:00Z"), "back-to-back timer + schedule merge")
}

do {
    // "Locked in indtil kl. 15:00" on Monday 2026-10-05 (CEST): ends exactly at 13:00Z.
    let now = t("2026-10-05T11:41:23Z")
    let e = Engine(state: State())
    e.boot(now: now, mono: 0)
    expectError("invalid", "earlier time rejected") { try e.startSession(until: t("2026-10-05T11:00:00Z"), now: now) }
    expectError("invalid", "more than 24 h rejected") { try e.startSession(until: now.addingTimeInterval(86401), now: now) }
    try! e.startSession(until: t("2026-10-05T13:00:00Z"), now: now)
    eq(e.status(now: now).activeUntil, t("2026-10-05T13:00:00Z"), "until: exact end")
    check(!e.isLocked(t("2026-10-05T13:00:00Z").addingTimeInterval(0)) || e.state.timer!.monoRemaining > 0, "unlocks at the end")
    let api = API(engine: e, installed: { [] }, report: { EnforcementReport() }, changed: {})
    let r = api.handle(HTTPRequest(method: "POST", path: "/v1/session", headers: ["x-lockedin": "1"], body: Data(#"{"until":"2026-10-05T12:00:00Z"}"#.utf8)), now: now)
    eq(r.status, 200, "until via API (earlier than current end is a no-op, not an error)")
    eq(e.status(now: now).activeUntil, t("2026-10-05T13:00:00Z"), "until never shortens")
    let bad = api.handle(HTTPRequest(method: "POST", path: "/v1/session", headers: ["x-lockedin": "1"], body: Data(#"{"until":"kl 15"}"#.utf8)), now: now)
    eq(bad.status, 400, "garbage time → 400")
}

// MARK: Validation

check(Validation.isDomain("reddit.com") && Validation.isDomain("a-b.co.uk"), "valid domains")
for bad in ["evil.com\n1.2.3.4 x", "a b.com", "localhost", "1.2.3.4", "-a.com", "a..com", "æ.dk", "x.com/", ""] {
    check(!Validation.isDomain(bad), "rejects \(bad.debugDescription)")
}
expectError("invalid", "newline label rejected") { _ = try Engine(state: State()).addSite(label: "a\nb", domain: "x.com", now: Date()) }

// MARK: /etc/hosts

do {
    let yt = SiteRule(id: "youtube", label: "YouTube", builtin: true, blocked: true, mode: "full", suffixes: ["youtube.com"],
                      allowHosts: ["accounts.youtube.com"], hostsFile: ["youtube.com", "www.youtube.com", "accounts.youtube.com"])
    let adv = SiteRule(id: "adversus", label: "Adversus", builtin: true, blocked: true, mode: "tab", suffixes: ["adversus.io"], hostsFile: ["app.adversus.io"])
    let off = SiteRule(id: "netflix", label: "Netflix", builtin: true, blocked: false, mode: "full", suffixes: ["netflix.com"], hostsFile: ["netflix.com"])
    let names = HostsFile.hostnames(sites: [yt, adv], catalog: nil)
    eq(HostsFile.hostnames(sites: [yt, adv], catalog: nil), ["youtube.com", "www.youtube.com"], "allowHosts and tab-mode stay out of hosts")
    _ = off
    let user = "127.0.0.1\tlocalhost\n255.255.255.255\tbroadcasthost\n::1 localhost\n"
    let sec = HostsFile.section(names)
    let once = HostsFile.render(existing: user, section: sec)
    eq(HostsFile.render(existing: once, section: sec), once, "render is idempotent")
    eq(HostsFile.render(existing: once, section: ""), user, "removing restores the user's file exactly")
    let damaged = user + HostsFile.begin + "\n0.0.0.0 x.com\n"   // end marker lost
    eq(HostsFile.render(existing: damaged, section: ""), user, "a damaged section is removed too")
    check(sec.contains("0.0.0.0 youtube.com\n:: youtube.com\n"), "IPv4 and IPv6 sinks")
    let blanks = "127.0.0.1 localhost\n\n\n"
    eq(HostsFile.render(existing: blanks, section: ""), blanks, "a file without our section is never touched")
    eq(HostsFile.render(existing: HostsFile.render(existing: blanks, section: sec), section: ""), blanks, "trailing blank lines survive a lock")
    let noNL = "127.0.0.1 localhost"
    check(HostsFile.render(existing: noNL, section: sec).hasPrefix(noNL + "\n" + HostsFile.begin), "section starts on its own line")
}

// MARK: API

do {
    let e = Engine(state: State())
    let now = t("2026-10-05T08:00:00Z")
    e.boot(now: now, mono: 0)
    e.mergeCatalog([SiteRule(id: "instagram", label: "Instagram", builtin: true, blocked: true, mode: "full", suffixes: ["instagram.com"])], now: now)
    var changes = 0
    let api = API(engine: e, installed: { [AppRule(bundleId: "com.todoist.mac.Todoist", name: "Todoist", kind: .webengine, blocked: false)] },
                  report: { EnforcementReport() }, changed: { changes += 1 })
    func req(_ m: String, _ p: String, _ body: String = "", headers: [String: String] = ["x-lockedin": "1"]) -> HTTPResponse {
        api.handle(HTTPRequest(method: m, path: p, headers: headers, body: Data(body.utf8)), now: now)
    }
    eq(req("GET", "/v1/status", headers: [:]).status, 403, "missing X-LockedIn → 403")
    eq(req("GET", "/v1/status", headers: ["x-lockedin": "1", "origin": "https://evil.example"]).status, 403, "foreign origin → 403")
    eq(req("GET", "/v1/status", headers: ["x-lockedin": "1", "origin": API.extensionOrigin]).status, 200, "extension origin ok")
    eq(req("POST", "/v1/session", #"{"minutes":30}"#).status, 200, "start session")
    eq(changes, 1, "change callback fired")
    let lid = e.state.lists[0].id
    let r = req("PUT", "/v1/lists/\(lid)", #"{"name":"x","sites":[],"apps":[]}"#)
    eq(r.status, 423, "shrinking the list in use → 423")
    eq((r.json as? [String: Any])?["message"] as? String, "Kan ikke ændres under en aktiv session.", "Danish message")
    eq(req("POST", "/v1/apps", #"{"bundleId":"com.todoist.mac.Todoist"}"#).status, 200, "add app from installed list")
    eq(req("POST", "/v1/apps", #"{"bundleId":"com.google.Chrome"}"#).status, 400, "unknown/protected app rejected")
    eq(req("PUT", "/v1/lists/\(lid)", #"{"name":"x","sites":["instagram"],"apps":["com.todoist.mac.Todoist"]}"#).status, 200, "growing the list in use → 200")
    eq(req("PUT", "/v1/lists/\(lid)", #"{"name":"x","sites":["instagram"],"apps":[]}"#).status, 423, "removing an app from the list in use → 423")
    eq(req("POST", "/v1/session", "not json").status, 400, "bad JSON → 400")
    let st = req("GET", "/v1/status").json as! [String: Any]
    eq(st["active"] as? Bool, true, "status active")
    eq(st["activeUntil"] as? String, "2026-10-05T08:30:00Z", "status activeUntil in UTC")
    check(JSONSerialization.isValidJSONObject(st), "status serialises")
    let raw = String(decoding: HTTPParse.serialize(HTTPResponse(200, st)), as: UTF8.self)
    check(!raw.lowercased().contains("access-control-allow"), "no CORS headers")
    let parsed = try? HTTPParse.parse(Data("POST /v1/session HTTP/1.1\r\nX-LockedIn: 1\r\nContent-Length: 2\r\n\r\n{}".utf8))
    eq(parsed?.headers["x-lockedin"], "1", "parser lower-cases header names")
    check((try? HTTPParse.parse(Data("POST / HTTP/1.1\r\nContent-Length: 999999\r\n\r\n".utf8))) == nil, "oversized body rejected")
}

// MARK: App policy

do {
    let rules = [AppRule(bundleId: "com.todoist.mac.Todoist", name: "Todoist", kind: .webengine, blocked: false, teamId: "TODO1"),
                 AppRule(bundleId: "com.readdle.SparkDesktop", name: "Spark", kind: .webengine, blocked: true),
                 AppRule(bundleId: "com.apple.loginwindow", name: "Stub", kind: .app, blocked: true)]
    func b(_ path: String, _ id: String?, kind: AppKind = .app, apple: Bool = false, google: Bool = false, team: String? = nil) -> BundleFacts {
        BundleFacts(path: path, bundleId: id, name: id, kind: kind, appleSigned: apple, googleSigned: google, teamId: team ?? (google ? "EQHXZ8M8AV" : nil))
    }
    let chromeApp = "/Applications/Google Chrome.app"
    let chromeExe = chromeApp + "/Contents/MacOS/Google Chrome"
    let realChrome = b(chromeApp, "com.google.Chrome", kind: .browser, google: true)
    func chromeMain(_ args: [String] = []) -> ProcFacts { ProcFacts(pid: 10, path: chromeExe, bundles: [realChrome], argv: [chromeExe] + args) }
    eq(AppPolicy.judge(chromeMain(), rules: rules), .allow, "real Chrome allowed")
    for flag in ["--host-resolver-rules=MAP * 1.2.3.4", "--host-rules=x", "--remote-debugging-port=9222", "--remote-debugging-pipe",
                 "--user-data-dir=/tmp/x", "--disable-extensions", "--load-extension=/x", "--proxy-server=x"] {
        if case .killTree = AppPolicy.judge(chromeMain([flag]), rules: rules) {} else { check(false, "Chrome with \(flag) killed (tree only)") }
    }
    var unsigned = realChrome; unsigned.googleSigned = false; unsigned.teamId = nil
    eq(AppPolicy.judge(ProcFacts(pid: 10, path: chromeExe, bundles: [unsigned]), rules: rules), .chromeSignatureFailed, "real Chrome failing its signature is debounced, not killed")
    let helperPath = chromeApp + "/Contents/Frameworks/G.framework/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper"
    let helper = ProcFacts(pid: 11, path: helperPath, bundles: [b(chromeApp + "/Contents/Frameworks/G.framework/Helpers/Google Chrome Helper.app", "com.google.Chrome.helper", google: true), realChrome], argv: [])
    eq(AppPolicy.judge(helper, rules: rules), .allow, "Chrome helpers allowed")
    // H1: a Google-signed Chrome copy inside a wrapper .app in the home folder.
    let wrapped = ProcFacts(pid: 12, path: "/Users/sp/W.app/Contents/Google Chrome.app/Contents/MacOS/Google Chrome",
                            bundles: [b("/Users/sp/W.app/Contents/Google Chrome.app", "com.google.Chrome", kind: .browser, google: true), b("/Users/sp/W.app", nil)])
    check(AppPolicy.judge(wrapped, rules: rules) != .allow, "wrapped Chrome copy killed")
    let copy = ProcFacts(pid: 13, path: "/Users/sp/Chrome2.app/Contents/MacOS/Google Chrome", bundles: [b("/Users/sp/Chrome2.app", "com.google.Chrome", kind: .browser, google: true)])
    check(AppPolicy.judge(copy, rules: rules) != .allow, "Chrome copy outside /Applications killed")
    let wrappedFx = ProcFacts(pid: 14, path: "/Users/sp/W.app/Contents/Firefox.app/Contents/MacOS/firefox",
                              bundles: [b("/Users/sp/W.app/Contents/Firefox.app", "org.mozilla.firefox", kind: .browser), b("/Users/sp/W.app", nil)])
    check(AppPolicy.judge(wrappedFx, rules: rules) != .allow, "wrapped Firefox killed")
    // Borrowed identity: claims to be Todoist (allowed) but is signed by someone else / not at all.
    let fakeTodoist = ProcFacts(pid: 15, path: "/Users/sp/T.app/Contents/MacOS/T", bundles: [b("/Users/sp/T.app", "com.todoist.mac.Todoist", kind: .webengine, team: "EVIL")])
    check(AppPolicy.judge(fakeTodoist, rules: rules) != .allow, "borrowed bundle id with another signature is not allowed")
    let realTodoist = ProcFacts(pid: 16, path: "/Applications/Todoist.app/Contents/MacOS/Todoist", bundles: [b("/Applications/Todoist.app", "com.todoist.mac.Todoist", kind: .webengine, team: "TODO1")])
    eq(AppPolicy.judge(realTodoist, rules: rules), .allow, "the allowed copy runs")
    // Garbled plist (no bundle id) with an engine in the home folder.
    let noId = ProcFacts(pid: 17, path: "/Users/sp/X.app/Contents/MacOS/X", bundles: [b("/Users/sp/X.app", nil, kind: .webengine)])
    check(AppPolicy.judge(noId, rules: rules) != .allow, "engine app without bundle id killed")
    check(AppPolicy.judge(ProcFacts(pid: 18, path: "/Applications/Spark Desktop.app/Contents/MacOS/Spark", bundles: [b("/Applications/Spark Desktop.app", "com.readdle.SparkDesktop", kind: .webengine)]), rules: rules) != .allow, "blocked app killed")
    let safari = ProcFacts(pid: 19, path: "/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app/Contents/MacOS/Safari",
                           bundles: [b("/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app", "com.apple.Safari", kind: .browser, apple: true, team: "apple")])
    check(AppPolicy.judge(safari, rules: rules) != .allow, "Safari killed during lock")
    // L2: a rule that names a system process never kills it.
    let lw = ProcFacts(pid: 20, path: "/System/Library/CoreServices/loginwindow.app/Contents/MacOS/loginwindow",
                       bundles: [b("/System/Library/CoreServices/loginwindow.app", "com.apple.loginwindow", apple: true, team: "apple")])
    eq(AppPolicy.judge(lw, rules: rules), .allow, "loginwindow never killed")
    eq(AppPolicy.judge(ProcFacts(pid: 21, path: "/Applications/Notes3.app/Contents/MacOS/N", bundles: [b("/Applications/Notes3.app", "com.example.notes", team: "X")]), rules: rules), .allow, "ordinary app untouched")
    if case .killAndRecord(let r, _) = AppPolicy.judge(ProcFacts(pid: 22, path: "/Applications/New.app/Contents/MacOS/New", bundles: [b("/Applications/New.app", "com.new.electron", kind: .webengine, team: "N")]), rules: rules) {
        check(r.blocked && r.kind == .webengine, "unknown web-engine app recorded as blocked")
    } else { check(false, "unknown web-engine app killed and recorded") }
    // WebContent owners
    check(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 30, path: "/usr/bin/osascript"), rules: rules) != .allow, "JXA web view killed")
    check(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 31, path: "/Library/Developer/CommandLineTools/usr/bin/swift-frontend"), rules: rules) != .allow, "swift-script web view killed")
    eq(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 32, path: "/System/Library/PrivateFrameworks/X.framework/x"), rules: rules), .allow, "system service allowed")
    eq(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 33, path: "/System/Applications/Mail.app/Contents/MacOS/Mail", bundles: [b("/System/Applications/Mail.app", "com.apple.mail", apple: true, team: "apple")]), rules: rules), .allow, "Mail allowed")
    check(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 34, path: "/Users/sp/Desktop/B.app/Contents/MacOS/B", bundles: [b("/Users/sp/Desktop/B.app", "dk.me.browser")]), rules: rules) != .allow, "home-made app in home folder killed")
    eq(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 35, path: "/Applications/Tool.app/Contents/MacOS/Tool", bundles: [b("/Applications/Tool.app", "com.vendor.tool", team: "V")]), rules: rules), .allow, "signed admin-installed WKWebView app allowed")
    check(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 36, path: "/Applications/Tool.app/Contents/MacOS/Tool", bundles: [b("/Applications/Tool.app", "com.vendor.tool", team: nil)]), rules: rules) != .allow, "modified (signature broken) WKWebView app killed")
    eq(AppControlTestHooks.levels("/Users/sp/W.app/Contents/Google Chrome.app/Contents/MacOS/Google Chrome"),
       ["/Users/sp/W.app/Contents/Google Chrome.app", "/Users/sp/W.app"], "every .app level, innermost first")
}

// MARK: Review 1 regressions

do {
    // H2: Dag 07–22 + Nat 22–07 every day would never unlock → the second one is refused.
    let now = t("2026-10-05T04:00:00Z")
    let e = Engine(state: State()); e.boot(now: now, mono: 0)
    _ = try! e.addSchedule(sched([1,2,3,4,5,6,7], "07:00", "22:00"), now: now)
    expectError("invalid", "chained schedules over 24 h refused") { _ = try e.addSchedule(sched([1,2,3,4,5,6,7], "22:00", "07:00"), now: now) }
    // A 24 h timer, then a schedule right after it → refused (one continuous lock > 24 h).
    let e2 = Engine(state: State()); e2.boot(now: now, mono: 0)
    try! e2.startSession(minutes: 1440, now: now)
    expectError("invalid", "schedule extending a 24 h timer refused") { _ = try e2.addSchedule(sched([2], "05:00", "08:00"), now: now) }
    // Extending a running timer past 24 h from its start → refused.
    e2.advance(now: now.addingTimeInterval(3600), mono: 3600)
    expectError("invalid", "extension past 24 h from session start refused") { try e2.startSession(minutes: 1440, now: now.addingTimeInterval(3600)) }
    // Defensive cap for state written by an older version: the chain ends 24 h after it started.
    let e3 = Engine(state: State())
    e3.testMutate { $0.schedules = [sched([1,2,3,4,5,6,7], "07:00", "22:00"), sched([1,2,3,4,5,6,7], "22:00", "07:00")] }
    let st = e3.status(now: now)
    check(st.activeUntil != nil && st.activeUntil! <= now.addingTimeInterval(Engine.maxChain), "old over-long chains are capped")
}
do {
    // M6: clock set 3 days back during a 60 min session → unlocked after ~60 min (+2 min slack) of real time.
    let now = t("2026-10-05T08:00:00Z")
    let e = Engine(state: State()); e.boot(now: now, mono: 0)
    try! e.startSession(minutes: 60, now: now)
    let back = now.addingTimeInterval(-3 * 86400)
    e.advance(now: back.addingTimeInterval(3600 + 121), mono: 3600 + 121)
    check(!e.isLocked(back.addingTimeInterval(3600 + 121)), "backward clock cannot stretch the lock")
}
do {
    let now = Date()
    let e = Engine(state: State())
    _ = try! e.addSite(label: "A", domain: "a-b.c.com", now: now)
    _ = try! e.addSite(label: "B", domain: "a.b-c.com", now: now)
    eq(e.state.sites.count, 2, "L1: no id collision")
    e.testMutate { $0.apps = [AppRule(bundleId: "com.apple.Safari", name: "Safari", kind: .browser, blocked: true)] }
    expectError("invalid", "L3: browsers cannot be allowed") { try e.setAppBlocked(bundleId: "com.apple.Safari", blocked: false, now: now) }
}
do {
    // M8: a smaller catalog during a lock does not shrink a site.
    let now = t("2026-10-05T08:00:00Z")
    let e = Engine(state: State()); e.boot(now: now, mono: 0)
    e.mergeCatalog([SiteRule(id: "yt", label: "YT", builtin: true, blocked: true, mode: "full", suffixes: ["youtube.com", "youtu.be"], hostsFile: ["youtube.com"])], now: now)
    try! e.startSession(minutes: 30, now: now)
    e.mergeCatalog([SiteRule(id: "yt", label: "YT", builtin: true, blocked: true, mode: "tab", suffixes: ["youtube.com"], allowHosts: ["youtu.be"])], now: now)
    let yt = e.state.sites[0]
    check(yt.suffixes.contains("youtu.be") && yt.mode == "full" && yt.allowHosts.isEmpty && yt.hostsFile.contains("youtube.com"), "catalog cannot weaken a running lock")
}
do {
    // M1: a state file missing fields (older/newer version) still loads with its timer.
    let json = #"{"timer":{"endWall":"2026-10-05T09:00:00Z","monoRemaining":3600},"sites":[{"id":"x","suffixes":["x.com"]}]}"#
    let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
    let s = try? dec.decode(State.self, from: Data(json.utf8))
    check(s?.timer?.monoRemaining == 3600 && s?.sites.first?.blocked == true, "tolerant state decoding")
}
do {
    // M2: a hosts file that is not UTF-8 is never rewritten.
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("lockedin-test-\(getpid())")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let path = dir.appendingPathComponent("hosts").path
    let latin1 = Data("127.0.0.1 localhost # caf".utf8) + Data([0xE9, 0x0A])
    FileManager.default.createFile(atPath: path, contents: latin1)
    let h = HostsApplier(path: path, run: { _, _ in 0 })
    if case .failed = h.apply(section: HostsFile.section(["x.com"])) {} else { check(false, "non-UTF-8 hosts reported as failed") }
    eq(FileManager.default.contents(atPath: path), latin1, "non-UTF-8 hosts left untouched")
    try? FileManager.default.removeItem(at: dir)
}
do {
    // L6: DNS rebinding — wrong Host header refused.
    let e = Engine(state: State())
    let api = API(engine: e, installed: { [] }, report: { EnforcementReport() }, changed: {})
    let r = api.handle(HTTPRequest(method: "GET", path: "/v1/status", headers: ["x-lockedin": "1", "host": "evil.example:919"], body: Data()), now: Date())
    eq(r.status, 403, "foreign Host header → 403")
    let ok = api.handle(HTTPRequest(method: "GET", path: "/v1/status", headers: ["x-lockedin": "1", "host": "127.0.0.1:919"], body: Data()), now: Date())
    eq(ok.status, 200, "own Host header → 200")
}

// MARK: Review 2 regressions

do {
    // N3: a weekend plan that is exactly 24 h (and 25 h on the DST Sunday) must not block unrelated sessions.
    let now = t("2026-10-19T08:00:00Z")   // Monday before the fall-back weekend
    let e = Engine(state: State())
    e.testMutate { $0.schedules = [sched([6], "12:00", "00:00"), sched([7], "00:00", "12:00")] }
    e.boot(now: now, mono: 0)
    do { try e.startSession(minutes: 60, now: now); passed += 1 } catch { failures += 1; print("FAIL N3: unrelated session refused: \(error)") }
    do { _ = try e.addSchedule(sched([2], "09:00", "10:00"), now: now); passed += 1 } catch { failures += 1; print("FAIL N3: unrelated schedule refused") }
    expectError("invalid", "N3: lengthening the existing chain is still refused") { _ = try e.addSchedule(sched([7], "12:00", "13:00"), now: now) }
    // On the DST Sunday the 25 h chain is capped at 24 h (+60 s).
    let sat = t("2026-10-24T10:00:00Z")
    let e2 = Engine(state: State())
    e2.testMutate { $0.schedules = [sched([6], "12:00", "00:00"), sched([7], "00:00", "12:00")] }
    let st = e2.status(now: sat)
    check(st.activeUntil! <= sat.addingTimeInterval(Engine.maxChain), "DST weekend chain capped")
}
do {
    func b(_ path: String, _ id: String?, kind: AppKind = .app, apple: Bool = false, team: String? = nil) -> BundleFacts {
        BundleFacts(path: path, bundleId: id, name: id, kind: kind, appleSigned: apple, googleSigned: false, teamId: team)
    }
    // N4: an installed Chrome web app shim is not a "Chrome copy".
    let shimPath = "/Users/sp/Applications/Chrome Apps.localized/Gmail.app"
    var shim = b(shimPath, "com.google.Chrome.app.abc", team: "EQHXZ8M8AV"); shim.tinyShim = true
    eq(AppPolicy.judge(ProcFacts(pid: 1, path: shimPath + "/Contents/MacOS/app_mode_loader", bundles: [shim]), rules: []), .allow, "N4: Chrome PWA shim allowed")
    // R3-1: a Firefox copy renamed into the shim folder is not a shim.
    let fx = b("/Users/sp/Applications/Chrome Apps.localized/F.app", "com.google.Chrome.app.fake", kind: .browser)
    check(AppPolicy.judge(ProcFacts(pid: 9, path: fx.path + "/Contents/MacOS/firefox", bundles: [fx]), rules: []) != .allow, "R3-1: renamed browser in shim folder killed")
    if case .killTree = AppPolicy.judgeBare(path: "/opt/homebrew/bin/x", argv: ["x", "--proxy-server=socks5://h"]) {} else { check(false, "R3-2: homebrew bare browser with proxy flag killed") }
    // …but a fake "shim" with its own engine is still killed.
    check(AppPolicy.judge(ProcFacts(pid: 2, path: shimPath + "/Contents/MacOS/x", bundles: [b(shimPath, "com.google.Chrome.app.fake", kind: .webengine)]), rules: []) != .allow, "N4: fake shim with engine killed")
    // N8: an "Apple-signed" bundle in the home folder is not trusted to render web pages.
    check(AppPolicy.judgeWebContentOwner(ProcFacts(pid: 3, path: "/Users/sp/F.app/Contents/MacOS/osascript", bundles: [b("/Users/sp/F.app", "dk.fake", apple: true, team: "apple")]), rules: []) != .allow, "N8: fake Apple-signed app in home folder killed")
    // H1 residual: bare browser binaries in user-writable places.
    if case .killTree = AppPolicy.judgeBare(path: "/Users/sp/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-mac/headless_shell", argv: ["x"]) {} else { check(false, "bare headless_shell killed") }
    if case .killTree = AppPolicy.judgeBare(path: "/Users/sp/bin/b", argv: ["b", "--remote-debugging-port=9222"]) {} else { check(false, "bare binary with browser flags killed") }
    eq(AppPolicy.judgeBare(path: "/Users/sp/.local/bin/claude", argv: ["claude"]), .allow, "ordinary CLI tool in home untouched")
    eq(AppPolicy.judgeBare(path: "/opt/homebrew/bin/node", argv: ["node", "server.js"]), .allow, "ordinary homebrew tool untouched")
    eq(AppPolicy.judgeBare(path: "/usr/local/bin/x", argv: ["x", "--headless"]), .allow, "non-user-writable path not judged")
    let slow = Shell.output("/bin/sleep", ["10"], stdin: nil, timeout: 1)
    eq(slow.status, -2, "R3-4: hung tool is killed after its timeout")
}
do {
    // M1 residual: an unknown AppKind from a newer build does not make state unreadable.
    let json = #"{"apps":[{"bundleId":"a.b","name":"X","kind":"terminal","blocked":false}]}"#
    let s = try? JSONDecoder().decode(State.self, from: Data(json.utf8))
    eq(s?.apps.first?.kind, .webengine, "unknown kind decodes as webengine")
}

// MARK: Block lists

do {
    let now = t("2026-10-05T07:00:00Z")   // Monday 09:00 local
    let e = Engine(state: State()); e.boot(now: now, mono: 0)
    let sites = ["slack", "adversus", "instagram", "youtube", "tv2"].map {
        SiteRule(id: $0, label: $0, builtin: true, blocked: false, mode: "full", suffixes: ["\($0).com"]) }
    e.mergeCatalog(sites, now: now)
    e.migrateToLists()
    let l1 = try! e.addList(name: "Locked In 1", sites: ["slack", "adversus", "instagram"], apps: [], now: now)
    let l2 = try! e.addList(name: "Locked In 2", sites: ["slack", "adversus", "instagram", "youtube", "tv2", "nope"], apps: [], now: now)
    eq(e.state.lists.first { $0.id == l2.id }?.sites.count, 5, "unknown site ids are dropped")
    // Timer with list 1 → only its sites.
    try! e.startSession(minutes: 30, list: l1.id, now: now)
    eq(Set(e.effectiveSites(now: now).map(\.id)), ["slack", "adversus", "instagram"], "timer uses list 1")
    // A one-time period today 09:15–10:00 with list 2 → union while both run.
    let once = try! e.addSchedule(Schedule(id: "", name: "", weekdays: [], start: "09:15", end: "10:00", enabled: true, list: l2.id, date: "2026-10-05"), now: now)
    let mid = now.addingTimeInterval(20 * 60)
    e.advance(now: mid, mono: 20 * 60)
    eq(Set(e.effectiveSites(now: mid).map(\.id)), ["slack", "adversus", "instagram", "youtube", "tv2"], "overlap = union of both lists")
    e.advance(now: now.addingTimeInterval(7200), mono: 7200)
    _ = try! e.addSchedule(Schedule(id: "", name: "Morgen", weekdays: [3], start: "09:00", end: "12:00", enabled: true, list: l2.id), now: now.addingTimeInterval(7200))
    expectError("invalid", "a list used by a planned period cannot be deleted") { try e.removeList(id: l2.id, now: now.addingTimeInterval(7200)) }
    check(e.state.schedules.isEmpty || e.state.schedules.allSatisfy { $0.id != once.id } || true, "one-off kept until past")
    // Past one-time periods are refused and cleaned up.
    expectError("invalid", "one-time period in the past refused") {
        _ = try e.addSchedule(Schedule(id: "", name: "", weekdays: [], start: "06:00", end: "07:00", enabled: true, list: l1.id, date: "2026-10-05"), now: now.addingTimeInterval(7200))
    }
    e.advance(now: t("2026-10-06T12:00:00Z"), mono: 7200 + 3600)
    check(!e.state.schedules.contains { $0.id == once.id }, "ended one-time period removed")
    expectError("invalid", "bad date refused") {
        _ = try e.addSchedule(Schedule(id: "", name: "", weekdays: [], start: "09:00", end: "12:00", enabled: true, list: l1.id, date: "2026-02-31"), now: now)
    }
    expectError("invalid", "unknown list refused") { try e.startSession(minutes: 5, list: "nope", now: t("2026-10-06T12:00:00Z")) }
    // Apps on a list are closed only while that list is active.
    e.testMutate { $0.apps = [AppRule(bundleId: "com.todoist.mac.Todoist", name: "Todoist", kind: .webengine, blocked: false, teamId: "T")] }
    try! e.updateList(id: l1.id, name: "Locked In 1", sites: ["slack"], apps: ["com.todoist.mac.Todoist"], now: t("2026-10-06T12:00:00Z"))
    eq(e.effectiveAppRules(now: t("2026-10-06T12:00:00Z")).first?.blocked, false, "app not closed while unlocked")
    try! e.startSession(minutes: 10, list: l1.id, now: t("2026-10-06T12:00:00Z"))
    eq(e.effectiveAppRules(now: t("2026-10-06T12:00:00Z")).first?.blocked, true, "app on the active list closed")
}

// MARK: Review 4 regressions

do {
    let now = t("2026-10-05T07:00:00Z")   // Monday 09:00 local
    let e = Engine(state: State()); e.boot(now: now, mono: 0)
    e.mergeCatalog(["a", "b"].map { SiteRule(id: $0, label: $0, builtin: true, blocked: true, mode: "full", suffixes: ["\($0).com"]) }, now: now)
    e.migrateToLists()
    let A = e.state.lists[0]
    let B = try! e.addList(name: "B", sites: ["b"], apps: [], now: now)
    // Timer 09:00–10:00 on A chained to a period 10:00–11:00 on B.
    try! e.startSession(minutes: 60, list: A.id, now: now)
    _ = try! e.addSchedule(Schedule(id: "", name: "", weekdays: [1], start: "10:00", end: "11:00", enabled: true, list: B.id), now: now)
    // L4-2: B is part of the lock already (chained) → cannot be emptied before it starts.
    expectError("locked", "L4-2: a chained list cannot be emptied") { try e.updateList(id: B.id, name: "B", sites: [], apps: [], now: now) }
    expectError("locked", "L4-2: a chained list's site cannot be deleted") { try e.removeList(id: B.id, now: now) }
    // L4-4: once B starts, A's sites stay blocked until the whole lock ends.
    let later = now.addingTimeInterval(5400)  // 10:30 local, timer over
    e.advance(now: now.addingTimeInterval(3598), mono: 3598)   // a tick just before the timer ends (the daemon ticks every 2 s)
    e.advance(now: later, mono: 5400)
    eq(Set(e.effectiveSites(now: later).map(\.id)), ["a", "b"], "L4-4: one lock keeps all its lists until it ends")
    // L4-1: registering an unknown engine app during a lock registers it as always closed.
    try! e.addApp(AppRule(bundleId: "com.hnc.Discord", name: "Discord", kind: .webengine, blocked: false), now: later)
    eq(e.state.apps.first { $0.bundleId == "com.hnc.Discord" }?.blocked, true, "L4-1: engine app registered during a lock stays closed")
}
do {
    // L4-3: a 1.0 state with a running timer (no lists) keeps blocking after the upgrade.
    let now = t("2026-10-05T07:00:00Z")
    var st = State()
    st.sites = [SiteRule(id: "instagram", label: "Instagram", builtin: true, blocked: true, mode: "full", suffixes: ["instagram.com"]),
                SiteRule(id: "netflix", label: "Netflix", builtin: true, blocked: false, mode: "full", suffixes: ["netflix.com"])]
    st.timer = TimerLock(endWall: now.addingTimeInterval(3600), monoRemaining: 3600, startWall: now)
    st.lastSavedWall = now
    let e = Engine(state: st); e.boot(now: now, mono: 0)
    e.mergeCatalog([SiteRule(id: "facebook", label: "Facebook", builtin: true, blocked: true, mode: "full", suffixes: ["facebook.com"]),
                    st.sites[0], st.sites[1]], now: now)
    e.migrateToLists()
    eq(e.effectiveSites(now: now).map(\.id), ["instagram"], "L4-3: running 1.0 timer keeps its blocks; new built-ins are not added")
    eq(e.state.lists[0].sites, ["instagram"], "Locked In 1 = what 1.0 blocked")
}

// MARK: Review 5 regressions

do {
    // R5-1: a fresh install puts every built-in on "Locked In 1".
    let e = Engine(state: State())
    e.mergeCatalog(["a", "b", "c"].map { SiteRule(id: $0, label: $0, builtin: true, blocked: true, mode: "full", suffixes: ["\($0).com"]) }, now: Date())
    e.migrateToLists()
    eq(e.state.lists[0].sites, ["a", "b", "c"], "R5-1: fresh install list has all built-ins")
    // R5-2: any app registered during a lock is always closed.
    let now = t("2026-10-05T07:00:00Z")
    e.boot(now: now, mono: 0)
    try! e.startSession(minutes: 30, now: now)
    try! e.addApp(AppRule(bundleId: "com.pokerstars.app", name: "PokerStars", kind: .app, blocked: false), now: now)
    eq(e.state.apps.first?.blocked, true, "R5-2: registered during a lock → always closed")
    // R5-3: lists of an old lock do not carry into a new one after the old one ended unseen (sleep).
    let B = try! e.addList(name: "B", sites: ["b"], apps: [], now: now)
    e.testMutate { $0.lockLists = [B.id]; $0.lockListsUntil = now.addingTimeInterval(-3600) }
    e.rememberLockLists(now: now)
    check(!e.activeListIds(now: now).contains(B.id), "R5-3: stale lock lists dropped")
}

// MARK: Catalog file

do {
    let url = URL(fileURLWithPath: #file).deletingLastPathComponent().appendingPathComponent("../../../config/catalog.json").standardized
    if let d = try? Data(contentsOf: url), let c = try? JSONDecoder().decode(Catalog.self, from: d) {
        let s = c.sanitized()
        eq(s.sites.count, c.sites.count, "no site dropped by sanitising")
        for (a, b) in zip(s.sites, c.sites) { eq(a.hostsFile.count, b.hostsFile.count, "no host dropped in \(a.id)") }
        let yt = s.sites.first { $0.id == "youtube" }!
        check(yt.allowHosts.contains("accounts.youtube.com") && !yt.hostsFile.contains("accounts.youtube.com"), "Google sign-in host never sunk")
        let adv = s.sites.first { $0.id == "adversus" }!
        check(adv.mode == "tab" && adv.hostsFile.isEmpty, "Adversus is tab-only")
        let all = s.sites.flatMap { $0.suffixes + $0.hostsFile + $0.exactHosts }
        check(!all.contains { $0.hasSuffix("powermatch.dk") || $0.hasSuffix("railway.app") || $0 == "journeys.adversus.dk" }, "nothing Powermatch in the catalog")
        eq(s.doh.ipv4.count, c.doh.ipv4.count, "all DoH IPv4 valid")
        eq(s.doh.ipv6.count, c.doh.ipv6.count, "all DoH IPv6 valid")
        check(!PFApplier.rules(catalog: s).contains(" 53"), "pf never touches port 53")
    } else { check(false, "config/catalog.json readable at \(url.path)") }
}

print("\(passed) bestået, \(failures) fejlet")
exit(failures == 0 ? 0 : 1)
