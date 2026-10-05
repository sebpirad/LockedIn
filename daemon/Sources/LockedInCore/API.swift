import Foundation

public struct EnforcementReport {
    public var hostsOK = true
    public var pfOK = true
    public var appControlOK = true
    public var lastTick: Date?
    public var problems: [String] = []
    public var recentKills: [String] = []
    public init() {}
}

/// Routes /v1/* to the Engine. Pure apart from the injected closures; tested without a socket.
public final class API {
    public static let extensionOrigin = "chrome-extension://nildondjeeibacombanbjnokenmhfhie"
    public static let version = "1.4.0"

    let engine: Engine
    let installed: () -> [AppRule]
    let report: () -> EnforcementReport
    let changed: () -> Void

    public init(engine: Engine, installed: @escaping () -> [AppRule], report: @escaping () -> EnforcementReport, changed: @escaping () -> Void) {
        self.engine = engine; self.installed = installed; self.report = report; self.changed = changed
    }

    static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()
    static func ts(_ d: Date?) -> Any { d.map { iso.string(from: $0) } ?? NSNull() }

    static func err(_ e: EngineError) -> HTTPResponse { HTTPResponse(e.status, ["error": e.code, "message": e.message]) }
    static func bad(_ m: String) -> HTTPResponse { err(EngineError.invalid(m)) }

    public func handle(_ req: HTTPRequest, now: Date) -> HTTPResponse {
        // CSRF guard: a custom header forces a CORS preflight that we never approve; Origin must be ours if present.
        guard req.headers["x-lockedin"] == "1" else { return HTTPResponse(403, ["error": "forbidden", "message": "Mangler X-LockedIn."]) }
        // DNS rebinding: a page on evil.example resolving to 127.0.0.1 would send Host: evil.example (review 1, L6).
        if let h = req.headers["host"], h != "127.0.0.1:919", h != "localhost:919" {
            return HTTPResponse(403, ["error": "forbidden", "message": "Ukendt vært."])
        }
        if let o = req.headers["origin"], o != Self.extensionOrigin {
            return HTTPResponse(403, ["error": "forbidden", "message": "Ukendt afsender."])
        }
        let parts = req.path.split(separator: "?").first.map { $0.split(separator: "/").map(String.init) } ?? []
        guard parts.count >= 2, parts[0] == "v1" else { return HTTPResponse(404, ["error": "not_found", "message": "Ukendt adresse."]) }
        var body: [String: Any] = [:]
        if !req.body.isEmpty {
            guard let b = try? JSONSerialization.jsonObject(with: req.body) as? [String: Any] else { return Self.bad("Ugyldig JSON.") }
            body = b
        }
        let id = parts.count > 2 ? (parts[2].removingPercentEncoding ?? parts[2]) : nil
        do {
            switch (req.method, parts[1], id) {
            case ("GET", "status", nil):
                return HTTPResponse(200, status(now: now))
            case ("POST", "session", nil):
                let list = body["list"] as? String
                if let u = body["until"] as? String {
                    guard let d = Self.iso.date(from: u) else { return Self.bad("Ugyldigt tidspunkt.") }
                    try engine.startSession(until: d, list: list, now: now)
                } else if let m = body["minutes"] as? Int {
                    try engine.startSession(minutes: m, list: list, now: now)
                } else {
                    return Self.bad("Angiv minutter eller et sluttidspunkt.")
                }
            case ("POST", "lists", nil):
                _ = try engine.addList(name: body["name"] as? String ?? "", sites: body["sites"] as? [String] ?? [],
                                       apps: body["apps"] as? [String] ?? [], now: now)
            case ("PUT", "lists", let id?):
                try engine.updateList(id: id, name: body["name"] as? String ?? "", sites: body["sites"] as? [String] ?? [],
                                      apps: body["apps"] as? [String] ?? [], now: now)
            case ("DELETE", "lists", let id?):
                try engine.removeList(id: id, now: now)
            case ("POST", "sites", nil):
                _ = try engine.addSite(label: body["label"] as? String ?? "", domain: body["domain"] as? String ?? "",
                                       list: body["list"] as? String, now: now)
            case ("DELETE", "sites", let id?):
                try engine.removeSite(id: id, now: now)
            case ("GET", "installed", nil):
                return HTTPResponse(200, ["apps": installed().map(Self.appJSON)])
            case ("POST", "apps", nil):
                guard let bid = body["bundleId"] as? String,
                      let app = installed().first(where: { $0.bundleId == bid }) else { return Self.bad("Vælg en app fra listen.") }
                try engine.addApp(app, list: body["list"] as? String, now: now)
            case ("PATCH", "apps", let id?):
                if let n = body["neverClose"] as? Bool {
                    try engine.setNeverClose(bundleId: id, on: n, now: now)
                } else if let b = body["blocked"] as? Bool {
                    try engine.setAppBlocked(bundleId: id, blocked: b, now: now)
                } else {
                    return Self.bad("Angiv blocked eller neverClose.")
                }
            case ("DELETE", "apps", let id?):
                try engine.removeApp(bundleId: id, now: now)
            case ("POST", "schedules", nil):
                _ = try engine.addSchedule(Self.schedule(body, id: ""), now: now)
            case ("PUT", "schedules", let id?):
                try engine.updateSchedule(Self.schedule(body, id: id), now: now)
            case ("DELETE", "schedules", let id?):
                try engine.removeSchedule(id: id, now: now)
            case ("POST", "skip", let id?):
                guard let d = body["date"] as? String else { return Self.bad("Angiv dato.") }
                try engine.skipOccurrence(id: id, date: d, now: now)
            case ("DELETE", "skip", let id?):
                guard let d = body["date"] as? String else { return Self.bad("Angiv dato.") }
                try engine.unskipOccurrence(id: id, date: d, now: now)
            case ("POST", "heartbeat", nil):
                engine.heartbeat(now: now)
                changed()
                return HTTPResponse(200, ["ok": true])
            default:
                return HTTPResponse(404, ["error": "not_found", "message": "Ukendt adresse."])
            }
        } catch let e as EngineError {
            return Self.err(e)
        } catch {
            return HTTPResponse(500, ["error": "internal", "message": "Intern fejl."])
        }
        changed()
        return HTTPResponse(200, status(now: now))
    }

