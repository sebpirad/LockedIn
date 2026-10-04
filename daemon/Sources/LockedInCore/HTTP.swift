import Foundation
import Network

public struct HTTPRequest {
    public var method: String
    public var path: String
    public var headers: [String: String]   // lower-cased names
    public var body: Data
    public init(method: String, path: String, headers: [String: String], body: Data) {
        self.method = method; self.path = path; self.headers = headers; self.body = body
    }
}

public struct HTTPResponse {
    public var status: Int
    public var json: Any
    public init(_ status: Int, _ json: Any) { self.status = status; self.json = json }
}

public enum HTTPParse {
    public static let maxBody = 64 * 1024

    /// Returns a request once `data` holds a complete one, nil if more bytes are needed; throws on garbage.
    public static func parse(_ data: Data) throws -> HTTPRequest? {
        guard let headEnd = data.range(of: Data("\r\n\r\n".utf8)) else {
            if data.count > 16 * 1024 { throw URLError(.badServerResponse) }
            return nil
        }
        guard let head = String(data: data[..<headEnd.lowerBound], encoding: .utf8) else { throw URLError(.badServerResponse) }
        var lines = head.components(separatedBy: "\r\n")
        let first = lines.removeFirst().split(separator: " ")
        guard first.count == 3 else { throw URLError(.badServerResponse) }
        var headers: [String: String] = [:]
        for l in lines {
            guard let c = l.firstIndex(of: ":") else { continue }
            headers[l[..<c].trimmingCharacters(in: .whitespaces).lowercased()] = l[l.index(after: c)...].trimmingCharacters(in: .whitespaces)
        }
        let len = Int(headers["content-length"] ?? "0") ?? -1
        guard (0...maxBody).contains(len) else { throw URLError(.badServerResponse) }
        let bodyStart = headEnd.upperBound
        guard data.count - bodyStart >= len else { return nil }
        return HTTPRequest(method: String(first[0]), path: String(first[1]), headers: headers,
                           body: data[bodyStart..<(bodyStart + len)])
    }

    static let reasons = [200: "OK", 201: "Created", 204: "No Content", 400: "Bad Request", 403: "Forbidden",
                          404: "Not Found", 405: "Method Not Allowed", 413: "Payload Too Large", 423: "Locked", 500: "Internal Server Error"]

    public static func serialize(_ r: HTTPResponse) -> Data {
        let body = (try? JSONSerialization.data(withJSONObject: r.json, options: [.sortedKeys])) ?? Data("{}".utf8)
        // No Access-Control-Allow-* headers on purpose: web pages must never get a usable answer.
        let head = "HTTP/1.1 \(r.status) \(reasons[r.status] ?? "Status")\r\nContent-Type: application/json; charset=utf-8\r\n" +
                   "Content-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n"
        return Data(head.utf8) + body
    }
}

/// Minimal HTTP/1.1 server on 127.0.0.1 (one request per connection). `handler` runs on `queue`.
public final class LocalServer {
    let listener: NWListener
    let queue: DispatchQueue
    let handler: (HTTPRequest) -> HTTPResponse

    public init(port: UInt16, queue: DispatchQueue, handler: @escaping (HTTPRequest) -> HTTPResponse) throws {
        let params = NWParameters.tcp
        params.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!)
        params.allowLocalEndpointReuse = true
        listener = try NWListener(using: params)
        self.queue = queue
        self.handler = handler
    }

    public func start(onFailure: @escaping (Error) -> Void) {
        listener.stateUpdateHandler = { if case .failed(let e) = $0 { onFailure(e) } }
        listener.newConnectionHandler = { [weak self] c in self?.accept(c) }
        listener.start(queue: queue)
    }

    /// A local process holding thousands of idle connections must not starve the daemon of file descriptors
    /// (review 1, H4): at most `maxConnections` at once, each closed after `deadline` seconds.
    static let maxConnections = 16
    static let deadline: Double = 3
    private var open = 0

    func accept(_ c: NWConnection) {
        guard open < Self.maxConnections else { c.cancel(); return }
        open += 1
        var counted = true
        c.stateUpdateHandler = { [weak self] st in
            switch st {
            case .cancelled, .failed:
                if counted { counted = false; self?.open -= 1 }
            default: break
            }
        }
        c.start(queue: queue)
        queue.asyncAfter(deadline: .now() + Self.deadline) { if c.state != .cancelled { c.cancel() } }
        receive(c, Data())
    }

    func receive(_ c: NWConnection, _ buf: Data) {
        c.receive(minimumIncompleteLength: 1, maximumLength: 70 * 1024) { [weak self] data, _, done, err in
            guard let self else { return }
            var b = buf
            if let data { b.append(data) }
            do {
                if let req = try HTTPParse.parse(b) {
                    let resp = self.handler(req)
                    c.send(content: HTTPParse.serialize(resp), completion: .contentProcessed { _ in c.cancel() })
                } else if done || err != nil || b.count > 80 * 1024 {
                    c.cancel()
                } else {
                    self.receive(c, b)
                }
            } catch {
                c.send(content: HTTPParse.serialize(HTTPResponse(400, ["error": "invalid", "message": "Ugyldig forespørgsel."])),
                       completion: .contentProcessed { _ in c.cancel() })
            }
        }
    }
}
