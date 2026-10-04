import Foundation

/// The managed section of /etc/hosts. Everything outside the markers belongs to the user/system and is never touched.
public enum HostsFile {
    public static let begin = "# >>> Locked in — styres automatisk, rediger ikke >>>"
    public static let end = "# <<< Locked in <<<"

    /// Hostnames to sink while locked. "tab"-mode sites (Adversus) never appear here.
    public static func hostnames(sites: [SiteRule], catalog: Catalog?) -> [String] {
        var seen = Set<String>()
        var out: [String] = []
        func add(_ h: String) { if Validation.isDomain(h), seen.insert(h).inserted { out.append(h) } }
        for s in sites where s.blocked && s.mode == "full" {
            let allow = Set(s.allowHosts)
            for h in s.hostsFile where !allow.contains(h) { add(h) }
        }
        if let c = catalog {
            c.doh.hostnames.forEach(add)
            c.alwaysHosts.forEach(add)
        }
        return out
    }

    public static func section(_ hosts: [String]) -> String {
        guard !hosts.isEmpty else { return "" }
        var lines = [begin]
        for h in hosts { lines.append("0.0.0.0 \(h)"); lines.append(":: \(h)") }
        lines.append(end)
        return lines.joined(separator: "\n") + "\n"
    }

    /// Removes any managed section (even a damaged one with a missing end marker) and appends the new one.
    /// A file without a managed section is returned byte-for-byte when there is nothing to add.
    public static func render(existing: String, section: String) -> String {
        guard existing.contains(begin) else {
            if section.isEmpty { return existing }
            return existing + (existing.isEmpty || existing.hasSuffix("\n") ? "" : "\n") + section
        }
        var kept: [Substring] = []
        var inside = false
        for line in existing.split(separator: "\n", omittingEmptySubsequences: false) {
            if line == begin { inside = true; continue }
            if inside { if line == end { inside = false }; continue }
            kept.append(line)
        }
        var base = kept.joined(separator: "\n")
        if !base.isEmpty && !base.hasSuffix("\n") { base += "\n" }
        return base + section
    }
}

/// Applies the section to the real file. Writes only when the content differs, atomically, root:wheel 0644.
public final class HostsApplier {
    let path: String
    let run: (String, [String]) -> Int32

    public init(path: String = "/private/etc/hosts", run: @escaping (String, [String]) -> Int32 = Shell.run) {
        self.path = path; self.run = run
    }

    public enum Result: Equatable { case unchanged, written, failed(String) }

    /// Reads the file as bytes. If it cannot be read, or is not valid UTF-8, nothing is written: rewriting it from
    /// an empty string would wipe the user's own entries (review 1, M2).
    public func apply(section: String) -> Result {
        guard let data = FileManager.default.contents(atPath: path) else {
            return section.isEmpty ? .unchanged : .failed("hosts kunne ikke læses")
        }
        guard let existing = String(data: data, encoding: .utf8) else {
            return .failed("hosts indeholder tegn, der ikke er UTF-8 — ikke ændret")
        }
        let next = HostsFile.render(existing: existing, section: section)
        guard next != existing else { return .unchanged }
        let tmp = path + ".lockedin.tmp"
        guard FileManager.default.createFile(atPath: tmp, contents: Data(next.utf8), attributes: [.posixPermissions: 0o644]) else {
            return .failed("hosts: kunne ikke skrive midlertidig fil")
        }
        chown(tmp, 0, 0)
        guard rename(tmp, path) == 0 else { unlink(tmp); return .failed("hosts: kunne ikke erstatte filen") }
        _ = run("/usr/bin/dscacheutil", ["-flushcache"])
        _ = run("/usr/bin/killall", ["-HUP", "mDNSResponder"])
        return .written
    }
}
