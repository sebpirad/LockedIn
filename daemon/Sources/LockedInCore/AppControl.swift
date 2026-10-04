import Foundation
import Security
import Darwin

/// Reads the process table as root and applies AppPolicy verdicts. All judgement lives in AppPolicy.
public final class AppControl {
    private struct CacheKey: Hashable { let path: String; let stamp: String }
    /// Only successful signature checks are cached, keyed on Info.plist, the main executable and CodeResources
    /// (review 1, H3) — a failed or partial read is re-checked on the next tick.
    private var bundleCache: [CacheKey: BundleFacts] = [:]
    private var pendingKill: [Int32: Date] = [:]
    private var chromeSigFailSince: Date?
    private typealias RespFn = @convention(c) (pid_t) -> pid_t
    private let responsibleFn: RespFn? = {
        guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), "responsibility_get_pid_responsible_for_pid") else { return nil }
        return unsafeBitCast(sym, to: RespFn.self)
    }()
    public var webKitCheckAvailable: Bool { responsibleFn != nil }

    /// Full signature checks (resources included: an Electron app's JavaScript lives in Contents/Resources) of the
    /// running apps that a rule allows. Too slow for every tick, so they run on their own queue at lock start and every
    /// 15 minutes; a bundle that fails is treated as unsigned (→ "unknown app") until it passes again.
    private let deepQueue = DispatchQueue(label: "dk.lockedin.deepverify", qos: .utility)
    private let deepLock = NSLock()
    private var deepFailed: Set<String> = []
    private var deepFailCount: [String: Int] = [:]
    private var deepCheckedAt: [String: Date] = [:]
    private var deepRunning = false

    /// Called when the lock ends: a failed check from this session never carries into the next one.
    public func resetDeepVerify() {
        deepLock.lock(); deepFailed.removeAll(); deepFailCount.removeAll(); deepCheckedAt.removeAll(); deepLock.unlock()
    }
    public func deepFailedNames() -> [String] {
        deepLock.lock(); defer { deepLock.unlock() }
        return deepFailed.map { ($0 as NSString).lastPathComponent }
    }

    func isDeepFailed(_ path: String) -> Bool { deepLock.lock(); defer { deepLock.unlock() }; return deepFailed.contains(path) }

    func scheduleDeepVerify(_ paths: [String], now: Date) {
        deepLock.lock()
        // A bundle that failed once is re-checked after 60 s (an app caught mid-update); others every 15 minutes.
        let due = paths.filter { p in
            deepCheckedAt[p].map { now.timeIntervalSince($0) >= ((deepFailCount[p] ?? 0) > 0 ? 60 : 900) } ?? true
        }
        guard !due.isEmpty, !deepRunning else { deepLock.unlock(); return }
        deepRunning = true
        for p in due { deepCheckedAt[p] = now }
        deepLock.unlock()
        deepQueue.async { [weak self] in
            for p in due {
                var code: SecStaticCode?
                var ok = false
                if SecStaticCodeCreateWithPath(URL(fileURLWithPath: p) as CFURL, [], &code) == errSecSuccess, let code {
                    ok = SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSCheckAllArchitectures), nil) == errSecSuccess
                }
                self?.deepLock.lock()
                if ok {
                    self?.deepFailed.remove(p); self?.deepFailCount[p] = 0
                } else {
                    let n = (self?.deepFailCount[p] ?? 0) + 1
                    self?.deepFailCount[p] = n
                    // Only two failures in a row (≥ 60 s apart) mark the app as changed.
                    if n >= 2 { self?.deepFailed.insert(p) }
                }
                self?.deepLock.unlock()
            }
            self?.deepLock.lock(); self?.deepRunning = false; self?.deepLock.unlock()
        }
    }

    public init() {}

    // MARK: Process table

    struct Proc { let pid: Int32; let ppid: Int32; let path: String; let started: Date }

    func processes() -> [Proc] {
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0]
        var size = 0
        guard sysctl(&mib, 4, nil, &size, nil, 0) == 0 else { return [] }
        let count = size / MemoryLayout<kinfo_proc>.stride + 16
        var procs = [kinfo_proc](repeating: kinfo_proc(), count: count)
        size = count * MemoryLayout<kinfo_proc>.stride
        guard sysctl(&mib, 4, &procs, &size, nil, 0) == 0 else { return [] }
        let n = size / MemoryLayout<kinfo_proc>.stride
        var out: [Proc] = []
        var buf = [CChar](repeating: 0, count: 4096)
        for i in 0..<n {
            let pid = procs[i].kp_proc.p_pid
            guard pid > 1 else { continue }
            let len = proc_pidpath(pid, &buf, UInt32(buf.count))
            guard len > 0 else { continue }
            let tv = procs[i].kp_proc.p_un.__p_starttime
            out.append(Proc(pid: pid, ppid: procs[i].kp_eproc.e_ppid, path: String(cString: buf),
                            started: Date(timeIntervalSince1970: Double(tv.tv_sec) + Double(tv.tv_usec) / 1e6)))
        }
        return out
    }

    /// argv via KERN_PROCARGS2 (root can read every process).
    func argv(_ pid: Int32) -> [String] {
        var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > 4 else { return [] }
        var data = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, 3, &data, &size, nil, 0) == 0 else { return [] }
        let argc = Int(data.withUnsafeBytes { $0.load(as: Int32.self) })
        var i = 4
        while i < size && data[i] != 0 { i += 1 }        // exec path
        while i < size && data[i] == 0 { i += 1 }        // padding
        var args: [String] = []
        var start = i
        while i < size && args.count < argc {
            if data[i] == 0 {
                args.append(String(decoding: data[start..<i], as: UTF8.self))
                start = i + 1
            }
            i += 1
        }
        return args
    }

    // MARK: Bundles

    /// Every ".app" level of a path, innermost first.
    static func appLevels(_ path: String) -> [String] {
        var levels: [String] = []
        var search = path.startIndex..<path.endIndex
        while let r = path.range(of: ".app/", range: search) {
            levels.append(String(path[..<r.lowerBound]) + ".app")
            search = r.upperBound..<path.endIndex
        }
        return levels.reversed()
    }

    static func classify(bundle url: URL, info: [String: Any]) -> AppKind {
        if let types = info["CFBundleURLTypes"] as? [[String: Any]],
           types.contains(where: { (($0["CFBundleURLSchemes"] as? [String]) ?? []).contains { $0.lowercased() == "https" || $0.lowercased() == "http" } }) {
            return .browser
        }
        let fw = url.appendingPathComponent("Contents/Frameworks")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: fw.path)) ?? []
        let engine = names.contains { n in
            n == "Electron Framework.framework" || n == "Chromium Embedded Framework.framework" || n == "XUL.framework" ||
            (n.hasSuffix(" Framework.framework") && (n.contains("Chrome") || n.contains("Chromium") || n.contains("Browser")))
        }
        return engine ? .webengine : .app
    }

    private static func stamp(_ path: String) -> String {
        func s(_ p: String) -> String {
            var st = stat()
            guard lstat(p, &st) == 0 else { return "-" }
            return "\(st.st_ino):\(st.st_mtimespec.tv_sec):\(st.st_mtimespec.tv_nsec):\(st.st_size)"
        }
        let info = path + "/Contents/Info.plist"
        let exe = (NSDictionary(contentsOfFile: info)?["CFBundleExecutable"] as? String).map { path + "/Contents/MacOS/" + $0 } ?? ""
        return [s(path), s(info), s(exe), s(path + "/Contents/_CodeSignature/CodeResources")].joined(separator: "|")
    }

    func bundleFacts(_ bundlePath: String) -> BundleFacts {
        let key = CacheKey(path: bundlePath, stamp: Self.stamp(bundlePath))
        if let c = bundleCache[key] { return c }
        let url = URL(fileURLWithPath: bundlePath)
        let info = (NSDictionary(contentsOf: url.appendingPathComponent("Contents/Info.plist")) as? [String: Any]) ?? [:]
        let rawId = info["CFBundleIdentifier"] as? String
        let id = rawId.flatMap { Validation.isBundleId($0) ? $0 : nil }
        let name = (info["CFBundleDisplayName"] as? String) ?? (info["CFBundleName"] as? String) ?? url.deletingPathExtension().lastPathComponent
        var sig = Self.signature(bundlePath)
        // A signature that does not belong to THIS bundle (e.g. a copied /usr/bin/osascript as the main executable of a
        // fake .app) proves nothing about it (review 2, N8).
        if let id, let ident = sig.identifier, ident != id { sig = (nil, false, ident) }
        let exeSize = (info["CFBundleExecutable"] as? String).flatMap {
            try? FileManager.default.attributesOfItem(atPath: bundlePath + "/Contents/MacOS/" + $0)[.size] as? Int } ?? Int.max
        let tiny = !FileManager.default.fileExists(atPath: bundlePath + "/Contents/Frameworks") && exeSize < 2_000_000
        var f = BundleFacts(path: bundlePath, bundleId: id, name: name, kind: Self.classify(bundle: url, info: info),
                            appleSigned: sig.apple, googleSigned: sig.team == "EQHXZ8M8AV", teamId: sig.team, tinyShim: tiny)
        if AppPolicy.knownBrowsers.contains(id ?? "") { f.kind = .browser }
        // Cache only complete, verified results.
        if id != nil && (sig.team != nil || sig.apple) {
            if bundleCache.count > 1000 { bundleCache.removeAll() }
            bundleCache[key] = f
        }
        return f
    }

    /// Validates the signature including the main executable. Resources and nested code are not hashed here (too slow
    /// every tick); the running allowed apps and Chrome get a full check in the background (scheduleDeepVerify).
    static func signature(_ path: String) -> (team: String?, apple: Bool, identifier: String?) {
        var code: SecStaticCode?
        guard SecStaticCodeCreateWithPath(URL(fileURLWithPath: path) as CFURL, [], &code) == errSecSuccess, let code else { return (nil, false, nil) }
        let flags = SecCSFlags(rawValue: kSecCSDoNotValidateResources)
        guard SecStaticCodeCheckValidity(code, flags, nil) == errSecSuccess else { return (nil, false, nil) }
        var appleReq: SecRequirement?
        SecRequirementCreateWithString("anchor apple" as CFString, [], &appleReq)
        let apple = appleReq.map { SecStaticCodeCheckValidity(code, flags, $0) == errSecSuccess } ?? false
        var infoRef: CFDictionary?
        guard SecCodeCopySigningInformation(code, SecCSFlags(rawValue: kSecCSSigningInformation), &infoRef) == errSecSuccess,
              let info = infoRef as? [String: Any] else { return (nil, apple, nil) }
        return (info[kSecCodeInfoTeamIdentifier as String] as? String ?? (apple ? "apple" : nil), apple,
                info[kSecCodeInfoIdentifier as String] as? String)
    }

    func facts(_ p: Proc) -> ProcFacts {
        var f = ProcFacts(pid: p.pid, path: p.path, bundles: Self.appLevels(p.path).map { path -> BundleFacts in
            var b = bundleFacts(path)
            if isDeepFailed(path) { b.teamId = nil; b.googleSigned = false }
            return b
        })
        if AppPolicy.isChromeMain(f) { f.argv = argv(p.pid) }
        return f
    }

    // MARK: Enforcement

    public struct Outcome {
        public var killed: [String] = []; public var recorded: [AppRule] = []; public var problems: [String] = []
        public var realChromeRunning = false
    }

    /// One pass over the process table during a lock.
    /// `heartbeatOK` is false when the Locked in extension has not been heard from for 2 minutes: the real Chrome
    /// is then closed (if it has been running for 2 minutes) — Chrome without the extension has no quote page and no
    /// Adversus block.
    public func enforce(rules: [AppRule], heartbeatOK: Bool, now: Date = Date(), ownPid: Int32 = getpid()) -> Outcome {
        var out = Outcome()
        if responsibleFn == nil { out.problems.append("WebKit-kontrol er ikke tilgængelig på denne macOS") }
        let procs = processes()
        let byPid = Dictionary(procs.map { ($0.pid, $0) }, uniquingKeysWith: { a, _ in a })
        var killBundles: [String: String] = [:]   // outermost bundle path -> reason
        var killPids: [Int32: String] = [:]
        var chromeSigFailed = false
        var realChromeRunning = false

        func apply(_ v: Verdict, _ f: ProcFacts) {
            switch v {
            case .allow: break
            case .chromeSignatureFailed: chromeSigFailed = true
            case .kill(let reason):
                if let b = f.outer?.path { killBundles[b] = reason } else { killPids[f.pid] = reason }
            case .killAndRecord(let rule, let reason):
                out.recorded.append(rule)
                if let b = f.outer?.path { killBundles[b] = reason } else { killPids[f.pid] = reason }
            case .killTree(let reason):
                killPids[f.pid] = reason
            }
        }

        for p in procs where p.pid != ownPid {
            if p.path.contains("com.apple.WebKit.WebContent") || p.path.contains("com.apple.WebKit.Networking") {
                guard let fn = responsibleFn else { continue }
                let owner = fn(p.pid)
                guard owner > 1, owner != p.pid, owner != ownPid, let op = byPid[owner] else { continue }
                let f = facts(op)
                apply(AppPolicy.judgeWebContentOwner(f, rules: rules), f)
                continue
            }
            guard p.path.contains(".app/") else {
                if AppPolicy.isUserWritable(p.path) {
                    let v = AppPolicy.judgeBare(path: p.path, argv: argv(p.pid))
                    if case .killTree(let reason) = v { killPids[p.pid] = reason }
                }
                continue
            }
            let f = facts(p)
            apply(AppPolicy.judge(f, rules: rules), f)
            if AppPolicy.isChromeMain(f) && !heartbeatOK && now.timeIntervalSince(p.started) >= 120 && killPids[p.pid] == nil {
                killPids[p.pid] = "Locked in-udvidelsen svarer ikke i Chrome"
            }
            if AppPolicy.isChromeMain(f) && f.outer?.googleSigned == true { realChromeRunning = true }
        }

        // Allowed web-engine apps that are running get a full (resources included) signature check in the background.
        let allowed = Set(rules.filter { !$0.blocked && $0.kind == .webengine }.map(\.bundleId))
        var running: Set<String> = []
        for p in procs where p.path.contains(".app/") {
            if let outer = Self.appLevels(p.path).last, let id = bundleFacts(outer).bundleId, allowed.contains(id) { running.insert(outer) }
        }
        if procs.contains(where: { $0.path.hasPrefix(AppPolicy.chromePath + "/") }) { running.insert(AppPolicy.chromePath) }
        scheduleDeepVerify(Array(running), now: now)
        for n in deepFailedNames() { out.problems.append("\(n): appens signatur er ændret — behandles som ukendt app") }

        // The real Chrome failing its signature check: only after 60 s of continuous failure (updates replace files
        // in place; one failed read must never close Chrome and PowerLink with it).
        if chromeSigFailed {
            if chromeSigFailSince == nil { chromeSigFailSince = now }
            if now.timeIntervalSince(chromeSigFailSince!) >= 60 {
                killBundles[AppPolicy.chromePath] = "Chrome er ikke signeret af Google"
            } else {
                out.problems.append("Chromes signatur kunne ikke bekræftes — tjekker igen")
            }
        } else {
            chromeSigFailSince = nil
        }

        out.realChromeRunning = realChromeRunning
        for (bundle, reason) in killBundles {
            let pids = procs.filter { $0.path.hasPrefix(bundle + "/") && !AppPolicy.isProtectedSystemPath($0.path) }.map(\.pid)
            terminate(pids, now: now)
            out.killed.append("\((bundle as NSString).lastPathComponent): \(reason)")
        }
        for (pid, reason) in killPids {
            var tree: Set<Int32> = [pid]
            var grew = true
            while grew {
                grew = false
                for p in procs where tree.contains(p.ppid) && !tree.contains(p.pid) { tree.insert(p.pid); grew = true }
            }
            terminate(Array(tree), now: now)
            out.killed.append("pid \(pid): \(reason)")
        }
        return out
    }

    /// SIGTERM first; SIGKILL if the process is still there 3 s later.
    func terminate(_ pids: [Int32], now: Date) {
        for pid in pids {
            if let first = pendingKill[pid], now.timeIntervalSince(first) >= 3 {
                kill(pid, SIGKILL)
            } else if pendingKill[pid] == nil {
                pendingKill[pid] = now
                kill(pid, SIGTERM)
            }
        }
        pendingKill = pendingKill.filter { kill($0.key, 0) == 0 && now.timeIntervalSince($0.value) < 30 }
    }

    /// True when `pid` belongs to the real, Google-signed Chrome at /Applications/Google Chrome.app.
    public func isRealChromePid(_ pid: Int32) -> Bool {
        var buf = [CChar](repeating: 0, count: 4096)
        guard proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 else { return false }
        let path = String(cString: buf)
        guard path.hasPrefix(AppPolicy.chromePath + "/") else { return false }
        return bundleFacts(AppPolicy.chromePath).googleSigned
    }

    // MARK: Installed apps (for the UI picker and the first-run seed)

    public func installed(consoleUserHome: String?) -> [AppRule] {
        var dirs = ["/Applications", "/Applications/Utilities"]
        if let h = consoleUserHome { dirs.append(h + "/Applications") }
        var out: [AppRule] = []
        var seen = Set<String>()
        for d in dirs {
            for n in (try? FileManager.default.contentsOfDirectory(atPath: d)) ?? [] where n.hasSuffix(".app") {
                let f = bundleFacts(d + "/" + n)
                guard let id = f.bundleId, !Validation.protectedBundleIds.contains(id), seen.insert(id).inserted else { continue }
                out.append(AppRule(bundleId: id, name: f.name ?? id, kind: f.kind, blocked: f.kind == .browser, teamId: f.teamId))
            }
        }
        return out.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

/// Test access to pure helpers.
public enum AppControlTestHooks {
    public static func levels(_ path: String) -> [String] { AppControl.appLevels(path) }
}
