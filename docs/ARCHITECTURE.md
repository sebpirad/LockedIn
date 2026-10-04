# Locked in — arkitektur v2

Status: bygget og installeret på ejerens Mac; uafhængigt reviewet to gange (`docs/REVIEW-1.md`, `docs/REVIEW-2.md`), rettelser beskrevet nederst.

## Forudsætninger (ejerens beslutninger)

- Ejeren arbejder dagligt på en **standardkonto**. En anden person har den eneste administratoradgangskode. Installation sker, mens ejeren stadig er admin. Bagefter nedgraderes han, og administratoren gennemgår tjeklisten i `docs/ADMIN-TJEKLISTE.md`.
- Ingen Apple Developer-konto, ingen Xcode og ingen MDM. Mac'en er arm64 med macOS 26.6, FileVault og SIP slået til.
- Kun Chrome bruges som browser.
- ExpressVPN, Cold Turkey og GoLogin afinstalleres ved installationen.
- Sessionens længde vælges frit. Under en session kan intet stoppes, forkortes eller åbnes. **Uden for sessioner kan alt ændres frit** (ingen 24-timersregel).
- Der er ingen nødudgang.

## Komponenter

### 1. `lockedind` (root LaunchDaemon, Swift)
- Installeres root-ejet: binæren i `/Library/PrivilegedHelperTools/` og plist-filen i `/Library/LaunchDaemons/` (RunAtLoad, KeepAlive). Tilstanden gemmes atomisk i `/Library/Application Support/LockedIn/state.json`. Den læses tolerant, så manglende eller ukendte felter giver standardværdier, og en ulæselig fil overskrives aldrig.
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
  - (URLBlocklist kan ikke bruges dynamisk, fordi profilen er statisk. Under sessioner blokerer udvidelsen, hosts og app-kontrollen.)

- **Fail closed:** Hvis daemonen dør eller tilstandsfilen ikke kan læses, bevares de seneste blokeringer. De ryddes aldrig ved nedlukning.
- **IPC:** HTTP på `127.0.0.1:919` (se `docs/API.md`). Porten er **ikke** beskyttet på macOS. Blokeringen afhænger derfor ikke af API'et, og daemonen lukker en proces, der optager porten. Native messaging er droppet. Daemonen accepterer kun kommandoer, der strammer låsen eller er neutrale: start session, tilføj plan og ændre lister uden for en session. Under en session afvises alle svækkelser. Indgående data valideres: hostnavne skal matche `^[a-z0-9.-]+$`, og antallet af poster er begrænset.

### 2. Chrome-udvidelse (MV3)
- **Kontrolside:**
  - stor timer og én "Start Locked in"-knap
  - planlagte perioder (én dato eller ugentligt), hver med en liste
  - **lister** med hjemmesider og apps, der redigeres direkte på ikonerne (se "Lister" nederst)
  - næste session og aktive blokeringer
- **Citatsiden:** declarativeNetRequest omdirigerer `main_frame` til `blocked.html`, før TLS-forbindelsen oprettes. Andre ressourcetyper (sub_frame, xhr, websocket, media) blokeres. Et indholdsscript tjekker igen ved `pageshow` (persisted) og ved ændringer i historikken (back/forward-cache). Ved sessionsstart lukkes og genskabes faner med blokerede sider.
- Udvidelsen gemmer selv sessionens sluttidspunkt og fjerner aldrig regler før det. Den taler med daemonen over `127.0.0.1:919`. Svar, der vil svække en lås, ignoreres.
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
- **Signaturkontroller caches kun ved succes.** Chrome lukkes først efter 60 sekunders sammenhængende signaturfejl, så en opdatering ikke lukker Chrome og PowerLink, medmindre Chromes signatur er ugyldig i over 60 sekunder (H3).
- **Vagthund** (ejerens valg, M5, efter review 2 N1/N2/N10): Under en session lukkes Chrome, når alt dette gælder:
  - konfigurationsprofilen indeholder udvidelsen i `ExtensionInstallForcelist`, som også er til stede, når Chrome afviser installationen;
  - der er set mindst ét **verificeret** hjerteslag fra den rigtige Chrome, kontrolleret via forbindelsens proces;
  - der har ikke været et hjerteslag i 120 sekunders **vågen** tid, og dvale tæller ikke;
  - brugeren er aktiv ved Mac'en (HID idle under 60 sekunder);
  - det har stået på i 30 sekunder.

  Opvågning fra dvale giver en ny frist. Begrænsning: Ejeren styrer selv udvidelsens kode, så en tom udvidelse, der kun sender hjerteslag, stoppes ikke af vagthunden.
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

