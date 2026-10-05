#!/bin/sh
# Drives the quote page (blocked.html?mock=1, dev mock served over http — not the extension) in Chrome for
# Testing and checks the design rules on real renders: layout, type, credit, contrast on pixels, print
# brightness, motion, the lock and "session over" states, the no-image fallback. See test/ui/drive-blocked.mjs.
#   FULL=1 sh test/blocked-in-chrome.sh          all 100 quotes (default: 24 that cover every hard case)
#   SHOTS=/path sh test/blocked-in-chrome.sh     also save a screenshot per quote and viewport
# It never talks to the real daemon: the driver blocks every URL on port 919 before loading anything.
set -eu
EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${CFT:-}" ]; then
  CFT="$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/"Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null | tail -1 || true)"
fi
[ -n "$CFT" ] && [ -x "$CFT" ] || { echo "blocked-in-chrome: Chrome for Testing not found (set CFT=...)" >&2; exit 2; }

# The real daemon closes Chrome for Testing during a real lock, so do not even start one then.
# (Read-only GET; nothing in these tests ever sends anything else to port 919.)
if curl -fsS -m 2 -H 'X-LockedIn: 1' http://127.0.0.1:919/v1/status 2>/dev/null \
   | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("active") else 1)' 2>/dev/null; then
  echo "En rigtig LockedIn-lås kører — vent til den er slut" >&2
  exit 3
fi
TMP="$(mktemp -d "${TMPDIR:-/tmp}/lockedin-blocked.XXXXXX")"
SPID=""; CPID=""
cleanup() { [ -n "$CPID" ] && kill "$CPID" 2>/dev/null || true; [ -n "$SPID" ] && kill "$SPID" 2>/dev/null || true; sleep 0.3; rm -rf "$TMP"; }
trap cleanup EXIT INT TERM
free() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])'; }

HTTP="$(free)"
CDP="$(free)"
for p in "$HTTP" "$CDP"; do [ "$p" = 919 ] && { echo "refusing port 919" >&2; exit 1; }; done
python3 -m http.server "$HTTP" --bind 127.0.0.1 --directory "$EXT_DIR" >/dev/null 2>&1 &
SPID=$!
"$CFT" --headless=new --user-data-dir="$TMP/profile" --remote-debugging-port="$CDP" --window-size=1600,1000 \
  --no-first-run --no-default-browser-check --disable-sync --disable-background-networking --hide-scrollbars about:blank > "$TMP/chrome.log" 2>&1 &
CPID=$!
sleep 1
node "$EXT_DIR/test/ui/drive-blocked.mjs" "$CDP" "$HTTP"
