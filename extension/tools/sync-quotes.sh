#!/bin/sh
# Copies research/quotes.json + research/quote-images/ into extension/quotes/,
# rewriting image paths to "images/<file>". Quotes whose image file is missing keep
# their text but lose the image (and the script says so). Safe to re-run.
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_JSON="$ROOT/research/quotes-final.json"; [ -f "$SRC_JSON" ] || SRC_JSON="$ROOT/research/quotes.json"
SRC_IMG="$ROOT/research/quote-images"
DST="$ROOT/extension/quotes"

mkdir -p "$DST/images"

if [ ! -f "$SRC_JSON" ]; then
  echo "sync-quotes: $SRC_JSON findes ikke endnu."
  [ -f "$DST/quotes.json" ] || echo "[]" > "$DST/quotes.json"
  exit 0
fi

SRC_JSON="$SRC_JSON" SRC_IMG="$SRC_IMG" DST="$DST" node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
const { SRC_JSON, SRC_IMG, DST } = process.env;
const raw = JSON.parse(fs.readFileSync(SRC_JSON, "utf8"));
const list = Array.isArray(raw) ? raw : Array.isArray(raw.quotes) ? raw.quotes : [];
const SAFE = /^[A-Za-z0-9._-]+$/;
const out = [];
const used = new Set();
const ids = new Set();
let dropped = 0, noImage = 0;
for (const q of list) {
  if (!q || typeof q.id !== "string" || typeof q.text !== "string" || !q.text.trim() || typeof q.author !== "string" || ids.has(q.id)) {
    dropped++; continue;
  }
  ids.add(q.id);
  // Only what the quote page shows ("original" and research notes stay in research/).
  const pick = (o, keys) => (o && typeof o === "object" ? Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]])) : null);
  const copy = {
    id: q.id, text: q.text, author: q.author, author_dates: q.author_dates ?? null,
    source: pick(q.source, ["work", "year", "locator", "url"]),
    translation: pick(q.translation, ["translator", "edition", "year"]),
    image: pick(q.image, ["file", "license", "license_url", "creator", "attribution", "commons_page"]),
  };
  if (copy.image && typeof copy.image.file === "string") {
    const base = path.basename(copy.image.file);
    const from = path.join(SRC_IMG, base);
    if (SAFE.test(base) && fs.existsSync(from)) {
      fs.copyFileSync(from, path.join(DST, "images", base));
      used.add(base);
      copy.image.file = "images/" + base;
    } else {
      console.warn(`sync-quotes: billede mangler for ${q.id}: ${copy.image.file}`);
      copy.image = null; noImage++;
    }
  }
  out.push(copy);
}
for (const f of fs.readdirSync(path.join(DST, "images"))) {
  if (!used.has(f)) fs.rmSync(path.join(DST, "images", f));
}
fs.writeFileSync(path.join(DST, "quotes.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`sync-quotes: ${out.length} citater, ${used.size} billeder` + (dropped ? `, ${dropped} ugyldige sprunget over` : "") + (noImage ? `, ${noImage} uden billede` : ""));
'

# Art direction for the quote page: face box + yaw (Apple Vision, macOS only — skipped elsewhere, the last
# tools/quote-faces.json is kept), then tone, credit names, short source titles and image sizes.
if command -v swift >/dev/null 2>&1 && [ "$(uname)" = Darwin ]; then
  swift "$ROOT/extension/tools/measure-faces.swift" "$DST/images" > "$ROOT/extension/tools/quote-faces.json.tmp" \
    && mv "$ROOT/extension/tools/quote-faces.json.tmp" "$ROOT/extension/tools/quote-faces.json" \
    || { rm -f "$ROOT/extension/tools/quote-faces.json.tmp"; echo "sync-quotes: ansigtsmåling sprunget over"; }
fi
node "$ROOT/extension/tools/quote-art.mjs"
