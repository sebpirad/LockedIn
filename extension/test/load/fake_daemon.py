"""Fake lockedind for test/load-in-chrome.sh. Binds 127.0.0.1 on a free port (never 919) and prints it.

GET  /v1/status     lock mode: active, 10 min left, catalog sites
                    spoof mode: active:false + every site gets allowHosts "instagram.com" (review M3)
POST /v1/heartbeat  recorded
POST /__mode/spoof  switch to spoof mode (test control)
GET  /__hits        what the extension sent
"""
import datetime, http.server, json, os, sys, threading

catalog = sys.argv[1]
if os.path.exists(catalog):
    SITES = json.load(open(catalog))["sites"]
else:
    SITES = json.load(open(os.path.join(os.path.dirname(__file__), "..", "..", "dev", "mock-status.json")))["sites"]
KEYS = ["id", "label", "builtin", "blocked", "mode", "suffixes", "exactHosts", "regexFilters", "allowHosts"]
state = {"mode": "lock", "hits": []}
lock = threading.Lock()


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        if self.path == "/__hits":
            with lock:
                return self._send(200, state["hits"])
        with lock:
            state["hits"].append(["GET", self.path, self.headers.get("X-LockedIn")])
        if self.path != "/v1/status":
            return self._send(404, {"error": "not_found", "message": "Findes ikke"})
        now = datetime.datetime.now(datetime.timezone.utc)
        fmt = "%Y-%m-%dT%H:%M:%SZ"
        until = (now + datetime.timedelta(minutes=10)).strftime(fmt)
        spoof = state["mode"] == "spoof"
        sites = []
        for s in SITES:
            x = {k: s.get(k, [] if k in ("suffixes", "exactHosts", "regexFilters", "allowHosts") else None) for k in KEYS}
            if spoof:
                x["allowHosts"] = list(x["allowHosts"] or []) + ["instagram.com"]
            sites.append(x)
        self._send(200, {
            "version": "fake", "now": now.strftime(fmt), "active": not spoof,
            "activeUntil": None if spoof else until,
            "activeSince": None if spoof else (now - datetime.timedelta(minutes=1)).strftime(fmt), "activeSources": [] if spoof else ["timer"],
            "nextSession": None, "maxSessionMinutes": 1440, "sites": sites, "apps": [], "schedules": [],
            "lists": [{"id": "l1", "name": "Locked In 1", "sites": [x["id"] for x in sites], "apps": []}],
            "activeLists": [] if spoof else ["l1"],
            "enforcement": {"hosts": True, "pf": True, "appControl": True, "lastTick": now.strftime(fmt), "lastHeartbeat": None},
        })

    def do_POST(self):
        n = int(self.headers.get("Content-Length", "0") or 0)
        body = self.rfile.read(n).decode() if n else ""
        if self.path == "/__mode/spoof":
            state["mode"] = "spoof"
            return self._send(200, {"ok": True})
        with lock:
            state["hits"].append(["POST", self.path, body])
        if self.path == "/v1/heartbeat":
            # Like the real daemon when the TCP peer is not Google Chrome (CfT is not): 403.
            return self._send(403, {"error": "forbidden", "message": "Kun Chrome"})
        self._send(403, {"error": "forbidden", "message": "Ikke i testen"})


srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
if srv.server_address[1] == 919:  # never stand in for (or next to) the real daemon
    sys.exit("fake daemon refuses port 919")
print(srv.server_address[1], flush=True)
srv.serve_forever()
