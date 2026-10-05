# lockedind lokal API (v1)

Daemonen lytter på **`http://127.0.0.1:919`**. Porten er ikke på Chromes liste over spærrede porte.

**Porten er ikke beskyttet.** På macOS kan en almindelig bruger binde `0.0.0.0` på en lav port (review 1, M4). Derfor:
- Blokeringen afhænger aldrig af API'et. Den kører videre, selv om porten er optaget.
- Daemonen lukker den proces, der har taget porten, og prøver igen hvert 5. sekund.
- Udvidelsen stoler aldrig på et svar, der vil forkorte en lås.

Højst 16 samtidige forbindelser er tilladt, og hver forbindelse lukkes efter 3 sekunder. Headeren `Host` skal være `127.0.0.1:919`, hvilket stopper DNS-rebinding.

## Sikkerhedsregler for hver forespørgsel
- Headeren `X-LockedIn: 1` er påkrævet. Den tvinger browsere til en CORS-preflight, som daemonen aldrig godkender, så almindelige hjemmesider kan ikke kalde API'et.
- Er `Origin` sat, skal den være `chrome-extension://nildondjeeibacombanbjnokenmhfhie`. Ellers svarer daemonen 403.
- Body er JSON (`Content-Type: application/json`) og højst 64 KB.
- Alle tider er ISO 8601 i UTC (`2026-10-04T12:00:00Z`). Visning sker i `Europe/Copenhagen`.
- Fejl har formen `{"error": "<kode>", "message": "<dansk tekst til brugeren>"}`.
  - **423** `locked`: kan ikke svækkes under en aktiv session.
  - **400** `invalid`
  - **404** `not_found`
  - **403** `forbidden`

## Endpoints

### `GET /v1/status`
```json
{
  "version": "1.1.0",
  "now": "…Z",
  "active": true,
  "activeUntil": "…Z",
  "activeSince": "…Z",            // start af den samlede lås (24-timersloftet regnes herfra), null hvis inaktiv            // sluttid for den samlede aktive lås (max af timer og aktive planvinduer), null hvis inaktiv
  "activeSources": ["timer", "schedule:ab12"],
  "nextSession": {"start": "…Z", "end": "…Z", "scheduleId": "ab12", "name": "Morgenfokus"},  // eller null
  "maxSessionMinutes": 1440,
  "sites": [{"id": "instagram", "label": "Instagram", "builtin": true, "blocked": true,
             "mode": "full",      // "full" = hosts + Chrome alle ressourcetyper; "tab" = kun main_frame i Chrome (Adversus)
             "suffixes": ["instagram.com", "…"], "exactHosts": ["…"], "regexFilters": ["…"], "allowHosts": ["accounts.youtube.com"]}],
  "apps": [{"bundleId": "com.todoist.mac.Todoist", "name": "Todoist", "kind": "webengine", "blocked": false}],
  // kind: "browser" | "webengine" | "app"
  "schedules": [{"id": "ab12", "name": "Morgenfokus", "weekdays": [1,2,3,4,5], "start": "09:00", "end": "12:00", "enabled": true}],
  // weekdays: 1 = mandag … 7 = søndag. end <= start betyder, at vinduet går over midnat.
  "enforcement": {"hosts": true, "pf": true, "appControl": true, "lastTick": "…Z", "lastHeartbeat": "…Z"}
}
```
Betydningen af `sites[].blocked` og `apps[].blocked` er ændret i v1.2. Se afsnittet "Lister" nederst.

### `POST /v1/session` `{"minutes": 90}` eller `{"until": "2026-10-05T13:00:00Z"}`
`until` bruges til "Locked in indtil kl. 15:00": sessionen slutter præcis på det tidspunkt. Tidspunktet skal ligge mindst 1 minut og højst 24 timer ude i fremtiden, ellers svarer daemonen 400 med "Vælg et senere tidspunkt." Udvidelsen tilbyder kun senere tidspunkter i dag.

Starter en session eller forlænger den aktive: ny slut = max(nuværende slut, nu + minutes). Gyldige værdier er 1–1440 minutter. **Én samlet lås må højst vare 24 timer.** Det gælder timer og faste tider i forlængelse af hinanden, regnet fra låsens start, og alt, der ville gøre den længere, afvises med 400 "En samlet lås kan højst vare 24 timer." Svarer med status.

### Hjemmesider
- `POST /v1/sites` `{"label": "Reddit", "domain": "reddit.com", "list"?}`: tilføjer et eget domæne (`mode: "full"`). Domænet valideres mod `^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$` efter IDN→punycode, trim og små bogstaver.
- `DELETE /v1/sites/{id}`: kun egne sider. Svarer 423, hvis siden står på en liste i den kørende lås.

### Apps
- `GET /v1/installed`: svarer `{"apps": [...]}` med installerede apps fra `/Applications`, `/Applications/Utilities` og konsolbrugerens `~/Applications`, hver som `{bundleId, name, kind, blocked}`.
- `POST /v1/apps` `{"bundleId": "…", "list"?}`: registrerer en installeret app. Under en lås registreres en app med web-motor som "altid lukket".
- `PATCH /v1/apps/{bundleId}` `{"blocked": bool}`: "altid lukket" til/fra ("Tillad"). `false` giver 423 under en lås og 400 for browsere.
- `DELETE /v1/apps/{bundleId}`: giver 423 under en aktiv session.

