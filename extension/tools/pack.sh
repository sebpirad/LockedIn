#!/bin/sh
# Copies only the runtime files into ../dist/extension/ (no test/, tools/, dev/).
# Fails if anything dev-only would ship.
set -eu

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DST="$(cd "$SRC/.." && pwd)/dist/extension"

rm -rf "$DST"
mkdir -p "$DST"

for f in manifest.json background.js content.js app.html blocked.html; do
  cp "$SRC/$f" "$DST/$f"
done
mkdir -p "$DST/lib" "$DST/ui" "$DST/icons" "$DST/quotes/images"
cp "$SRC"/lib/*.js "$DST/lib/"
cp "$SRC"/ui/*.js "$SRC"/ui/*.css "$DST/ui/"
cp "$SRC"/icons/*.png "$DST/icons/"
cp "$SRC/quotes/quotes.json" "$DST/quotes/"
if ls "$SRC"/quotes/images/* >/dev/null 2>&1; then cp "$SRC"/quotes/images/* "$DST/quotes/images/"; fi

for bad in dev test tools; do
  if [ -e "$DST/$bad" ]; then echo "pack: $bad/ må ikke med" >&2; exit 1; fi
done
if grep -rl "mock-status\|sample-quotes" "$DST" --include=*.json >/dev/null 2>&1; then
  echo "pack: mock-data fundet i pakken" >&2; exit 1
fi
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$DST/manifest.json"

echo "pack: $(find "$DST" -type f | wc -l | tr -d " ") filer i $DST"
