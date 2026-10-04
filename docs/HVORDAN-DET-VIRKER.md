# Sådan virker blokeringen og citatsiden

## Tre lag
| Lag | Hvor | Hvad det gør | Hvad det ikke kan |
|---|---|---|---|
| **Chrome-udvidelsen** | I Chrome | Omdirigerer blokerede sider til citatsiden og blokerer alt andet indhold fra dem (billeder, video, indlejringer). | Virker kun i Chrome. |
| **Hosts og pf** | Hele Mac'en (daemon som root) | Blokerede domæner peger på 0.0.0.0 for alle apps. Kendte servere til DNS over HTTPS er spærret. | Kan ikke vise en side. Kan ikke dække underdomæner med skiftende navne (fx YouTubes videoservere) uden for Chrome. |
| **App-kontrol** | Hele Mac'en (daemon som root) | Lukker andre browsere, blokerede apps og ukendte apps med indbygget browser under en session. Lukker Chrome, hvis den er startet med omgåelsesflag, eller hvis udvidelsen ikke svarer i 2 minutter. | Ser ikke programmer uden en app-pakke, fx en tunnel startet i Terminal. |

## Hvorfor citatsiden kræver udvidelsen (HTTPS)
Næsten alle sider bruger HTTPS. Browseren kontrollerer, at serveren har et gyldigt certifikat for præcis det domæne. Hvis en blokering på netværksniveau sendte dig til en lokal "citatserver", ville den aldrig kunne vise et gyldigt certifikat for instagram.com. Du ville få en certifikatfejl, og for Instagram og YouTube (HSTS-forudindlæste domæner) kan fejlen ikke engang klikkes væk.

Derfor sker omdirigeringen **inde i Chrome, før forbindelsen oprettes**:
1. Du skriver `instagram.com`.
2. Chromes regelmotor (`declarativeNetRequest`) matcher navigationen mod udvidelsens regler, før der er sendt så meget som et DNS-opslag.
3. Navigationen omdirigeres til udvidelsens egen side `chrome-extension://…/blocked.html`. Der er ingen TLS-forbindelse og intet certifikat at fejle.
4. Citatsiden henter citat, billede og resterende tid lokalt fra udvidelsen og fra daemonen på `127.0.0.1:919`.

Hosts-filen er reserven. Når udvidelsen ikke kan tage navigationen (andre apps, eller Chrome uden udvidelse), fejler forbindelsen bare.

## Privat browsing
- **Inkognito** er slået fra af konfigurationsprofilen (`IncognitoModeAvailability=1`), så det kan ikke åbnes.
- **Gæstetilstand og nye Chrome-profiler** er slået fra (`BrowserGuestModeEnabled=false`, `BrowserAddPersonEnabled=false`). Din eksisterende profil er urørt.
- **Safari og andre browsere** (også private vinduer) lukkes under sessioner. Hosts-filen gælder dem også.
- **iCloud Private Relay** slås fra under sessioner via `mask.icloud.com` i hosts. Det er Apples egen dokumenterede metode.

## Allerede åbne faner og "tilbage"-knappen
Når en session starter, sendes alle åbne faner med en blokeret side til citatsiden. Går du tilbage i historikken, kan Chrome vise en side fra hukommelsen (back/forward-cache) uden ny forespørgsel. Derfor tjekker et lille script på alle sider igen ved `pageshow`.

## Variation i citaterne
Citatsiden trækker fra en "pose" med alle citater, der gemmes i udvidelsen. Hvert citat vises én gang, før nogen gentages, og det samme citat kommer aldrig to gange i træk, heller ikke når posen fyldes op igen.

## Tid
- Alle tider vises i **Europe/Copenhagen**. Sommertid håndteres af tidszonedatabasen. En fast tid, der falder i den time, der findes to gange i oktober, bruger den første. En tid, der ikke findes i marts, rykkes frem.
- Sessionens længde måles med et **monotont ur**, der ikke kan stilles. Et systemur, der flyttes frem, kan ikke afslutte en session tidligere. Et ur, der flyttes tilbage, kan højst forlænge den med 2 minutter.
- Strømafbrydelse eller genstart: Tiden, Mac'en var slukket, tæller med.
- Én samlet lås, timer og faste tider i forlængelse af hinanden, kan højst vare 24 timer.
