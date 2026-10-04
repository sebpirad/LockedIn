#!/bin/bash
# Packs the extension into a signed CRX for GitHub Pages: web/locked-in.crx + web/updates.xml.
# Needs keys/locked-in.pem (never committed). The extension id is derived from it: nildondjeeibacombanbjnokenmhfhie.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
[ -f keys/locked-in.pem ] || { echo "keys/locked-in.pem mangler"; exit 1; }
extension/tools/pack.sh >/dev/null
VERSION=$(python3 -c "import json;print(json.load(open('dist/extension/manifest.json'))['version'])")
rm -f dist/extension.crx
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --pack-extension="$ROOT/dist/extension" --pack-extension-key="$ROOT/keys/locked-in.pem" >/dev/null 2>&1 || true
[ -f dist/extension.crx ] || { echo "CRX blev ikke lavet"; exit 1; }
mv dist/extension.crx web/locked-in.crx
cat > web/updates.xml <<XML
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='nildondjeeibacombanbjnokenmhfhie'>
    <updatecheck codebase='https://sebpirad.github.io/LockedIn/locked-in.crx' version='${VERSION}' />
  </app>
</gupdate>
XML
echo "web/locked-in.crx (v${VERSION}, $(du -h web/locked-in.crx | cut -f1)) + web/updates.xml"
