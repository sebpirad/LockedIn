# Locked in

Fokusværktøj til Mac. Vælg en varighed eller et sluttidspunkt. Under sessionen er distraherende hjemmesider og apps låst, og prøver du at åbne en blokeret side, møder du et citat i stedet. Sessionen kan ikke stoppes eller forkortes og åbner automatisk, når tiden er gået.

- **Installation:** [docs/INSTALL.md](docs/INSTALL.md)
- **Gør låsen rigtig:** [docs/ADMIN-TJEKLISTE.md](docs/ADMIN-TJEKLISTE.md)
- **Sådan virker det (HTTPS, privat browsing, tid):** [docs/HVORDAN-DET-VIRKER.md](docs/HVORDAN-DET-VIRKER.md)
- **Arkitektur og begrænsninger:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Testet på en rigtig Mac:** [docs/TESTLOG.md](docs/TESTLOG.md)
- **Uafhængige reviews:** [docs/REVIEW-1.md](docs/REVIEW-1.md), [docs/REVIEW-2.md](docs/REVIEW-2.md)
- **Webside:** https://sebpirad.github.io/LockedIn/

## Indhold
| Mappe | Hvad |
|---|---|
| `daemon/` | `lockedind` (root-tjeneste: hosts, pf, app-kontrol, lokalt API) og menulinje-timeren. Swift, bygges med Command Line Tools. |
| `extension/` | Chrome-udvidelsen: kontrolside, citatside og blokeringsregler. |
| `install/` | Installation, afinstallation og launchd-filer. |
| `config/catalog.json` | Domæner for de indbyggede tjenester, bygget fra `research/domains.json`. |
| `research/` | Domæneresearch, citater med kilder og billeder samt den uafhængige verifikation. |
| `web/` | GitHub Pages: webside, `locked-in.crx` og `updates.xml`. |

## Tests
```bash
cd daemon && swift build && .build/debug/CoreTests
```
```bash
cd extension && node --test test/*.test.mjs
```

## Garantier og forudsætninger
Locked in lover ikke at være umulig at omgå. Den er en reel lås **under disse forudsætninger**: Du arbejder på en standardkonto, en anden person har administratoradgangskoden, og [administrator-tjeklisten](docs/ADMIN-TJEKLISTE.md) er gennemgået. De kendte undtagelser er beskrevet i [ARCHITECTURE.md](docs/ARCHITECTURE.md#kendte-begrænsninger-dokumenteres-ærligt).
