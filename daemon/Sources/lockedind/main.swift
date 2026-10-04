import Foundation
import LockedInCore
import SystemConfiguration
import IOKit

// lockedind — runs as root from /Library/LaunchDaemons/dk.lockedin.daemon.plist (RunAtLoad, KeepAlive).
// Enforcement never depends on the HTTP API, and a block is lifted only by a tick that has positively computed
// "unlocked" from a readable state.

setvbuf(stdout, nil, _IOLBF, 0)
let stampFormatter = ISO8601DateFormatter()
func log(_ s: String) { print("\(stampFormatter.string(from: Date())) \(s)") }

guard getuid() == 0 else { log("lockedind skal køre som root"); exit(1) }

let supportDir = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "/Library/Application Support/LockedIn")
try? FileManager.default.createDirectory(at: supportDir, withIntermediateDirectories: true)
chmod(supportDir.path, 0o755)

let queue = DispatchQueue(label: "dk.lockedin.daemon")
let store = Store(directory: supportDir)
let engine = Engine(state: store.load())
if store.loadFailed {
    log("ADVARSEL: state.json kunne ikke læses — filen bevares, blokeringer holdes som de var, ændringer afvises")
}

func monoSeconds() -> Double { Double(clock_gettime_nsec_np(CLOCK_MONOTONIC)) / 1e9 }

var catalog: Catalog?
let catalogURL = supportDir.appendingPathComponent("catalog.json")
if let d = try? Data(contentsOf: catalogURL), let c = try? JSONDecoder().decode(Catalog.self, from: d) {
    catalog = c.sanitized()
} else {
    log("ADVARSEL: catalog.json mangler eller er ugyldig")
}

let apps = AppControl()
func consoleHome() -> String? {
    var uid: uid_t = 0
    guard let user = SCDynamicStoreCopyConsoleUser(nil, &uid, nil) as String?, user != "loginwindow", uid >= 500,
          let pw = getpwuid(uid) else { return nil }
    return String(cString: pw.pointee.pw_dir)
}

engine.boot(now: Date(), mono: monoSeconds())
if !store.loadFailed {
    if let c = catalog { engine.mergeCatalog(c.sites, now: Date()) }
    let installedNow = apps.installed(consoleUserHome: consoleHome())
    // First run: everything installed today is known. Browsers start blocked; apps with a web engine start allowed.
    if !engine.state.appsSeeded { engine.seedApps(installedNow.filter { $0.kind != .app }) }
    engine.fillMissingTeamIds(installedNow)
}

// MARK: Watchdog (review 2, N1/N2/N10)
// Chrome is closed during a lock only when ALL hold: the profile force-installs the extension, a verified heartbeat
// from the real Chrome has been seen at least once (ever), no verified heartbeat for 120 s of AWAKE time (uptime
// excludes sleep), the user is actively using the Mac (HID idle < 60 s — never after wake, in dark wake or App Nap),
// and that has been true on ticks spanning at least 30 s.
func uptime() -> Double { Double(clock_gettime_nsec_np(CLOCK_UPTIME_RAW)) / 1e9 }
var lastHeartbeatUptime = uptime()          // daemon start counts as a fresh grace period
var staleSinceUptime: Double?
var lastTickWall = Date()

