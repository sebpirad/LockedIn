# Quote page: design directions

The quote page is `extension/blocked.html`, the page you land on when you open a blocked site. Two designers worked in parallel, and each section below describes one direction. The mockups are dev-only and are never shipped. They live in `extension/dev/quote-concepts/` and load the real `quotes/quotes.json` and `quotes/images/`.

## Retning 1: Editorial / typographic (designer 1)

**Idea.** Treat each quote as an opening spread in a print magazine. The quote is set as display type. The portrait is a printed plate: it is toned, grained and cropped around the face. The name is the sign-off. Every portrait goes through the same tonal treatment, so a Roman bust, a 1900s glass plate and a 2010s press photo read as one series. That consistency carries much of the "one strong visual experience" the brief asks for. The page has no labels, buttons or chrome. In the locked state it shows the quote, the face, the name, the time left, and one quiet attribution.

### Files

| File | What it is |
|---|---|
| `d1-opslag.html` | **Variant A "Opslag" (the spread).** A hard-edged portrait plate bleeds off the left edge at full height. The quote is set in Didot roman with a hanging yellow “, and the signature is a yellow rule followed by the name in letter-spaced caps. The photo credit runs vertically up the gutter, the way magazines credit photos. |
| `d1-omslag.html` | **Variant B "Omslag" (the cover).** A larger portrait on the right dissolves into the page through a mask. The quote is set in Didot italic with no quotation marks, and its width stops short of the sitter. The name is set in Didot roman as a signature, with dates, source and translator in one small line under it. On phone the quote overlaps the faded foot of the photograph. |
| `d1-common.js` | Shared engine: typesetting, fit-to-box, line freezing, the portrait pipeline, the face-aware crop, the credit line, the mock session. It imports `lib/time.js` and `lib/credits.js` from production unchanged. |
| `d1-focus.json` | Face boxes for the 99 portrait files, found with Apple Vision (`VNDetectFaceRectanglesRequest`). 95 of 99 have a face with confidence > 0.5. The other 4 (Laozi painting, Leonardo chalk, Anne Brontë sketch, x20) fall back to centre/upper third. |
| `d1-shots/` | 24 PNGs per the brief: both variants × 4 quotes (q079 Churchill, a21 "Champions adjust.", x03 Scott at 38 words, q003 Marcus Aurelius translated) at 1440×900 and at 390×844 @2x, plus 1280×720 (x03 and the 398 px Jordan a12) and the "session over" state (q094). |

Dev URL parameters are `?q=<id>`, `?mins=<n>`, `?ended=1`, `?host=<host>`, `?still=1` (no entrance motion), and `?noimg=1` (the fallback without a portrait). Keys: ← and → step through all 100 quotes, and E toggles "session over".

### Typography

**Faces.** All faces are system fonts and nothing is bundled.
- **Didot** is preinstalled on every Mac in `/System/Library/Fonts/Supplemental`. It sets the quote, and in B also the name.
- **SF Pro** (via `system-ui`) sets everything else. Fallback chain: `Didot, "Bodoni 72", "Iowan Old Style", Georgia, serif`.
- Didot's high contrast is what makes the page feel like print rather than a web page. Its hairlines at 60–140 px are the main visual signature.

**Finding that also affects production:** Chrome on macOS does not resolve `ui-serif`, `"New York"` or `-apple-system`. I measured this in Chrome 152. The current `blocked.css` stack therefore renders in Iowan Old Style, and its sans-serif falls through to `BlinkMacSystemFont`. Use `system-ui` / `BlinkMacSystemFont` for SF.

**The quote is fitted, not stepped.** A binary search finds the largest whole pixel size that meets three conditions: it fits the height left for it, no word is wider than the column, and verse keeps one line per verse. Line-height and tracking are interpolated from the size, so large type is set tight and small type is set open. The line breaks are then frozen into one span per line. Those spans are what the entrance animates, and the step also catches sub-pixel drift by stepping down 2 px. A sweep of all 100 quotes × 3 viewports × 2 variants found 0 overflows, 0 collisions and 0 lines past the edge.

| | A "Opslag" | B "Omslag" |
|---|---|---|
| Quote | Didot 400 roman. Size = min(148, 16 vh, 20 % of column). Line-height 1.20 → 1.00, tracking +0.004 → −0.018 em, across 26 → 140 px | Didot 400 italic. Size = min(136, 15 vh, 20 % of free width). Line-height 1.18 → 1.02, tracking +0.004 → −0.012 em |
| Measured size range, 1440×900 | 63–141 px (Scott 63, "Champions adjust." 141) | 61–129 px |
| 1280×720 | 51–115 px | 50–108 px |
| 390×844 | 29–64 px (floor 22) | 32–62 px (floor 22) |
| Measure | `text-wrap: balance` up to 22 words (max 17 em), `pretty` above that (max 24 em) | the same, max 15 em / 22 em |
| Name | SF 13 px / 600, caps, +0.20 em, after a 44 × 1 px yellow rule | Didot 24–34 px roman (`clamp(24px, 2.3vw, 34px)`) |
| Dates | SF 13 px, tabular, muted | SF 12.5 px / 500, tabular, paper at 78 % |
| Source · translator | SF 12.5 px muted, title in italic, at the foot of the column | in the meta line under the name |
| Photo credit | SF 10.5 px / 500, +0.04 em, vertical in the gutter (horizontal on phone) | SF 10.5 px, on the photograph's dark foot, bottom right |
| Timer | SF 19 px / 300, tabular, +0.05 em, yellow lock glyph, top right | the same, top left |

**Typesetting details.** All of these are done in code.
- Curly quotes and apostrophes: 20 quotes contain a straight `'`.
- Correct nesting: in e09, A gives “‘Don’t put…’…” and B, which has no outer marks, keeps “ ”.
- An em dash that is closed up never starts a line (word joiner). A spaced dash is bound with a no-break space.
- A hyphen may break only between two real words, so "to-day", "to-morrow" and "10-minute" never split.
- In quotes of six or more words, the last word is never left alone on a line.
- Piet Hein's grook (q094), written as `Problems worthy / of attack / …`, is set as real verse lines.
- In A the opening “ hangs into the margin.

**Data cleaned at render time.** It belongs in `quotes.json` or the tools pipeline.
- "born 1963" / "b. 1951" → "f. 1963".
- "Laozi (traditional attribution)" → "Laozi". The dates already say "trad.".
- Source titles lose their parentheticals and, when longer than 56 characters, their subtitle after the colon. They are capped at 70 characters, and the full title is in the tooltip.
- Research notes are removed from years: e24's "1911 (IBM's page says 1915, which cannot be right…)" → "1911".
- Translator notes are removed: "Inter IKEA Systems B.V. (IKEA's official English version)".

### Image treatment

1. **Same-origin canvas pipeline**, about 3–50 ms per portrait. Steps:
   - Compute luminance.
   - Set levels at the 1st and 99th percentiles.
   - Apply gamma so the **face's** median lands on a fixed tone: A 0.60, B 0.54. The pipeline uses the frame's median when there is no face, so every face is exposed alike: dark (Nellie Bly), bright (marble busts), low contrast (scans).
   - Apply a gentle S-curve.
   - Cap the highlights (A 0.93, B 0.90) so no plate outshines the quote. This also fixes review note N7, the bright museum backgrounds.
   - Map to a 3-stop duotone:
     - A "bone": `#0b0a09 → #6d6152 → #e9dfcc` (a warm silver print).
     - B "silver": `#0a0a0b → #4d4a46 → #d9d3c8` (neutral, lower key, cinematic).
2. **Grain.** A static 180 px noise tile is blended over the plate in overlay at 20–22 %. A adds 3.5 % paper grain over the whole page. The grain also hides JPEG blocks and upscaling softness. It is never animated.
3. **Face-aware crop** from `d1-focus.json`:
   - **A:** the face centre sits at 50 % / 36 % of the plate and the face is 25 % of plate height. Zoom is capped at 1.9 CSS px per image px.
   - **B:** the face sits at 66 % / 40 % and is 26 % of plate height. A face that would land in the faded edge gets up to 1.35× extra scale to reach 60 %. The quote's width then ends 36 px before the sitter (face centre − 2 face widths, never left of 24 % of the plate). The type steps aside for the face.
   - **Phone:** the face is 34–36 % of plate height, with zoom capped at 1.25.
   - Portraits are **never mirrored**.
4. **Phone height budget.** The quote is fitted first, and the plate takes the remaining height: A 28–50 %, B 32–62 % of the viewport. The quote, name, source and credit then fit on one screen for all 100 quotes.
5. **Licence.** Duotone plus crop is a modification. For the 32 CC BY / BY-SA images the credit therefore ends in "· bearbejdet" ("modified"; CC 4.0 requires indicating changes, and 2.0/3.0 adaptations must credit them). Public-domain and CC0 images get no suffix. The credit line itself is `creditParts()` from production: Foto, licence link, Commons link.

