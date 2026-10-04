#!/bin/sh
# Loads the packed extension into a throwaway Chrome for Testing profile and checks it for real.
#
# Never talks to the real daemon: the real lockedind listens on 127.0.0.1:919, and the shipped
# build has that port hardcoded (no override exists in shipped code). So this script packs with
# tools/pack.sh, copies dist/extension to a temp dir and rewrites the port in exactly three places
# (lib/api.js DAEMON, manifest host_permissions, manifest CSP connect-src) to a fake daemon on a
# free port. It asserts that nothing else differs from what ships.
#
# Needs: Chrome for Testing (CFT=/path/to/binary, default: Playwright's cache), python3, node 22+.
set -eu

EXT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$EXT_DIR/.." && pwd)"
ID=nildondjeeibacombanbjnokenmhfhie

if [ -z "${CFT:-}" ]; then
  CFT="$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/"Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" 2>/dev/null | tail -1 || true)"
fi
if [ -z "$CFT" ] || [ ! -x "$CFT" ]; then
  echo "load-in-chrome: Chrome for Testing not found (set CFT=...)" >&2
  exit 2
fi

# The real daemon closes Chrome for Testing during a real lock, so do not even start one then.
# (Read-only GET; nothing in these tests ever sends anything else to port 919.)
if curl -fsS -m 2 -H 'X-LockedIn: 1' http://127.0.0.1:919/v1/status 2>/dev/null \
   | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("active") else 1)' 2>/dev/null; then
  echo "En rigtig LockedIn-lås kører — vent til den er slut" >&2
  exit 3
fi
TMP="$(mktemp -d "${TMPDIR:-/tmp}/lockedin-load.XXXXXX")"
DPID=""; CPID=""
cleanup() {
  [ -n "$CPID" ] && kill "$CPID" 2>/dev/null || true
  [ -n "$DPID" ] && kill "$DPID" 2>/dev/null || true
  sleep 0.5
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

sh "$EXT_DIR/tools/pack.sh" >/dev/null

# Fake daemon on a free port (prints the port).
python3 -u "$EXT_DIR/test/load/fake_daemon.py" "$ROOT/config/catalog.json" > "$TMP/daemon.out" 2>&1 &
DPID=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$TMP/daemon.out" ] && break; sleep 0.2; done
DPORT="$(head -1 "$TMP/daemon.out")"
case "$DPORT" in ''|*[!0-9]*) echo "fake daemon did not start: $(cat "$TMP/daemon.out")" >&2; exit 1;; esac
[ "$DPORT" = 919 ] && { echo "refusing port 919" >&2; exit 1; }

# Test copy: identical to dist/extension except the daemon port.
cp -R "$ROOT/dist/extension" "$TMP/ext"
sed -i '' "s#http://127.0.0.1:919#http://127.0.0.1:$DPORT#g" "$TMP/ext/lib/api.js" "$TMP/ext/manifest.json"
CHANGED="$(diff -r "$ROOT/dist/extension" "$TMP/ext" | grep -c '^>' || true)"
if [ "$CHANGED" != 3 ] || grep -rq "127.0.0.1:919" "$TMP/ext"; then
  echo "test copy differs from the shipped build in more than the port ($CHANGED lines)" >&2
  diff -r "$ROOT/dist/extension" "$TMP/ext" >&2 || true
  exit 1
fi

CDP="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
"$CFT" --headless=new --user-data-dir="$TMP/profile" --remote-debugging-port="$CDP" \
  --no-first-run --no-default-browser-check --disable-sync --disable-background-networking \
  --disable-extensions-except="$TMP/ext" --load-extension="$TMP/ext" \
  --enable-logging=stderr --v=0 about:blank > "$TMP/chrome.log" 2>&1 &
CPID=$!

echo "Chrome for Testing: $("$CFT" --version 2>/dev/null)"
echo "fake daemon: 127.0.0.1:$DPORT (the real one on :919 is never contacted)"
STATUS=0
node "$EXT_DIR/test/load/drive.mjs" "$CDP" "$DPORT" "$ID" || STATUS=$?

if grep -E "load_error_reporter|Extension error|manifest" "$TMP/chrome.log" | grep -vi "registration_request" >/dev/null; then
  echo "FAIL  Chrome reported an extension/manifest error:"
  grep -E "load_error_reporter|Extension error|manifest" "$TMP/chrome.log"
  STATUS=1
else
  echo "PASS  no extension or manifest errors in Chrome's log"
fi
exit "$STATUS"
