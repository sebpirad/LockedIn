import Foundation

public struct EngineError: Error, Equatable {
    public let status: Int
    public let code: String
    public let message: String
    static func locked() -> EngineError {
        EngineError(status: 423, code: "locked", message: "Kan ikke ændres under en aktiv session.")
    }
    static func invalid(_ m: String) -> EngineError { EngineError(status: 400, code: "invalid", message: m) }
    static func notFound(_ m: String) -> EngineError { EngineError(status: 404, code: "not_found", message: m) }
}

public struct LockStatus: Equatable {
    public var active: Bool
    public var activeUntil: Date?
    public var sources: [String]
    public var next: Interval?
}

/// The lock's rules. Pure: time comes in as arguments, nothing touches the system.
/// The single invariant: while `status(now).active`, no command may make the lock weaker.
public final class Engine {
    public private(set) var state: State
    /// Monotonic seconds (CLOCK_MONOTONIC, includes sleep) at the last `advance`.
    private var lastMono: Double?

    public init(state: State) { self.state = state }

    // MARK: Time

    /// Called once at daemon start: powered-off time is not seen by the monotonic clock, so subtract the wall gap
    /// since the last save. A wall clock that went backwards subtracts nothing.
    public func boot(now: Date, mono: Double) {
        if var t = state.timer {
            let gap = max(0, now.timeIntervalSince(state.lastSavedWall))
            t.monoRemaining = max(0, t.monoRemaining - gap)
            state.timer = t
        }
        lastMono = mono
        clearExpiredTimer(now: now)
    }

    /// Called on every tick.
    public func advance(now: Date, mono: Double) {
        if let last = lastMono, var t = state.timer {
            let d = max(0, mono - last)
            t.monoRemaining = max(0, t.monoRemaining - d)
            state.timer = t
        }
        lastMono = mono
        clearExpiredTimer(now: now)
    }

    /// Remaining timer seconds. The monotonic budget is authoritative: a wall clock jumping forward cannot end the
    /// lock early, and a wall clock set backwards can add at most `wallSlack` on top of it (review 1, M6).
    static let wallSlack: Double = 120
    func timerRemaining(now: Date) -> Double {
        guard let t = state.timer else { return 0 }
        // When the monotonic budget is spent, the timer is over — the slack never outlives it.
        guard t.monoRemaining > 0 else { return 0 }
        let wall = t.endWall.timeIntervalSince(now)
        return max(t.monoRemaining, min(wall, t.monoRemaining + Self.wallSlack))
    }

    private func clearExpiredTimer(now: Date) {
        if state.timer != nil && timerRemaining(now: now) <= 0 { state.timer = nil }
    }

    /// One continuous lock may never exceed this, however timer and schedules are chained (review 1, H2).
    public static let maxChain: Double = Limits.maxSessionSeconds + 60

    /// All lock intervals around `now`: schedule occurrences plus the timer from its start to its end.
    static func intervals(_ s: State, timerRemaining tr: Double, now: Date) -> [Interval] {
        var all = ScheduleMath.allOccurrences(s.schedules, around: now)
        if tr > 0, let t = s.timer {
            let start = min(t.startWall ?? now, now)
            all.append(Interval(start: start, end: now.addingTimeInterval(tr), source: "timer"))
        }
        return all.sorted { $0.start < $1.start }
    }

    /// Merges overlapping/back-to-back intervals into continuous locks.
    static func chains(_ ivs: [Interval]) -> [Interval] {
        var out: [Interval] = []
        for iv in ivs.sorted(by: { $0.start < $1.start }) {
            if var last = out.last, iv.start <= last.end {
                if iv.end > last.end { last.end = iv.end; out[out.count - 1] = last }
            } else {
                out.append(Interval(start: iv.start, end: iv.end, source: "chain"))
            }
        }
        return out
    }

    public func status(now: Date) -> LockStatus {
        let tr = timerRemaining(now: now)
        let all = Self.intervals(state, timerRemaining: tr, now: now)
        let active = all.filter { $0.start <= now && now < $0.end }
        var until: Date?
        var isActive = false
        if let chain = Self.chains(all).first(where: { $0.start <= now && now < $0.end }) {
            // Defensive cap: even if stored schedules chain past 24 h (state from an older version), the lock ends.
            let capped = min(chain.end, chain.start.addingTimeInterval(Self.maxChain))
            if now < capped { isActive = true; until = capped }
        }
        let next = all.first { $0.start > now && $0.source != "timer" && (until == nil || $0.start > until!) }
        var sources: [String] = []
        if isActive { for s in active.map(\.source) where !sources.contains(s) { sources.append(s) } }
        return LockStatus(active: isActive, activeUntil: until, sources: sources, next: next)
    }

    public func isLocked(_ now: Date) -> Bool { status(now: now).active }

    /// Rejects a candidate state in which any continuous lock in the next 8 days would last longer than 24 h.
    func checkChains(_ candidate: State, timerRemaining tr: Double, now: Date) throws {
        for c in Self.chains(Self.intervals(candidate, timerRemaining: tr, now: now)) where c.end > now {
            if c.end.timeIntervalSince(c.start) > Self.maxChain {
                throw EngineError.invalid("En samlet lås kan højst vare 24 timer.")
            }
        }
    }

