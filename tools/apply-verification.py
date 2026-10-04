#!/usr/bin/env python3
"""Apply the independent verifier's FIX values (research/verification.json) to research/quotes.json.
Keeps the unverified original as research/quotes.raw.json. Dotted keys address nested fields."""
import json, pathlib, shutil
R = pathlib.Path(__file__).resolve().parent.parent / "research"
raw = R / "quotes.raw.json"
if not raw.exists():
    shutil.copy(R / "quotes.json", raw)
data = json.loads(raw.read_text())
ver = {v["id"]: v for v in json.loads((R / "verification.json").read_text())}
applied = 0
for q in data["quotes"]:
    v = ver.get(q["id"])
    q["verified"] = v["verdict"] if v else "UNVERIFIED"
    if v and v["verdict"] == "FIX" and v.get("fix"):
        for key, val in v["fix"].items():
            node = q
            *path, last = key.split(".")
            for p in path:
                node = node.setdefault(p, {})
            node[last] = val
            applied += 1
(R / "quotes.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
print(f"{applied} fields fixed; verdicts:", {k: sum(1 for q in data['quotes'] if q['verified'] == k) for k in ("PASS", "FIX", "REJECT", "UNVERIFIED")})