### Motion

Every animation ends by **600 ms**, checked with `getAnimations()` on short, long, verse and translated quotes. All of it is entrance motion, played once per page view, and nothing loops. The countdown never animates.

| Element | A "Opslag" | B "Omslag" |
|---|---|---|
| Portrait | 0–600 ms: a `clip-path` wipe from the left, while the image settles from scale 1.06 to 1 | 0–600 ms: develops from opacity 0, while the image settles from scale 1.045 / −1.2 % x |
| Quote | each frozen line rises 0.62 em from its own mask and fades in. 420 ms each, start 40 ms, stagger ≤ 45 ms, total spread ≤ 140 ms | the same, rising 0.5 em |
| Signature | rule draws (scaleX) 200–580 ms; name and dates fade 260–600 ms | fades 260–580 ms |
| Timer, credits | fade 200–600 ms | fade 260–580 ms |
| Session over | timer → message crossfade, 300 ms | the same |

The easing is `cubic-bezier(.2, .7, .1, 1)`. Under `prefers-reduced-motion: reduce` the page runs **no animations at all**: `document.getAnimations().length === 0` was verified with emulated reduce. The page stays hidden (`visibility`) until the quote is fitted and the portrait decoded, about 40 ms locally, so no layout jump is ever seen.

### Accessibility

WCAG 2.x contrast ratios, computed from the tokens.

| Token | A on `#0b0a09` | B on `#0a0a0b` |
|---|---|---|
| Quote / name, paper | 16.1 : 1 | 16.6 : 1 |
| Timer, dates, source, muted | 8.8 : 1 | 8.3 : 1 (dates 10.2 : 1) |
| Photo credit | 5.7 : 1 (faint `#8f897e`, 10.5 px) | 8.3 : 1 on ink. On the photograph's foot it is ≥ 5.8 : 1 against the brightest possible duotone pixel |
| Yellow link and lock | 11.8 : 1 | 11.8 : 1 |

**B, where text meets the photograph.** These figures are worst cases, measured against the brightest pixel the duotone can produce (`#bdb8ae`). The radial vignette and the text-shadow, which only make things darker, are left out.
- **Desktop quote:** at least 8.4 : 1. The quote ends where the mask alpha is ≤ 0.32.
- **Phone, first line over the faded foot (alpha ≤ 0.53):** at least 4.8 : 1. Quote type is ≥ 22 px and in practice ≥ 29 px, so this is large text with a 3 : 1 threshold.
- **Phone timer over its top scrim:** 5.4 : 1.

A has no text on the image.

Other accessibility details:
- The countdown is `role="timer"` with a Danish label; it is not live-announced.
- The portrait canvas is `role="img"`, labelled "Portræt af {name}".
- The blockquote is `lang="en"` and the hanging mark is `aria-hidden`.
- Links show a yellow `:focus-visible` ring.
- No horizontal scroll at 390 px.

### Known weaknesses

- **Didot hairlines at 1× density.** On a non-Retina external monitor, quotes in the 25–40 px range (the longest quotes on 1280×720 and phone) can look spindly. If that matters, switch to Bodoni 72 Book below about 40 px. Bodoni 72 is sturdier and also a system font.
- **Low-resolution portraits.** a12 (398×568), e13/e14 (468×631) and e25 (467×651) are upscaled up to 2.2 CSS px per image px in B at 1440 px, which is 4.3 device px on Retina. The grain hides most of the softness but not all of it. On phone, q094's JPEG blocks show in the trees. These files should be re-sourced at ≥ 1200 px.
- **Duotone discards colour.** Jobs' red backdrop and Federer's blue are gone. That is deliberate for consistency, but the owner may want colour for modern photographs.
- **Face boxes are a dev sidecar.** Production needs `image.focus {x, y, w, h}` in `quotes.json`, written once by the tools pipeline. The Vision script is 25 lines of Swift. Without focus data the crop falls back to the centre and upper third, which is acceptable but less intentional.
- **The step-aside rule in B is a heuristic.** It assumes the subject is about four face widths wide. Augustus' raised arm (q088) and Seneca's double herm (q062) come close to the text, though they do not touch it.
- **Rotated credit in A.** You have to tilt your head to read it. That is magazine convention, and it is horizontal on phone, but it is less readable than a normal line.
- **Hierarchy shift.** The timer drops from 56 px to 19 px, so the quote wins. If the owner wants the time to be glanceable from across the room, A has space top right for 28–32 px without crowding.
- **Layout depends on JS.** The fit runs on load and on resize (about 10 measurements, < 40 ms). Before that the stage is hidden, so a page that fails to load the quotes shows only the timer.
- **Source shortening is heuristic.** It should be data (`source.short`). The label "Foto:" is also slightly off for paintings and sculptures (Marcus Aurelius, Leonardo); "Portræt:" fits better.

### Production notes

- No new permissions are needed. The canvas reads same-origin extension images, so it is never tainted.
- A port would replace `blocked.css` and the render part of `blocked.js`. It would reuse `fit`, `settle`, `typeset`, `treat` and `cropTo` as a small `lib/editorial.js`, and add `image.focus` to `quotes.json`.
- The production rules stay as they are: no link to the blocked site while locked, Danish UI, and the credit line from `creditParts()`.

## Retning 2: Cinematic / immersive (designer 2)

**Idea.** Treat the page as a film title card. The room goes dark, one face is lit, and the words appear beside it. Every portrait is re-printed in the same darkroom: one tone curve, one warm monochrome palette, exposed for the face and burnt down toward the edges. The result is that a Roman bust, a 1900s glass plate and a 2010s press photo come out as stills from the same film. No image edge is ever visible, because every edge that falls inside the window dissolves into black. That is what makes odd crops, low-resolution files and white studio backdrops look intentional at full bleed. The page has no labels and no chrome. In the locked state it shows the quote, the face, the name, the time left, and one quiet credit line.

### Files

| File | What it is |
|---|---|
| `d2-a.html` | **Variant A "Mørkekammer" (the darkroom).** The portrait bleeds off one edge at full height and dissolves into black. The quote stands in the dark beside it, in Hoefler Text, and the name follows a short yellow rule in letter-spaced caps. The countdown sits under the quote, and the photo credit sits under the photo. **Look room:** the portrait goes on the side that lets the sitter look *into* the frame, toward the quote. 18 of 99 portraits turn to the viewer's right and are placed on the left; the photograph itself is never mirrored. |
| `d2-b.html` | **Variant B "Titelkort" (the title card).** The composition is centred. The portrait stands in the middle of the frame, lit from above, and falls into black. The quote is set over its darkened lower half in Big Caslon. The name sits below the quote as a title in wide caps under a yellow rule, with the dates under it. The site name and the countdown sit in the top corners like a film slate, and the credit is centred at the foot. |
| `d2-stage.js` | Shared engine: the darkroom (`develop`), art-directed framing (`frame`), type fitting (`fit`), typesetting, the credit line and the mock session. It imports `lib/time.js` and `lib/credits.js` from production unchanged. |
| `d2-focus.json` | Face box and **yaw** for the 99 portrait files, from Apple Vision (`VNDetectFaceRectanglesRequest`, revision 3). Vision finds 95 faces. Four are set by hand: Laozi, the Leonardo chalk, the Anne Brontë sketch, and Amundsen seen from behind (x20). Yaw is in radians, positive when the face turns toward the viewer's right. It was calibrated on Helen Keller (+1.10, looking right) and Amundsen x01 (−0.79, looking left). |
| `d2-frame.html` / `.js` | Dev tool that shows a mockup in an exact-size frame. It exists because headless Chrome will not make a window narrower than about 500 px, and its viewport is about 88 px shorter than its window. All screenshots and measurements go through it or through a CDP viewport override. |
| `d2-shots/` | 29 PNGs. For both variants: 4 quotes at 1440×900 and at 390×844 @2x. The quotes are q079 Churchill (26 words, black and white), a21 "Champions adjust." (2 words, colour), x01 Amundsen (31 words, translated) and a12 Jordan (the 398×568 file). Also for both variants: q056 Keller (the look-room flip), 1280×720 for q094 (landscape file, verse) and x03 (38 words, the longest), and "session over" at desktop and phone. Plus `d2-{a,b}-alle-100-citater.png`, all 100 quotes at 1440×900 in one sheet, and `d2-a-1440x900@2x-a12-detalje.png`, the 398 px file at Retina density. |

