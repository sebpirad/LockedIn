#!/bin/bash
# Writes dist/LockedIn-Chrome.mobileconfig — the static Chrome policy (System scope; only an admin can remove it).
# Deliberately NOT set: RemoteDebuggingAllowed (owner 2026-10-04: debugging flags are closed by the daemon only
# during sessions, so Playwright/DevTools keep working otherwise). ExtensionSettings / ExtensionInstallBlocklist — the powermatch.dk cloud policy uses
# ExtensionSettings for PowerLink, and a local value would replace it (docs/TESTLOG.md, T1).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
EXT_ID="nildondjeeibacombanbjnokenmhfhie"
UPDATE_URL="https://sebpirad.github.io/LockedIn/updates.xml"
# Stable UUIDs so a reinstall replaces the same profile instead of adding a second one.
cat > dist/LockedIn-Chrome.mobileconfig <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key><string>Locked in — Chrome</string>
  <key>PayloadDescription</key><string>Locked in: tvinger Locked in-udvidelsen på Chrome og slår inkognito, gæstetilstand, nye profiler, sikker DNS og proxy fra. Kan kun fjernes af en administrator.</string>
  <key>PayloadIdentifier</key><string>dk.lockedin.chrome</string>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadScope</key><string>System</string>
  <key>PayloadUUID</key><string>6C1D2E3F-4A5B-4C6D-8E7F-0A1B2C3D4E5F</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key><string>com.google.Chrome</string>
      <key>PayloadIdentifier</key><string>dk.lockedin.chrome.policy</string>
      <key>PayloadUUID</key><string>7D2E3F40-5B6C-4D7E-9F80-1B2C3D4E5F60</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadDisplayName</key><string>Chrome-politik</string>
      <key>ExtensionInstallForcelist</key>
      <array><string>${EXT_ID};${UPDATE_URL}</string></array>
      <key>IncognitoModeAvailability</key><integer>1</integer>
      <key>BrowserGuestModeEnabled</key><false/>
      <key>BrowserAddPersonEnabled</key><false/>
      <key>DnsOverHttpsMode</key><string>off</string>
      <key>ProxyMode</key><string>direct</string>
    </dict>
  </array>
</dict>
</plist>
PLIST
plutil -lint dist/LockedIn-Chrome.mobileconfig >/dev/null
echo "dist/LockedIn-Chrome.mobileconfig"
