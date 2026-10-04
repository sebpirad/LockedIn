import Foundation

/// What the daemon knows about one .app level in a process's path.
public struct BundleFacts: Equatable {
    public var path: String
    public var bundleId: String?
    public var name: String?
    public var kind: AppKind
    /// Signed by Apple (anchor apple).
    public var appleSigned: Bool
    /// Valid signature (executable checked) whose team is Google's Chrome team EQHXZ8M8AV.
    public var googleSigned: Bool
    /// Team of a VALID signature; nil when unsigned or the signature does not verify.
    public var teamId: String?
    /// No Contents/Frameworks and a main executable under 2 MB — what a Chrome web-app shim looks like.
    public var tinyShim: Bool
    public init(path: String, bundleId: String? = nil, name: String? = nil, kind: AppKind = .app,
                appleSigned: Bool = false, googleSigned: Bool = false, teamId: String? = nil, tinyShim: Bool = false) {
        self.path = path; self.bundleId = bundleId; self.name = name; self.kind = kind
        self.appleSigned = appleSigned; self.googleSigned = googleSigned; self.teamId = teamId; self.tinyShim = tinyShim
    }
}

/// What the daemon knows about one running process. Built by AppControl, judged here (pure, testable).
public struct ProcFacts: Equatable {
    public var pid: Int32
    public var path: String
    /// Every .app level of the executable path, innermost first. Empty for bare executables.
    public var bundles: [BundleFacts]
    /// argv of a Chrome main process (empty for others).
    public var argv: [String]
    public init(pid: Int32, path: String, bundles: [BundleFacts] = [], argv: [String] = []) {
        self.pid = pid; self.path = path; self.bundles = bundles; self.argv = argv
    }
    public var outer: BundleFacts? { bundles.last }
}

public enum Verdict: Equatable {
    case allow
    /// Kill every process of the outermost bundle (or this pid tree when there is no bundle).
    case kill(reason: String)
    /// Kill and remember the app as blocked so it shows up in the UI.
    case killAndRecord(AppRule, reason: String)
    /// Kill only this pid and its children (the real Chrome started with bypass flags, or without the extension).
    case killTree(reason: String)
    /// The real Chrome at its real path failed its signature check — debounced by AppControl, never killed at once.
    case chromeSignatureFailed
}

public enum AppPolicy {
    public static let chromePath = "/Applications/Google Chrome.app"

    public static let knownBrowsers: Set<String> = [
        "com.apple.Safari", "com.apple.SafariTechnologyPreview",
        "org.mozilla.firefox", "org.mozilla.firefoxdeveloperedition", "org.mozilla.nightly", "net.waterfox.waterfox",
        "io.gitlab.librewolf-community", "org.torproject.torbrowser", "app.zen-browser.zen",
        "company.thebrowser.Browser", "company.thebrowser.dia",
        "com.brave.Browser", "com.brave.Browser.beta", "com.brave.Browser.nightly",
        "com.microsoft.edgemac", "com.microsoft.edgemac.Beta", "com.microsoft.edgemac.Dev", "com.microsoft.edgemac.Canary",
        "com.operasoftware.Opera", "com.operasoftware.OperaGX", "com.operasoftware.OperaNext",
        "com.vivaldi.Vivaldi", "org.chromium.Chromium", "com.google.chrome.for.testing",
        "com.google.Chrome.canary", "com.google.Chrome.beta", "com.google.Chrome.dev",
        "com.kagi.kagimacOS", "com.duckduckgo.macos.browser", "com.sigmaos.sigmaos.macos",
        "ru.yandex.desktop.yandex-browser", "com.naver.Whale", "com.openai.atlas", "ai.perplexity.comet",
        "com.gologin.desktop", "com.pushplaylabs.sidekick", "com.mighty.app", "com.wavebox.wavebox",
    ]

    /// Chrome started with any of these bypasses hosts, the extension or the policy (prefix match).
    public static let bannedChromeFlags = [
        "--host-resolver-rules", "--host-rules", "--disable-extensions", "--remote-debugging", "--user-data-dir",
        "--load-extension", "--proxy",
    ]

    public static func isUserWritable(_ path: String) -> Bool {
        // /opt/homebrew belongs to the owner on this Mac (review 3, R3-2).
        ["/Users/", "/private/tmp/", "/tmp/", "/private/var/folders/", "/var/folders/", "/private/var/tmp/", "/var/tmp/",
         "/Volumes/", "/opt/homebrew/"].contains { path.hasPrefix($0) }
    }

    /// Never killed, whatever a rule says (a stub claiming com.apple.loginwindow must not log the user out; review 1, L2).
    public static func isProtectedSystemPath(_ path: String) -> Bool {
        ["/System/Library/", "/usr/", "/bin/", "/sbin/", "/Library/Apple/", "/System/Applications/Utilities/"].contains { path.hasPrefix($0) }
    }

    static func isChromeId(_ id: String?) -> Bool { id == "com.google.Chrome" || (id?.hasPrefix("com.google.Chrome.") ?? false) }

    /// Installed Chrome web apps: tiny shims in ~/Applications/Chrome Apps.localized whose windows Chrome renders
    /// (the extension's rules apply in them). Exempt from the "Chrome copy"/browser rule only — a fake one with its own
    /// engine is still caught by the engine and WebContent rules (review 2, N4).
    static func isChromeAppShim(_ b: BundleFacts) -> Bool {
        // Must also look like a shim: a renamed Firefox/Chromium in that folder carries frameworks and a large binary
        // (review 3, R3-1). A tiny WKWebView fake is still caught by the WebContent rule.
        (b.bundleId?.hasPrefix("com.google.Chrome.app.") ?? false) && b.path.contains("/Applications/Chrome Apps.localized/") && b.tinyShim
    }

