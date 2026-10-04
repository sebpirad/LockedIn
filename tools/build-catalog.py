#!/usr/bin/env python3
"""Build config/catalog.json (what the daemon loads) from research/domains.json + owner decisions.

Owner decisions 2026-10-04 (docs/ARCHITECTURE.md "Produktvalg"):
- Adversus: adversus.io + app.adversus.io, mode "tab" (Chrome main_frame only, never hosts) — PowerLink must keep working.
- Extra: Threads, TV3/Viafree/Allente, viaplaygroup.com.
- googlevideo.com blocked; accounts.youtube.com always allowed.
"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = json.loads((ROOT / "research/domains.json").read_text())
LABEL = r"[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?"
DOMAIN = re.compile(rf"^{LABEL}(\.{LABEL})+$")
NEVER = ("powermatch.dk", "railway.app", "journeys.adversus.dk")

def clean(hosts):
    out = []
    for h in hosts:
        h = h.strip().lower().rstrip(".")
        if not DOMAIN.match(h):
            raise SystemExit(f"invalid host in catalog: {h!r}")
        if any(h == n or h.endswith("." + n) for n in NEVER):
            raise SystemExit(f"forbidden host in catalog: {h}")
        if h not in out:
            out.append(h)
    return out

def site(id, label, suffixes, hosts=(), exact=(), regex=(), allow=(), mode="full"):
    allow = clean(allow)
    hostsfile = [] if mode == "tab" else [h for h in clean(list(suffixes) + ["www." + s for s in suffixes] + list(hosts) + list(exact)) if h not in allow]
    return {"id": id, "label": label, "builtin": True, "blocked": True, "mode": mode,
            "suffixes": clean(suffixes), "exactHosts": clean(exact), "regexFilters": list(regex),
            "allowHosts": allow, "hostsFile": hostsfile}

S = src["services"]
def from_src(key, label, mode="full"):
    v = S[key]
    return site(key, label, v.get("suffixes", []), v.get("hosts", []),
                v.get("host_only_in_shared_domains") or [], v.get("chrome_regex_filters") or [],
                v.get("chrome_allow_exceptions") or [], mode)

sites = [
    from_src("instagram", "Instagram"),
    from_src("youtube", "YouTube"),
    from_src("slack", "Slack"),
    site("adversus", "Adversus", ["adversus.io"], mode="tab"),
    from_src("viaplay", "Viaplay"),
    from_src("netflix", "Netflix"),
    site("threads", "Threads", ["threads.net", "threads.com"]),
    site("tv3", "TV3 / Viafree / Allente", ["tv3.dk", "tv3play.dk", "viafree.dk", "allente.dk"]),
    site("viaplaygroup", "Viaplay Group", ["viaplaygroup.com"]),
]
# Adversus: never anything but app/website tabs; the suffix adversus.io covers app.adversus.io.
assert sites[3]["hostsFile"] == []
yt = sites[1]
assert "accounts.youtube.com" in yt["allowHosts"] and "accounts.youtube.com" not in yt["hostsFile"]

doh = src["doh"]
catalog = {
    "version": 1,
    "sites": sites,
    "doh": {"ipv4": doh["ips_v4"], "ipv6": doh["ips_v6"], "hostnames": clean(doh["hostnames"])},
    # Apple documents these as the way a network turns iCloud Private Relay off (Safari bypass).
    "alwaysHosts": ["mask.icloud.com", "mask-h2.icloud.com"],
}
(ROOT / "config/catalog.json").write_text(json.dumps(catalog, indent=1, ensure_ascii=False) + "\n")
print("catalog:", ", ".join(f'{s["id"]}({len(s["suffixes"])}/{len(s["hostsFile"])})' for s in sites))