    // MARK: Commands

    public func startSession(minutes: Int, now: Date) throws {
        guard (1...1440).contains(minutes) else { throw EngineError.invalid("Vælg mellem 1 minut og 24 timer.") }
        try lock(seconds: Double(minutes) * 60, now: now)
    }

    /// "Locked in indtil kl. 15:00": ends exactly at `until`. Only a later time is accepted, at most 24 h ahead.
    public func startSession(until: Date, now: Date) throws {
        let secs = until.timeIntervalSince(now)
        guard secs >= 60 else { throw EngineError.invalid("Vælg et senere tidspunkt.") }
        guard secs <= Limits.maxSessionSeconds else { throw EngineError.invalid("En samlet lås kan højst vare 24 timer.") }
        try lock(seconds: secs, now: now)
    }

    /// New end = max(current end, now + seconds). Never shortens; the whole continuous lock stays within 24 h.
    private func lock(seconds secs: Double, now: Date) throws {
        guard secs <= Limits.maxSessionSeconds else { throw EngineError.invalid("En samlet lås kan højst vare 24 timer.") }
        let current = timerRemaining(now: now)
        var t = state.timer ?? TimerLock(endWall: now, monoRemaining: 0, startWall: now)
        if current <= 0 { t = TimerLock(endWall: now, monoRemaining: 0, startWall: now) }
        t.endWall = max(t.endWall, now.addingTimeInterval(secs))
        t.monoRemaining = max(current, secs)
        if t.startWall == nil { t.startWall = now }
        var candidate = state
        candidate.timer = t
        try checkChains(candidate, timerRemaining: max(current, secs), now: now)
        state.timer = t
    }

    // Sites

    public func addSite(label: String, domain raw: String, now: Date) throws -> SiteRule {
        let domain = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let stripped = Validation.stripWww(domain)
        guard Validation.isDomain(stripped) else {
            throw EngineError.invalid("Ugyldigt domæne. Skriv fx reddit.com.")
        }
        let name = label.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.count <= Limits.maxLabel, Validation.isSafeLabel(name) else {
            throw EngineError.invalid("Navnet skal være 1–40 tegn.")
        }
        guard state.sites.count < Limits.maxSites else { throw EngineError.invalid("Der kan højst være 200 hjemmesider.") }
        let id = "c-" + stripped   // dots kept: "a-b.c.com" and "a.b-c.com" must not collide
        if let i = state.sites.firstIndex(where: { $0.id == id || ($0.suffixes.contains(stripped)) }) {
            // Already there: adding again only ever strengthens it.
            state.sites[i].blocked = true
            return state.sites[i]
        }
        let site = SiteRule(id: id, label: name, builtin: false, blocked: true, mode: "full",
                            suffixes: [stripped], hostsFile: [stripped, "www." + stripped, "m." + stripped])
        state.sites.append(site)
        return site
    }

    public func setSiteBlocked(id: String, blocked: Bool, now: Date) throws {
        guard let i = state.sites.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Hjemmesiden findes ikke.") }
        if !blocked && state.sites[i].blocked && isLocked(now) { throw EngineError.locked() }
        state.sites[i].blocked = blocked
    }

    public func removeSite(id: String, now: Date) throws {
        guard let i = state.sites.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Hjemmesiden findes ikke.") }
        if state.sites[i].builtin { throw EngineError.invalid("Indbyggede hjemmesider kan ikke slettes, kun slås fra.") }
        if isLocked(now) { throw EngineError.locked() }
        state.sites.remove(at: i)
    }

    // Apps

    public func addApp(_ app: AppRule, now: Date) throws {
        guard Validation.isBundleId(app.bundleId) else { throw EngineError.invalid("Ugyldig app.") }
        if Validation.protectedBundleIds.contains(app.bundleId) {
            throw EngineError.invalid("Chrome kan ikke blokeres — Locked in kører i Chrome.")
        }
        if let i = state.apps.firstIndex(where: { $0.bundleId == app.bundleId }) {
            state.apps[i].blocked = true
            return
        }
        guard state.apps.count < Limits.maxApps else { throw EngineError.invalid("Der kan højst være 300 apps.") }
        var a = app
        a.blocked = true
        a.name = String(a.name.prefix(80))
        state.apps.append(a)
    }

    /// Daemon-internal: an unknown browser/web-engine app seen during a lock is recorded as blocked (a strengthening).
    public func recordUnknownApp(_ app: AppRule) {
        guard !state.apps.contains(where: { $0.bundleId == app.bundleId }), state.apps.count < Limits.maxApps else { return }
        var a = app
        a.blocked = true
        state.apps.append(a)
    }

    public func setAppBlocked(bundleId: String, blocked: Bool, now: Date) throws {
        guard let i = state.apps.firstIndex(where: { $0.bundleId == bundleId }) else { throw EngineError.notFound("Appen findes ikke på listen.") }
        if !blocked && (state.apps[i].kind == .browser || AppPolicy.knownBrowsers.contains(bundleId)) {
            throw EngineError.invalid("Andre browsere end Chrome er altid lukket under fokus.")
        }
        if !blocked && state.apps[i].blocked && isLocked(now) { throw EngineError.locked() }
        state.apps[i].blocked = blocked
    }