    /// Flags/names that identify a Chromium/Firefox-family browser binary that is not inside any .app (e.g.
    /// Playwright's chrome-headless-shell in ~/Library/Caches) — judged only in user-writable locations.
    static let bareBrowserArgs = ["--type=renderer", "--type=gpu-process", "--remote-debugging", "--host-resolver-rules",
                                  "--headless", "--user-data-dir", "--disable-extensions", "-marionette", "--remote-allow-origins",
                                  "--proxy-server", "--host-rules"]
    static let bareBrowserNames = ["chrome", "chromium", "headless_shell", "firefox", "msedge", "brave", "electron"]

    public static func judgeBare(path: String, argv: [String]) -> Verdict {
        guard isUserWritable(path) else { return .allow }
        let name = (path as NSString).lastPathComponent.lowercased()
        if bareBrowserNames.contains(where: { name.contains($0) }) || argv.dropFirst().contains(where: { a in bareBrowserArgs.contains { a.hasPrefix($0) } }) {
            return .killTree(reason: "Browser uden app-pakke (\((path as NSString).lastPathComponent))")
        }
        return .allow
    }

    /// The real Chrome: outermost bundle at /Applications/Google Chrome.app.
    public static func isRealChrome(_ p: ProcFacts) -> Bool { p.outer?.path == chromePath && p.outer?.bundleId == "com.google.Chrome" }

    public static func isChromeMain(_ p: ProcFacts) -> Bool {
        isRealChrome(p) && p.path == chromePath + "/Contents/MacOS/Google Chrome"
    }

    /// Judge a process during a lock. `rules` is the user's app list.
    public static func judge(_ p: ProcFacts, rules: [AppRule]) -> Verdict {
        guard let outer = p.outer else { return .allow }   // bare executables: judged only via WebContent ownership
        if isProtectedSystemPath(p.path) && !p.bundles.contains(where: { knownBrowsers.contains($0.bundleId ?? "") }) {
            return .allow
        }

        // 1. The real Chrome: only the signature (debounced) and, for the main process, its flags.
        if isRealChrome(p) {
            if !outer.googleSigned { return .chromeSignatureFailed }
            if isChromeMain(p), let flag = p.argv.dropFirst().first(where: { a in bannedChromeFlags.contains { a.hasPrefix($0) } }) {
                return .killTree(reason: "Chrome startet med \(flag.split(separator: "=").first ?? "")")
            }
            return .allow
        }

        // 2. Any level that is a browser — including a Chrome copy anywhere else, or one hidden inside a wrapper .app.
        for b in p.bundles where !isChromeAppShim(b) {
            if isChromeId(b.bundleId) || b.googleSigned && b.kind == .browser {
                return .kill(reason: "Chrome-kopi uden for /Applications")
            }
            if knownBrowsers.contains(b.bundleId ?? "") || b.kind == .browser {
                let id = b.bundleId ?? outer.bundleId ?? "ukendt"
                return .killAndRecord(AppRule(bundleId: id, name: b.name ?? id, kind: .browser, blocked: true),
                                      reason: "Andre browsere end Chrome lukkes under fokus")
            }
        }

        // 3. The user's list, matched on the outermost app — and, when a team was recorded, on its signature.
        if let id = outer.bundleId, let r = rules.first(where: { $0.bundleId == id }) {
            if r.blocked { return .kill(reason: "\(r.name) er blokeret under fokus") }
            if r.teamId == nil || r.teamId == outer.teamId { return .allow }
            // Same bundle id, different or broken signature: not the app that was allowed → judged as unknown.
        }

        // 4. Unknown apps with a web engine at any level.
        if let engine = p.bundles.first(where: { $0.kind == .webengine }) {
            let id = outer.bundleId ?? engine.bundleId ?? "ukendt"
            if outer.bundleId == nil || !Validation.isBundleId(id) { return .kill(reason: "Ukendt app med indbygget browser") }
            return .killAndRecord(AppRule(bundleId: id, name: outer.name ?? id, kind: .webengine, blocked: true),
                                  reason: "Ukendt app med indbygget browser")
        }
        return .allow
    }

    /// The process responsible for a com.apple.WebKit.WebContent process (i.e. something rendering web pages).
    public static func judgeWebContentOwner(_ owner: ProcFacts, rules: [AppRule]) -> Verdict {
        guard let outer = owner.outer else {
            // A bare executable (osascript/JXA, the swift interpreter, python …) rendering web pages is a home-made browser.
            return isProtectedSystemPath(owner.path) && owner.path.hasPrefix("/usr/bin/") == false ? .allow
                : .kill(reason: "Program uden app-pakke viser websider (\((owner.path as NSString).lastPathComponent))")
        }
        let v = judge(owner, rules: rules)
        if v != .allow { return v }
        if let id = outer.bundleId, let r = rules.first(where: { $0.bundleId == id }), r.teamId == nil || r.teamId == outer.teamId { return .allow }
        if outer.appleSigned && !isUserWritable(outer.path) { return .allow }
        // A non-Apple app rendering web pages: allowed only from an admin-installed location AND with an intact signature.
        if !isUserWritable(outer.path) && outer.teamId != nil { return .allow }
        let id = outer.bundleId ?? "ukendt"
        guard outer.bundleId != nil else { return .kill(reason: "Ukendt app med indbygget browser") }
        return .killAndRecord(AppRule(bundleId: id, name: outer.name ?? id, kind: .webengine, blocked: true),
                              reason: "Ukendt app med indbygget browser")
    }
}
