# Locked in — arkitektur v2

Status: godkendt retning efter ét adversarialt review (2026-10-04). Ikke bygget endnu.

## Forudsætninger (ejerens beslutninger)

- Ejeren arbejder dagligt på en **standardkonto**. En anden person har den eneste administratoradgangskode. Installation sker, mens ejeren stadig er admin. Bagefter nedgraderes han, og administratoren gennemgår tjeklisten i `docs/ADMIN-TJEKLISTE.md`.
- Ingen Apple Developer-konto, ingen Xcode og ingen MDM. Mac'en er arm64 med macOS 26.6, FileVault og SIP slået til.
- Kun Chrome bruges som browser.
- ExpressVPN, Cold Turkey og GoLogin afinstalleres ved installationen.
- Sessionens længde vælges frit. Under en session kan intet stoppes, forkortes eller åbnes. **Uden for sessioner kan alt ændres frit** (ingen 24-timersregel).
- Der er ingen nødudgang.

## Komponenter

### 1. `lockedind` (root LaunchDaemon, Swift)
- Installeres root-ejet: binæren i `/Library/PrivilegedHelperTools/` og plist-filen i `/Library/LaunchDaemons/` (RunAtLoad, KeepAlive). Tilstanden gemmes atomisk i `/Library/Application Support/LockedIn/state.json` og valideres strengt.
- Kalder kun systemværktøjer via absolut sti med et rent miljø. `/opt/homebrew` er brugerejet og må aldrig være på PATH.
- **Tid:** Sessionens slutning gemmes som et UTC-tidspunkt. En standardkonto kan ikke ændre uret (`system.preferences.datetime` kræver admin, verificeret). Planer udregnes i daemonens egen `Europe/Copenhagen`-zone, aldrig i systemets zone. Ved sommertidsskift gælder følgende: et tidspunkt, der findes to gange, regnes som det første, og et tidspunkt, der ikke findes, rykkes frem.
- **Under en session**, ved hvert tjek, og der skrives kun ved forskel (hash):
  1. En markeret blok i `/etc/hosts` (0.0.0.0 og ::) for alle domæner fra domæneresearchen. Derefter tømmes DNS-cachen.
  2. En pf-anker (`com.apple/lockedin`, `pfctl -E`), der blokerer kendte DNS over HTTPS- og DoT-resolvere. Anker og tilstand verificeres hvert 10. sekund. Eksisterende forbindelser afbrydes ikke, da Chrome selv har sikker DNS slået fra.
  3. **App-kontrol:**
     - Apps sat til "Blokeret" lukkes.
     - Apps med indlejret web-motor (Electron, Chromium, CEF eller XUL), som ikke står på listen "Virker", lukkes. Det samme gælder WebKit-apps, der hverken er signeret af Apple eller står på listen.
     - Andre browsere end Google-signeret Chrome (team-id `EQHXZ8M8AV`) lukkes.
  4. **Chrome-flag:** Daemonen læser argv for alle Chrome-processer (`KERN_PROCARGS2`) og lukker Chrome, hvis et af disse flag er sat: `--host-resolver-rules`, `--disable-extensions*`, `--remote-debugging*`, `--user-data-dir`, `--load-extension` eller `--proxy*`.
  5. **Hjerteslag:** Kører Chrome uden hjerteslag fra udvidelsen, lukkes Chrome.
- **Chrome-politik** leveres som en manuelt installeret **konfigurationsprofil** (System-scope, `.mobileconfig`), som kun en admin kan fjerne. Test T1 er bestået. Den er ikke cloud-styret, fordi ejeren administrerer lejeren. Profilen sætter **ikke** `ExtensionSettings`, fordi cloud-politikken bruger den til PowerLink, og en lokal værdi ville erstatte den. Politikkerne er:
  - ExtensionInstallForcelist (kun Locked in, `nildondjeeibacombanbjnokenmhfhie`)
  - IncognitoModeAvailability=1
  - BrowserGuestModeEnabled=false og BrowserAddPersonEnabled=false
  - DnsOverHttpsMode=off
  - ProxyMode=direct
  - RemoteDebuggingAllowed=false
  - (URLBlocklist kan ikke bruges dynamisk, fordi profilen er statisk. Under sessioner blokerer udvidelsen, hosts og app-kontrollen.)