    static func schedule(_ b: [String: Any], id: String) -> Schedule {
        Schedule(id: id, name: b["name"] as? String ?? "", weekdays: b["weekdays"] as? [Int] ?? [],
                 start: b["start"] as? String ?? "", end: b["end"] as? String ?? "", enabled: b["enabled"] as? Bool ?? true,
                 list: b["list"] as? String ?? "", date: (b["date"] as? String).flatMap { $0.isEmpty ? nil : $0 })
    }

    static func appJSON(_ a: AppRule) -> [String: Any] {
        ["bundleId": a.bundleId, "name": a.name, "kind": a.kind.rawValue, "blocked": a.blocked, "neverClose": a.neverClose]
    }

    public func status(now: Date) -> [String: Any] {
        let s = engine.status(now: now)
        let r = report()
        let active = engine.activeListIds(now: now)
        let effective = Set(engine.effectiveSites(now: now).map(\.id))
        let activeApps = Set(engine.state.lists.filter { active.contains($0.id) }.flatMap(\.apps))
        let frozenSchedules = engine.frozenScheduleIds(now: now)
        let next: Any = s.next.map { iv -> [String: Any] in
            let sid = String(iv.source.dropFirst("schedule:".count))
            let sc = engine.state.schedules.first { $0.id == sid }
            return ["start": Self.ts(iv.start), "end": Self.ts(iv.end), "scheduleId": sid, "name": sc?.name ?? "",
                    "list": sc?.list ?? "", "listName": engine.state.lists.first { $0.id == sc?.list }?.name ?? ""]
        } ?? NSNull()
        return [
            "version": Self.version,
            "now": Self.ts(now),
            "active": s.active,
            "activeUntil": Self.ts(s.activeUntil),
            "activeSince": Self.ts(s.activeSince),
            "activeSources": s.sources,
            "nextSession": next,
            "maxSessionMinutes": 1440,
            "activeLists": active,
            "lists": engine.state.lists.map { l -> [String: Any] in ["id": l.id, "name": l.name, "sites": l.sites, "apps": l.apps] },
            // `blocked` = blocked right now (in an active list). Always false when unlocked.
            "sites": engine.state.sites.map { x -> [String: Any] in
                ["id": x.id, "label": x.label, "builtin": x.builtin, "blocked": effective.contains(x.id), "mode": x.mode,
                 "suffixes": x.suffixes, "exactHosts": x.exactHosts, "regexFilters": x.regexFilters, "allowHosts": x.allowHosts]
            },
            // `blocked` = always closed during any lock (browsers, unknown web-engine apps); `inActiveList` = closed now.
            "apps": engine.state.apps.map { a -> [String: Any] in
                var j = Self.appJSON(a); j["inActiveList"] = activeApps.contains(a.bundleId); return j
            },
            "schedules": engine.state.schedules.map { x -> [String: Any] in
                ["id": x.id, "name": x.name, "weekdays": x.weekdays, "start": x.start, "end": x.end, "enabled": x.enabled,
                 "list": x.list, "date": x.date ?? NSNull(), "skip": x.skip,
                 "frozen": frozenSchedules.contains(x.id)]
            },
            "enforcement": ["hosts": r.hostsOK, "pf": r.pfOK, "appControl": r.appControlOK,
                            "lastTick": Self.ts(r.lastTick), "lastHeartbeat": Self.ts(engine.state.lastHeartbeat),
                            "problems": r.problems, "recentKills": r.recentKills] as [String: Any],
        ]
    }
}