    public func removeApp(bundleId: String, now: Date) throws {
        guard let i = state.apps.firstIndex(where: { $0.bundleId == bundleId }) else { throw EngineError.notFound("Appen findes ikke på listen.") }
        if isLocked(now) { throw EngineError.locked() }
        state.apps.remove(at: i)
    }

    // Schedules

    func validate(_ s: Schedule) throws {
        guard ScheduleMath.minutes(s.start) != nil, ScheduleMath.minutes(s.end) != nil else {
            throw EngineError.invalid("Tider skal skrives som TT:MM.")
        }
        guard s.start != s.end else { throw EngineError.invalid("Start og slut kan ikke være det samme.") }
        guard !s.weekdays.isEmpty, s.weekdays.allSatisfy({ (1...7).contains($0) }), Set(s.weekdays).count == s.weekdays.count else {
            throw EngineError.invalid("Vælg mindst én ugedag.")
        }
        let n = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard n.count <= Limits.maxLabel, Validation.isSafeLabel(n) || n.isEmpty else {
            throw EngineError.invalid("Navnet skal være højst 40 tegn.")
        }
    }

    public func addSchedule(_ input: Schedule, now: Date) throws -> Schedule {
        var s = input
        s.id = Validation.newId()
        s.name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
        s.weekdays = s.weekdays.sorted()
        try validate(s)
        guard state.schedules.count < Limits.maxSchedules else { throw EngineError.invalid("Der kan højst være 50 faste tider.") }
        var candidate = state
        candidate.schedules.append(s)
        try checkChains(candidate, timerRemaining: timerRemaining(now: now), now: now)
        state.schedules.append(s)
        return s
    }

    public func updateSchedule(_ input: Schedule, now: Date) throws {
        guard let i = state.schedules.firstIndex(where: { $0.id == input.id }) else { throw EngineError.notFound("Den faste tid findes ikke.") }
        var s = input
        s.name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
        s.weekdays = s.weekdays.sorted()
        try validate(s)
        if isLocked(now) && s != state.schedules[i] { throw EngineError.locked() }
        var candidate = state
        candidate.schedules[i] = s
        try checkChains(candidate, timerRemaining: timerRemaining(now: now), now: now)
        state.schedules[i] = s
    }

    public func removeSchedule(id: String, now: Date) throws {
        guard let i = state.schedules.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Den faste tid findes ikke.") }
        if isLocked(now) { throw EngineError.locked() }
        state.schedules.remove(at: i)
    }

    public func heartbeat(now: Date) { state.lastHeartbeat = now }

    /// Tests only: set up state directly.
    public func testMutate(_ f: (inout State) -> Void) { f(&state) }

    // MARK: Catalog

    /// Merge built-in sites from the catalog: new ones are added (blocked), existing ones get fresh domain data
    /// but keep the user's blocked flag. A built-in removed from the catalog is dropped only while unlocked.
    public func mergeCatalog(_ catalog: [SiteRule], now: Date) {
        let locked = isLocked(now)
        for c in catalog {
            if let i = state.sites.firstIndex(where: { $0.id == c.id }) {
                let prev = state.sites[i]
                var n = c
                n.blocked = prev.blocked
                if locked {
                    // A catalog swapped in during a lock (e.g. a reinstall) may only add domains, never remove them.
                    func union(_ a: [String], _ b: [String]) -> [String] { a + b.filter { !a.contains($0) } }
                    n.suffixes = union(prev.suffixes, c.suffixes)
                    n.exactHosts = union(prev.exactHosts, c.exactHosts)
                    n.regexFilters = union(prev.regexFilters, c.regexFilters)
                    n.hostsFile = union(prev.hostsFile, c.hostsFile)
                    n.allowHosts = prev.allowHosts.filter(c.allowHosts.contains)
                    if prev.mode == "full" { n.mode = "full" }
                }
                state.sites[i] = n
            } else {
                state.sites.append(c)
            }
        }
        if !locked {
            let ids = Set(catalog.map(\.id))
            state.sites.removeAll { $0.builtin && !ids.contains($0.id) }
        }
    }

    /// Rules created before signatures were recorded get the team of the copy installed now.
    public func fillMissingTeamIds(_ installed: [AppRule]) {
        for i in state.apps.indices where state.apps[i].teamId == nil {
            state.apps[i].teamId = installed.first { $0.bundleId == state.apps[i].bundleId }?.teamId
        }
    }

    public func seedApps(_ apps: [AppRule]) {
        guard !state.appsSeeded else { return }
        for a in apps where !state.apps.contains(where: { $0.bundleId == a.bundleId }) && !Validation.protectedBundleIds.contains(a.bundleId) {
            state.apps.append(a)
        }
        state.appsSeeded = true
    }

    // MARK: Effective block sets

    public func blockedSites() -> [SiteRule] { state.sites.filter(\.blocked) }
}
