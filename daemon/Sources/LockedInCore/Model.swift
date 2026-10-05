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
    /// Desktop apps of the same service (e.g. the Slack app) — closed whenever the site is in an active list.
    public var apps: [String] = []

    public init(id: String, label: String, builtin: Bool, blocked: Bool, mode: String,
                suffixes: [String], exactHosts: [String] = [], regexFilters: [String] = [],
                allowHosts: [String] = [], hostsFile: [String] = []) {
        self.id = id; self.label = label; self.builtin = builtin; self.blocked = blocked; self.mode = mode
        self.suffixes = suffixes; self.exactHosts = exactHosts; self.regexFilters = regexFilters
        self.allowHosts = allowHosts; self.hostsFile = hostsFile
    }

    enum CodingKeys: String, CodingKey { case id, label, builtin, blocked, mode, suffixes, exactHosts, regexFilters, allowHosts, hostsFile, apps }

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
        apps = try c.decodeIfPresent([String].self, forKey: .apps) ?? []
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
    /// "Lukkes aldrig": never closed by any list or rule (owner 2026-10-05: Spark, Wispr Flow, Claude). Browsers can't be.
    public var neverClose: Bool
    public init(bundleId: String, name: String, kind: AppKind, blocked: Bool, teamId: String? = nil, neverClose: Bool = false) {
        self.bundleId = bundleId; self.name = name; self.kind = kind; self.blocked = blocked; self.teamId = teamId
        self.neverClose = neverClose
    }
    enum CodingKeys: String, CodingKey { case bundleId, name, kind, blocked, teamId, neverClose }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        bundleId = try c.decode(String.self, forKey: .bundleId)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? bundleId
        kind = try c.decodeIfPresent(AppKind.self, forKey: .kind) ?? .webengine
        blocked = try c.decodeIfPresent(Bool.self, forKey: .blocked) ?? false
        teamId = try c.decodeIfPresent(String.self, forKey: .teamId)
        neverClose = try c.decodeIfPresent(Bool.self, forKey: .neverClose) ?? false
    }
}

public struct Schedule: Codable, Equatable {
    public var id: String
    public var name: String
    /// 1 = Monday … 7 = Sunday (ISO). Ignored when `date` is set.
    public var weekdays: [Int]
    /// "HH:MM", Europe/Copenhagen wall time. end <= start means the window crosses midnight.
    public var start: String
    public var end: String
    public var enabled: Bool
    /// The block list this period uses.
    public var list: String
    /// "YYYY-MM-DD" (Copenhagen) for a one-time period, e.g. tomorrow 09–12; nil = every chosen weekday.
    public var date: String?
    /// Days ("YYYY-MM-DD", the occurrence's start day) a weekly period is skipped once ("ikke på fredag").
    public var skip: [String]
    public init(id: String, name: String, weekdays: [Int], start: String, end: String, enabled: Bool, list: String = "", date: String? = nil, skip: [String] = []) {
        self.id = id; self.name = name; self.weekdays = weekdays; self.start = start; self.end = end; self.enabled = enabled
        self.list = list; self.date = date; self.skip = skip
    }
    enum CodingKeys: String, CodingKey { case id, name, weekdays, start, end, enabled, list, date, skip }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decodeIfPresent(String.self, forKey: .name) ?? ""
        weekdays = try c.decodeIfPresent([Int].self, forKey: .weekdays) ?? []
        start = try c.decodeIfPresent(String.self, forKey: .start) ?? "00:00"
        end = try c.decodeIfPresent(String.self, forKey: .end) ?? "00:00"
        enabled = try c.decodeIfPresent(Bool.self, forKey: .enabled) ?? true
        list = try c.decodeIfPresent(String.self, forKey: .list) ?? ""
        date = try c.decodeIfPresent(String.self, forKey: .date)
        skip = try c.decodeIfPresent([String].self, forKey: .skip) ?? []
    }
}

/// A named set of sites and apps to block, e.g. "Locked In 1": Slack, Adversus, Instagram.
public struct BlockList: Codable, Equatable {
    public var id: String
    public var name: String
    public var sites: [String]   // SiteRule ids
    public var apps: [String]    // bundle ids
    public init(id: String, name: String, sites: [String], apps: [String]) {
        self.id = id; self.name = name; self.sites = sites; self.apps = apps
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
    /// Block lists in force for this timer (several when a session is extended with another list).
    public var lists: [String]
    public init(endWall: Date, monoRemaining: Double, startWall: Date? = nil, lists: [String] = []) {
        self.endWall = endWall; self.monoRemaining = monoRemaining; self.startWall = startWall; self.lists = lists
    }
    enum CodingKeys: String, CodingKey { case endWall, monoRemaining, startWall, lists }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        endWall = try c.decode(Date.self, forKey: .endWall)
        monoRemaining = try c.decode(Double.self, forKey: .monoRemaining)
        startWall = try c.decodeIfPresent(Date.self, forKey: .startWall)
        lists = try c.decodeIfPresent([String].self, forKey: .lists) ?? []
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
    public var lists: [BlockList] = []
    /// v1.0 used a blocked flag per site/app; it is turned into "Locked In 1" once.
    public var listsMigrated: Bool = false
    /// Every list that has been part of the running lock; kept until the lock ends (a timer that expires mid-chain
    /// is forgotten, its list is not).
    public var lockLists: [String] = []
    /// End of the lock `lockLists` belongs to; a lock that starts after it (e.g. after sleep) starts fresh.
    public var lockListsUntil: Date?
    public init() {}

    enum CodingKeys: String, CodingKey { case schemaVersion, sites, apps, schedules, timer, lastSavedWall, lastHeartbeat, appsSeeded, lists, listsMigrated, lockLists, lockListsUntil }

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
        lists = try c.decodeIfPresent([BlockList].self, forKey: .lists) ?? []
        listsMigrated = try c.decodeIfPresent(Bool.self, forKey: .listsMigrated) ?? false
        lockLists = try c.decodeIfPresent([String].self, forKey: .lockLists) ?? []
        lockListsUntil = try c.decodeIfPresent(Date.self, forKey: .lockListsUntil)
    }
}

public enum Limits {
    public static let maxSessionSeconds: Double = 24 * 3600
    public static let maxSites = 200
    public static let maxApps = 300
    public static let maxSchedules = 50
    public static let maxLabel = 40
    public static let maxLists = 20
}
