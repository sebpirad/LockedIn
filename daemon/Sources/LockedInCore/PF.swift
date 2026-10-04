import Foundation

/// Blocks public DNS-over-HTTPS / DNS-over-TLS resolvers on 443 and 853 (TCP and UDP) while locked.
/// Never port 53: if the router hands out 8.8.8.8 as plain DNS, blocking 53 would kill all name lookups.
/// The anchor lives under com.apple/ so the stock /etc/pf.conf (`anchor "com.apple/*"`) evaluates it.
public final class PFApplier {
    public static let anchor = "com.apple/lockedin"
    let pfctl = "/sbin/pfctl"
    private var token: String?
    private var loadedRules: String?
    /// After one check at startup, release() only acts when this process loaded rules itself.
    private var startupChecked = false
    private var lastVerified = Date.distantPast

    public init() {}

    public static func rules(catalog: Catalog) -> String {
        let ips = catalog.doh.ipv4 + catalog.doh.ipv6
        guard !ips.isEmpty else { return "" }
        return """
        table <lockedin_doh> const { \(ips.joined(separator: ", ")) }
        block drop out quick proto { tcp, udp } from any to <lockedin_doh> port { 443, 853 }

        """
    }

    /// Returns a short problem description, or nil when the anchor is loaded and pf is enabled.
    @discardableResult
    public func enforce(catalog: Catalog) -> String? {
        let rules = Self.rules(catalog: catalog)
        guard !rules.isEmpty else { return nil }
        // Verify against pf every 10 s, not on every 2 s tick (each check is three pfctl runs).
        if loadedRules == rules && Date().timeIntervalSince(lastVerified) < 10 { return nil }
        lastVerified = Date()
        // The main ruleset must contain the com.apple anchor point; load the stock pf.conf if it does not.
        let main = Shell.output(pfctl, ["-s", "Anchors"], stdin: nil).out
        if !main.contains("com.apple") { _ = Shell.run(pfctl, ["-q", "-f", "/etc/pf.conf"]) }
        let current = Shell.output(pfctl, ["-a", Self.anchor, "-s", "rules"], stdin: nil).out
        if loadedRules != rules || !current.contains("lockedin_doh") {
            let r = Shell.output(pfctl, ["-q", "-a", Self.anchor, "-f", "-"], stdin: rules)
            if r.status != 0 { return "pf: kunne ikke indlæse regler (\(r.out.prefix(120)))" }
            loadedRules = rules
        }
        let info = Shell.output(pfctl, ["-s", "info"], stdin: nil).out
        if !info.contains("Status: Enabled") || token == nil {
            let e = Shell.output(pfctl, ["-E"], stdin: nil)
            if let line = e.out.split(separator: "\n").first(where: { $0.contains("Token") }),
               let t = line.split(separator: ":").last?.trimmingCharacters(in: .whitespaces) {
                token = t
            }
            if !Shell.output(pfctl, ["-s", "info"], stdin: nil).out.contains("Status: Enabled") {
                return "pf: kunne ikke slås til"
            }
        }
        return nil
    }

    public func release() {
        if loadedRules == nil && token == nil && startupChecked { return }
        startupChecked = true
        if loadedRules != nil || Shell.output(pfctl, ["-a", Self.anchor, "-s", "rules"], stdin: nil).out.contains("lockedin_doh") {
            _ = Shell.run(pfctl, ["-q", "-a", Self.anchor, "-F", "all"])
            loadedRules = nil
            lastVerified = .distantPast
        }
        // pf is reference-counted (-E/-X); give back only our own reference so other users of pf are unaffected.
        if let t = token { _ = Shell.run(pfctl, ["-q", "-X", t]); token = nil }
    }
}