- **Fail closed:** Hvis daemonen dør eller tilstandsfilen ikke kan læses, bevares de seneste blokeringer. De ryddes aldrig ved nedlukning.
- **IPC:** HTTP på `127.0.0.1:919` (se `docs/API.md`). Port under 1024 kan kun bindes af root, så den kan ikke forfalskes af en standardbruger. Native messaging er droppet. Daemonen accepterer kun kommandoer, der strammer låsen eller er neutrale: start session, tilføj plan og ændre lister uden for en session. Under en session afvises alle svækkelser. Indgående data valideres: hostnavne skal matche `^[a-z0-9.-]+$`, og antallet af poster er begrænset.

### 2. Chrome-udvidelse (MV3)
- **Kontrolside:**
  - stor timer og én "Start Locked in"-knap
  - faste planer pr. ugedag
  - listerne **Hjemmesider** og **Apps**, hvor hvert element enten er "Virker under fokus" eller "Blokeret", og hvor man kan tilføje sine egne
  - næste session og aktive blokeringer
- **Citatsiden:** declarativeNetRequest omdirigerer `main_frame` til `blocked.html`, før TLS-forbindelsen oprettes. Andre ressourcetyper (sub_frame, xhr, websocket, media) blokeres. Et indholdsscript tjekker igen ved `pageshow` (persisted) og ved ændringer i historikken (back/forward-cache). Ved sessionsstart lukkes og genskabes faner med blokerede sider.
- Udvidelsen gemmer selv sessionens sluttidspunkt og fjerner aldrig regler før det. Den taler med daemonen over `127.0.0.1:919` (root-port), ikke via native messaging.
- **Ingen ExtensionInstallBlocklist.** VPN- og proxy-udvidelser er uskadeliggjort af `ProxyMode=direct`, og en blokliste ville risikere ejerens andre udvidelser, herunder PowerLink. Profilen indeholder heller ikke `ExtensionSettings`. Den bruger `ExtensionInstallForcelist`, så cloud-politikken for PowerLink står urørt.
- **Distribution:** CRX og `updates.xml` ligger på GitHub Pages.

### 3. Menulinje-timer
En lille Swift-app (LaunchAgent), der kun viser status. Kan brugeren slå den fra, påvirker det kun visningen.

### 4. Web
Statisk side på GitHub Pages, deployet fra `sebpirad/LockedIn` (offentligt repo) via Actions.

## Kendte begrænsninger (dokumenteres ærligt)
- **Fejlsikret tilstand (Safe Mode):** Daemonen starter ikke, men hosts-blokken og Chrome-reglerne ligger der stadig. En portabel browser eller en tunnel slipper igennem. Det kan ikke lukkes uden MDM.
- **Tunneler i brugerrum** (ssh -D, cloudflared, en egen WKWebView-app osv.) kan omgå netværkslaget. App-kontrollen gør det svært, men ikke umuligt. Uden Network Extension eller Endpoint Security kan det ikke lukkes helt.
- **Ejeren styrer selv repoet og CRX-nøglen.** Han kan udgive en tom udvidelse, men hosts, pf og app-kontrol bliver liggende, og det gør den lokale politik også.
- **Webproxyer og fjernbrowsere** kan ikke dækkes af en domæneliste.
- **Telefon og iPad** er uden for scope.