Dev URL parameters are `?q=<id>`, `?mins=<n>`, `?ended=1`, `?host=<host>`, `?still=1` (no drift and no transitions, used for screenshots), `?notext=1` (all text hidden with the layout unchanged, used for the contrast audit), and `?measure=1` (writes every text line box to `<html data-boxes>`). Keys: ← and → step through all 100 quotes.

### Typography

**Faces.** All faces are macOS system fonts, referenced by name. Nothing is bundled or fetched, so no licence question arises. Production never ships a font file.
- **A: Hoefler Text** (`/System/Library/Fonts/Supplemental/Hoefler Text.ttc`). It is a Garamond-like text face with real weight, and its strokes survive grain and photographic backgrounds at 31 px as well as at 92 px. Fallback chain: `'Hoefler Text', 'Iowan Old Style', Palatino, Georgia, serif`.
- **B: Big Caslon** (`/System/Library/Fonts/Supplemental/BigCaslon.ttf`). It is a display Caslon with heavy hairlines and a dramatic, compact colour that suits centred title-card setting. It has a single weight, which is all a quote needs.
- **SF Pro** (via `system-ui`) sets everything else.
- Didot (Retning 1) was rejected for this direction. Its hairlines break up over photographic texture at 1× density, and in this direction the text sits close to, or over, a photograph.
- I confirmed in Chrome 152 that `ui-serif`, `"New York"` and `local("New York")` do not resolve. `system-ui` does resolve to SF.

**The quote is set at the largest step of one fixed scale that fits.** The scale is modular, with steps of about 1.125: `104 · 92 · 82 · 73 · 65 · 58 · 52 · 47 · 42 · 38 · 34 · 31 · 28 · 26 · 24 · 22 · 20 · 19 · 18` px. A step is accepted when the quote plus the name fits the height budget and the line count is within the step's limit: ≥ 82 px at most 3 lines, ≥ 65 px at most 4, ≥ 52 px at most 5, ≥ 42 px at most 6. Leading runs from 1.02 at 70 px or more to 1.30 below 24 px, and tracking from −0.024 em to 0. `text-wrap: balance` is used up to 5 lines and `pretty` beyond that. Using fixed steps rather than free fitting means two quotes of similar length always get exactly the same size, so the series looks typeset rather than auto-scaled.

| | A "Mørkekammer" | B "Titelkort" |
|---|---|---|
| Quote | Hoefler Text 400. Cap 10.4 vh. Column `min(47vw, 780px)` | Big Caslon. Cap 9 vh. Column `min(68vw, 1000px)`, centred. Budget ≤ 40 vh, so the face keeps the upper half |
| Measured, 1440×900 | 47–92 px | 47–73 px |
| Measured, 1280×720 | 38–73 px | 42–58 px |
| Measured, 390×844 | 31–47 px (cap `min(48, 6.2vh)`, budget ≤ 45 vh) | 31–47 px |
| Name | SF 600 caps, +0.24 em, `clamp(14px, 0.24 × quote, 19px)`, after a 28 × 1 px yellow rule | SF 600 caps, +0.30 em, `clamp(15px, 0.30 × quote, 22px)`, under a 36 × 1 px yellow rule (optically centred) |
| Dates | SF 13 px, tabular, `#aaa397`, after the name | the same, on their own line under the name |
| Countdown | SF 200, `clamp(34px, 4.8vh, 46px)`, tabular, under the quote column (34 px on phone) | SF 300, 26–32 px, tabular, top right (24 px on phone) |
| Site, credit | SF 12 px `#969086` (11.5 px on phone). Credit under the photograph | the same. Credit centred at the foot |

**Typesetting details.** All of these are done in code; the data is untouched.
- Curly quotes and apostrophes: e09, e18 and others contain straight `"` and `'`.
- A closed-up em dash is glued to the word before it with a word joiner, so a line never starts with "—". A spaced dash gets a no-break space.
- Piet Hein's `Problems worthy / of attack / …` is set as real verse lines.
- "born 1943" / "b. 1951" → "f. 1943". **This is a production bug:** `daDates()` does not translate "born", so the live page shows "born 1943".

### Image treatment ("darkroom")

All steps run in one canvas pass, 6–43 ms per portrait measured in headless Chrome. The extension's own images are same-origin, so the canvas is never tainted.

1. **Levels.** The black point is set at the 0.4th percentile (capped at 0.22) and the white point at the 99.7th.
2. **Expose for the face, part of the way.** The pass meters the middle 70 % of the Vision face box and moves its tone toward 0.48 (B: 0.46), but **only 60 % of the way, in log space**: `gamma = (ln target / ln faceMean)^0.6`, clamped to 0.6–1.9. Exposing every face to the same value turns dark skin and pale skin into the same grey. Partial correction rescues a faded scan or a crushed shadow, while Jordan, Kipchoge, Owens and Henson keep dark skin and the marble busts stay marble.
3. **S-curve** (0.32 / 0.38) and **highlight ceiling** (0.82 / 0.78). A white backdrop never prints as white.
4. **Burn (dodge and burn).** The pass meters the backdrop as the mean of the outer 10 % ring. The print then darkens with distance from the face, from 1.25 to 4.4 face units on a smoothstep, with the body below the face lit a little longer. Burn strength runs from 0.38 to 0.80 and rises with backdrop brightness. A white studio wall (Ali, Kierkegaard, Keller, Amundsen in the snow) becomes a glow behind the head instead of a grey slab.
5. **Warm monochrome**, mapped through a 3-stop palette: A `#060607 → #766e63 → #ece4d5`, B `#050506 → #6e675d → #e8e0d1` (lower key). Colour photographs and black-and-white glass plates become one series.
6. **Framing from the face box.**
   - **A:** the face is 30 % of window height, with its centre at 71 % (29 % when flipped) across and 40 % down. The print always covers the full height. A narrow print slides 60 % of the way to its edge, and the rest of the gap is darkness.
   - **B:** the face is at most 26 vh and at most 42 % of the space above the quote, centred, with the eye line at 46 % of that space. Close-ups are **not** blown up to cover the height, because that pushed chins into the quote. They float, and their top edge dissolves too.
   - **Phone:** the print fills the width. The whole face is kept between a 72 px dark top strip (site name, countdown) and the quote. A close-up that cannot fit is printed down to 80 % width with its sides dissolving.
   - The upscale cap is 1.75 CSS px per source px (2.1 on phone).
7. **No edge is ever visible.** Every print edge inside the window gets an eased `mask-image` feather. The side facing the quote gets a long one, which may reach the shadow side of the face (Rembrandt light) but never past its middle. On phone the print dissolves from just under the chin into the first line of the quote. That fade is clamped inside the print, so a close-up whose chin sits near the bottom of its file still gets at least 110 px of fade.
8. **Light.** A radial falloff centred on the face, plus scrims, all placed from the face position through CSS custom properties. A: a side scrim behind the quote, the bottom at 0.95 → 0.91 → 0.55, the top at 0.74 → 0.42. B: the same falloff, and a scrim from just above the quote to 0.92 at the foot.
9. **Haze.** The print, scaled down to 48 px and blurred 64–72 px, is spread across the whole window. Its opacity is computed per image so its mean stays near `#121110`: a dark print gets a faint glow of its own tones, and a light one cannot grey the side where the quote stands.
10. **Grain.** A static 192 px noise tile, blended in overlay at 0.30–0.50. The amount rises with the device upscale factor. It never animates.
11. **Low-resolution insurance.** Beyond 2.6 device px per source px, the print is softened 0–1.1 px, so it reads as depth of field rather than JPEG blocks, and the grain gives texture back. Example: a12 (398×568) prints at 1.58 CSS px per source px at 1440×900, which is 3.2 device px on Retina, and gets 0.18 px of softening. See `d2-a-1440x900@2x-a12-detalje.png`: at Retina density it reads as a vintage print rather than an upscale.
12. **Licence.** The grade and crop are a modification. Credits for CC BY / BY-SA images therefore end in ", bearbejdet" ("modified"); public-domain and CC0 images get no suffix. Apart from that, the line is production's `creditParts()` wording: source, translator ("Overs. …"), "Foto:", licence link and Commons link.

**Fallback.** If the image is missing or fails, the page shows type only on black. The column widens, and the quote is fitted again for the new width (tested with all `*.jpg` blocked).

### Motion

