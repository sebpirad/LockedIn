import Foundation

public struct Catalog: Codable {
    public struct DoH: Codable { public var ipv4: [String]; public var ipv6: [String]; public var hostnames: [String] }
    public var version: Int
    public var sites: [SiteRule]
    public var doh: DoH
    public var alwaysHosts: [String]

    /// Drops anything that is not a plain hostname / IP, so a bad catalog can never inject into hosts or pf.
    public func sanitized() -> Catalog {
        var c = self
        c.sites = sites.map { s in
            var s = s
            s.suffixes = s.suffixes.filter(Validation.isDomain)
            s.exactHosts = s.exactHosts.filter(Validation.isDomain)
            s.allowHosts = s.allowHosts.filter(Validation.isDomain)
            s.hostsFile = s.hostsFile.filter(Validation.isDomain)
            s.builtin = true
            return s
        }.filter { Validation.isBundleId($0.id) && !$0.suffixes.isEmpty }
        c.doh.ipv4 = doh.ipv4.filter { IP.isV4($0) }
        c.doh.ipv6 = doh.ipv6.filter { IP.isV6($0) }
        c.doh.hostnames = doh.hostnames.filter(Validation.isDomain)
        c.alwaysHosts = alwaysHosts.filter(Validation.isDomain)
        return c
    }
}

public enum IP {
    public static func isV4(_ s: String) -> Bool { var a = in_addr(); return inet_pton(AF_INET, s, &a) == 1 }
    public static func isV6(_ s: String) -> Bool { var a = in6_addr(); return inet_pton(AF_INET6, s, &a) == 1 }
}

/// state.json is written atomically and a backup is kept. If neither can be read, `loadFailed` is set and the
/// daemon keeps every block it already has in place instead of starting from an empty, unlocked state.
public final class Store {
    public let url: URL
    public private(set) var loadFailed = false

    public init(directory: URL) {
        url = directory.appendingPathComponent("state.json")
    }

    var backup: URL { url.appendingPathExtension("bak") }

    public func load() -> State {
        let dec = JSONDecoder()
        dec.dateDecodingStrategy = .iso8601
        for u in [url, backup] {
            guard let d = try? Data(contentsOf: u) else { continue }
            if let s = try? dec.decode(State.self, from: d) { return s }
        }
        // No file at all is a fresh install; an unreadable one is not.
        loadFailed = FileManager.default.fileExists(atPath: url.path) || FileManager.default.fileExists(atPath: backup.path)
        return State()
    }

    public func save(_ state: State, now: Date) throws {
        var s = state
        s.lastSavedWall = now
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        let data = try enc.encode(s)
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path) {
            _ = try? fm.removeItem(at: backup)
            try? fm.copyItem(at: url, to: backup)
        }
        try data.write(to: url, options: .atomic)
        chmod(url.path, 0o600)
        loadFailed = false
    }
}
