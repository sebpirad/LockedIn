# Domæner — hvad blokeres, hvad slipper igennem, og hvorfor

Maskinlæsbar liste: `domains.json`. Researchet 2026-10-04.

## Sådan læses listen

- **suffixes** bruges i Chromes declarativeNetRequest-regler (`requestDomains`) og i URLBlocklist. Et suffiks dækker alle subdomæner.
- **hosts** er eksakte navne til `/etc/hosts`. Filen kender ikke wildcards, så kun navne, der er kendt på forhånd, kan stå her.
- **excluded** er domæner, der bevidst er udeladt, fordi de deles med tjenester, som skal blive ved med at virke. Ét af dem kræver en beslutning fra ejeren.

Det vigtigste at vide om hosts-blokken: Den lukker selve web-appen (HTML, API og login). Den kan ikke lukke CDN-shards med skiftende navne. I praksis gør det kun lidt, for uden appen er der ikke noget, der beder om videoen. Chrome dækker shards via suffikserne.

## Tjenesterne

**Instagram.** Alt under `instagram.com`, `cdninstagram.com`, `instagr.am`, `ig.me` og `igtv.com` blokeres. Billeder kommer også fra `instagram.f<by>.fna.fbcdn.net`. `fbcdn.net` bliver **ikke** blokeret, fordi Facebook (og dele af WhatsApp) bruger domænet. I stedet får Chrome en `regexFilter`-regel, som kun rammer navne, der starter med `instagram.`. Login via Facebook og Instagrams krypterede chat går over `facebook.com`. Det er udeladt, så Facebook bliver ved med at virke.

**YouTube.** Alt under `youtube.com`, `youtu.be`, `youtube-nocookie.com`, `ytimg.com` og `googlevideo.com` blokeres, sammen med `youtubekids.com` og landedomænerne. Fra Googles delte domæner står kun præcise navne på listen: `youtubei.googleapis.com`, `yt3.ggpht.com` og `yt3.googleusercontent.com`.

- **Vigtigt:** `accounts.youtube.com` må **ikke** blokeres. Google-login (Gmail, Drive og Chrome-synkronisering) går igennem det navn. Chrome-reglen skal derfor have en allow-undtagelse med højere prioritet, ellers ender ethvert Google-login på citatsiden.
- Selve videoen hentes fra `rrN---sn-xxxx.googlevideo.com`. Der findes tusindvis af den slags navne, og de skifter, så de kan ikke skrives i hosts. I Chrome er de dækket af suffikset. Uden for Chrome er de det ikke, for eksempel i yt-dlp, en Electron-klient eller en Invidious-proxy. pf kan ikke hjælpe, fordi IP-adresserne er Googles fælles.

**Slack.** `slack.com`, `slack-edge.com`, `slack-msgs.com`, `slack-imgs.com`, `slack-files.com`, `slack-redir.net` og `slackb.com` blokeres, plus websocket-hostene `wss-primary`, `wss-backup` og `wss-mobile`. **Hul:** Hvert workspace har sit eget navn, `<navn>.slack.com`. Chrome dækker det, men i hosts skal ejeren selv skrive sine workspace-navne ind. Slacks egen komplette allowlist (`my.slack.com/help/urls`) kræver login.

**Adversus.** Ifølge ejerens regel blokeres Adversus **kun som Chrome-fane** (`main_frame`). Der er ingen hosts-, pf-, xhr-, websocket- eller sub_frame-blokering, for PowerLink kalder Adversus og sin backend i baggrunden under arbejdet. Suffikserne er `adversus.io` og `app.adversus.io`, og hosts-listen er tom.

- `adversus.dk` er **ikke** suffiks-blokeret, fordi det ville ramme PowerLinks journey-trigger.
- **adversus.com er ikke Adversus.** Det er et mode-site, så det er udeladt.
- En ekstern SIP-softphone (`gateway.adversus-server.dk`) er ikke dækket. Den skal i givet fald fanges af app-kontrollen.

**Viaplay.** `viaplay.com`, `viaplay.dk/.se/.no/.fi` og de andre lande samt `viaplay.tv` (CDN) blokeres. Desuden blokeres to præcise navne på delte domæner: `viaplay.mtg-api.com` og `i-viaplay-com.akamaized.net`. **Hul:** Der findes ingen officiel liste, og videoserverne ligger bag login, så de kunne ikke ses. Uden forside, login og content-API'et starter afspilleren ikke. Om `allente.dk`, `tv3.dk` og `viafree.dk` skal med, er ejerens valg.

**Netflix.** `netflix.com`, `netflix.net`, `nflxvideo.net`, `nflximg.net/.com`, `nflxext.com` og `nflxso.net` blokeres. Videoservernes navne (`ipv4-cNNN-…oca.nflxvideo.net`) kan ikke skrives i hosts, men Netflix har ingen Mac-app, så web er den eneste vej ind. **Beslutning: fast.com** (Netflix' hastighedstest) er udeladt. Den holder alligevel op med at virke i Chrome under en session, fordi den måler mod `nflxvideo.net`.

## DNS over HTTPS / DoT (pf)

Listen dækker IP-adresser og hostnavne for Cloudflare, Google, Quad9, OpenDNS, AdGuard, Mullvad, NextDNS, Control D, CleanBrowsing, DNS4EU, DNS.SB og CZ.NIC. Kilden er primært Chromes egen udbydertabel.

- **Bloker kun TCP/UDP 443 og 853. Bloker aldrig port 53.** Hvis routeren udleverer for eksempel 8.8.8.8 eller 1.1.1.1 som almindelig DNS, holder al navneopslag op med at virke, hvis port 53 blokeres.
- **macOS** bruger som standard almindelig DNS fra routeren. iCloud Private Relay gælder kun Safari. `mask.icloud.com` står i hosts, og det er den metode, Apple selv beskriver.
- **Chrome** har "sikker DNS" sat til automatisk. Den opgraderer kun, hvis systemets resolver er en kendt udbyder. `DnsOverHttpsMode=off` er den egentlige kontrol, og pf er reserven.
- Apples egen `doh.dns.apple.com` er udeladt, fordi den kan bruges af systemet.
- NextDNS og DoH på egne servere kan ikke dækkes fuldt via IP-adresser.
