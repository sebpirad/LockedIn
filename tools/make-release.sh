#!/bin/bash
# Builds a prebuilt package (universal: Apple silicon + Intel) for the one-line installer:
#   dist/LockedIn.tar.gz  →  GitHub Release asset, fetched by web/install.sh
# Contents: bin/ (lockedind, LockedInMenu), install/, config/catalog.json, dist/extension/, tools/make-profile.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
(cd daemon
 swift build -c release 2>&1 | grep -E "error:" | grep -v xcrun || true
 swift build -c release --triple x86_64-apple-macosx13.0 --scratch-path .build-x86 2>&1 | grep -E "error:" | grep -v xcrun || true
 .build/release/CoreTests | tail -1)
python3 tools/build-catalog.py >/dev/null
extension/tools/pack.sh >/dev/null
STAGE="$(mktemp -d)/LockedIn"
mkdir -p "$STAGE/bin" "$STAGE/config" "$STAGE/dist" "$STAGE/tools"
for p in lockedind LockedInMenu; do
  lipo -create "daemon/.build/release/$p" "daemon/.build-x86/x86_64-apple-macosx/release/$p" -output "$STAGE/bin/$p"
done
cp -R install "$STAGE/install"
cp config/catalog.json "$STAGE/config/"
cp -R dist/extension "$STAGE/dist/extension"
cp tools/make-profile.sh "$STAGE/tools/"
mkdir -p dist
tar -C "$(dirname "$STAGE")" -czf dist/LockedIn.tar.gz LockedIn
lipo -info "$STAGE/bin/lockedind"
echo "dist/LockedIn.tar.gz ($(du -h dist/LockedIn.tar.gz | cut -f1))"
