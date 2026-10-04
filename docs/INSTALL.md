# Installation

Tager ca. 10 minutter. Kræver macOS 13 eller nyere, Google Chrome i `/Applications`, Apples Command Line Tools (`xcode-select --install`) og en administratoradgangskode.

## 1. Hent og installér
```bash
git clone https://github.com/sebpirad/LockedIn.git ~/locked-in
```
```bash
cd ~/locked-in && sudo ./install/install.sh
```
Scriptet bygger Locked in og kører alle tests. Fejler bygningen eller en test, installeres intet. Derefter installerer det tjenesten (`dk.lockedin.daemon`), menulinje-timeren og konfigurationsprofilen.

## 2. Godkend konfigurationsprofilen
*Systemindstillinger → Generelt → Enhedsadministration → Locked in — Chrome → Installér.*

Profilen slår inkognito, gæstetilstand, nye Chrome-profiler, sikker DNS og proxy fra. Den forsøger også at tvinge udvidelsen ind, men på en Mac uden virksomhedsstyring afviser Chrome det, så længe udvidelsen ikke ligger i Chrome Web Store (se trin 3). Din egen Chrome-profil, dine bogmærker og PowerLink røres ikke.

## 3. Indlæs udvidelsen i Chrome
Chrome tvangsinstallerer kun udvidelser fra Chrome Web Store på en Mac, der ikke er virksomhedsstyret. Indtil LockedIn ligger i Web Store, gør du sådan:

1. `chrome://extensions` → slå **Udviklertilstand** til.
2. **Indlæs upakket** → **⌘⇧G** → `/Library/Application Support/LockedIn/extension` → **Vælg**.
3. Klik én gang på LockedIn-ikonet.

Mappen ejes af root og kan kun ændres af en administrator. Slår du udvidelsen fra under en session, lukker vagthunden Chrome efter 2 minutter.

## 4. Gør låsen rigtig
Følg [ADMIN-TJEKLISTE.md](ADMIN-TJEKLISTE.md) sammen med den person, der skal have administratoradgangskoden. Indtil da er Locked in en friktionslås, som du selv kan bryde med `sudo`.

## Afinstallation
Kræver administrator og nægter under en aktiv session:
```bash
sudo ./install/uninstall.sh
```
Fjern derefter profilen under *Enhedsadministration*.

## Hvis noget ikke virker
- **Menulinjen viser 🔒 ?** Tjenesten svarer ikke. Se `/Library/Logs/LockedIn/lockedind.log`.
- **Locked in-ikonet mangler i Chrome:** Se `chrome://policy` (søg efter `ExtensionInstallForcelist`) og `chrome://extensions`.
