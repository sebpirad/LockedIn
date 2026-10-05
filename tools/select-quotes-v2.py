#!/usr/bin/env python3
"""Builds research/quotes-final.json (v2): the owner's 54 persons (research/persons-v2.json), only quotes an
independent verifier passed (PASS, or FIX with the fix applied); REJECTs never used. Max 2 per person.
Owner's rule (2026-10-04): genuine always; fame = anthology OR documented most-cited line; every person keeps
at least their best genuine line. The v1 set is kept as research/quotes-final-v1.json."""
import json, pathlib, shutil, sys
R = pathlib.Path(__file__).resolve().parent.parent / "research"
SCR = pathlib.Path("/private/tmp/claude-501/-Users-sebastianpirad-powerlink/92b58899-467c-424a-8ed1-d3636b2fd856/scratchpad/new-images.json")

def load(name):
    return json.loads((R / name).read_text())

def apply(q, fix):
    q = json.loads(json.dumps(q))
    for key, val in (fix or {}).items():
        node = q
        *path, last = key.split(".")
        for p in path:
            node = node.setdefault(p, {})
        node[last] = val
    return q

quotes = {}
for qf, vf in (("quotes-v2-A.json", "verification-v2-A.json"), ("quotes-v2-B1.json", "verification-v2-B1.json"),
               ("quotes-v2-B2.json", "verification-v2-B2.json"), ("quotes-v2-B3.json", "verification-v2-B3.json"),
               ("quotes-v2-B4.json", "verification-v2-B4.json")):
    qs = {q["id"]: q for q in load(qf)["quotes"]}
    for v in load(vf):
        src = qs
        if v.get("source_file"):
            src = {q["id"]: q for q in load(v["source_file"])["quotes"]}
        if v["id"] not in src or v["verdict"] not in ("PASS", "FIX"):
            continue
        q = apply(src[v["id"]], v.get("fix") if v["verdict"] == "FIX" else None)
        q["fame"] = v.get("fame_confirmed", q.get("fame"))
        quotes[v["id"]] = q

# Owner wants a clean page: no editorial brackets in displayed text.
for q in quotes.values():
    if q["author"] == "Tom Brady" and q["text"].startswith("["):
        q["text"] = q["text"].split("]", 1)[1].strip()

# Image replacements decided by the verifiers.
new = json.loads(SCR.read_text())
new["v2-sun-tzu-pd"]["creator"] = "Ukendt kunstner (Qing-dynastiet)"
new["v2-sun-tzu-pd"]["attribution"] = "Ukendt kunstner (Qing-dynastiet), Public domain, via Wikimedia Commons (" + new["v2-sun-tzu-pd"]["commons_page"] + ")"
for q in quotes.values():
    if q["author"] == "Sun Tzu":
        q["image"] = new["v2-sun-tzu-pd"]
    if q["author"] == "Bruce Lee":
        q["image"] = new["v2-bruce-lee-pd"]
jordan = [q for q in quotes.values() if q["author"] == "Michael Jordan"]
safe = next((q for q in jordan if q["id"] == "a12"), None)
for q in jordan:
    if safe and q["id"] == "a02":
        q["image"] = dict(safe["image"])   # a02's own photo had an unclear permission record

groups = load("persons-v2.json")["groups"]
CAT = {"leaders": "leader", "conquerors": "conqueror", "thinkers": "thinker", "business": "entrepreneur",
       "sport": "athlete", "explorers": "explorer", "screen": "screen"}
ALIASES = {"Frederick the Great": "Frederick the Great", "Alexander the Great": "Alexander the Great"}
cat_of = {name: CAT[g] for g, names in groups.items() for name in names}

out, per = [], {}
for q in sorted(quotes.values(), key=lambda x: x["id"]):
    a = q["author"]
    cat = cat_of.get(a) or next((c for n, c in cat_of.items() if n.split()[-1] in a and n.split()[0] in a), None)
    if not cat:
        sys.exit(f"author not in persons-v2.json: {a}")
    if per.get(a, 0) >= 2:
        continue
    per[a] = per.get(a, 0) + 1
    q["category"] = cat
    assert (R / q["image"]["file"]).exists(), (q["id"], q["image"]["file"])
    out.append(q)

missing = [n for n in cat_of if not any(n == q["author"] or (n.split()[-1] in q["author"] and n.split()[0] in q["author"]) for q in out)]
if (R / "quotes-final.json").exists() and not (R / "quotes-final-v1.json").exists():
    shutil.copy(R / "quotes-final.json", R / "quotes-final-v1.json")
(R / "quotes-final.json").write_text(json.dumps({"quotes": out}, indent=1, ensure_ascii=False) + "\n")
from collections import Counter
print(len(out), "quotes,", len(per), "persons →", dict(Counter(q["category"] for q in out)))
print("persons without a quote:", missing or "none")
