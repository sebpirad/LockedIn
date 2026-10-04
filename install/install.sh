#!/bin/bash
# Locked in — installation. Kør fra repoets rod:  sudo ./install/install.sh
# Kræver administrator (sudo). Bygger fra kildekoden med Command Line Tools.
# Efter nedgraderingen til standardkonto: administratoren installerer KUN fra en frisk `git clone` af
# github.com/sebpirad/LockedIn i en mappe, standardbrugeren ikke kan skrive i (se docs/ADMIN-TJEKLISTE.md).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

[ "$(id -u)" = 0 ] || { echo "Kør med sudo: sudo ./install/install.sh"; exit 1; }
USER_NAME="${SUDO_USER:-}"
[ -n "$USER_NAME" ] && [ "$USER_NAME" != root ] || { echo "Kør via sudo fra din egen konto."; exit 1; }
USER_UID="$(id -u "$USER_NAME")"

SUPPORT="/Library/Application Support/LockedIn"
BIN="/Library/PrivilegedHelperTools/dk.lockedin.daemon"
DPLIST="/Library/LaunchDaemons/dk.lockedin.daemon.plist"
APLIST="/Library/LaunchAgents/dk.lockedin.menu.plist"

echo "1/6  Bygger (som $USER_NAME) …"
sudo -u "$USER_NAME" bash -c "cd '$ROOT/daemon' && swift build -c release --product lockedind && swift build -c release --product LockedInMenu && swift build -c release --product CoreTests && .build/release/CoreTests" \
  || { echo "Bygning eller tests fejlede — intet er installeret."; exit 1; }
sudo -u "$USER_NAME" python3 tools/build-catalog.py >/dev/null

echo "2/6  Stopper en eventuel tidligere version …"
launchctl bootout system/dk.lockedin.daemon 2>/dev/null || true
launchctl bootout "gui/$USER_UID/dk.lockedin.menu" 2>/dev/null || true
for i in $(seq 1 20); do launchctl print system/dk.lockedin.daemon >/dev/null 2>&1 || break; sleep 0.5; done

echo "3/6  Installerer filer (root-ejet) …"
install -d -o root -g wheel -m 755 "$SUPPORT" /Library/PrivilegedHelperTools /Library/Logs/LockedIn
install -o root -g wheel -m 755 daemon/.build/release/lockedind "$BIN"
install -o root -g wheel -m 644 config/catalog.json "$SUPPORT/catalog.json"
APP="$SUPPORT/Locked in.app"
rm -rf "$APP"
install -d -o root -g wheel -m 755 "$APP/Contents/MacOS"
install -o root -g wheel -m 755 daemon/.build/release/LockedInMenu "$APP/Contents/MacOS/LockedInMenu"
install -o root -g wheel -m 644 install/menu-Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$BIN" >/dev/null 2>&1 || true
codesign --force --sign - "$APP" >/dev/null 2>&1 || true
install -o root -g wheel -m 644 install/dk.lockedin.daemon.plist "$DPLIST"
install -o root -g wheel -m 644 install/dk.lockedin.menu.plist "$APLIST"

# Chrome only force-installs Web Store extensions on a Mac that is not company-managed (TESTLOG T3), so the extension
# is also placed in a root-owned folder for "Indlæs upakket". The manifest key gives it the same id.
sudo -u "$USER_NAME" extension/tools/pack.sh >/dev/null
rm -rf "$SUPPORT/extension"
cp -R dist/extension "$SUPPORT/extension"
chown -R root:wheel "$SUPPORT/extension"
chmod -R go-w "$SUPPORT/extension"

echo "4/6  Starter tjenesten …"
launchctl bootstrap system "$DPLIST" || { sleep 2; launchctl bootstrap system "$DPLIST"; }
launchctl bootstrap "gui/$USER_UID" "$APLIST" 2>/dev/null || true
for i in $(seq 1 20); do
  curl -fsS -H 'X-LockedIn: 1' http://127.0.0.1:919/v1/status >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS -H 'X-LockedIn: 1' http://127.0.0.1:919/v1/status >/dev/null || { echo "Tjenesten svarer ikke — se /Library/Logs/LockedIn/lockedind.log"; exit 1; }
echo "     Tjenesten kører på 127.0.0.1:919."

if [ "${1:-}" = "--uden-profil" ]; then echo "5/6  Chrome-profil springes over (--uden-profil)."; else
echo "5/6  Chrome-profil …"
sudo -u "$USER_NAME" tools/make-profile.sh >/dev/null
sudo -u "$USER_NAME" open "$ROOT/dist/LockedIn-Chrome.mobileconfig" || true
echo "     Godkend profilen: Systemindstillinger → Generelt → Enhedsadministration → 'Locked in — Chrome' → Installér."
fi

echo "6/6  Tjek for kendte omgåelser …"
for app in "ExpressVPN" "Cold Turkey Blocker" "GoLogin"; do
  [ -e "/Applications/$app.app" ] && echo "     ⚠  /Applications/$app.app er installeret — skal afinstalleres (se docs/INSTALL.md)."
done
[ -e /Library/LaunchDaemons/com.expressvpn.expressvpnd.plist ] && echo "     ⚠  ExpressVPN's root-tjeneste findes stadig."
echo "Færdig."
echo "Chrome: chrome://extensions → Udviklertilstand → Indlæs upakket → ⌘⇧G → $SUPPORT/extension"
echo "(Er udvidelsen allerede indlæst derfra, så tryk bare 'Opdater' på chrome://extensions.)"