| What | Spec |
|---|---|
| Portrait | Develops from black: opacity 0 → 1, 600 ms, `cubic-bezier(.4, 0, .2, 1)`, starting when the print is ready |
| Quote | Rises 10 px and fades in, 520 ms, delay 40 ms, `cubic-bezier(.2, .7, .2, 1)` |
| Name | The same, 460 ms, delay 130 ms (ends at 590 ms) |
| Countdown, site, credit | Fade 400 ms, delay 200 ms (ends at 600 ms) |
| Ambient drift | A single slow push-in: scale 1 → 1.055 over **60 s**, centred **on the face** (`transform-origin` = face), so the face stays put while the room closes in. It then holds and never loops. At 1440×900 a point 500 px from the face moves under 0.5 px per second, so the drift is felt rather than seen. It is composited (transform only), and the print is never redrawn. |
| Session over | The countdown is replaced by "Fokussessionen er slut" and a yellow "Fortsæt til {site} →". The print brightens to 112 % over 600 ms: the lights come up. |
| `prefers-reduced-motion: reduce` | No drift and no travel; only 200 ms opacity fades. Verified with CDP emulation: the plate's `animationName` is `none`, and the text uses `fade 0.2s`. |

The entrance timings were verified with `getComputedStyle` in headless Chrome. Every entrance ends by 600 ms. A tab opened in the background starts its entrance when it becomes visible.

### Accessibility: contrast measured over the real imagery

**Method.** Every one of the 100 quotes was rendered in headless Chrome with exact viewports (CDP `setDeviceMetricsOverride`): 1440×900, 1280×720 and 390×844, in both variants, 600 renders in all. Each render ran with all text hidden (`visibility`, so the layout is identical) and wrote each text line's box. The audit then took the background pixels under every line box from the screenshot and computed the WCAG 2.x ratio between the text colour and:
- the **95th-percentile** background luminance, which ignores single grain specks;
- the **single brightest pixel**.

The text halo and the quote's text-shadow only darken the background, so they are left out of the figures, which are therefore conservative.

**Worst case of all 100 quotes.** Each cell gives the p95 ratio, then the brightest-pixel ratio in brackets, then the quote it occurs on.

| Element (colour, size) | A 1440×900 | A 1280×720 | A 390×844 | B 1440×900 | B 1280×720 | B 390×844 |
|---|---|---|---|---|---|---|
| Quote `#f5f0e7` | 10.0 (5.1) x20 | 8.3 (4.1) x20 | 17.6 (15.8) | 14.6 (10.1) x16 | 15.0 (10.7) x16 | 18.0 (16.6) |
| Name `#e6dfd2` | 12.1 q021 | 11.7 x20 | 15.8 | 15.0 | 15.1 | 16.1 |
| Dates `#aaa397`, 13 px | 8.1 | 7.4 q007 | 8.3 | 7.9 | 7.9 | 8.3 |
| Countdown | 15.6 | 15.5 | 15.8 | 13.1 x20 | 12.2 x20 | 14.3 x20 |
| Credit `#969086`, 12 px | 6.1 a03 | **5.4 (4.1) a06** | 6.6 | 6.3 | 6.4 | 6.6 |
| Site `#969086`, 12 px | 4.9 (4.3) x20 | **4.6 (4.0) x20** | 5.9 (5.7) x20 | 6.4 | 5.3 (4.8) x20 | 6.0 (5.8) x20 |
| Session over: text / yellow link | 18.5 / 12.5 | — | 18.4 / 12.4 | — | 11.9 / 8.0 (x20) | 13.1 / 8.8 |

- Every element passes AA (4.5 : 1 for small text) at p95, on every quote and every layout.
- The median quote ratio is about 17.9 : 1.
- The weakest case is the 12 px site name over Amundsen's snow (x20) at 1280×720. It passes at p95 (4.6 : 1); measured against the single brightest pixel it is 4.0 : 1.
- The same audit found **0 collisions** between text elements, **0 lines outside the window**, and **0 quotes or names over a face** (the face box plus 15 % for the chin) in all 600 renders. The face check caught three phone close-ups (a03, a22, q094) before the phone framing rule was added.

**Other accessibility details.**
- The page is `lang="da"` and the blockquote is `lang="en"`.
- The countdown is `role="timer"` with the label "Tid tilbage" and is not live-announced. Its tooltip reads "Låst til HH:MM".
- The scene is `aria-hidden`. The sitter's name is always text, so the portrait is decorative.
- Links show a yellow `:focus-visible` ring.
- No horizontal scroll at 390 px.
- The tab title is "01:12:55 · LockedIn".

### Known weaknesses

- **Colour is gone.** Jobs' red backdrop, Biles' green and the astronauts' flags all become warm monochrome. This is deliberate, because it is what makes the series one film, but the owner may miss colour on modern photographs.
- **Full-length figures are soft on Retina.** x20, x18 and a01 have tiny faces, so they hit the 1.75 upscale cap: 3.5 device px per source px. The grain and softening make them read as archival rather than broken, but they are the softest frames. These files and a12, e13, e14 and e25 should be re-sourced at ≥ 1200 px.
- **Drawings print faint.** The tone curve is built for photographs. Leonardo's red chalk (q013) and the Laozi painting (q007) come out as ghosts on dark paper. That is atmospheric, but the face barely reads. A per-image `contrast` override in the data would fix it.
- **B's close-ups are smaller.** Ali, Jordan and Caesar float as lit medallions above the quote and are less immersive than in A. That is the price of keeping the chin out of the centred quote.
- **Look room depends on data.** The flip needs `yaw`. Vision gives it for 95 files and 4 are set by hand. The 0.35 rad threshold flips 18 portraits, and a few of those are mild turns (0.36–0.40) that could go either way. Without yaw data, A falls back to portrait-right.
- **The layout depends on JS.** Fitting, framing and developing run on load and on resize: about 10 measurements plus one canvas pass of 6–43 ms. The text appears before the print, so a slow image never holds the quote back, but the page is not designed to work without JS.
- **Credits are long.** Production's `creditParts()` prints full book titles, so the credit runs to 2–3 lines at 12 px. A `source.short` field in the data would fix this (Retning 1 suggests the same).
- **The haze is subtle by design.** On dark prints it is nearly invisible. If simplicity wins, it can be removed with no other change.
- **The audit ran at 1× density.** At 2× the grain is finer and the per-pixel numbers move slightly; the p95 figures are not expected to drop.

### Production notes

- **Data.** Add `image.focus: {x, y, w, h, yaw}` to `quotes.json`, written once by the tools pipeline. The Vision pass is a 30-line Swift script (`VNDetectFaceRectanglesRequest` revision 3); its output for the current 99 files is `d2-focus.json`. Fix "born" in `daDates()` in `lib/credits.js`.
- **Code.** A port replaces `blocked.css` and the render half of `blocked.js`. It adds `develop`, `frame`, `fit` and `setText` from `d2-stage.js`, about 300 lines with no dependencies. The scripts stay external modules, as MV3's default CSP requires. The grain tile is a `data:` PNG generated at runtime, which the default extension CSP allows.
- **Permissions.** No new permissions are needed.
- **Rules that stay.** The production rules stay as they are: no link to the blocked site while locked, Danish UI, and the credit line from `creditParts()` (plus ", bearbejdet").

## Kritik af Retning 2 (fra designer 1)

**How I tested.** I read `d2-a.html`, `d2-b.html`, `d2-stage.js`, all of `d2-shots/` and the two 100-quote sheets. I rendered q079, a21, x03, e01 and a12 in all four variants at 1440×900 with exact CDP viewports, and measured the quote's font size and its box's share of the window.

**Verdict.** This is the most accomplished *photography* in either direction. The darkroom pass makes 99 mismatched files into one series better than mine does. But the brief's first sentence is *"Selve præsentationen af citaterne skal være markant federe"*, and Retning 2 makes the image the hero and the quote its caption. Of the two, Mørkekammer (A) is clearly the stronger; Titelkort (B) has a problem with what it signals (see 3 below).

### Where Retning 2 beats my variants