## PowerLink og Powermatch (ejerens regel, 2026-10-04)
Locked in må aldrig ødelægge, ændre eller blokere PowerLink eller andet Powermatch-relateret, medmindre ejeren selv har valgt det.
- **Adversus** blokeres **kun som faner i Chrome**: `main_frame`-navigation til adversus.com, adversus.io og app.adversus.io omdirigeres til citatsiden. Adversus står **aldrig** i hosts, pf eller app-kontrollen, og udvidelsen blokerer ingen `xmlhttprequest`/`websocket`/`sub_frame` mod Adversus. Så PowerLinks kald til `journeys.adversus.dk` og Railway virker under sessioner. PowerLinks "åbn i Adversus"-faner viser citatsiden. Det er bevidst.
- Der er **ingen** fast hvidliste. Ejeren valgte den fra, og Powermatch-domæner behandles som alle andre.
- Profilen rører ikke `ExtensionSettings`, så cloud-politikken med PowerLink står urørt (se TESTLOG T1). Cloud-lejeren, OU'en, `.pem` og Railway røres aldrig.

## Produktvalg (ejeren, 2026-10-04)
- **Maks 24 timer** pr. session (daemonen afviser længere). Vil man have mere, starter man en ny session bagefter.
- **Bekræftelsestrin** før låsen: opsummering af sluttid, blokerede sider/apps og "Kan ikke stoppes", derefter "Lås nu".
- **Mørkt design.**
- **Domæner:** Adversus = adversus.io + app.adversus.io (kun faner i Chrome; adversus.com er en modebutik og udelades). Ekstra blokeret: Threads (threads.net), TV3/Viafree/Allente og viaplaygroup.com. `googlevideo.com` blokeres (Drive-/Fotos-video kan påvirkes under sessioner; skal testes). `accounts.youtube.com` undtages altid, fordi Google-login går gennem den.

## Ændringer efter review 1 (2026-10-04, se `docs/REVIEW-1.md`)
- **Én samlet lås må højst vare 24 timer.** Timer og faste tider i forlængelse af hinanden regnes som én lås, og alt, der ville gøre den længere, afvises. Er en ældre tilstandsfil alligevel for lang, afkortes låsen efter 24 timer (H2).
- **Timeren styres af det monotone ur.** Et ur, der sættes tilbage, kan højst forlænge låsen med 2 minutter (M6).
- **Chrome** er kun den Google-signerede app på præcis `/Applications/Google Chrome.app`. Alle andre kopier lukkes under en session, også én gemt inde i en anden `.app` (H1). Hvert `.app`-lag i en proces' sti vurderes.
- **Tilladte apps** genkendes på kodesignaturens team-id, som registreres, når appen tillades. Ved sessionsstart og hvert 15. minut verificeres de fuldt ud i baggrunden, inklusive resourcer. En ændret app regnes som ukendt (H1).
- **Signaturkontroller caches kun ved succes.** Chrome lukkes først efter 60 sekunders sammenhængende signaturfejl, så en opdatering aldrig lukker Chrome og PowerLink (H3).
- **Vagthund** (ejerens valg): Under en session lukkes Chrome, hvis udvidelsen ikke har sendt et hjerteslag i 2 minutter, og Chrome har kørt i mindst 2 minutter (M5).
- **Fjern-debugging** er ikke længere i profilen (ejerens valg). Daemonen lukker kun en Chrome med `--remote-debugging*` under sessioner.
- **Andre browsere** kan ikke sættes til "Virker" (ejerens valg, L3).
- **Systemprocesser** under `/System/Library`, `/usr`, `/bin`, `/sbin` og `/Library/Apple` lukkes aldrig, uanset regler (L2).
- **Robusthed:**
  - `state.json` læses tolerant, og en ulæselig fil overskrives aldrig (M1).
  - `/etc/hosts` håndteres som bytes og røres ikke, hvis den ikke kan læses som UTF-8 (M2).
  - Serveren tillader højst 16 forbindelser og kontrollerer `Host`-headeren (H4, L6).
  - Daemonen stopper ikke længere, hvis port 919 er optaget (M4).
  - Kataloget kan ikke svække en kørende lås (M8).
- **Administrator** installerer kun fra en frisk klon (`docs/ADMIN-TJEKLISTE.md`, M8).
