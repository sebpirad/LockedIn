# Testlog — rigtig Mac (arm64, macOS 26.6.2, Chrome 154)

| # | Dato | Test | Resultat | Bevis |
|---|---|---|---|---|
| T1 | 2026-10-04 | Respekterer Chrome en manuelt installeret konfigurationsprofil (System-scope) uden MDM? Profil `dk.lockedin.test.t1` med `BrowserGuestModeEnabled=false`. | **Bestået.** chrome://policy: Kilde *Platform*, Gælder for *Maskine*, Niveau *Obligatorisk*, Status *OK*. | Skærmbillede fra ejeren, 2026-10-04 |
| T2 | 2026-10-04 | Rigtig session på 2 min via `POST /v1/session` (daemon installeret uden Chrome-profil og uden udvidelse). | **Bestået.** Under: instagram.com, www.youtube.com, youtu.be, slack.com → 0.0.0.0; `curl https://www.instagram.com` fejler; DoH `https://1.1.1.1/dns-query` blokeret (pf); `PATCH /v1/sites/instagram {"blocked":false}` → 423; Safari åbnet → lukket inden for 9 s. **Urørt:** app.powermatch.dk (302), journeys.adversus.dk, app.adversus.io, PowerLinks Railway-server, google.com. Efter: lås ophævet automatisk 2 s efter sluttid, `/etc/hosts` byte-identisk med før, DoH og Safari virker igen. | Terminal-output + `/Library/Logs/LockedIn/lockedind.log`, 12:54–12:56Z |

## Fund under T1
- Chrome modtager allerede **cloud-brugerpolitik** fra powermatch.dk (bl.a. `ExtensionSettings` med PowerLink `pkphnaobljakjanllihlllijndpknioo`). Platform/maskine slår cloud/bruger, og politikker flettes ikke. **Krav:** Locked in-profilens `ExtensionSettings` skal indeholde de eksisterende poster (PowerLink m.fl.), ellers forsvinder de.
- Manuelt skrevne filer i `/Library/Managed Preferences` er ikke vejen frem: macOS genskaber mappen ud fra installerede profiler. Der findes allerede en brugerprofil `system.dateandtime.force_date_time_configuration_*` (formentlig Skærmtid), som tvinger automatisk dato og tid.

## Endnu ikke testet
- At profilen overlever genstart (forventet: ja).
- At en Chrome startet med `--user-data-dir=<ny mappe>` også får maskinpolitikken.
- At en standardkonto ikke kan fjerne profilen.
