#!/bin/bash
# Locked in — afinstallation (kræver administrator). Nægter under en aktiv session.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Kør med sudo."; exit 1; }
ACTIVE=$(curl -fsS -H 'X-LockedIn: 1' http://127.0.0.1:919/v1/status 2>/dev/null | /usr/bin/python3 -c 'import json,sys; print(json.load(sys.stdin)["active"])' 2>/dev/null || echo "ukendt")
if [ "$ACTIVE" = "True" ]; then echo "En session er aktiv. Locked in kan ikke afinstalleres, før den er slut."; exit 1; fi
USER_UID="$(id -u "${SUDO_USER:-root}")"
launchctl bootout system/dk.lockedin.daemon 2>/dev/null || true
launchctl bootout "gui/$USER_UID/dk.lockedin.menu" 2>/dev/null || true
rm -f /Library/LaunchDaemons/dk.lockedin.daemon.plist /Library/LaunchAgents/dk.lockedin.menu.plist /Library/PrivilegedHelperTools/dk.lockedin.daemon
rm -rf "/Library/Application Support/LockedIn"
rm -f /etc/newsyslog.d/dk.lockedin.conf
# Remove the managed hosts section and the pf anchor.
/usr/bin/python3 - <<'PY'
p = "/private/etc/hosts"
lines = open(p).read().split("\n")
out, inside = [], False
for l in lines:
    if l == "# >>> Locked in — styres automatisk, rediger ikke >>>": inside = True; continue
    if inside:
        if l == "# <<< Locked in <<<": inside = False
        continue
    out.append(l)
import os
tmp = p + ".lockedin.tmp"
with open(tmp, "w") as f: f.write("\n".join(out))
os.chmod(tmp, 0o644); os.chown(tmp, 0, 0); os.replace(tmp, p)
PY
/usr/bin/dscacheutil -flushcache; /usr/bin/killall -HUP mDNSResponder 2>/dev/null || true
/sbin/pfctl -q -a com.apple/lockedin -F all 2>/dev/null || true
echo "Locked in er fjernet. Fjern Chrome-profilen i Systemindstillinger → Generelt → Enhedsadministration."
