import Foundation

/// Runs system tools by absolute path with a fixed, minimal environment.
/// /opt/homebrew is user-owned on this Mac, so nothing may ever be resolved through the caller's PATH.
public enum Shell {
    static let env = ["PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "C"]

    public static func run(_ tool: String, _ args: [String]) -> Int32 {
        output(tool, args, stdin: nil).status
    }

    /// Runs a tool and returns its output. A tool that has not finished after `timeout` seconds is killed, so a hung
    /// child can never freeze the daemon's queue (review 3, R3-4).
    public static func output(_ tool: String, _ args: [String], stdin: String?, timeout: Double = 5) -> (status: Int32, out: String) {
        precondition(tool.hasPrefix("/usr/") || tool.hasPrefix("/sbin/") || tool.hasPrefix("/bin/"), "absolute system path only")
        let p = Process()
        p.executableURL = URL(fileURLWithPath: tool)
        p.arguments = args
        p.environment = env
        let out = Pipe()
        p.standardOutput = out
        p.standardError = out
        let inPipe = Pipe()
        if stdin != nil { p.standardInput = inPipe }
        do { try p.run() } catch { return (-1, "\(error)") }
        if let s = stdin {
            inPipe.fileHandleForWriting.write(s.data(using: .utf8)!)
            try? inPipe.fileHandleForWriting.close()
        }
        let done = DispatchSemaphore(value: 0)
        var data = Data()
        DispatchQueue.global().async {
            data = out.fileHandleForReading.readDataToEndOfFile()
            done.signal()
        }
        if done.wait(timeout: .now() + timeout) == .timedOut {
            p.terminate()
            kill(p.processIdentifier, SIGKILL)
            _ = done.wait(timeout: .now() + 1)
            return (-2, "timeout")
        }
        p.waitUntilExit()
        return (p.terminationStatus, String(decoding: data, as: UTF8.self))
    }
}
