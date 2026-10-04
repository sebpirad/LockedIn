import AppKit

// Locked in menu-bar timer. Display only: it reads GET /v1/status and can open the control page.
// Quitting it changes nothing about the lock.

final class MenuApp: NSObject, NSApplicationDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let menu = NSMenu()
    let infoItem = NSMenuItem(title: "Henter status …", action: nil, keyEquivalent: "")
    let nextItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    var activeUntil: Date?
    var reachable = false
    let iso = ISO8601DateFormatter()
    lazy var clock: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "da_DK")
        f.timeZone = TimeZone(identifier: "Europe/Copenhagen")
        f.dateFormat = "EEE HH:mm"
        return f
    }()

    func applicationDidFinishLaunching(_ n: Notification) {
        menu.addItem(infoItem)
        menu.addItem(nextItem)
        menu.addItem(.separator())
        let open = NSMenuItem(title: "Åbn Locked in", action: #selector(openControl), keyEquivalent: "")
        open.target = self
        menu.addItem(open)
        item.menu = menu
        item.button?.font = NSFont.monospacedDigitSystemFont(ofSize: NSFont.systemFontSize, weight: .medium)
        render()
        poll()
        Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.poll() }
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.render() }
    }

    @objc func openControl() {
        let url = URL(string: "chrome-extension://nildondjeeibacombanbjnokenmhfhie/app.html")!
        let chrome = URL(fileURLWithPath: "/Applications/Google Chrome.app")
        NSWorkspace.shared.open([url], withApplicationAt: chrome, configuration: NSWorkspace.OpenConfiguration())
    }

    func poll() {
        var req = URLRequest(url: URL(string: "http://127.0.0.1:919/v1/status")!)
        req.setValue("1", forHTTPHeaderField: "X-LockedIn")
        req.timeoutInterval = 3
        URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            guard let self else { return }
            let json = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            DispatchQueue.main.async {
                self.reachable = json != nil
                self.activeUntil = (json?["activeUntil"] as? String).flatMap(self.iso.date(from:))
                if let n = json?["nextSession"] as? [String: Any], let s = (n["start"] as? String).flatMap(self.iso.date(from:)) {
                    self.nextItem.title = "Næste: \(self.clock.string(from: s))"
                } else {
                    self.nextItem.title = "Ingen planlagte sessioner"
                }
                self.render()
            }
        }.resume()
    }

    func render() {
        guard reachable else {
            item.button?.title = "🔒 ?"
            infoItem.title = "Locked in-tjenesten svarer ikke"
            return
        }
        if let until = activeUntil, until > Date() {
            let s = Int(until.timeIntervalSinceNow)
            item.button?.title = String(format: "🔒 %d:%02d:%02d", s / 3600, s / 60 % 60, s % 60)
            infoItem.title = "Låst til \(clock.string(from: until))"
        } else {
            item.button?.title = "🔓"
            infoItem.title = "Ingen aktiv session"
        }
    }
}

let app = NSApplication.shared
let delegate = MenuApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
