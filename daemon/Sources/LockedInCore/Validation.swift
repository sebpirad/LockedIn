import Foundation

/// Everything that ends up in /etc/hosts, a pf rule or state.json passes through here.
/// A newline or space in a hostname would let a crafted entry break out of the managed hosts section.
public enum Validation {
    public static let protectedBundleIds: Set<String> = ["com.google.Chrome"]

    private static let label = "[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
    private static let domainRegex = try! NSRegularExpression(pattern: "^\(label)(\\.\(label))+$")

    public static func isDomain(_ s: String) -> Bool {
        guard s.count <= 253, s.unicodeScalars.allSatisfy({ $0.isASCII }) else { return false }
        let r = NSRange(s.startIndex..., in: s)
        guard domainRegex.firstMatch(in: s, range: r) != nil else { return false }
        // The last label must not be all digits (no bare IP addresses).
        return !(s.split(separator: ".").last!.allSatisfy(\.isNumber))
    }

    public static func stripWww(_ s: String) -> String {
        var d = s
        if let r = d.range(of: "://") { d = String(d[r.upperBound...]) }
        if let slash = d.firstIndex(of: "/") { d = String(d[..<slash]) }
        if let colon = d.firstIndex(of: ":") { d = String(d[..<colon]) }
        if d.hasPrefix("www.") { d = String(d.dropFirst(4)) }
        return d
    }

    public static func isBundleId(_ s: String) -> Bool {
        guard (3...255).contains(s.count) else { return false }
        return s.unicodeScalars.allSatisfy { CharacterSet.alphanumerics.contains($0) && $0.isASCII || $0 == "." || $0 == "-" || $0 == "_" }
    }

    /// Labels are shown in the UI only, but keep control characters out of state.json.
    public static func isSafeLabel(_ s: String) -> Bool {
        !s.unicodeScalars.contains { CharacterSet.controlCharacters.contains($0) || CharacterSet.newlines.contains($0) }
    }

    public static func newId() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").prefix(10)).lowercased()
    }
}
