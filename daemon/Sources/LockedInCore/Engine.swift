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
    /// Start of the continuous lock in force (the 24 h cap counts from here).
    public var activeSince: Date? = nil
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
        rememberLockLists(now: now)
        if !isLocked(now) { dropPastOneOffs(now: now) }
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
        var since: Date?
        var isActive = false
        if let chain = Self.chains(all).first(where: { $0.start <= now && now < $0.end }) {
            // Defensive cap: even if stored schedules chain past 24 h (state from an older version), the lock ends.
            let capped = min(chain.end, chain.start.addingTimeInterval(Self.maxChain))
            if now < capped { isActive = true; until = capped; since = chain.start }
        }
        let next = all.first { $0.start > now && $0.source != "timer" && (until == nil || $0.start > until!) }
        var sources: [String] = []
        if isActive { for s in active.map(\.source) where !sources.contains(s) { sources.append(s) } }
        return LockStatus(active: isActive, activeUntil: until, activeSince: since, sources: sources, next: next)
    }

    public func isLocked(_ now: Date) -> Bool { status(now: now).active }

    /// Rejects a candidate state that CREATES or LENGTHENS a continuous lock of more than 24 h in the next 8 days.
    /// An over-long chain that already exists (e.g. a weekend plan that grows by an hour on the DST Sunday) does not
    /// block unrelated actions — `status()` caps it at 24 h (review 2, N3).
    func checkChains(_ candidate: State, timerRemaining tr: Double, now: Date) throws {
        let current = Self.chains(Self.intervals(state, timerRemaining: timerRemaining(now: now), now: now))
        for c in Self.chains(Self.intervals(candidate, timerRemaining: tr, now: now)) where c.end > now {
            guard c.end.timeIntervalSince(c.start) > Self.maxChain else { continue }
            let preexisting = current.contains { $0.start <= c.start && $0.end >= c.end }
            if !preexisting { throw EngineError.invalid("En samlet lås kan højst vare 24 timer.") }
        }
    }

    // MARK: Block lists

    /// "Locked In 1" is created from v1.0's per-site/app blocked flags (or from the catalog on a fresh install).
    public func migrateToLists() {
        guard !state.listsMigrated else { return }
        if state.lists.isEmpty {
            state.lists = [BlockList(id: Validation.newId(), name: "Locked In 1",
                                     sites: state.sites.filter(\.blocked).map(\.id), apps: [])]
        }
        let first = state.lists[0].id
        for i in state.schedules.indices where state.schedules[i].list.isEmpty { state.schedules[i].list = first }
        if var t = state.timer, t.lists.isEmpty { t.lists = [first]; state.timer = t }
        state.listsMigrated = true
    }

    func listId(_ requested: String?) throws -> String {
        if state.lists.isEmpty { migrateToLists() }
        let id = (requested?.isEmpty == false ? requested! : state.lists.first?.id) ?? ""
        guard state.lists.contains(where: { $0.id == id }) else { throw EngineError.invalid("Vælg en liste.") }
        return id
    }

    /// The list id of a source ("timer" or "schedule:<id>"). A timer without lists (written by 1.0) uses the first list.
    func lists(ofSource src: String) -> [String] {
        let first = state.lists.first?.id ?? ""
        if src == "timer" { let l = state.timer?.lists ?? []; return l.isEmpty ? [first] : l }
        guard let sc = state.schedules.first(where: { "schedule:\($0.id)" == src }) else { return [] }
        return [sc.list.isEmpty ? first : sc.list]
    }

    /// Sources of the continuous lock around `now`, restricted to those that have started by `upTo`.
    func chainSources(now: Date, upTo: Date?) -> [String] {
        let st = status(now: now)
        guard st.active, let since = st.activeSince, let until = st.activeUntil else { return [] }
        let limit = min(upTo ?? until, until)
        let all = Self.intervals(state, timerRemaining: timerRemaining(now: now), now: now)
        var out: [String] = []
        for iv in all where iv.start < limit && iv.end > since && !out.contains(iv.source) { out.append(iv.source) }
        return out
    }

    /// Lists in force right now: every list that has been part of the current continuous lock so far. One lock blocks
    /// everything from all its lists until it ends — Chrome's fail-closed rules behave the same (review 4, L4-4).
    public func activeListIds(now: Date) -> [String] {
        guard isLocked(now) else { return [] }
        var seen = Set<String>()
        let current = chainSources(now: now, upTo: now.addingTimeInterval(0.001)).flatMap { lists(ofSource: $0) }
        let known = Set(state.lists.map(\.id))
        let remembered = sameLock(now) ? state.lockLists : []
        return (remembered + current).filter { known.contains($0) && seen.insert($0).inserted }
    }

    /// Remembers the running lock's lists (called on every tick and after every command).
    public func rememberLockLists(now: Date) {
        guard isLocked(now) else {
            if !state.lockLists.isEmpty || state.lockListsUntil != nil { state.lockLists = []; state.lockListsUntil = nil }
            return
        }
        if !sameLock(now) { state.lockLists = []; state.lockListsUntil = nil }   // review 5, R5-3
        let ids = activeListIds(now: now)
        if ids != state.lockLists { state.lockLists = ids }
        if let u = status(now: now).activeUntil, u > (state.lockListsUntil ?? .distantPast) { state.lockListsUntil = u }
    }

    /// The remembered lists belong to the lock running now (it had not ended when they were recorded).
    func sameLock(_ now: Date) -> Bool { state.lockListsUntil.map { now <= $0.addingTimeInterval(5) } ?? false }

    /// Lists that may only grow right now: those of every source in the current lock, including periods that are
    /// chained to it later (review 4, L4-2).
    public func frozenListIds(now: Date) -> Set<String> {
        isLocked(now) ? Set(chainSources(now: now, upTo: nil).flatMap { lists(ofSource: $0) } + (sameLock(now) ? state.lockLists : [])) : []
    }

    func activeLists(_ now: Date) -> [BlockList] {
        let ids = activeListIds(now: now)
        return state.lists.filter { ids.contains($0.id) }
    }

    /// Sites blocked right now (empty when unlocked).
    public func effectiveSites(now: Date) -> [SiteRule] {
        let ids = Set(activeLists(now).flatMap(\.sites))
        return state.sites.filter { ids.contains($0.id) }
    }

    /// The app rules for app control: an app is closed if it is "always closed" (browsers, unknown engines) or in an
    /// active list.
    public func effectiveAppRules(now: Date) -> [AppRule] {
        let siteApps = Set(effectiveSites(now: now).flatMap(\.apps))
        let ids = Set(activeLists(now).flatMap(\.apps)).union(siteApps)
        var rules = state.apps.map { a -> AppRule in
            var r = a
            r.blocked = !a.neverClose && (a.blocked || ids.contains(a.bundleId))
            return r
        }
        // A service's desktop app that LockedIn has never seen (e.g. Slack installed later) is still closed.
        for id in siteApps where !rules.contains(where: { $0.bundleId == id }) && Validation.isBundleId(id) {
            rules.append(AppRule(bundleId: id, name: id, kind: .app, blocked: true))
        }
        return rules
    }

    func cleanList(name: String, sites: [String], apps: [String]) throws -> (String, [String], [String]) {
        let n = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !n.isEmpty, n.count <= Limits.maxLabel, Validation.isSafeLabel(n) else { throw EngineError.invalid("Navnet skal være 1–40 tegn.") }
        var seen = Set<String>()
        let sIds = sites.filter { id in state.sites.contains { $0.id == id } && seen.insert("s" + id).inserted }
        let aIds = apps.filter { id in state.apps.contains { $0.bundleId == id && !$0.neverClose } && seen.insert("a" + id).inserted }
        return (n, sIds, aIds)
    }

    public func addList(name: String, sites: [String], apps: [String], now: Date) throws -> BlockList {
        guard state.lists.count < Limits.maxLists else { throw EngineError.invalid("Der kan højst være 20 lister.") }
        let (n, sIds, aIds) = try cleanList(name: name, sites: sites, apps: apps)
        let l = BlockList(id: Validation.newId(), name: n, sites: sIds, apps: aIds)
        state.lists.append(l)
        return l
    }

    /// A list in use by the running lock may only grow (rename is fine).
    public func updateList(id: String, name: String, sites: [String], apps: [String], now: Date) throws {
        guard let i = state.lists.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Listen findes ikke.") }
        let (n, sIds, aIds) = try cleanList(name: name, sites: sites, apps: apps)
        let old = state.lists[i]
        if frozenListIds(now: now).contains(id) && (!Set(old.sites).isSubset(of: sIds) || !Set(old.apps).isSubset(of: aIds)) {
            throw EngineError.locked()
        }
        state.lists[i] = BlockList(id: id, name: n, sites: sIds, apps: aIds)
    }

    public func removeList(id: String, now: Date) throws {
        guard let i = state.lists.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Listen findes ikke.") }
        if frozenListIds(now: now).contains(id) { throw EngineError.locked() }
        guard state.lists.count > 1 else { throw EngineError.invalid("Der skal være mindst én liste.") }
        if let sc = state.schedules.first(where: { $0.list == id }) {
            throw EngineError.invalid("Listen bruges af \(sc.name.isEmpty ? "en planlagt periode" : sc.name).")
        }
        state.lists.remove(at: i)
    }

    // MARK: Sessions

    public func startSession(minutes: Int, list: String? = nil, now: Date) throws {
        guard (1...1440).contains(minutes) else { throw EngineError.invalid("Vælg mellem 1 minut og 24 timer.") }
        try lock(seconds: Double(minutes) * 60, list: try listId(list), now: now)
    }

    /// "Locked in indtil kl. 15:00": ends exactly at `until`. Only a later time is accepted, at most 24 h ahead.
    public func startSession(until: Date, list: String? = nil, now: Date) throws {
        let secs = until.timeIntervalSince(now)
        guard secs >= 60 else { throw EngineError.invalid("Vælg et senere tidspunkt.") }
        guard secs <= Limits.maxSessionSeconds else { throw EngineError.invalid("En samlet lås kan højst vare 24 timer.") }
        try lock(seconds: secs, list: try listId(list), now: now)
    }

    /// New end = max(current end, now + seconds). Never shortens; the whole continuous lock stays within 24 h.
    /// Starting again during a lock with another list adds that list.
    private func lock(seconds secs: Double, list: String, now: Date) throws {
        guard secs <= Limits.maxSessionSeconds else { throw EngineError.invalid("En samlet lås kan højst vare 24 timer.") }
        let current = timerRemaining(now: now)
        var t = state.timer ?? TimerLock(endWall: now, monoRemaining: 0, startWall: now)
        if current <= 0 { t = TimerLock(endWall: now, monoRemaining: 0, startWall: now) }
        t.endWall = max(t.endWall, now.addingTimeInterval(secs))
        t.monoRemaining = max(current, secs)
        if t.startWall == nil { t.startWall = now }
        if !t.lists.contains(list) { t.lists.append(list) }
        var candidate = state
        candidate.timer = t
        try checkChains(candidate, timerRemaining: max(current, secs), now: now)
        state.timer = t
        rememberLockLists(now: now)
    }

    // MARK: Sites

    /// Adds an own website; with `list`, also puts it on that list (always allowed — it only adds a block).
    public func addSite(label: String, domain raw: String, list: String? = nil, now: Date) throws -> SiteRule {
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
        let id = "c-" + stripped   // dots kept: "a-b.c.com" and "a.b-c.com" must not collide
        var site: SiteRule
        if let existing = state.sites.first(where: { $0.id == id || $0.suffixes.contains(stripped) }) {
            site = existing
        } else {
            guard state.sites.count < Limits.maxSites else { throw EngineError.invalid("Der kan højst være 200 hjemmesider.") }
            site = SiteRule(id: id, label: name, builtin: false, blocked: true, mode: "full",
                            suffixes: [stripped], hostsFile: [stripped, "www." + stripped, "m." + stripped])
            state.sites.append(site)
        }
        if let list, let i = state.lists.firstIndex(where: { $0.id == list }), !state.lists[i].sites.contains(site.id) {
            state.lists[i].sites.append(site.id)
        }
        return site
    }

    public func removeSite(id: String, now: Date) throws {
        guard let i = state.sites.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Hjemmesiden findes ikke.") }
        if state.sites[i].builtin { throw EngineError.invalid("Indbyggede hjemmesider kan ikke slettes.") }
        let frozen = frozenListIds(now: now)
        if state.lists.contains(where: { frozen.contains($0.id) && $0.sites.contains(id) }) { throw EngineError.locked() }
        state.sites.remove(at: i)
        for j in state.lists.indices { state.lists[j].sites.removeAll { $0 == id } }
    }

    // MARK: Apps

    /// Registers an app so it can go on lists; with `list`, also puts it there.
    public func addApp(_ app: AppRule, list: String? = nil, now: Date) throws {
        guard Validation.isBundleId(app.bundleId) else { throw EngineError.invalid("Ugyldig app.") }
        if Validation.protectedBundleIds.contains(app.bundleId) {
            throw EngineError.invalid("Chrome kan ikke blokeres — Locked in kører i Chrome.")
        }
        if !state.apps.contains(where: { $0.bundleId == app.bundleId }) {
            guard state.apps.count < Limits.maxApps else { throw EngineError.invalid("Der kan højst være 300 apps.") }
            var a = app
            // During a lock an app with a web engine is registered as "always closed": registering must never turn the
            // unknown-engine rule into an allow (review 4, L4-1).
            // Any app registered during a lock is "always closed" until allowed afterwards (review 5, R5-2).
            a.blocked = app.kind == .browser || AppPolicy.knownBrowsers.contains(app.bundleId) || isLocked(now)
            a.name = String(a.name.prefix(80))
            state.apps.append(a)
        }
        let never = state.apps.first { $0.bundleId == app.bundleId }?.neverClose ?? false
        if !never, let list, let i = state.lists.firstIndex(where: { $0.id == list }), !state.lists[i].apps.contains(app.bundleId) {
            state.lists[i].apps.append(app.bundleId)   // a never-close app is never put on a list (R7-2)
        }
    }

    /// Daemon-internal: an unknown browser/web-engine app seen during a lock is recorded as "always closed".
    public func recordUnknownApp(_ app: AppRule) {
        guard !state.apps.contains(where: { $0.bundleId == app.bundleId }), state.apps.count < Limits.maxApps else { return }
        var a = app
        a.blocked = true
        state.apps.append(a)
    }

    /// `blocked` here means "always closed during any lock" (browsers, unknown web-engine apps). `false` = "Tillad".
    public func setAppBlocked(bundleId: String, blocked: Bool, now: Date) throws {
        guard let i = state.apps.firstIndex(where: { $0.bundleId == bundleId }) else { throw EngineError.notFound("Appen findes ikke.") }
        if !blocked && (state.apps[i].kind == .browser || AppPolicy.knownBrowsers.contains(bundleId)) {
            throw EngineError.invalid("Andre browsere end Chrome er altid lukket under fokus.")
        }
        if !blocked && state.apps[i].blocked && isLocked(now) { throw EngineError.locked() }
        state.apps[i].blocked = blocked
    }

    /// "Lukkes aldrig" on/off. Turning it ON is a weakening: refused (423) during a lock if the app is closed right now.
    public func setNeverClose(bundleId: String, on: Bool, now: Date) throws {
        guard let i = state.apps.firstIndex(where: { $0.bundleId == bundleId }) else { throw EngineError.notFound("Appen findes ikke.") }
        if on && (state.apps[i].kind == .browser || AppPolicy.knownBrowsers.contains(bundleId)) {
            throw EngineError.invalid("Andre browsere end Chrome er altid lukket under fokus.")
        }
        if on && isLocked(now) {
            let closedNow = effectiveAppRules(now: now).first { $0.bundleId == bundleId }?.blocked ?? false
            // Also any list that is part of the running lock later (a chained period) — review 7, R7-1.
            let frozen = frozenListIds(now: now)
            let onFrozenList = state.lists.contains { l in
                frozen.contains(l.id) && (l.apps.contains(bundleId)
                    || l.sites.contains { sid in state.sites.first { $0.id == sid }?.apps.contains(bundleId) ?? false })
            }   // also via a site's desktop app on a frozen list (review 8, R8-1)
            if closedNow || onFrozenList { throw EngineError.locked() }
        }
        state.apps[i].neverClose = on
        if on {
            state.apps[i].blocked = false
            for j in state.lists.indices { state.lists[j].apps.removeAll { $0 == bundleId } }
        }
    }

    public func removeApp(bundleId: String, now: Date) throws {
        guard let i = state.apps.firstIndex(where: { $0.bundleId == bundleId }) else { throw EngineError.notFound("Appen findes ikke.") }
        let frozen = frozenListIds(now: now)
        if isLocked(now) && (state.apps[i].blocked || state.lists.contains(where: { frozen.contains($0.id) && $0.apps.contains(bundleId) })) {
            throw EngineError.locked()
        }
        state.apps.remove(at: i)
        for j in state.lists.indices { state.lists[j].apps.removeAll { $0 == bundleId } }
    }

    // MARK: Planned periods (weekly or one date)

    func validate(_ s: Schedule, now: Date) throws {
        guard ScheduleMath.minutes(s.start) != nil, ScheduleMath.minutes(s.end) != nil else {
            throw EngineError.invalid("Tider skal skrives som TT:MM.")
        }
        guard s.start != s.end else { throw EngineError.invalid("Start og slut kan ikke være det samme.") }
        if let d = s.date {
            guard ScheduleMath.day(d) != nil else { throw EngineError.invalid("Ugyldig dato.") }
            guard let occ = ScheduleMath.occurrences(s, around: now).first, occ.end > now else {
                throw EngineError.invalid("Vælg et senere tidspunkt.")
            }
        } else {
            guard !s.weekdays.isEmpty, s.weekdays.allSatisfy({ (1...7).contains($0) }), Set(s.weekdays).count == s.weekdays.count else {
                throw EngineError.invalid("Vælg mindst én ugedag.")
            }
        }
        guard state.lists.contains(where: { $0.id == s.list }) else { throw EngineError.invalid("Vælg en liste.") }
        let n = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard n.count <= Limits.maxLabel, Validation.isSafeLabel(n) || n.isEmpty else {
            throw EngineError.invalid("Navnet skal være højst 40 tegn.")
        }
    }

    public func addSchedule(_ input: Schedule, now: Date) throws -> Schedule {
        var s = input
        s.id = Validation.newId()
        s.name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
        s.weekdays = s.date == nil ? s.weekdays.sorted() : []
        s.list = try listId(s.list)
        try validate(s, now: now)
        guard state.schedules.count < Limits.maxSchedules else { throw EngineError.invalid("Der kan højst være 50 planlagte perioder.") }
        var candidate = state
        candidate.schedules.append(s)
        try checkChains(candidate, timerRemaining: timerRemaining(now: now), now: now)
        state.schedules.append(s)
        return s
    }

    public func updateSchedule(_ input: Schedule, now: Date) throws {
        guard let i = state.schedules.firstIndex(where: { $0.id == input.id }) else { throw EngineError.notFound("Perioden findes ikke.") }
        var s = input
        s.name = s.name.trimmingCharacters(in: .whitespacesAndNewlines)
        s.weekdays = s.date == nil ? s.weekdays.sorted() : []
        s.list = try listId(s.list)
        try validate(s, now: now)
        // Only periods that are part of the running lock are frozen (owner 2026-10-04); others can be edited.
        if frozenScheduleIds(now: now).contains(s.id) && s != state.schedules[i] { throw EngineError.locked() }
        var candidate = state
        candidate.schedules[i] = s
        try checkChains(candidate, timerRemaining: timerRemaining(now: now), now: now)
        state.schedules[i] = s
    }

    /// Periods with an occurrence in the running lock (including periods chained to it later).
    public func frozenScheduleIds(now: Date) -> Set<String> {
        guard isLocked(now) else { return [] }
        return Set(chainSources(now: now, upTo: nil).compactMap { $0.hasPrefix("schedule:") ? String($0.dropFirst(9)) : nil })
    }

    /// "Spring over denne gang": skips one day of a weekly period. Not for a day that is part of the running lock.
    public func skipOccurrence(id: String, date: String, now: Date) throws {
        guard let i = state.schedules.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Perioden findes ikke.") }
        guard state.schedules[i].date == nil else { throw EngineError.invalid("Kun ugentlige perioder kan springes over.") }
        // Only the canonical "YYYY-MM-DD" form is stored — it is what occurrences() compares against (review 6, R6-1).
        guard date.count == 10, let day = ScheduleMath.day(date) else { throw EngineError.invalid("Ugyldig dato.") }
        var probe = state.schedules[i]; probe.skip = []
        let cal = ScheduleMath.calendar   // Copenhagen only, never the system calendar (R6-2)
        let occ = ScheduleMath.occurrences(probe, around: day, daysAhead: 0).first { cal.isDate($0.start, inSameDayAs: day) }
        guard let occ else { throw EngineError.invalid("Perioden ligger ikke den dag.") }
        guard occ.end > now else { throw EngineError.invalid("Perioden er allerede slut.") }
        if frozenScheduleIds(now: now).contains(id) && occ.start <= (status(now: now).activeUntil ?? now) { throw EngineError.locked() }
        if !state.schedules[i].skip.contains(date) { state.schedules[i].skip.append(date) }
        // Keep the list short: forget skips that are more than a week old.
        state.schedules[i].skip.removeAll { (ScheduleMath.day($0) ?? .distantPast) < now.addingTimeInterval(-8 * 86400) }
    }

    public func unskipOccurrence(id: String, date: String, now: Date) throws {
        guard let i = state.schedules.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Perioden findes ikke.") }
        var candidate = state
        candidate.schedules[i].skip.removeAll { $0 == date }
        try checkChains(candidate, timerRemaining: timerRemaining(now: now), now: now)
        state.schedules[i].skip.removeAll { $0 == date }
    }

    public func removeSchedule(id: String, now: Date) throws {
        guard let i = state.schedules.firstIndex(where: { $0.id == id }) else { throw EngineError.notFound("Perioden findes ikke.") }
        if frozenScheduleIds(now: now).contains(id) { throw EngineError.locked() }
        state.schedules.remove(at: i)
    }

    /// One-time periods that have ended are removed.
    func dropPastOneOffs(now: Date) {
        state.schedules.removeAll { s in
            guard s.date != nil else { return false }
            let occ = ScheduleMath.occurrences(s, around: now)
            return occ.isEmpty ? ScheduleMath.day(s.date!).map { $0 < now.addingTimeInterval(-2 * 86400) } ?? true
                               : occ.allSatisfy { $0.end < now }
        }
    }

    public func heartbeat(now: Date) { state.lastHeartbeat = now }

    /// Tests only: set up state directly.
    public func testMutate(_ f: (inout State) -> Void) { f(&state) }

    // MARK: Catalog

    /// Merge built-in sites from the catalog: new ones are added (blocked), existing ones get fresh domain data
    /// but keep the user's blocked flag. A built-in removed from the catalog is dropped only while unlocked.
    public func mergeCatalog(_ catalog: [SiteRule], now: Date) {
        let locked = isLocked(now)
        // Decided once, before the loop: an upgrade from 1.0 adds new built-ins as options only (review 5, R5-1).
        let upgrading = !state.listsMigrated && !state.sites.isEmpty
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
                    n.apps = union(prev.apps, c.apps)
                    n.allowHosts = prev.allowHosts.filter(c.allowHosts.contains)
                    if prev.mode == "full" { n.mode = "full" }
                }
                state.sites[i] = n
            } else {
                var n = c
                // An upgrade from 1.0 adds new built-ins as options, not onto the owner's existing "Locked In 1".
                if upgrading { n.blocked = false }
                state.sites.append(n)
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

}