1. **Light.**
   - Face-centred dodge and burn, plus the haze and per-image burn strength, make every portrait look *lit*, and no edge is ever seen.
   - White studio walls (Ali, Keller, Kierkegaard, Amundsen's snow) become a glow behind the head.
   - My A prints them as a flat bone-coloured panel, and my B's straight linear mask is cruder.
2. **Skin tone.**
   - Partial face exposure (60 % of the way, in log space) keeps Jordan, Owens and Henson dark and the busts marble.
   - My pipeline pushes every face to the same tone (0.60 / 0.54), so dark skin comes out greyed. **That is a real flaw in mine**, not a matter of taste.
3. **Look room.** Placing the portrait by yaw so the sitter looks *into* the frame is real art direction. In my A, Amundsen and the other left-facing sitters look out of the page, away from the quote.
4. **The timer.** At 34–46 px it can be read at a glance, which the brief's "remaining focus time" needs. My 19 px is too quiet; I already listed this as a weakness.
5. **Rigor.**
   - The contrast audit samples the real pixels under every line box: 600 renders, p95 and brightest pixel. My figures are analytic worst cases.
   - The text appears before the print. My stage stays hidden until the image has decoded.
   - Softening low-resolution files when they are upscaled past 2.6 device px is a good idea.
6. **Hoefler Text holds up at 1× density.** That sidesteps my main known risk, Didot's hairlines on a non-Retina monitor.

### Against the brief

1. **The quote is not "markant federe". It is smaller than today's page relative to the photograph.** Same quotes, same 1440×900 window:

   | Quote | d2-a | d2-b | d1-opslag | d1-omslag |
   |---|---|---|---|---|
   | Churchill (26 words) | 47 px | 58 px | 72 px | 70 px |
   | Scott (38 words) | 47 px | 47 px | 63 px | 61 px |
   | Jobs (14 words) | 73 px | 73 px | 106 px | 108 px |
   | "Champions adjust." | 92 px | 73 px | 141 px | 129 px |

   - The modular steps carry line limits: at most 3 lines at ≥ 82 px, at most 4 at ≥ 65 px. These cap the short, punchy quotes, which are the ones that should hit hardest.
   - In B, "Champions adjust." sits at 73 px in a black field about six times its own area.
   - Hoefler's and Big Caslon's larger x-height narrows the gap optically, but does not close it.
   - The quote's box takes 6–19 % of the window, against 13–35 % in mine. "Consistency across the series" was chosen over "bolder quote".
2. **Text the brief calls unnecessary.**
   - **The host line.** "instagram.com" sits top left during the whole lock. The recruiter just typed it, so it tells him nothing.
   - **Long credits.** The credit line runs 2–3 lines at 12 px. It prints the full bibliographic record, for example "(arranged by Leonard Huxley; London: Smith, Elder & Co.)", "(New York: LifeTime Media)" and "(29. oktober)".
   - **Effect.** Designer 2 lists this as a data problem, but the mockup ships it. On phone it is 3–4 lines, the longest block on the screen after the quote.
3. **B reads as a memorial card.**
   - The ingredients are a centred, vignetted portrait floating in black, the name in spaced caps under a short rule, and the dates on their own line beneath. That is the visual language of in-memoriam and obituary cards.
   - It is awkward for living people (Billie Jean King "f. 1943", Federer, Musk) and for a page that is meant to push a salesperson forward.
   - Centred setting also makes 4–5-line quotes harder to read, because both edges are ragged.
   - B's close-ups shrink to medallions of about 26 vh, as Designer 2 notes.
4. **A's composition is scattered.**
   - The window has four things in four places: host at top left, a 46 px countdown at bottom left far below the quote, the credit at bottom right (bottom left when flipped), and the quote in the middle.
   - The name-and-quote unit is good, but the timer floats away from it, so quote, image and name are less of "one unit" than the photography suggests.
5. **Motion.**
   - The 60-second push-in breaks the ≤ 600 ms rule we were both given. It is a moving image on a page whose job is focus.
   - It is well made (anchored on the face, under 0.5 px/s, it holds and never loops), but it is still motion. The 112 % "lights come up" on session over is lovely and within the rule.
6. **The mood is one note.**
   - Highlight ceilings of 0.78–0.82 and burn up to 0.80 put every frame near black. Both 100-quote sheets look almost identical from one frame to the next.
   - That coherence is the point, but for a page seen dozens of times a day, by a recruiter who should leave it energised rather than solemn, I would lift the key a little.
   - Drawings (Laozi, Leonardo) print as ghosts, as Designer 2 notes.

### What I would steal

- Partial, log-space face exposure. This replaces my full normalisation and fixes the skin-tone flaw.
- Face-centred burn for bright backdrops, in place of my B's linear mask and my A's flat panels.
- Look room from yaw. In my A, the plate would move to the right when the sitter faces left.
- A 28–32 px timer.
- The real-pixel contrast audit.
- Text before the print.
- Lights up on session over.
- Softening when upscaled.

### What I would keep from Retning 1

- The quote as the dominant element.
- One short source line, with no host line.
- Hanging punctuation, correct nesting and the rules for dashes and hyphens.
- Every animation ends by 600 ms.

**Best hybrid:** d1-opslag's type scale and quiet text, printed with d2's darkroom (partial exposure, burn, look room) and d2's timer size.

## Kritik af Retning 1 (fra designer 2)

**How I tested.** I rendered all 100 quotes in both variants at 1440×900, 1280×720 and 390×844 with exact CDP viewports and `?still=1`, 600 renders in all. I read every frame on contact sheets and opened the hard cases at full size: light backdrops, low-resolution files, the longest quotes, and verse. I also read `d1-shots/` and the "Retning 1" text. Brightness figures are relative luminance measured on the renders.

**Verdict.** Retning 1 answers the first line of the brief, *"markant federe"*, more literally than I did. Didot roman at 90–141 px with a hanging yellow “ (Opslag) is the most striking typography of the four variants. Opslag's Kierkegaard and Gandhi frames are posters. **Omslag is the stronger of the two for the whole brief.** It dissolves the photograph into the page, so quote, face and name read as one picture. Opslag is a diptych: a photograph panel and a text panel with a hard seam. That is a beautiful spread, but it is two things side by side rather than one experience.

### Where Retning 1 beats my variants

1. **The quote is bigger and bolder.** At 1440×900 it is 63–141 px against my 47–92 px in A. My line limits per step (3 lines at ≥ 82 px, 4 at ≥ 65 px) cap exactly the short quotes that should hit hardest. Designer 1's table in the section above is correct.
2. **The hanging yellow “.** One glyph that says "quote", carries the brand colour, and costs no space. My variants have no quotation marks at all.
3. **Larger faces in Omslag.** The face fills about 26 % of plate height and the plate is larger, so the sitter is closer and more present than in my A at 30 vh of a narrower print.
4. **Phone, Opslag.** A hard-edged plate above and type below is the cleanest phone layout of the four. It is calm, it fits all 100 quotes, and it has no gradients to manage.
5. **Restraint in motion.** There is no ambient drift, and under reduced motion there are **zero** animations; mine keeps 200 ms opacity fades. The per-line entrance from frozen lines is more refined than my whole-block rise.
6. **Clean data at render time.** Short source titles and stripped research notes. My credit line prints the full bibliographic record and runs to 2–3 lines; Designer 1 is right that I ship that.

### Against the brief

1. **Opslag's plate is the brightest thing on the page.** It has hard edges, a highlight ceiling of 0.93 and no backdrop burn, so light backdrops become a cream slab covering 37 % of the window. Measured on the plate alone, excluding all type:
   - pixels brighter than L 0.35 (about `#a0a0a0`) cover a median 7.1 % of the window, 16.4 % at p90 and **25.8 % at worst** (q092, Kierkegaard's sketch);
   - the plate's mean luminance reaches 0.39.

   For comparison, over the whole window including the type, Omslag measures 2.7 % median and 13.8 % worst, and my A measures 2.5 % median and 7.1 % worst. On a page whose job is focus, the words should be the brightest thing on the page. Gandhi's shawl, Keller's studio wall and Vivekananda's paper outshine the quote.
2. **The hard edge exposes the source crop.** In Opslag the plate edge cuts through whatever is there: Vivekananda's handwriting mid-word, scan borders, Augustus's arm. A dissolve (Omslag, or my variants) hides the accidents of each file; a hard frame shows them.
3. **Very large type in a narrow column breaks into fragments.** At 120–141 px, Opslag sets 2–3 words a line ("Purity / of heart / is to will / one thing."; Gandhi in 5 lines). As a poster that is magnificent. For a 20–30 word quote read in a few seconds, it reads word by word.
4. **Long quotes in Didot italic (Omslag).** Scott runs 9 lines of italic Didot at 61 px on desktop and about 30 px on phone. Long italic passages read more slowly than roman, and the hairlines are thin on a 1× external monitor (Designer 1 flags this too).
5. **The time left is a footnote.** At 19 px light in a top corner, "the remaining focus time" from the brief cannot be read at a glance (Designer 1 agrees).
6. **The photo credit is 10.5 px in both variants, and rotated 90° in Opslag.** That is below the 12 px floor the earlier design review set for this page (DESIGN-REVIEW M5). A credit you must tilt your head to read is a magazine gesture, not a "helt enkel oplevelse".
7. **No look room.** Opslag always puts the face left, so Amundsen (x01), Leonardo and Churchill look out of the page. Omslag always puts it right, so Keller (q056) and Anne Brontë look away from their own words.
8. **Equal face exposure.** Every face is metered to the same median, which is a risk to skin tone. To be fair, I did not see a visible failure in the renders (Jordan, Owens and Henson look natural), and Designer 1 has already adopted the partial exposure.

### What I would steal

- A higher type ceiling: about 14 vh for quotes of up to 8 words, and line limits loosened by one line at each step.
- The hanging yellow “.
- `source.short`, or the render-time shortening, to cut my credit line to one line. I would also drop my host line, which Designer 1 rightly calls redundant.
- Zero animations under reduced motion, and the per-line entrance.
- Omslag's larger face scale on desktop.

### A note on one point in the critique of Retning 2

The 60-second drift does not break the motion rule. The coordinator's brief allows *"a very slow ambient image drift … if it can't distract and stops with reduced motion"*. Mine moves a point 500 px from the face by less than 0.5 px a second, plays once and holds, and is off under reduced motion. Whether it belongs on a focus page at all is still a fair question.

**Best hybrid:** Omslag's type scale (in roman, not italic, for long quotes) and its hanging “, printed with d2-A's darkroom (partial exposure, burn), dissolve and look room, with a 28–46 px timer and a one-line credit.

## Afgørelse (independent judge, 2026-10-04)

**How I judged.** I read both directions and both critiques in full. I then rendered all four variants myself with exact CDP viewports (`?still=1`) at **1440×900** (11 quotes), **1280×720** at 1× density (5 quotes) and **390×844 @2x** (5 quotes): 76 renders in all, compared on side-by-side sheets. The quotes covered:
- short: a21 "Champions adjust.";
- long: x03 Scott, 38 words;
- black and white: q079 Churchill;
- low resolution and dark skin: a12 Jordan, 398 px;
- dark skin: a08 Owens;
- a bust: q001 Marcus Aurelius;
- light backdrops: q056 Keller, q092 Kierkegaard;
- drawings: q013;
- a sitter facing left: x01 Amundsen;
- verse: q094.

I also looked at the "session over" frames and at 1× crops of Didot next to Hoefler Text. No file other than this section was changed.

### Ranking as built

1. **d2-a "Mørkekammer".** The strongest single picture. The darkroom makes 99 mismatched files into one series. Look room is right: Owens and Amundsen look toward their words. Skin tones survive (Jordan and Owens stay dark), and the busts stay marble. It loses on the brief's first line, though: the quote is the caption, not the hero. Churchill is 47 px against 72 px in d1-opslag, and "Champions adjust." is 92 px against 141 px. It also carries text the brief calls unnecessary: the host line and 2–3-line credits.
2. **d1-omslag.** One picture, big type. But it has italic Didot for 9-line quotes (Scott, Churchill), no look room (Owens smiles away from his quote), and the d1 exposure.
3. **d1-opslag.** The best typography of the four: Didot roman plus the hanging yellow “ is the poster the owner is asking for. But it is a diptych, and the hard plate is the brightest thing on the page (Keller, Owens, Kierkegaard and Jordan become cream slabs). The hard edge also exposes source crops, and the 19 px timer is a footnote.
4. **d2-b "Titelkort".** Dropped. A centred medallion with the name in spaced caps under a rule and the dates beneath reads as a memorial card. That is wrong for living people and for a page meant to push a salesperson forward. Its faces are also the smallest.

**Decision: build a hybrid on d2-a's chassis with d1-opslag's typography and text discipline.** That is what both critiques converge on. Below is the exact spec. Anything not stated follows d2-a.

### Layout per breakpoint

| | Desktop / landscape (width ≥ 900 and aspect ≥ 1.1; covers 1440×900 and 1280×720) | Phone / portrait (width < 900 or aspect < 1.1; covers 390×844) |
|---|---|---|
| **Portrait** | Full height, **46 %** of the width, on the **look-room side**: right by default, left when `yaw > +0.35 rad`. The pixels are never mirrored. The inner edge dissolves with d2-a's eased feather, and no print edge is ever visible. | Full width at the top. Its height is whatever is left after the text is fitted, at least 34 % of the height. It dissolves from just below the chin into the first line of the quote, using d2-a's phone framing (the whole face always kept). |
| **Text zone** | The other 54 %. Outer padding `clamp(32px, 5vw, 80px)`. The quote ends at least 40 px before (face box − 1 face width). The quote block is centred on 46 % of the height, a little above the middle. | 20 px side margins. Quote, then signature, then credit, all on one screen for every one of the 100 quotes (fit first, then the plate). |
| **Timer** | At the top of the text zone, aligned to the quote's left edge. It moves with the side flip, so it always sits over dark. | A top strip of 20 px padding over a scrim of at least 0.9. |
| **Credit** | One line at the foot of the text zone, on plain dark. Never on the print. | At the foot, at most 2 lines. |

The portrait and the timer take fixed places (an image side and a top corner), so the eye learns where the time is. The quote, rule and name form one block.

### Typography

- **Quote face: Didot 400 roman.** Use the family name explicitly: Chrome does not resolve `ui-serif` or `"New York"`, and `blocked.css` must stop relying on them. Fallback: `"Bodoni 72", "Iowan Old Style", Georgia, serif`.
  - **Do not use italic** for quotes.
  - **1× rule:** when the fitted size is < 40 px and `devicePixelRatio < 2`, set the quote in **Bodoni 72 Book**. Its hairlines are sturdier. Desktop windows of 1280×720 and up never reach this rule (the 1280×720 floor measured 51 px).
- **Colour.** Quote in paper `#f2ece1`. The **opening “ hangs in accent `#f2c14e`**. The closing ” is in paper.
- **Size: the largest step of one modular scale that fits.** This gives d2's series consistency with d1's ceiling.
  - Scale: `128 · 114 · 104 · 92 · 82 · 73 · 65 · 58 · 52 · 47 · 42 · 38 · 34 · 31 · 29` px.
  - Ceiling: desktop `min(128px, 15vh)`, phone `min(64px, 7.6vh)`. Floor: 29 px.
  - Line limits: ≥ 104 px → at most 3 lines; ≥ 82 → at most 4; ≥ 65 → at most 5; ≥ 52 → at most 7.
  - **No fragments:** quotes of 6 or more words must average at least 3 words per line, excluding the last line. This fixes the "Purity / of heart / is to will" problem.
  - Measure: at most 17 em up to 22 words, at most 22 em above that. `balance` up to 5 lines, `pretty` beyond.
  - Leading 1.04 at ≥ 92 px, rising to 1.18 at ≤ 34 px. Tracking −0.015 em at ≥ 92 px, rising to 0 at ≤ 40 px. Both are interpolated.
- **Typesetting rules from d1, unchanged:** curly quotes and correct nesting, dash binding, hyphen rules, no last word alone on a line, and verse lines.
- **Signature:** a 32×1 px accent rule, then the name in **SF Pro (`system-ui`) 600, caps, +0.22 em, `clamp(14px, 0.22 × quote, 19px)`**, paper at 90 %. After it, the dates in SF 400 13 px, tabular, `#aaa397`, with "f. 1943" style years (fix `daDates()`).
- **Timer:** SF Pro 300, tabular, `#c9c2b6`. Desktop `clamp(28px, 3.6vh, 36px)`, phone 24 px. No lock glyph and no label. The tooltip reads "Låst til HH:MM", and it has `role="timer"`, labelled "Tid tilbage".

### Image treatment: d2's darkroom, with four changes

1. **Keep:**
   - levels;
   - **partial log-space face exposure** (60 % of the way to 0.48);
   - the S-curve;
   - face-centred **burn**;
   - the warm monochrome palette A;
   - static grain at 0.30–0.45;
   - **softening beyond 2.6 device px per source px**;
   - the feathered dissolve;
   - the upscale cap of 1.75 (2.1 on phone).
2. **Lift the key a little,** so the series is less one-note. Highlight ceiling 0.86 instead of 0.82, and burn strength 0.30–0.65 instead of 0.38–0.80.
   **Acceptance:** over all 100 quotes × 3 viewports, the 99th-percentile print luminance stays *below* the quote's luminance, and print area brighter than L 0.35 is ≤ 6 % of the window at p90. The words stay the brightest thing on the page.
3. **Drop the haze.** Designer 2 calls it nearly invisible. Nothing lost, one pass less.
4. **Drawings:** add an `image.tone: "drawing"` flag for q007 and q013. Those images get no burn and a gentler curve, so they stop printing as ghosts.

**Crop:**
- Desktop: the face is 30 % of the viewport height, centred at 70 % / 40 % (mirrored to 30 % / 40 % when flipped).
- Full figures with tiny faces stop at the upscale cap and float in darkness, as in d2.
- Phone: the face is ≤ 34 % of the height, between the timer strip and the quote.
- Colour: monochrome for every image, including modern colour photographs. Consistency of the series wins. If the owner wants colour back, he can ask; this is the only open question.

**Fallback:** with no image, the page is type only and the column widens (d2).

### Credit line: minimal, with CC attribution always visible

- **Format:** one line, SF 12 px, `#969086`:
  `{source.short}, {year} · Billede: {creator}, {licence ↗}{, bearbejdet} · Wikimedia Commons ↗`
- **Label:** "Billede:" replaces "Foto:" and "Portræt:". It is correct for photographs, paintings and busts alike.
- **Order of truncation:** `source.short` is cut first (a new data field, at most 48 characters; until it exists, use d1's render-time shortening). Creator, licence, link and "bearbejdet" are **never** truncated. "Bearbejdet" only goes on CC BY / BY-SA images.
- **Placement:** on plain dark, never on the print. This removes the worst-case figures from d2's audit, and the credit must be ≥ 4.5 : 1 against the *brightest* pixel behind it.
- **Translator:** "Overs. X" stays in the line when it exists.

### Motion: every animation ends by 600 ms

| Element | Spec |
|---|---|
| Stage | Hidden for ≤ 50 ms until the type is fitted, so no layout jump is seen. The text **never waits** for the image. |
| Quote | Per line (d1): rise 0.5 em and fade, 420 ms each, from 40 ms, stagger 40 ms, total spread ≤ 140 ms. |
| Rule, name, dates | Rule scaleX 200–560 ms; name and dates fade 260–600 ms. |
| Portrait | Develops from black, opacity only, 600 ms from decode. No scale. |
| Timer, credit | Fade 200–600 ms. |
| **Ambient drift** | **Dropped.** It is well made, but the page is seen dozens of times a day. The brief says every detail must *support focus*, and any motion in peripheral vision pulls the eye away from the words. After 600 ms the page is perfectly still. |
| Session over | The timer slot crossfades in 300 ms to the message, and the print brightens to 112 % over 600 ms (d2's "lights come up"). Both play once. |
| Reduced motion | **Zero animations** (`getAnimations().length === 0`). The final state is shown at once. |

The easing is `cubic-bezier(.2, .7, .1, 1)`, and nothing loops.

### "Session over"

- The quote, portrait and credit stay.
- The timer's own slot turns into two lines:
  - `Fokussessionen er slut`, in paper, SF 500 17 px;
  - `Fortsæt til instagram.com →`, in accent, SF 15 px, with a focus ring.
- The host appears **only here**, because the link needs it.
- The tab title becomes "LockedIn".

### Contrast and quality targets

These are measured with d2's real-pixel audit over 100 quotes × {1440×900, 1280×720, 390×844}:
- **Quote, name, timer:** ≥ 7 : 1 at p95.
- **Dates, credit, link:** ≥ 4.5 : 1 at p95; the credit also ≥ 4.5 : 1 against the brightest pixel.
- **Collisions:** zero text over the face box + 15 %, zero collisions, zero lines outside the window, and no horizontal scroll at 390 px.

### What to drop

- d2-b in full.
- Italic Didot for quotes (d1-omslag).
- The hard-edged plate and the bone duotone panel (d1-opslag).
- The rotated gutter credit.
- **The host line during the lock.**
- The separate source line *and* separate photo credit, merged into one line.
- Full bibliographic records in the credit.
- d1's equal face normalisation.
- The 60 s push-in and the haze.
- The lock glyph, and the 19 px timer.
- d2's original line limits, which capped short quotes.
- The labels "Foto:" and "Portræt:".

### Before or with the port (data and production)

- Add `image.focus {x, y, w, h, yaw}` to `quotes.json`, generated by the Vision script.
- Add `source.short` and `image.tone`.
- Re-source a12, e13, e14, e25, x18, x20 and a01 at ≥ 1200 px.
- Fix "born" → "f." in `daDates()`.
- Replace the `ui-serif` and `"New York"` stacks with explicit family names.
- The port replaces `blocked.css` and the render half of `blocked.js`, using d2's `develop` / `frame` and d1's `typeset` plus the new step-fit. There are no new permissions, and scripts stay as external modules (MV3 CSP).

## Implementering (extension 1.3.0, designer 2)

The "Afgørelse" spec is built into production: `blocked.html`, `ui/blocked.css` and `ui/blocked.js`. The rules live in three new pure modules:
- `lib/quote-type.js`: the scale, line rules, typesetting and credit line;
- `lib/quote-frame.js`: the crop, look room, softening and grain;
- `lib/darkroom.js`: the print, working on raw RGBA pixels.

Everything runs under the extension's CSP:
- external module scripts only;
- layout values as CSS custom properties set through CSSOM;
- the grain as a runtime `data:` PNG (`img-src 'self' data:`);
- canvas only on the extension's own images;
- system fonts only (Didot, Bodoni 72, SF via `system-ui`);
- no new permissions.

The page still reads the quote from the worker's shuffle bag, counts down with "Låst til …", switches to "Fokussessionen er slut" with the link back, and keeps the `?mock=1` dev path (outside the extension only). The manifest is 1.3.0.

**Data (precomputed, never measured at runtime).**
- `tools/measure-faces.swift` (Apple Vision, run on a Mac) writes `tools/quote-faces.json`.
- `tools/quote-art.json` holds the hand-kept parts:
  - faces for the four files Vision cannot read;
  - `tone: "drawing"` for q007 and q013;
  - 52 editorial `source.short` titles.
- `tools/quote-art.mjs` merges `image.focus {x, y, w, h, yaw}`, `image.tone`, `image.width/height` and `source.short` (≤ 48 characters) into `quotes/quotes.json`. `tools/sync-quotes.sh` now runs it after every sync.

### Where the build departs from the spec, and why

1. **Face margin.** The quote ends at least 40 px plus *half* a face width before the face box, not a full face width. A close-up also moves outward, so its face box starts inside the 46 % zone.
   - With a full face width, a close-up that must cover the full height (Caesar, Ali, Jordan) left the quote a 200–450 px column at 1440×900, and "I came, I saw, I conquered." came out at 29 px.
   - As built, desktop sizes at 1440×900 run 47–128 px, median 65 (1280×720: 47–104 px, median 58; phone: 31–58 px, median 38).
   - In all 300 renders, no quote, name or date touches the face box plus 15 %.
2. **Credit line.** It is one line on desktop and two on phone whenever the full attribution allows it. Only the source is shortened (48 → 32 → 20 characters), then dropped. Creator, licence, links, translator and "bearbejdet" are never cut.
   - 26 of the 100 attributions (41 at 1280×720) need two lines **on their own**, because the creator field carries provenance notes. Examples: "Henry Maull and John Fox (Maull & Fox); frontispiece of The Voyage of the Discovery, 1905" and "Charles_Darwin_seated.jpg: Henry Maull …". On phone, 23 need 3–4 lines.
   - Cleaning those creator strings is an attribution decision for the owner, so the data is left untouched.
3. **No fragments: greedy fallback.** When balanced breaking would fail the no-fragments rule ("Limits, like / fears, are often / …"), the same size is tried with greedy breaking before the page steps down.
4. **Light.** The radial falloff around the face is measured in a light unit of the face height, clamped to 16–24 % of the print height, exactly like the darkroom's burn. It is a little stronger than d2-a's, and stronger again on phone. This is what meets the brightness target on phone, where the print takes about half the screen. The darkroom constants are as specified: ceiling 0.86, burn 0.30–0.65, partial face exposure 60 % toward 0.48.
5. **The image loads with the `load` event, not `decode()`.** Chrome does not settle `decode()` in a hidden tab, and the worker opens this page in background tabs when a lock starts.
6. **Production bug fixed in passing.** "born 1943" → "f. 1943", via `lifeDates()` in `lib/quote-type.js`; `lib/credits.js` itself is unchanged. "Laozi (traditional attribution)" shows as "Laozi".

### Verification

- `node --test test/*.test.mjs`: **129 pass**. The 20 new tests cover:
  - the scale, leading and tracking, line limits, no-fragments and step picking;
  - typesetting: nesting, dashes, hyphens, verse and the last word;
  - dates, source titles and the credit line, with no attribution truncation;
  - look room, both crops, softening and grain;
  - the darkroom's partial exposure, ceiling and palette;
  - the merged `quotes.json` fields.
- `FULL=1 sh test/blocked-in-chrome.sh` (new, Chrome for Testing): **all checks pass** on all 100 quotes × 1440×900, 1280×720 and 390×844 @2x. It refuses to run during a real lock (read-only GET `/v1/status`), and the browser blocks port 919. It covers:
  - no overflow, no horizontal scroll, no collisions, nothing outside the window, no text over the face;
  - line limits and no fragments;
  - Didot roman, Bodoni 72 only below 40 px at 1×;
  - the yellow “;
  - no site name during the lock;
  - complete attribution in the credit;
  - contrast measured on pixels:
    - quote, name and timer ≥ 7 : 1; the worst is 11.3 : 1, the median quote about 17 : 1;
    - dates and credit ≥ 4.5 : 1 at p95; the credit is also ≥ 4.5 : 1 against the brightest pixel, worst 6.4 : 1;
  - print area brighter than L 0.35 ≤ 6 % at p90 on every viewport;
  - the print's p99 below the quote;
  - motion: every animation ends by 600 ms and the page is still afterwards;
  - reduced motion: `getAnimations().length` stays 0;
  - the lock and session-over states;
  - the no-image fallback.
- `sh test/load-in-chrome.sh` (the packed extension under its CSP, fake daemon): **all checks pass**. The quote page renders and the print develops in about 14 ms. The site name is known to the page (`data-host`) but not shown during the lock.
- Daemon `CoreTests`: 175 pass (untouched).
- Contact sheets of all 100 quotes at all three sizes are in `extension/dev/quote-concepts/final-shots/`.

### Still open

- Re-source the low-resolution files: a12, e13, e14, e25, x18, x20 and a01.
- The owner may want to clean the provenance notes out of the long creator strings (point 2 above).
- Colour for modern photographs stays the one open taste question.
- `web/updates.xml` still advertises 1.2.0. The CRX has to be packed, signed and published together with it.

## Runde 2: QA-rettelser, v2-sættet og "et nyt citat" (designer 2, 2026-10-05)

### QA must-fix (docs/QUOTE-QA.md)

- **Sømmen på telefon.** Zonen (lyset) ender `EDGE_PAD` = 4 px efter printets fade, og printet har sin egen maske hele vejen ned. Telefonens zone klipper ikke længere (`overflow: visible`): et klip midt i printet kunne efterlade én umaskeret række i en skaleret rasterisering (pinch-zoom, skalerede skærmbilleder) — en hårlinje gennem første linje. På 1× og 2× er rækkerne under fade'en målt til ren sidefarve (5,5,5).
- **Krediteringen** renses ved build: `tools/quote-art.mjs` gemmer `image.credit` (navn uden noter, arkivnumre, URL'er, filnavne og wiki-markup; højst 40 tegn, aldrig klippet midt i et ord; "Unknown photographer" → "Ukendt fotograf"). Linjen viser navn, licens med link til deed'en (kun CC), "bearbejdet" ved CC BY/BY-SA og "Wikimedia Commons ↗". Den rå creator-tekst står kun i tooltip. Etiketten er "Billede:", ikke "Foto:", fordi tre filer er tegninger eller statuer. Et link brydes aldrig indeni ("CC BY-SA 4.0 ↗").
- **Vers** (Piet Hein og tilsvarende) sættes linje for linje, som de er skrevet. Lange vers (Shakespeare) får hængende indrykning, når en verslinje løber over.
- **1024×768**: tekstkolonnen er mindst 440 px (48vw under 1200 px), og portrættet viger. Målt på alle 69: min 42 px, median 58 px, kolonne ≥ 449 px.

### Should-fix

- Kilder vises hele eller slet ikke; de klippes aldrig.
- Enlige ord undgås: stub-reglen er blød, så den vælger det bedste linjefald, men koster aldrig et trin på skalaen.
- Signaturen er et grid, så datoerne brydes under navnet og aldrig under stregen.
- Printene når skærmkanten.
- **Timeren** viser H:MM og skifter én gang i minuttet. Sekunder vises kun i sidste minut, så der ikke tikker noget på en stille side. Under reduced motion er der ingen animation.

### v2-sættet: 69 citater, 53 personer

Pipelinen kører i ét trin, også for fremtidige billeder:

```
tools/sync-quotes.sh → measure-faces.swift (Apple Vision) → quote-art.mjs → quotes.json
```

Alle 69 har en ansigtsboks. Små filer (Sun Tzu 276×300) forstørres højst `MAX_UP·1.25` og svæver med fjer foroven og forneden.

Geometrisk sweep af alle 69 ved 1440×900, 1280×720, 1024×768, 390×844 og 360×740:

- Nul af hver slags: overflow, kollisioner, tekst over ansigtet, søm, skrald i krediteringen, vandret scroll.
- Krediteringen fylder 1 linje på desktop (1024: alle undtagen A30, som har 2) og højst 2 på telefon.

Kendte grænsetilfælde ved 360×740:

- C13 har et enligt ord ved bunden af skalaen (29 px).
- B12 er 9 verslinjer ved 29 px.

Kontaktark: `extension/dev/quote-concepts/final-shots/v2-69-*.jpg`. De gamle ark for 100 citater ligger i `v1-100-citater/`.

### Et nyt citat (ejerens ønske)

- Dobbeltklik, dobbelttryk, → eller mellemrum viser næste citat fra den samme shuffle-bag (`lib/quote-next.js`). Workerens `nextQuote` er uændret. Hvis bag'en giver citatet, der allerede står på skærmen (en anden fane har trukket imellem), trækkes der igen.
- Overgangen: det gamle citat fader ud på 180 ms, og det nye kommer ind med den almindelige entré (≤ 600 ms). Under reduced motion skiftes der med det samme. Timeren og tab-titlen røres ikke.
- Siden viser ingen hint.
- Et dobbeltklik markerer ikke tekst. Links virker som før.
- Én ændring pr. gestus (tre- og firedobbeltklik giver kun én), sikret af en gate med 650 ms ro.

Test:

- `test/quote-next.test.mjs`, kørt mod den rigtige `pickNext`.
- Chrome-tjekket er afsnit 6 i `test/ui/drive-blocked.mjs`.

### Status

- Enhedstests: 150 grønne.
- `test/blocked-in-chrome.sh` er ikke kørt. Den nægter at starte, mens den rigtige lås er aktiv (exit 3, låst til 10:00Z), og skal køres, når låsen er slut.

## Runde 3: det stablede layout (QA R2-M1)

Det stablede layout dækker telefon og split screen, alt der ikke er desktop: < 900 px eller format < 1,1.

### Portrætbåndet

- **Båndet reserveres først.** `stackedBand()` i `lib/quote-frame.js` reserverer et billedbånd øverst, og citatet sættes i pladsen under det.
  - Båndet holder mindst et ansigt på `minFacePhone` (11 % af højden eller 24 % af bredden). Det er aldrig under 34 % af højden.
  - Det større bånd (ansigtet i et print, der fylder bredden, højst halv højde) bruges kun, hvis det koster citatet højst ét trin på skalaen.
- **Printet er væk før citatet.** `framePhone` lader printet opløses fuldstændigt `TEXT_CLEAR` = 4 px over citatets boks. Opløsningen begynder ved hagen og er mindst 56–90 px lang.
- **Ansigtet beskæres aldrig.** Hele ansigtsboksen ligger under timeren (`phoneTopSafe`). Kan ansigtet ikke være der i fuld bredde, printes det mindre og centreret. Siderne og toppen opløses så over 20 % af bredden.
- **Kolonnen i split screen** er 5,5 % fra kanten (20–48 px). Under 480 px er den 20 px.

### Linjefald

Giver en størrelse en stub-linje eller et enligt ord, prøves et 6–18 % smallere mål på samme størrelse, før den gives op. Det fjernede A31 og B01.

Tilbage er A30 ("for the / remaining quarter.") og C13 ved 29 px på 360×740. Begge sidder i linjeloftet eller bunden af skalaen.

### Målt på alle 69 ved 7 størrelser

Størrelserne er 1440×900, 1280×720, 1024×768, 900×700, 720×900, 390×844 og 360×740. Målingen er `dev/quote-concepts/qa-sweep.js`.

- Nul af hver af disse: overflow, kollision, tekst over ansigtet, print under citatet, ansigt over timeren og beskåret ansigt.
- Estimeret kontrast på hver linje (det fremkaldte canvas × printets maske, uden mørkningen fra lyset): mindst 17,3:1, altså ren sidefarve.
- Rigtige pixels under første linje: A20 ved 390×844 og A30 ved 720×900 måler 17,3:1. Før var de 2,9:1 og 2,1:1.
- Typestørrelser ved 720×900: 42–92 px, median 65.

### Nyt i Chrome-driveren

- To nye størrelser: 900×700 og 720×900.
- To nye pixeltjek i det stablede layout:
  - alt fra 4 px over citatet og ned er `#050505`;
  - ansigtet starter under timeren.

### Kontaktark

`final-shots/v2-69-*.jpg`, nu også ved 720×900.
