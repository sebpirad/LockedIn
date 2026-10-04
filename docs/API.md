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
Under en aktiv session er `sites[].blocked` og `apps[].blocked` de **effektive** værdier, altså øjebliksbilledet fra sessionsstart plus eventuelle stramninger.

### `POST /v1/session` `{"minutes": 90}` eller `{"until": "2026-10-05T13:00:00Z"}`
`until` bruges til "Locked in indtil kl. 15:00": sessionen slutter præcis på det tidspunkt. Tidspunktet skal ligge mindst 1 minut og højst 24 timer ude i fremtiden, ellers svarer daemonen 400 med "Vælg et senere tidspunkt." Udvidelsen tilbyder kun senere tidspunkter i dag.

Starter en session eller forlænger den aktive: ny slut = max(nuværende slut, nu + minutes). Gyldige værdier er 1–1440 minutter. **Én samlet lås må højst vare 24 timer.** Det gælder timer og faste tider i forlængelse af hinanden, regnet fra låsens start, og alt, der ville gøre den længere, afvises med 400 "En samlet lås kan højst vare 24 timer." Svarer med status.

### Hjemmesider
- `POST /v1/sites` `{"label": "Reddit", "domain": "reddit.com"}`: tilføjer et eget domæne, `blocked: true`, `mode: "full"`. Domænet valideres mod `^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$` efter IDN→punycode, trim og små bogstaver.
- `PATCH /v1/sites/{id}` `{"blocked": true|false}`: `false` giver 423 under en aktiv session.
- `DELETE /v1/sites/{id}`: giver 423 under en aktiv session. Indbyggede sider kan ikke slettes, kun slås fra.

### Apps
- `GET /v1/installed`: svarer `{"apps": [...]}` med installerede apps fra `/Applications`, `/Applications/Utilities` og konsolbrugerens `~/Applications`, hver som `{bundleId, name, kind, blocked}`.
- `POST /v1/apps` `{"bundleId": "…"}`: tilføjer en app fra listen, `blocked: true`.
- `PATCH /v1/apps/{bundleId}` `{"blocked": bool}`: `false` giver 423 under en aktiv session, og 400 for browsere, som altid er lukket under fokus.
- `DELETE /v1/apps/{bundleId}`: giver 423 under en aktiv session.

### Planer
- `POST /v1/schedules` `{"name", "weekdays", "start", "end", "enabled"}`: afvises med 400, hvis tiden sammen med andre faste tider eller timeren giver en samlet lås på over 24 timer.
- `PUT /v1/schedules/{id}` og `DELETE /v1/schedules/{id}`: giver 423 under en aktiv session. At tilføje en ny plan er altid tilladt.

### `POST /v1/heartbeat` `{"extensionVersion": "1.0.0"}`
Udvidelsen sender et hjerteslag mindst hvert 30. sekund. Svarer `{"ok": true}`, men **kun når forbindelsen kommer fra den rigtige Chrome**. Daemonen slår processen bag forbindelsen op, og alle andre får 403.