## Ændringer efter review 2 (2026-10-04, se `docs/REVIEW-2.md`)
- **N1, N2, N10:** Vagthunden er bygget om (se ovenfor).
- **N3:** Kun ændringer, der skaber eller forlænger en lås på over 24 timer, afvises. En eksisterende weekendplan, der bliver 25 timer på sommertidens sidste søndag, blokerer ikke andre sessioner. `status()` afkorter den til 24 timer.
- **N4:** Installerede Chrome-webapps (`com.google.Chrome.app.*` i `~/Applications/Chrome Apps.localized`) er ikke "Chrome-kopier".
- **N5:** En fuld signaturkontrol skal fejle to gange med 60 sekunders mellemrum, før en tilladt app regnes som ændret. Status viser "appens signatur er ændret", og kontrollen nulstilles ved låsens slutning.
- **N8:** En signatur, der ikke tilhører selve app-pakken, beviser intet. En "Apple-signeret" app i brugerens mapper må ikke vise websider.
- **H1-rest:** Browsere uden app-pakke (fx Playwrights `headless_shell`) i brugerens mapper lukkes under sessioner, når navn eller flag afslører dem.
- **L5:** Loggen nulstilles ved 5 MB i stedet for at blive roteret.
- **Kendt og accepteret:**
  - **N9:** Et ur, der flyttes frem under en genstart, kan afkorte låsen. En standardkonto kan ikke ændre uret.
  - **N6:** En lokal proces kan overbelaste API'et. Det er ikke en omgåelse.
  - **N11:** Gælder kun tilstandsfiler fra version 1.0.

## Lister (v1.2, ejerens ønske 2026-10-04)
- En **liste** er et navngivet sæt hjemmesider og apps, fx "Locked In 1". Listerne erstatter til/fra-knapperne pr. side og app.
- **Timer, Indtil og planlagte perioder** vælger hver en liste. Planlagte perioder kan være én dato (fx i morgen 09–12) eller ugentlige.
- **Én sammenhængende lås blokerer alt fra alle sine lister, til den slutter.** Listerne i låsen må kun vokse og kan ikke slettes, før låsen er slut.
- **Altid lukket under fokus** uanset liste: andre browsere og ukendte apps med web-motor, indtil de tillades uden for en lås.
- **Opgradering fra 1.0:** "Locked In 1" bliver det, 1.0 blokerede. Nye indbyggede sider (TV 2, Ekstra Bladet, Se og Hør, Facebook) kommer ikke automatisk på listen. En kørende timer beholder sine blokeringer.
- **Facebook:** `graph.facebook.com` er undtaget, og `fbcdn.net`, WhatsApp og Messenger blokeres ikke, så WhatsApp bliver ved med at virke. Det testes på Mac'en.

## Udvidelsen er indlæst manuelt (TESTLOG T3, 2026-10-04)
Chrome afviser tvangsinstallation af udvidelser uden for Web Store på en Mac uden virksomhedsstyring. Udvidelsen indlæses derfor upakket fra den root-ejede mappe `/Library/Application Support/LockedIn/extension`. **Ærlig konsekvens:** Ejeren kan fjerne den eller indlæse en anden udvidelse. Under en session lukker vagthunden Chrome, hvis LockedIn ikke svarer, men en anden udvidelse, der selv sender hjerteslag, stoppes ikke. Hosts, pf og app-kontrollen virker uanset hvad. Adversus er kun blokeret i Chrome-laget. **Plan:** Når LockedIn er udgivet som "ikke offentlig" i Chrome Web Store, kan profilen tvangsinstallere den.
