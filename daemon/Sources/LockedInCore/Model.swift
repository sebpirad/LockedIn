import Foundation

/// A blockable website (built-in from the catalog, or added by the user).
public struct SiteRule: Codable, Equatable {
    public var id: String
    public var label: String
    public var builtin: Bool
    public var blocked: Bool
    /// "full": /etc/hosts + every Chrome resource type. "tab": only Chrome main_frame (Adversus — PowerLink must keep working).
    public var mode: String
    /// Chrome suffix matching (covers all subdomains).
    public var suffixes: [String]
    /// Exact hosts inside shared domains (e.g. yt3.ggpht.com) — Chrome exact match + /etc/hosts.
    public var exactHosts: [String]
    public var regexFilters: [String]
    /// Never blocked, even when the suffix matches (accounts.youtube.com carries Google sign-in).
    public var allowHosts: [String]
    /// Explicit /etc/hosts entries (hosts has no wildcards).
    public var hostsFile: [String]

    public init(id: String, label: String, builtin: Bool, blocked: Bool, mode: String,
                suffixes: [String], exactHosts: [String] = [], regexFilters: [String] = [],
                allowHosts: [String] = [], hostsFile: [String] = []) {
        self.id = id; self.label = label; self.builtin = builtin; self.blocked = blocked; self.mode = mode
        self.suffixes = suffixes; self.exactHosts = exactHosts; self.regexFilters = regexFilters
        self.allowHosts = allowHosts; self.hostsFile = hostsFile
    }

    enum CodingKeys: String, CodingKey { case id, label, builtin, blocked, mode, suffixes, exactHosts, regexFilters, allowHosts, hostsFile }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        label = try c.decodeIfPresent(String.self, forKey: .label) ?? id
        builtin = try c.decodeIfPresent(Bool.self, forKey: .builtin) ?? false
        blocked = try c.decodeIfPresent(Bool.self, forKey: .blocked) ?? true
        mode = try c.decodeIfPresent(String.self, forKey: .mode) ?? "full"
        suffixes = try c.decodeIfPresent([String].self, forKey: .suffixes) ?? []
        exactHosts = try c.decodeIfPresent([String].self, forKey: .exactHosts) ?? []
        regexFilters = try c.decodeIfPresent([String].self, forKey: .regexFilters) ?? []
        allowHosts = try c.decodeIfPresent([String].self, forKey: .allowHosts) ?? []
        hostsFile = try c.decodeIfPresent([String].self, forKey: .hostsFile) ?? []
    }
}

public enum AppKind: String, Codable {
    case browser, webengine, app
    /// An unknown value (written by a newer build) must not make the whole state unreadable; treat it as a web engine,
    /// which is closed unless explicitly allowed.
    public init(from decoder: Decoder) throws {
        self = AppKind(rawValue: (try? decoder.singleValueContainer().decode(String.self)) ?? "") ?? .webengine
    }
}

public struct AppRule: Codable, Equatable {
    public var bundleId: String
    public var name: String
    public var kind: AppKind
    public var blocked: Bool
    /// Code-signing team of the copy that was allowed. An allowed rule only matches a process signed by the same
    /// team, so a browser cannot borrow an allowed app's bundle id, and a modified copy (broken signature) is unknown.
    public var teamId: String?
    public init(bundleId: String, name: String, kind: AppKind, blocked: Bool, teamId: String? = nil) {
        self.bundleId = bundleId; self.name = name; self.kind = kind; self.blocked = blocked; self.teamId = teamId
    }
}

public struct Schedule: Codable, Equatable {
    public var id: String
    public var name: String
    /// 1 = Monday … 7 = Sunday (ISO).
    public var weekdays: [Int]
    /// "HH:MM", Europe/Copenhagen wall time. end <= start means the window crosses midnight.
    public var start: String
    public var end: String
    public var enabled: Bool
    public init(id: String, name: String, weekdays: [Int], start: String, end: String, enabled: Bool) {
        self.id = id; self.name = name; self.weekdays = weekdays; self.start = start; self.end = end; self.enabled = enabled
    }
}

/// The manual timer. Two clocks, and the lock holds while EITHER says so:
/// `endWall` (UTC instant) and `monoRemaining` (seconds counted down with a monotonic clock that includes sleep,
/// reduced by powered-off time at boot). A wall-clock jump forward cannot end it early; a jump backward can only
/// extend it, and never beyond the 24 h cap.
public struct TimerLock: Codable, Equatable {
    public var endWall: Date
    public var monoRemaining: Double
    /// When this continuous timer lock began (extensions keep it). Used for the 24 h cap on one continuous lock.
    public var startWall: Date?
    public init(endWall: Date, monoRemaining: Double, startWall: Date? = nil) {
        self.endWall = endWall; self.monoRemaining = monoRemaining; self.startWall = startWall
    }
}

public struct State: Codable, Equatable {
    public var schemaVersion: Int = 1
    public var sites: [SiteRule] = []
    public var apps: [AppRule] = []
    public var schedules: [Schedule] = []
    public var timer: TimerLock?
    /// Wall clock at the last save — used at boot to subtract powered-off time from `monoRemaining`.
    public var lastSavedWall: Date = Date(timeIntervalSince1970: 0)
    public var lastHeartbeat: Date?
    public var appsSeeded: Bool = false
    public init() {}

    enum CodingKeys: String, CodingKey { case schemaVersion, sites, apps, schedules, timer, lastSavedWall, lastHeartbeat, appsSeeded }

    /// Every field is optional on disk: a state file written by an older or newer version must still load —
    /// a decode failure would otherwise drop a running lock.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decodeIfPresent(Int.self, forKey: .schemaVersion) ?? 1
        sites = try c.decodeIfPresent([SiteRule].self, forKey: .sites) ?? []
        apps = try c.decodeIfPresent([AppRule].self, forKey: .apps) ?? []
        schedules = try c.decodeIfPresent([Schedule].self, forKey: .schedules) ?? []
        timer = try c.decodeIfPresent(TimerLock.self, forKey: .timer)
        lastSavedWall = try c.decodeIfPresent(Date.self, forKey: .lastSavedWall) ?? Date(timeIntervalSince1970: 0)
        lastHeartbeat = try c.decodeIfPresent(Date.self, forKey: .lastHeartbeat)
        appsSeeded = try c.decodeIfPresent(Bool.self, forKey: .appsSeeded) ?? false
    }
}

public enum Limits {
    public static let maxSessionSeconds: Double = 24 * 3600
    public static let maxSites = 200
    public static let maxApps = 300
    public static let maxSchedules = 50
    public static let maxLabel = 40
}