func hidIdleSeconds() -> Double {
    let svc = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOHIDSystem"))
    guard svc != 0 else { return .infinity }
    defer { IOObjectRelease(svc) }
    guard let v = IORegistryEntryCreateCFProperty(svc, "HIDIdleTime" as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue(),
          let ns = (v as? NSNumber)?.doubleValue else { return .infinity }
    return ns / 1e9
}

/// True when Chrome's machine policy (the Locked in configuration profile) force-installs the extension.
func watchdogArmed() -> Bool {
    guard let d = NSDictionary(contentsOfFile: "/Library/Managed Preferences/com.google.Chrome.plist"),
          let list = d["ExtensionInstallForcelist"] as? [String] else { return false }
    return list.contains { $0.hasPrefix("nildondjeeibacombanbjnokenmhfhie") }
}

let hosts = HostsApplier()
let pf = PFApplier()
var report = EnforcementReport()
var dirty = true
var wasLocked: Bool?
var wasLockedForDeep = false
var lastLogCheck = Date.distantPast

/// launchd keeps our stdout open on the log file, so rotation by newsyslog would leave us writing to a deleted inode
/// (review 2, L5). Instead the log is truncated in place once it passes 5 MB (launchd opens it with O_APPEND).
func trimLogIfNeeded(_ now: Date) {
    guard now.timeIntervalSince(lastLogCheck) > 3600 else { return }
    lastLogCheck = now
    var st = stat()
    if fstat(STDOUT_FILENO, &st) == 0, st.st_size > 5 * 1024 * 1024 { ftruncate(STDOUT_FILENO, 0); log("log nulstillet (over 5 MB)") }
}
var lastSave = Date.distantPast

func save() {
    // Never overwrite a state file we could not read: it may hold a running lock.
    guard !store.loadFailed else { return }
    do { try store.save(engine.state, now: Date()); dirty = false; lastSave = Date() } catch { log("kunne ikke gemme state: \(error)") }
}

func tick() {
    let now = Date()
    engine.advance(now: now, mono: monoSeconds())
    if store.loadFailed {
        report.problems = ["state.json kunne ikke læses — blokeringer holdes som de var. En administrator skal se på det."]
        report.lastTick = now
        return
    }
    let locked = engine.isLocked(now)
    var problems: [String] = []

    if locked {
        let section = HostsFile.section(HostsFile.hostnames(sites: engine.blockedSites(), catalog: catalog))
        switch hosts.apply(section: section) {
        case .written: log("hosts opdateret (\(section.split(separator: "\n").count) linjer)"); report.hostsOK = true
        case .unchanged: report.hostsOK = true
        case .failed(let why): report.hostsOK = false; problems.append(why)
        }
        if let c = catalog, let p = pf.enforce(catalog: c) { problems.append(p); report.pfOK = false } else { report.pfOK = true }
        // A gap between ticks means the Mac slept: start a fresh grace period instead of judging a stale heartbeat.
        if now.timeIntervalSince(lastTickWall) > 10 { lastHeartbeatUptime = uptime(); staleSinceUptime = nil }
        var heartbeatOK = true
        if watchdogArmed() && engine.state.lastHeartbeat != nil {
            let stale = uptime() - lastHeartbeatUptime >= 120 && hidIdleSeconds() < 60
            if stale {
                if staleSinceUptime == nil { staleSinceUptime = uptime() }
                heartbeatOK = uptime() - staleSinceUptime! < 30
            } else {
                staleSinceUptime = nil
            }
        }
        let o = apps.enforce(rules: engine.state.apps, heartbeatOK: heartbeatOK, now: now)
        for r in o.recorded { engine.recordUnknownApp(r); dirty = true }
        for k in o.killed { log("lukket: \(k)") }
        if !o.killed.isEmpty { report.recentKills = Array((o.killed + report.recentKills).prefix(20)) }
        problems += o.problems
        report.appControlOK = o.problems.isEmpty
    } else {
        switch hosts.apply(section: "") {
        case .written: log("hosts: blokering fjernet"); report.hostsOK = true
        case .unchanged: report.hostsOK = true
        case .failed(let why): report.hostsOK = false; problems.append(why)
        }
        pf.release()
        report.pfOK = true
        report.appControlOK = true
    }
    if wasLocked != locked {
        log(locked ? "LÅST til \(engine.status(now: now).activeUntil.map { stampFormatter.string(from: $0) } ?? "?")" : "ulåst")
        wasLocked = locked
        dirty = true
    }
    if !locked && wasLockedForDeep { apps.resetDeepVerify() }
    wasLockedForDeep = locked
    report.problems = problems
    report.lastTick = now
    lastTickWall = now
    trimLogIfNeeded(now)
    // While locked, persist the monotonic budget once a minute so powered-off time is counted from a fresh point.
    if dirty || (locked && now.timeIntervalSince(lastSave) >= 60) { save() }
}

let api = API(engine: engine,
              installed: { apps.installed(consoleUserHome: consoleHome()) },
              report: { report },
              changed: { dirty = true; tick() })

/// The process on the other end of a local TCP connection, found by its client port.
func peerPid(_ port: UInt16?) -> Int32? {
    guard let port else { return nil }
    let r = Shell.output("/usr/sbin/lsof", ["-nP", "-a", "-iTCP:\(port)", "-sTCP:ESTABLISHED", "-t"], stdin: nil)
    return r.out.split(separator: "\n").compactMap { Int32($0.trimmingCharacters(in: .whitespaces)) }.first { $0 != getpid() }
}

func handle(_ req: HTTPRequest) -> HTTPResponse {
    if store.loadFailed && req.method != "GET" {
        return HTTPResponse(503, ["error": "unavailable", "message": "Locked in kan ikke gemme ændringer lige nu."])
    }
    if req.path.hasPrefix("/v1/heartbeat") {
        // Only the real Chrome (i.e. the extension) may feed the watchdog — not a curl loop (review 2, N10).
        guard let pid = peerPid(req.peerPort), apps.isRealChromePid(pid) else {
            return HTTPResponse(403, ["error": "forbidden", "message": "Hjerteslag kun fra Chrome."])
        }
        lastHeartbeatUptime = uptime()
        staleSinceUptime = nil
    }
    return api.handle(req, now: Date())
}

// The API is a convenience; enforcement runs without it. If the port is taken (a user process can bind 0.0.0.0:919 on
// macOS — review 1, M4), close whoever holds it and try again, forever.
var server: LocalServer?
func startServer() {
    do {
        let s = try LocalServer(port: 919, queue: queue, handler: handle)
        s.start { e in
            log("server fejlede: \(e) — prøver igen")
            server = nil
            queue.asyncAfter(deadline: .now() + 5) { evictPortSquatters(); startServer() }
        }
        server = s
    } catch {
        log("kunne ikke åbne port 919: \(error) — prøver igen")
        queue.asyncAfter(deadline: .now() + 5) { evictPortSquatters(); startServer() }
    }
}
func evictPortSquatters() {
    let r = Shell.output("/usr/sbin/lsof", ["-nP", "-iTCP:919", "-sTCP:LISTEN", "-t"], stdin: nil)
    for line in r.out.split(separator: "\n") {
        if let pid = Int32(line.trimmingCharacters(in: .whitespaces)), pid != getpid() {
            log("lukker proces \(pid), som optager port 919")
            kill(pid, SIGKILL)
        }
    }
}
queue.async { startServer() }

let timer = DispatchSource.makeTimerSource(queue: queue)
timer.schedule(deadline: .now(), repeating: .seconds(2), leeway: .milliseconds(200))
timer.setEventHandler(handler: tick)
timer.resume()

var signalSources: [DispatchSourceSignal] = []
for sig in [SIGTERM, SIGINT, SIGHUP] {
    signal(sig, SIG_IGN)
    let s = DispatchSource.makeSignalSource(signal: sig, queue: queue)
    // Save and exit; blocks stay where they are (fail closed).
    s.setEventHandler { save(); log("stopper (signal \(sig)) — blokeringer bevares"); exit(0) }
    s.resume()
    signalSources.append(s)
}
log("lockedind \(API.version) startet — \(engine.state.sites.count) sider, \(engine.state.apps.count) apps, \(engine.state.schedules.count) faste tider")
dispatchMain()
