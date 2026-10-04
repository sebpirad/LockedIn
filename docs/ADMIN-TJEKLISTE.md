# Administrator-tjekliste

Til den person, der har administratoradgangskoden. Locked in er kun en reel lås, når ejeren arbejder på en **standardkonto**, og alt herunder er gjort. Gå listen igennem én gang efter installationen og igen efter hver opdatering.

## 1. Før ejeren nedgraderes (ejeren er stadig administrator)
- [ ] Locked in er installeret (`sudo ./install/install.sh`), og konfigurationsprofilen **Locked in — Chrome** er godkendt under *Systemindstillinger → Generelt → Enhedsadministration*.
- [ ] Disse apps er afinstalleret: **ExpressVPN** (app og tjeneste, brug dens egen afinstallering), **Cold Turkey Blocker** og **GoLogin**.
- [ ] Der er oprettet en administratorkonto til dig med din egen adgangskode. Ejeren må ikke kende den.

## 2. Nedgradér ejeren
- [ ] *Systemindstillinger → Brugere og grupper → (ejeren) → slå "Tillad brugeren at administrere denne computer" fra.*
- [ ] Sammesteds på **begge** konti: slå "Tillad brugeren at nulstille adgangskoden med Apple-konto" fra.

## 3. Kontrollér efter nedgraderingen (log ind som administrator, kør i Terminal)
```bash
dscl . -read /Groups/admin GroupMembership
```
Kun din konto og `root` må stå der.
```bash
sudo ls -la /etc/sudoers.d; sudo grep -v '^#' /etc/sudoers | grep -v '^$'
```
Der må ikke være regler for ejerens konto.
```bash
ls -la /Library/LaunchDaemons /Library/LaunchAgents
```
Kun kendte tjenester (Apple, Google, `dk.lockedin.*`).
```bash
sudo profiles list
```
`dk.lockedin.chrome` skal være der.
```bash
sudo fdesetup changerecovery -personal
```
Ny FileVault-gendannelsesnøgle, som **kun du** gemmer. Den gamle kan ejeren have set.
- [ ] *Systemindstillinger → Generelt → Login-emner → Tillad i baggrunden*: Locked in er slået til.
- [ ] Prøv som ejeren: `chrome://policy` viser Locked in-reglerne som *Platform / Maskine*. Profilen kan ikke fjernes uden din adgangskode.

## 4. Før første session
- [ ] `chrome://extensions` viser **Locked in**, indlæst fra `/Library/Application Support/LockedIn/extension`. Den er ikke installeret af politik, før den ligger i Chrome Web Store. Menulinjen viser 🔓 og ikke 🔒 ?.
- [ ] Åbn Locked in i Chrome én gang, så daemonen ser et hjerteslag. Først derefter er vagthunden aktiv.

## 5. Opdateringer af Locked in
Installér fra en frisk kopi i din egen hjemmemappe, som ejeren ikke kan skrive i:
```bash
git clone https://github.com/sebpirad/LockedIn.git ~/locked-in-install
```
```bash
cd ~/locked-in-install && sudo ./install/install.sh
```
Byg aldrig fra ejerens egen mappe. Han kan ændre koden dér, før du kører den som root.

**Ærligt forbehold:** Repoet tilhører ejeren. En frisk klon beskytter kun mod ændringer i hans lokale mappe, ikke mod ændringer, han selv har udgivet. Kan du ikke selv gennemgå ændringerne, så installér kun en version, der er nævnt i et review i `docs/`.

## 6. Det, ingen tjekliste kan lukke (dokumenteret i README)
- **Fejlsikret tilstand (Shift ved opstart):** Locked in-tjenesten starter ikke. Hosts-blokeringen og Chrome-reglerne ligger der dog stadig.
- **Tunneler i brugerrum** (fx `ssh -D`) uden for Chrome kan omgå netværksblokeringen. Chrome selv er låst til direkte forbindelse.
- **Ejeren ejer selv repoet og udvidelsens signeringsnøgle.** Han kan udgive en udvidelse, der ikke blokerer, men stadig sender hjerteslag. Vagthunden stopper kun en udvidelse, der er fjernet eller ikke svarer. Hosts, pf og app-kontrollen virker uanset hvad.
- **Telefon og iPad** er ikke omfattet.
