#!/usr/bin/env python3
"""Builds the GitHub Pages site in web/: index.html + citater.html (+ images). Static, no external resources."""
import json, html, pathlib, shutil, sys
ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
src = ROOT / "research" / ("quotes-final.json" if (ROOT / "research/quotes-final.json").exists() else "quotes.json")
quotes = json.loads(src.read_text())["quotes"]
e = html.escape
CATS = {"leader": "Ledere og verdensforandrere", "conqueror": "Erobrere og strateger", "entrepreneur": "Iværksættere",
        "athlete": "Sportsfolk", "thinker": "Tænkere, videnskab og kunst", "explorer": "Eventyrere", "screen": "Film"}

CSS = """
:root{--bg:#0b0b0c;--fg:#f4f4f2;--mut:#8a8a86;--line:#222224;--acc:#f2c14e}
@media (prefers-color-scheme: light){:root:not([data-theme=dark]){--bg:#fafaf8;--fg:#141414;--mut:#6b6b66;--line:#e6e6e2;--acc:#b8860b}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg)}
body{font:16px/1.6 -apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",sans-serif;padding:0 16px}
main{max-width:760px;margin:0 auto;padding:72px 0 96px}
h1{font:600 clamp(44px,9vw,84px)/1 -apple-system,"SF Pro Display",sans-serif;letter-spacing:-.03em;margin:0 0 16px}
h2{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:600;margin:64px 0 16px}
p{margin:0 0 12px}a{color:var(--fg);text-underline-offset:3px}.mut{color:var(--mut)}
.lead{font-size:20px;color:var(--mut);max-width:560px}
ol,ul{padding-left:20px}li{margin:6px 0}code{font:14px ui-monospace,Menlo,monospace;background:var(--line);padding:2px 6px;border-radius:6px}
.q{display:grid;grid-template-columns:72px 1fr;gap:20px;padding:24px 0;border-top:1px solid var(--line)}
.q img{width:72px;height:90px;object-fit:cover;border-radius:6px;filter:grayscale(.2)}
.q blockquote{margin:0 0 8px;font:19px/1.5 "Iowan Old Style",Georgia,serif}
.q .who{font-weight:600}.q small{display:block;color:var(--mut);font-size:12.5px;line-height:1.5;margin-top:6px;overflow-wrap:anywhere}
nav{display:flex;gap:20px;margin-top:28px;flex-wrap:wrap}
"""

def page(title, body):
    return f"""<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><style>{CSS}</style></head><body><main>{body}</main></body></html>"""

repo = "https://github.com/sebpirad/LockedIn/blob/main"
index = f"""
<h1>Locked in</h1>
<p class="lead">Fokus til Mac. Vælg en liste og en varighed, et sluttidspunkt eller en planlagt periode. Så er de sider og apps låst, til tiden er gået.</p>
<nav><a href="{repo}/docs/INSTALL.md">Installation</a><a href="citater.html">Citater</a><a href="{repo}/docs/TESTLOG.md">Testrapport</a><a href="https://github.com/sebpirad/LockedIn">Kode</a></nav>

<h2>Sådan virker det</h2>
<ul>
<li>Gemte lister, fx "Locked In 1: Slack, Adversus, Instagram". Du vælger listen, når du starter eller planlægger.</li>
<li>En tjeneste på Mac'en blokerer sider for hele maskinen og lukker andre browsere under fokus.</li>
<li>Chrome-udvidelsen viser et citat i stedet for den blokerede side, også ved HTTPS.</li>
<li>Inkognito, gæstetilstand og nye Chrome-profiler er slået fra.</li>
<li>Kan ikke stoppes eller forkortes. Åbner automatisk, når tiden er gået. Højst 24 timer.</li>
</ul>
<p class="mut"><a href="{repo}/docs/HVORDAN-DET-VIRKER.md">Teknisk forklaring</a></p>

<h2>Forudsætninger</h2>
<p>Locked in er kun en reel lås, når du arbejder på en standardkonto, og en anden person har administratoradgangskoden (<a href="{repo}/docs/ADMIN-TJEKLISTE.md">tjekliste</a>). Som administrator kan du selv bryde den.</p>

<h2>Kendte begrænsninger</h2>
<ul class="mut">
<li>Fejlsikret tilstand starter Mac'en uden Locked in-tjenesten. Blokeringen i hosts og Chrome bliver liggende.</li>
<li>Tunneler startet fra Terminal kan omgå netværksblokeringen uden for Chrome.</li>
<li>Telefon og iPad er ikke omfattet.</li>
</ul>
"""
(WEB / "index.html").write_text(page("Locked in", index))

img_dir = WEB / "citater"
img_dir.mkdir(parents=True, exist_ok=True)
rows = []
order = list(CATS) + ["_"]
for cat in order:
    group = [q for q in quotes if q.get("category", "_") == cat]
    if not group: continue
    rows.append(f"<h2>{e(CATS.get(cat, 'Citater'))}</h2>")
    for q in group:
        im = q["image"]; name = pathlib.Path(im["file"]).name
        shutil.copy(ROOT / "research" / im["file"], img_dir / name)
        s = q["source"]
        tr = q.get("translation")
        trs = f" · Overs. {e(tr['translator'])}" if isinstance(tr, dict) and tr.get("translator") else ""
        src_link = f'<a href="{e(s["url"])}">{e(s["work"])}</a>' if s.get("url") else e(s["work"])
        rows.append(f"""<div class="q"><img src="citater/{e(name)}" alt="{e(q['author'])}" loading="lazy">
<div><blockquote>{e(q['text'])}</blockquote><span class="who">{e(q['author'])}</span> <span class="mut">{e(q.get('author_dates',''))}</span>
<small>{src_link}, {e(str(s.get('year','')))} · {e(s.get('locator',''))}{trs}</small>
<small>Foto: {e(im.get('attribution') or im.get('creator',''))} · <a href="{e(im['license_url'])}">{e(im['license'])}</a></small></div></div>""")
cit = f"""<h1>Citater</h1><p class="lead">{len(quotes)} citater med kilde og billedlicens. Hvert citat er kontrolleret mod kilden af en uafhængig gennemgang, og hver person er godkendt af ejeren.</p>
<nav><a href="index.html">← Locked in</a></nav>{''.join(rows)}"""
(WEB / "citater.html").write_text(page("Citater · Locked in", cit))
(WEB / ".nojekyll").write_text("")
print(f"web/: index.html, citater.html ({len(quotes)} citater fra {src.name})")
