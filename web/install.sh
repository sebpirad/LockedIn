#!/bin/bash
# LockedIn — installation med én kommando:
#   curl -fsSL https://sebpirad.github.io/LockedIn/install.sh | bash
set -euo pipefail
[ "$(uname)" = Darwin ] || { echo "LockedIn kræver en Mac."; exit 1; }
[ -d "/Applications/Google Chrome.app" ] || { echo "Installér Google Chrome først: https://www.google.com/chrome/"; exit 1; }
DIR="$HOME/LockedIn-installation"
echo "Henter LockedIn …"
rm -rf "$DIR" && mkdir -p "$DIR"
curl -fsSL https://github.com/sebpirad/LockedIn/releases/latest/download/LockedIn.tar.gz | tar -xz -C "$DIR"
cd "$DIR/LockedIn"
echo "Installerer (tast din Mac-adgangskode) …"
sudo ./install/install.sh < /dev/tty
open -R "/Library/Application Support/LockedIn/extension"
cat <<'TXT'

──────────────────────────────────────────────
 Næsten færdig — 3 trin:
 1. Systemindstillinger → Generelt → Enhedsadministration
    → "Locked in — Chrome" → Installér.
 2. Chrome: gå til  chrome://extensions  og slå Udviklertilstand til
    (øverst til højre).
 3. Træk mappen "extension" fra Finder-vinduet ind på den side.
 Tryk ⌘T — så åbner LockedIn.
──────────────────────────────────────────────
TXT