### Planer
- `POST /v1/schedules` `{"name", "weekdays", "start", "end", "enabled"}`: afvises med 400, hvis tiden sammen med andre faste tider eller timeren giver en samlet lås på over 24 timer.
- `PUT /v1/schedules/{id}` og `DELETE /v1/schedules/{id}`: giver 423 under en aktiv session. At tilføje en ny plan er altid tilladt.

### `POST /v1/heartbeat` `{"extensionVersion": "1.0.0"}`
Udvidelsen sender et hjerteslag mindst hvert 30. sekund. Svarer `{"ok": true}`, men **kun når forbindelsen kommer fra den rigtige Chrome**. Daemonen slår processen bag forbindelsen op, og alle andre får 403.

## Lister (v1.2)
En **liste** er et navngivet sæt hjemmesider og apps, fx "Locked In 1": Slack, Adversus, Instagram. Lister erstatter de tidligere til/fra-knapper pr. side og app.

- `GET /v1/status` indeholder desuden:
  - `lists: [{id, name, sites: [siteId], apps: [bundleId]}]`
  - `activeLists: [id]`: de lister, der gælder lige nu.
  - `sites[].blocked`: om siden er blokeret **lige nu**. Den er altid `false` uden for en lås.
  - `apps[].blocked`: appen er **altid lukket under fokus**. Det gælder browsere og ukendte apps med web-motor.
  - `apps[].inActiveList`: appen er lukket nu, fordi den står på en aktiv liste.
  - `schedules[].list` og `schedules[].date`. `date` er `"YYYY-MM-DD"` for en enkelt periode og `null` for ugentlig.
  - `nextSession.list` og `nextSession.listName`.
- `POST /v1/session` `{"minutes": 90, "list": "<id>"}` eller `{"until": "…Z", "list": "<id>"}`. Uden `list` bruges den første liste. Starter man igen under en lås med en anden liste, gælder begge lister.
- `POST /v1/lists` `{"name", "sites", "apps"}`. Ukendte id'er droppes. Højst 20 lister.
- `PUT /v1/lists/{id}` `{"name", "sites", "apps"}`. Er listen en del af den kørende lås, også via en planlagt periode, der ligger i forlængelse af den, må den kun **vokse**, og ellers svarer daemonen 423. Navnet må altid ændres.
- **Én sammenhængende lås blokerer alt fra alle sine lister, til den slutter.** Hvis en timer på liste A går over i en planlagt periode på liste B, er A og B begge blokeret til B slutter. Chrome gør det samme.
- `DELETE /v1/lists/{id}`. Svarer 423, hvis listen er i brug. Svarer 400, hvis den er den sidste liste, eller hvis en planlagt periode bruger den.
- `POST /v1/sites` `{"label", "domain", "list"?}` tilføjer en egen hjemmeside og eventuelt direkte til en liste. Det er altid tilladt.
- `DELETE /v1/sites/{id}` gælder kun egne sider. Svarer 423, hvis siden står på en aktiv liste.
- `POST /v1/apps` `{"bundleId", "list"?}` registrerer en installeret app og eventuelt på en liste.
- `PATCH /v1/apps/{bundleId}` `{"blocked": false}` betyder "Tillad" for en ukendt app, der er sat til altid at være lukket. Browsere kan ikke tillades.
- `POST /v1/schedules` `{"name", "list", "start", "end", "weekdays"}` for ugentlige perioder eller `{"name", "list", "start", "end", "date": "2026-10-06"}` for en enkelt periode. En enkelt periode skal ligge i fremtiden. Den fjernes automatisk, når den er slut, og ingen lås kører.
- `PATCH /v1/sites/{id}` findes **ikke** længere.

## Planlæg (v1.3)
- `schedules[].frozen` er `true`, når perioden er en del af den kørende lås (også i forlængelse af den). Kun de perioder kan ikke rettes eller slettes (423). Alle andre kan rettes frit, også under en lås (ejerens valg 2026-10-04).
- `schedules[].skip` er en liste af dage (`"YYYY-MM-DD"`), som en ugentlig periode springes over.
- `POST /v1/skip/{scheduleId}` `{"date": "2026-10-09"}`: "Spring over denne gang". Kun ugentlige perioder og kun en dag, hvor perioden ligger. Svarer 423, hvis forekomsten er en del af den kørende lås.
- `DELETE /v1/skip/{scheduleId}` `{"date": "…"}`: fortryder. Svarer 400, hvis det ville skabe en samlet lås på over 24 timer.
- "Næste" og forekomster beregnes 14 dage frem.

## Lukkes aldrig (v1.4)
- `apps[].neverClose` er `true` for apps, der aldrig lukkes af LockedIn (ejerens ønske 2026-10-05: fx Spark, Wispr Flow og Claude). Signaturkontrollen gælder stadig, så en anden app med samme navn er ikke undtaget.
- `PATCH /v1/apps/{bundleId}` `{"neverClose": true|false}`. Når feltet slås til, fjernes appen fra alle lister. Daemonen svarer 423, hvis appen er lukket lige nu under en lås, og 400 for browsere.
- Lister kan ikke indeholde apps med `neverClose`.
