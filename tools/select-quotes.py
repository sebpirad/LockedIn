#!/usr/bin/env python3
"""Builds research/quotes-final.json: 5 categories × 20, every quote independently verified (PASS or FIX applied).

Selection by the lead (2026-10-04), owner's rules: 5 × 20, ≥ 20 % women, max 2 per person, only images with
undoubted licences (doubtful ones flagged by the verifiers are left out), REJECTs never used.
"""
import json, pathlib, sys
R = pathlib.Path(__file__).resolve().parent.parent / "research"

def load(qfile, vfile):
    qs = {q["id"]: q for q in json.loads((R / qfile).read_text())["quotes"]}
    ver = {v["id"]: v for v in json.loads((R / vfile).read_text())} if (R / vfile).exists() else {}
    return qs, ver

def apply(q, v):
    q = json.loads(json.dumps(q))
    if v and v["verdict"] == "FIX" and v.get("fix"):
        for key, val in v["fix"].items():
            node = q
            *path, last = key.split(".")
            for p in path:
                node = node.setdefault(p, {})
            node[last] = val
    return q

PICK = {
    # quotes.json already has its verifier fixes applied (tools/apply-verification.py).
    "leader": ("quotes.json", None, ["q003", "q002", "q055", "q079", "q091", "q080", "q090", "q095", "q086", "q059",
                                     "q097", "q069", "q038", "q040", "q067", "q087", "q088", "q014", "q056", "q081"]),
    "thinker": ("quotes.json", None, ["q004", "q064", "q061", "q062", "q007", "q036", "q037", "q060", "q099", "q013",
                                      "q066", "q051", "q092", "q094", "q041", "q042", "q019", "q021", "q089", "q020"]),
    "entrepreneur": ("quotes-entrepreneur.json", "verification-entrepreneur.json",
                     ["e01", "e02", "e03", "e04", "e05", "e08", "e09", "e10", "e12", "e13", "e14", "e17", "e18", "e19",
                      "e20", "e22", "e23", "e24", "e25", "e26"]),
    "athlete": ("quotes-athlete.json", "verification-athlete.json", None),   # filled in after verification
    "explorer": ("quotes-explorer.json", "verification-explorer.json",
                 ["x01", "x02", "x03", "x04", "x05", "x06", "x07", "x09", "x10", "x11", "x12", "x16", "x17", "x18",
                  "x19", "x20", "x21", "x22", "x23", "x24"]),
}
ATHLETES = sys.argv[1].split(",") if len(sys.argv) > 1 else None

out = []
for cat, (qf, vf, ids) in PICK.items():
    ids = ATHLETES if cat == "athlete" else ids
    if not ids:
        sys.exit(f"{cat}: no ids yet")
    qs, ver = load(qf, vf) if vf else (load(qf, "verification.json")[0], {})
    if len(ids) != 20 or len(set(ids)) != 20:
        sys.exit(f"{cat}: need 20 distinct ids, got {len(ids)}")
    for i in ids:
        v = ver.get(i)
        if v and v["verdict"] == "REJECT":
            sys.exit(f"{i} was rejected by the verifier")
        if vf and not v:
            sys.exit(f"{i} has not been verified")
        q = apply(qs[i], v)
        q["category"] = cat
        out.append(q)

# x06's own photo (Frank Hurley, d. 1962) may still be protected in the EU: use x05's Shackleton portrait.
x05 = next(q for q in out if q["id"] == "x05")
for q in out:
    if q["id"] == "x06":
        q["image"] = dict(x05["image"])

from collections import Counter
per = Counter(q["author"] for q in out)
assert max(per.values()) <= 2, per.most_common(3)
for q in out:
    assert (R / q["image"]["file"]).exists(), q["id"]
(R / "quotes-final.json").write_text(json.dumps({"quotes": out}, indent=1, ensure_ascii=False) + "\n")
print(f"{len(out)} quotes → research/quotes-final.json; per category:", Counter(q["category"] for q in out))
