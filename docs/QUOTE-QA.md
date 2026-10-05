# Quote page: independent visual QA (extension 1.3.0)

Reviewer: independent QA agent, 2026-10-05. I did not design or build the page, and I changed no project file. The only files I wrote are this report and the screenshots in `extension/dev/quote-concepts/qa-shots/`.

**Verdict: CHANGES REQUIRED.** The desktop composition at 1440×900 and 1280×720 delivers the brief: big Didot type, a dark print and one calm block. Four defects still break it elsewhere:
- a visible seam through the quote on most phone renders;
- raw Wikimedia provenance junk in the credit line;
- Piet Hein's verse mangled on phone;
- the quote shrinking to a caption in 900–1150 px desktop windows.

## How I tested

**Constraint.** A real LockedIn session was running (schedule until 12:00, `GET :919/v1/status` → `active: true`). The daemon lists Chrome for Testing as blocked and was killing Chrome processes started with `--remote-debugging-port`. I therefore did not run `test/blocked-in-chrome.sh` or any CDP driver. I worked only in the Claude desktop app's built-in browser pane against `http://127.0.0.1:8765/blocked.html?mock=1`.

**Real use.** I resized the pane to 1440×900, 1280×720, 1024×768, 390×844 and 360×740 (device pixel ratio 2), plus 720×900 (Mac split screen) as an extra. Across these sizes I took about 70 screenshots and viewed **35 distinct quotes** by eye:
- shortest: a21, a09, q097;
- longest: x03 (38 words), q067, q055, e19, e24;
- black and white: q079, x03, q041, q066;
- low resolution: a12, e13, x18, x20;
- busts: q003, q064, q087;
- paintings: q069, q067, q020;
- drawings: q007, q013, q092;
- dark skin: a12, a08, a03, a15, a10, x07, e10;
- landscape source: q094, a06;
- translated: q003, q041, q092, x20, e13, q087, q013, q036.

I also reloaded without `q` (the shuffle bag) and pressed Tab through the page. I checked the session-over state both live (`mins=0.05`) and pre-set (`ended=1`).

**Measurement on all 100 quotes.** Same-origin iframes at exact CSS viewports inside the pane: 100 quotes × 1440×900, 1280×720, 1024×768, 390×844 and 360×740, plus 1440×780 and 1280×680 (a maximised MacBook window). For each render I recorded:
- the rectangles of every line, the name, dates, credit, timer, face box and zone;
- the chosen size and line count;
- line, credit and signature wrapping;
- overflow and scroll.

I ran a sweep of 1180×760, 1100×720 and 1024×640 to find where the layout degrades.

**Contrast and brightness** were measured on real pixels: text hidden with `visibility: hidden`, a screenshot taken, and WCAG luminance computed under each text box.

**Entrance animation.** I restarted it and froze `document.getAnimations()` at 60, 180, 320 and 450 ms.

**Reduced motion.** It could not be emulated in the pane (no media emulation without CDP). I verified it statically: every `animation`/`transition` declaration in `ui/blocked.css` sits inside `@media (prefers-reduced-motion: no-preference)` (parsed). `blocked.js` gates the 700 ms `settled` timer and the session-over crossfade on `matchMedia`.

All screenshot paths below are relative to `/Users/sebastianpirad/locked-in/extension/dev/quote-concepts/qa-shots/`. Desktop shots are the pane's 800 px-wide captures; phone shots are full 2× resolution.

---

## Must-fix

### M1. Phone: a hard horizontal seam cuts through the quote (63/100 at 390×844, 73/100 at 360×740)

- **Where:**
  - 390×844: q089 Maria Mitchell, the seam running between "slowly if you only" and "get";
  - 360×740: q036 Goethe, between "must also apply;" and "it is not enough";
  - 390×844: e13 Kamprad, through "10-minute units and";
  - in all, 63 of 100 quotes at 390×844 and 73 of 100 at 360×740.
- **Screenshots:**
  - `01-q089-390x844-zone-seam-through-quote.png`;
  - `01b-q089-390x844-seam-levels-boosted.png` (the same pixels with levels stretched 0–24 → 0–255, which makes the rectangle obvious);
  - `02b-q036-360x740-seam-levels-boosted.png`;
  - `17b-e13-390x844-seam-levels-boosted.png`.
- **Problem:**
  - On phone, `.zone` runs down to the print's bottom edge: `framePhone` returns `zone.height = top + h`. The print has already faded to transparent at `fade.to`, often 200–300 px higher; for q089 the print ends at 362 px but the zone at 632 px.
  - The `.light` overlay (black at 0.3–0.94 alpha) still covers the whole zone, so the zone paints **#010101** while the page is **#050505**.
  - The zone has no mask on phone, because the masks exist only for `data-side="left|right"`. It therefore ends in a ruler-straight edge, measured as a step from 1 to 5 on every channel at y = 632 CSS px. That edge passes behind the glyphs of a quote line.
  - It is subtle at full brightness but plainly visible on OLED phones and in a dark room. It is a straight line through the hero text, the one place that must be clean.
- **Fix (either one is enough; both are better):**
  1. In `framePhone`, return `zone.height = Math.min(vh, top + fade.to)`, so the zone ends where the print is already fully transparent.
  2. In `blocked.css`, make the light overlay unable to go darker than the page: write every `rgba(0, 0, 0, a)` in `.light` and `[data-side="top"] .light` as `rgba(5, 5, 5, a)` (= `--black`). The step then cannot exist on any layout.

  Add a check to `test/blocked-in-chrome.sh`: every pixel row outside the print has the page colour.

### M2. The credit line prints raw Commons provenance, including wiki markup, filenames and a URL

- **Where (1440×900, also every other size):**
  - q041 Pascal: `Billede: unknown; a copy of the painting of François II Quesnel, which was made for Gérard Edelinck en 1691[réf. nécessaire]., Public domain ↗`.
  - q066 Darwin: `Billede: Charles_Darwin_seated.jpg: Henry Maull (1829–1914) and John Fox (1832–1907) (Maull & Fox) [3] derivative work: Beao`.
  - e10 Winfrey: `Billede: aphrodite-in-nyc (Flickr user, https://www.flickr.com/photos/aphrodite-in-nyc)`.
  - q064 Aristotle: `Billede: Photo: Jastrow (Marie-Lan Nguyen), 2006, public domain; bust: Roman copy after Lysippos, Public domain ↗`.
- **Screenshots:**
  - `05-q041-1440x900-credit-junk-ref-necessaire.png`;
  - `06-q066-1440x900-credit-filename-footnote.png`;
  - `07-e10-1440x900-credit-raw-url.png`;
  - `15-q092-1440x900-cream-slab-provenance.png`;
  - `17-e13-390x844-seam-4line-credit-slide-text.png`;
  - `19-e19-360x740-4line-credit.png`.
- **Problem:**
  - Of the 100 `image.creator` strings, 57 carry parentheticals, restorers, archive numbers or notes. Three things in this text are actual garbage:
    - a French "citation needed" tag;
    - a footnote "[3]";
    - a filename and a raw URL.
  - Further defects:
    - English "Unknown author/photographer", lower-case "unknown";
    - "Billede: Photo:";
    - "public domain … Public domain".
  - This is exactly the "unnecessary text" the brief forbids. It makes the credit 2 lines on 25 % (1440×900) to 40 % (1280×720) of desktop pages, and 3–4 lines on 23 % (390×844) to 35 % (360×740) of phone pages. E19, for example, takes 4 lines at 360×740.
  - The builder left this to the owner. As QA I cannot pass a page that prints "[réf. nécessaire]" under a quote.
- **Fix:**
  - Add a display field `image.credit` to `tools/quote-art.json` (merged by `quote-art.mjs`). It holds the author name only, at most about 40 characters, in Danish where it is generic:
    - "Ukendt fotograf";
    - "Henry Maull & John Fox";
    - "Jastrow";
    - "Bill Sauro / NYWT&S";
    - "aphrodite-in-nyc".
  - `creditModel` shows `credit` and puts the full creator string only in the link's `title`. Name + licence + licence link + source link is complete TASL attribution for CC BY and BY-SA.
  - As a guard, `creditModel` should refuse any creator containing `[`, `http`, `.jpg` or `_`. The test should assert this for all 100.

  **Acceptance:** desktop credit is 1 line on ≥ 95 % at 1440×900 and 1280×720; phone credit is ≤ 2 lines on 100 %.

### M3. Piet Hein's grook (q094) loses its verse lines on phone and at 1024×768

- **Where:**
  - 390×844: 52 px, broken into 7 lines ("“Problems / worthy / of attack / prove their / worth / by hitting / back.”");
  - 360×740: 6 lines;
  - 1024×768: 58 px, 7 lines;
  - 1440 and 1280 are fine (4 lines).
- **Screenshots:** `03-q094-390x844-verse-broken.png`, `04-q094-360x740-verse-broken-zone-edge.png`; compare `46-q094-1440x900-verse-ok.png`.
- **Problem:**
  - `pickSize` accepts a size at which the verse lines wrap. The result is two one-word lines and "back.”" stranded, on the one Danish author in the set, whose form *is* the four lines.
  - The no-fragments rule exempts verse, so nothing catches it.
- **Fix:**
  - In `measureAt`, for `ts.verse`, set `fits = fits && renderedLines === ts.lines.length`, so the size steps down. At 390×844 the verse fits on 4 lines at about 38–42 px.
  - If you prefer to keep the size, give run-over lines a hanging indent (`padding-left: 1em; text-indent: -1em` per verse line) so the verse structure stays readable. Stepping down is better.

### M4. Desktop windows 900–1150 px wide: the quote becomes a caption

- **Where:**
  - 1024×768: every quote's column is 280–433 px wide; size median **42 px** (1440×900: 65); **57/100 at ≤ 42 px**. Worst: a03 Muhammad Ali at 31 px in a 280 px column, q087 Caesar at 288 px, a22 at 301 px.
  - Sweep: 1180×760 is still fine (median 58 px, 4 quotes ≤ 42 px). 1100×720 degrades to median 52 px with 26 ≤ 42 px, min 29 px. At 1024×640 the median is 47 px with 39 quotes ≤ 42 px.
- **Screenshots:** `08-a03-1024x768-quote-31px-caption.png` (dates also drop under the rule), `09-x03-1024x768-small-type-source-cut.png`.
- **Problem:**
  - `isDesktop` switches to the side-by-side layout at 900 px.
  - The portrait keeps 46 % of the width, and the face margin pushes the column further in. Close-ups (Ali, Caesar, Billie Jean King, Nansen) leave a 280–320 px column.
  - The face becomes the hero and the words a caption: the inverse of "Selve præsentationen af citaterne skal være markant federe".
  - A non-maximised Chrome window or an external-display tile easily falls in this range.
- **Fix:**
  - Scale the zone with width: `ZONE = clamp(0.36, 0.36 + (vw − 1000) × 0.0002, 0.46)`.
  - Shrink the face margin below 1200 px (`TEXT_GAP` 24 px; half-face → 0.35 face).
  - Guarantee `colR − colL ≥ max(440, 0.48 vw)`, letting the print slide outward or crop rather than squeezing the text.
  - Alternatively, use the stacked layout (`data-side="top"`) when `vw < 1150 && vw / vh < 1.45`.
  - **Acceptance at 1024×768:** median ≥ 52 px, no quote under 42 px, no column under 440 px.

---

## Should-fix

### S1. Source titles cut mid-phrase and mid-word with "…"

- **Where (count per viewport):** 13 at 1440×900, 15 at 1280×720, 11 at 1024×768, 21 at 390×844, 23 at 360×740. Examples:
  - x16: "Apollo 11 air-to-gr…, 1969" (1280×720);
  - q080: "‘West India…, 1857" (an opening quote mark that never closes);
  - x19: "‘Adventure’, St…";
  - a11: "Remarks after the…";
  - x04: "Scott’s Last…";
  - a03: "Bernie Lincicome, Fort…";
  - q087: "Pontic triumph inscription…, 47–46 f.Kr.".
- **Screenshots:** `13-x16-1280x720-source-cut-midword.png`, `09-x03-1024x768-small-type-source-cut.png`.
- **Problem:** `autoShort` cuts at a word only when the last space falls past 50 % of the limit; at the 20-character step it cuts mid-word. The fragments look like errors and add noise.
- **Fix:**
  - Use the curated `source.short` or nothing. Fill `source.short` (≤ 32 characters) for the 48 entries that lack it.
  - In `fitCredits`, go straight from the full or short source to **dropping** the source: no 20-character step, never a fragment.
  - Also turn the straight quotes in the data into curly ones: "'Problems', in Grooks", "'The Doctrine of the Sword".

### S2. Rag: stranded single words and hyphen breaks, including on the main desktop size

- **Where:**
  - a08 Owens, at 1440×900 and 1280×720: "awful lot of / **determination,** / dedication, **self-** / discipline and effort.”" The same appears at 1024×768, 390×844 and 360×740.
  - q089, at 390×844 and 360×740: "slowly if you only / **get** / on thoroughly.”".
  - e20 Walton, at 1440×900 and 1280×720: "the conventional / **wisdom.”**". Also q042 "simplicity!”" and e04 "incapacitated.”", plus e13 "activity.”" at 1024×768 and on phone.
  - At 1024×768 and 390×844: a07 "**capable**" alone and "self- / satisfaction"; x02 "**much-praised**" alone; x03 "**Providence,**" alone; q099 "ninety- / nine".
- **Screenshots:** `11-a08-1440x900-rag-determination-self.png`, `10-a08-1024x768-hyphen-break.png`, `16-q089-390x844-orphan-get.png`, `12-e20-1440x900-widow-wisdom-credit-widow.png`.
- **Problem:**
  - The last-word binding only applies when the last two words total ≤ 18 characters ("conventional wisdom" is 19).
  - `self-`/`ninety-` are allowed breaks.
  - `okLines` checks only the average words per line, so a single one-word line passes.
- **Fix:**
  1. Bind the last two words whenever the last word is ≤ 12 characters and the pair fits the measure.
  2. Never break after a hyphen in a compound of ≤ 16 characters (wrap it in the same `nowrap` token).
  3. In `measureAt`, reject a size where any non-final line of a quote of 8 or more words has one word, and try greedy, then the next step.

### S3. The signature falls apart on phone

- **Where:**
  - 360×740: the dates wrap under the rule in **26/100**; q036 Goethe shows the rule alone on a line, "JOHANN WOLFGANG VON / GOETHE" over two lines, then the dates.
  - 390×844: 7 quotes wrap; 1024×768: 7 (q087, q014, q036, a03, x02, x05, x06).
- **Screenshots:** `02-q036-360x740-seam-signature-breaks.png`, `08-a03-1024x768-quote-31px-caption.png`, `33-q067-360x740.png`.
- **Problem:** `.who` is a wrapping flex row, so the dates land at the rule's x, not the name's, and the rule can be orphaned. The quote, rule and name are meant to read as one block.
- **Fix:** set `.who` as a grid: `grid-template-columns: 32px 1fr; column-gap: 14px`. The rule goes in column 1, aligned to the first line. The name and dates go in column 2, the dates on their own row when they do not fit. Reduce the name's letter-spacing to 0.16 em below 400 px width so "Johann Wolfgang von Goethe" fits on one line at 360.

### S4. Desktop: 45/100 prints stop 6–84 px short of the outer screen edge

- **Where (1440×900):**
  - e26 84 px; e03 and e04 62 px; q092 56 px; a04 and a05 54 px; a09 51 px; e22 48 px.
  - Also q051, q019, a08, a21 and x02 on the left side.
- **Screenshots:** `47-e04-1440x900.png` (dark band along the right edge), `15-q092-1440x900-cream-slab-provenance.png`.
- **Problem:** the print bleeds the full height (top = 0, bottom = 900) but slides only "60 % of the way" to the outer edge, then fades by `er` ≈ 75–110 px. A full-bleed image with a dark gutter on one side reads as misaligned rather than as floating in darkness.
- **Fix:** in `frameDesktop`, when the print covers the full height (`h >= vh`), slide it 100 % to the outer edge; the face moves at most about 6 % outward. If the face would leave the zone's middle, scale up to cover `zoneW`; none of these cases is near the 1.75 cap. Keep floating only for prints that are also shorter than the window.

### S5. Split screen and portrait windows (720×900): type capped at phone size under a giant face

- **Where:** 720×900, a21 "Champions adjust." on one line of about 58 px under a face filling two thirds of the screen; q079 is fine.
- **Screenshots:** `14-a21-720x900-splitscreen-quote-small.png`, `36-q079-720x900-splitscreen.png`.
- **Problem:** the stacked-layout ceiling is `min(64px, 7.6vh)` regardless of width. The shortest, punchiest quotes, the ones that should be the boldest, become captions in any portrait window wider than a phone.
- **Fix:** set the stacked ceiling to `min(128px, 15vh, 0.17 × vw)`. That keeps about 64 px at 390 px and gives up to about 122 px at 720 px. Keep the portrait at 34 % or more of the height and give the quote the rest.

### S6. Distracting and duplicate links are focusable during the lock

- **Where:** every quote. The first Tab stop on the lock page is the source title, which opens nasa.gov, archive.org and similar in a new tab (x16 at 1440×900). For public-domain images, "Public domain ↗" and "Wikimedia Commons ↗" are two focus stops to the **same** Commons page (`File:Neil_Armstrong_pose.jpg`).
- **Screenshot:** `20-x16-1440x900-tab-focus-source-link.png`.
- **Problem:**
  - The lock page offers a reading rabbit hole with the first keypress.
  - Three focus stops, two of them identical, for a line that is meant to be quiet.
- **Fix:**
  - Render the source title as plain text.
  - For PD/PD-US images, render "Public domain" as plain text, since there is no licence deed to link.
  - Keep the CC licence link (CC only) and one Commons link. During the lock, at most 2 focus stops remain; after the session, the "Fortsæt til …" link stays first.

### S7. The seconds digit ticks forever

- **Where:** every page in the lock state. "01:12:59" changes every second, and so does the tab title.
- **Problem:** the spec's motion rule says "after 600 ms the page is perfectly still", and ambient drift was dropped for exactly this reason. A changing seconds field is the one motion left in peripheral vision, 60 times a minute.
- **Fix:**
  - Show `1:12` (H:MM, tabular), updated on the minute, with seconds only in the last 60 seconds.
  - The tab title follows the same format.
  - Keep the tooltip "Låst til HH:MM".

### S8. Under reduced motion the timer can paint at the wrong place, then jump about 780 px

- **Where:** a21, q056 and every left-flipped portrait (yaw > 0.35, roughly 1 in 5) at desktop sizes.
- **Evidence (measured in iframes, polling between tasks):**
  - `#remain` is un-hidden at the CSS defaults `(64, 40)` 5–10 ms before `layout()` moves it to `(846, 50)` (a21) or `(742, 50)` (q056); for right-side portraits it is `(72, 50)`.
  - In the mock that is under one frame. In the extension the gap also includes the `nextQuote` worker round trip and the `quotes.json` fetch (`cache: 'no-store'`).
  - With motion, the 200 ms fade delay hides it. Under `prefers-reduced-motion` there is no delay, so any painted frame shows the timer on the wrong side.
- **Fix:** do not un-hide `#remain` in `main()`. Un-hide it in `renderQuote()` after `layout()`, or add `.slot { visibility: hidden } .is-set .slot { visibility: visible }`. If the quotes fail to load, show it unconditionally.

### S9. Low-resolution sources show at phone size (already on the open list; confirming it matters)

- **Where (390×844):**
  - x20 Amundsen: a mushy, upscaled fur hood with a tiny profile looking out of frame;
  - e13 Kamprad: soft, with projected slide text behind his head competing with the quote;
  - x18 Peck: blotchy grain.
- **Screenshots:** `18-x20-390x844-lowres-mush.png`, `17-e13-390x844-seam-4line-credit-slide-text.png`, `40-x18-390x844-lowres.png`.
- **Fix:** re-source a12, e13, e14, e25, x18, x20 and a01 at ≥ 1200 px, as already listed. For e13, pick a frame without slide text.

---

## Nice to have

### N1. q092 Kierkegaard is the brightest page

- **Where:** 1440×900, `15-q092-1440x900-cream-slab-provenance.png`.
- **Problem:** the sketch paper puts 6.6 % of the window above L 0.35 (p99 0.48). The p90 rule passes overall, but this one reads as a cream slab beside the words.
- **Fix:** give sketches on toned paper a `tone: "sketch"` with a paper ceiling of about 0.30.

### N2. e20 Walton: the brightest element in the print is a white "WAL-MART" cap logo

- **Where:** 1440×900, `12-e20-1440x900-widow-wisdom-credit-widow.png`.
- **Problem:** the logo pulls the eye and adds a brand to a focus page.
- **Fix:** compress highlights locally outside the face box, or re-source the image.

### N3. q013 Leonardo on phone: the profile sits against the left edge and looks out of frame

- **Where:** 390×844, `37-q013-390x844-profile-at-edge.png`.
- **Problem:** the profile has no look room on phone.
- **Fix:** apply look room in `framePhone` as on desktop: shift the face away from its gaze by `min(0.12 vw, …)` when |yaw| > 0.35.

### N4. Desktop credit widows and left-side credit width

- **Where:** e20 at 1440×900 ends its credit with "Wikimedia Commons ↗" alone on line 2; a21 at 1440×900 takes 2 lines because left-side layouts limit the credit to the 522 px text column.
- **Problem:** right-side layouts extend the credit to 54 % of the width; left-side layouts do not.
- **Fix:** mirror the right-side extension for left-side layouts, bind "· Wikimedia Commons ↗" with a no-break space, and use `text-wrap: balance` on 2-line credits. Most of this disappears with M2.

### N5. Off-scale sizes after the drift step-down

- **Where:** a21 at 1440×900 is set at 103 px.
- **Problem:** the 1 px drift loop leaves sizes that are not on the scale.
- **Fix:** step down to the next scale value, or reduce letter-spacing by 0.005 em, instead of 1 px.

---

## Verified and passing

- **Fit.** All 700 measured renders (100 quotes × 7 viewports) have no overflow, no horizontal or vertical scroll and no element outside the window. The timer, quote and credit never overlap. No quote, name or date is over the face box (+15 %).
- **Sizes (min / median / max):**

  | Viewport | Sizes |
  |---|---|
  | 1440×900 | 47 / 65 / 128 px |
  | 1440×780 | 47 / 73 / 114 px |
  | 1280×720 | 47 / 58 / 104 px |
  | 1280×680 | 47 / 58 / 92 px |
  | 390×844 | 31 / 38 / 58 px |
  | 360×740 | 29 / 34 / 52 px |

  The maximised-MacBook case is strong.
- **Contrast on real pixels.** Text never sits on the print on desktop: the only incursions are hanging “ marks, 1–12 px into the transparent feather. On phone the first line sits on ≥ 0.9 black. Measured ratios:
  - quote: 16.2–17.4 : 1;
  - name: 17.3 : 1;
  - timer: 11.5–11.9 : 1;
  - credit: 6.4–6.5 : 1, including against the brightest pixel;
  - the session-over link over the phone strip: 11.3 : 1 against its worst pixel.
- **Entrance.** There are 13 animations: 1 transition and 12 CSS animations. All end by 600 ms: the print transition at 600, the slot fade at 600, the line rises at 460–600 with a 23 ms stagger, the rule at 560, the name, dates and credit at 600. Nothing loops. The frames are calm (`23-…060ms` to `26-…450ms`, final `27-q079-1440x900-final.png`). There is no layout shift from the image: `image.width/height` match the files for all 100, so `layout({frameOnly})` never moves the text.
- **Reduced motion.** It is clean by construction (see the method). The only issue is S8.
- **Session over.** The timer slot crossfades to "Fokussessionen er slut" and "Fortsæt til instagram.com →". The title becomes "LockedIn" and the print takes `brightness(1.12)`. The link is the first Tab stop with a 2 px accent ring. The host is shown only in this state. Screenshots: `21-…`, `22-…`, `55-…`, `56-…`.
- **Imagery.** The darkroom unifies the series well:
  - dark skin keeps its tone (Jordan, Owens, Ali, Rudolph, Biles, Henson, Winfrey);
  - busts stay marble (q003, q064, q087);
  - paintings and drawings print well (q069, q007, q013).
- **Typography.** Didot roman, never italic. The yellow “ hangs on desktop and sits inline on phone; the line limits hold.

---

## Re-check list after fixes

1. Phone, all 100 at 390×844 and 360×740: every pixel outside the print equals `--black` (M1).
2. No credit contains `[`, `http`, `.jpg`, `_` or "Unknown". Desktop credit is 1 line on ≥ 95 %; phone credit is ≤ 2 lines (M2).
3. q094 keeps 4 lines at every viewport (M3).
4. At 1024×768: median ≥ 52 px, minimum ≥ 42 px, column ≥ 440 px (M4).
5. No "…" inside a source, no one-word non-final lines, no break after a hyphen in a short compound. Dates align with the name (S1–S3).

**CHANGES REQUIRED**

---

# Runde 2 (re-check, 2026-10-05)

**Verdict: CHANGES REQUIRED.** Nearly every round-1 finding is fixed, and the double-click / double-tap feature works cleanly. One new blocker remains: in the stacked layout (phone and portrait windows) the quote's first lines now print **on top of the portrait**, at 2–5 : 1 contrast.

## How I re-tested

As in round 1, only the built-in browser pane was used, because a real lock is active and Chrome for Testing is closed by the daemon. No project file was edited.

- **The new set:** 69 quotes, measured in same-origin iframes at 1440×900, 1280×720, 1024×768, 390×844, 360×740, 720×900 and 1440×780 (483 renders).
- **By eye:** 44 distinct quotes in screenshots, plus 40 distinct quotes reached by actually pressing → in one tab (40 swaps, 40 different quotes, no repeat).
- **Interaction:** double-click, triple-click, double-click on the credit link, drag selection, →, Space, Space on a focused link, and a triple → press. Touch double-tap, triple-tap, quadruple-tap, tap-tap far apart and taps on the link were tested with synthesised `pointerType: "touch"` events in the 375×812 mobile preset. The pane's own clicks arrive as mouse events.
- **Contrast:** measured on real pixels with the text hidden. I also made an in-page estimate for all 69 quotes: the developed print canvas × the print's fade mask, ignoring the darkening overlay. That estimate is conservative; the real pixels came out 1.3–1.6× higher.

Screenshots are in `extension/dev/quote-concepts/qa-shots/r2-*.png`.

## Round-1 findings

| # | Finding | Status | Evidence |
|---|---|---|---|
| M1 | Phone zone seam | **FIXED** | The overlay is now `rgba(5,5,5,…)` and the zone ends after the fade. The rows below the print read exactly #050505 (A20, 390×844). |
| M2 | Credit junk | **FIXED** | 0 of 483 renders contain `[`, `http`, `.jpg`, `_` or "Unknown". The creator is a short name ("Ukendt kunstner", "Jastrow"). Desktop credits are 1 line on 69/69 at 1440×900, 1280×720 and 1440×780, and 68/69 at 1024×768 (A30 takes 2). Phone credits are exactly 2 lines on 69/69 at 390×844 and 360×740. |
| M3 | Verse broken | **FIXED (in a different form)** | q094 is no longer in the set. Shakespeare B12/B13 now keep their verse lines, with run-overs as hanging indents (`r2-10`, `r2-09`). |
| M4 | 900–1150 px desktop | **FIXED** | At 1024×768: 42–73 px, median 58, column 449–542 px (was 31–73, median 42, column 280–433). Ali is now about 47 px in a ~500 px column (`r2-12`). |
| S1 | Source cut mid-word | **FIXED** | No "…" fragment in any of the 483 renders; the source is shown whole or dropped. |
| S2 | Stranded words and hyphen breaks | **MOSTLY FIXED** | No hyphen breaks anywhere; one-word lines only in verse run-overs. Two cases remain: C13 "everything," alone at 360×740 (`r2-08`, known), and A30 has a 2-word stub "for the / remaining quarter." at 1024×768 and 720×900 (`r2-11`, `r2-05`). |
| S3 | Signature | **FIXED** | It is a grid now. When the dates wrap they align to the name (23/69 at 360×740, 5/69 at 390×844), the rule is never orphaned, and no name wraps. |
| S4 | Print short of the outer edge on desktop | **FIXED** | 0/69 at every desktop size. |
| S5 | Split screen 720×900 | **FIXED for size** | 47–92 px, median 73. This causes the regression R2-M1 below. |
| S6 | Distracting links | **FIXED** | The source is plain text and PD licences are plain text. There are ≤ 2 focus stops (CC licence + Commons), 1 for public-domain images. |
| S7 | Ticking seconds | **FIXED** | The timer shows "1:13" (H:MM) and changes once a minute, with seconds only in the last minute. |
| S8 | Timer flash before layout | **FIXED** | `#remain` is still un-hidden before layout, but `.slot` is `visibility: hidden` until `.is-set`, measured in 3 iframes. |
| S9 | Low resolution | **OPEN, data** | Sun Tzu (276×300) floats as a soft rectangle; it reads acceptably as a drawing (`r2-14`, `r2-22`). Jordan a02/a12 is still 398×568. |
| N1–N2 | Kierkegaard, Walton | n/a | Removed from the set. |
| N5 | Off-scale sizes | **FIXED** | Every size is a scale step. |

## The new feature: another quote

It **passes**:
- double-click anywhere changes the quote once (`r2-19` → `r2-20`);
- triple-click changes it once and selects nothing;
- a double-click on "Wikimedia Commons ↗" does not change the quote (the link itself tries to open, which is normal);
- drag selection of the quote still works ("He who is not / courageous enough") and does not change the quote (`r2-17`);
- → and Space each change the quote once;
- a triple → press changes it once (the 650 ms gate);
- Tab focuses the licence link first, and Space on it does **not** change the quote (`r2-18`);
- touch: a single tap does nothing; double-tap, triple-tap and quadruple-tap each give 1 change; two taps 150 px apart give 0; a double-tap on the link gives 0; a dblclick followed by a double-tap gives 1;
- `body { touch-action: manipulation }` is set;
- the countdown is never reset ("1:13" before and after, then "1:12" as real time passes), and the timer slot does not move;
- no hint text on the page.

## Must-fix (new)

### R2-M1. Stacked layout: the first line(s) of the quote sit on the portrait

- **Where:**
  - 390×844: A20 Roosevelt, line 1 over the white shirt (`r2-01`, text hidden `r2-01b`).
  - 360×740:
    - A18 Booker T. Washington, lines 1–2 over the collar (`r2-02`/`r2-02b`);
    - B02 Aristotle, line 1 over the bust's chest (`r2-03`/`r2-03b`);
    - C10 Gates, line 1 over the tie (`r2-04`/`r2-04b`);
    - A25 Mandela, tie behind "learned" (`r2-07`).
  - 720×900 (split screen): A30 Napoleon over the white waistcoat (`r2-05`/`r2-05b`), B20 Shackleton over the collar (`r2-06`).
- **Measured on real pixels (quote paper #f2ece1, p95 / worst pixel); target ≥ 7 : 1:**

  | Quote | Viewport | Line | p95 | Worst pixel |
  |---|---|---|---|---|
  | A20 | 390×844 | 1 | 2.93 | 1.63 |
  | A18 | 360×740 | 1 | 4.05 | 1.66 |
  | A18 | 360×740 | 2 | 4.72 | — |
  | B02 | 360×740 | 1 | 2.78 | — |
  | C10 | 360×740 | 1 | 3.64 | — |
  | A30 | 720×900 | 1 | 2.12 | 1.67 |
  | A30 | 720×900 | 2 | 3.18 | — |

- **Extent (conservative estimate, all 69 quotes; the estimate came within a factor of about 1.5 of every pixel measurement above):**
  - 390×844: 6 below 7 : 1 (A18, A20, B17, C05, C07, a04).
  - 360×740: 14 below 7 : 1 (A03, A07, A18, A21, A25, A30, B02, B07, C03, C05, C07, C10, E04, a02).
  - 720×900: **38 of 69** below 7 : 1, many under 2 : 1.
  - Desktop is not affected: no text box enters the zone at any desktop size.
- **Problem:**
  - In `framePhone`, `fadeFrom = max(fy + 0.9·fh, textTop − 0.16·vh) − top` and `fadeTo ≥ textTop + firstLine/2 − top`. When the chin sits low, the print is still fully opaque at the first line (A20: the fade starts at y = 323, the first line at y = 318). White collars and shirts sit right under the chin, so they land behind the words.
  - At 720×900 the larger ceiling (the S5 fix) makes the quote taller. The print is then pushed up until **5 faces are cut at the forehead or eyes** (A30, C03, C05, a02, a03), and 14/69 faces start above the timer strip's bottom edge (`r2-05`).
- **Fix:**
  - Make the print fully transparent before the first line: `fadeTo ≤ textTop − 4 − top` and `fadeFrom ≤ fadeTo − 80`.
  - If the chin plus collar does not fit above that, scale the print down or move it up within `topSafe`, rather than fade it under the text.
  - When even that fails (720×900), step the quote down one size instead of cropping the face.
  - Add the round-1 pixel audit for the stacked layout at 360×740, 390×844 and 720×900 to `test/blocked-in-chrome.sh`: quote ≥ 7 : 1 at p95, and face top ≥ strip bottom.

## Should-fix / nice (new, minor)

- **N6.** Branding and lettering in the prints compete with the quote:
  - B22 Washington stands in front of a legible "tiff" press wall (`r2-16`);
  - E02 Messi shows a club crest;
  - B07 Leonardo carries the inscription "LEONARDO VINCI" next to the name label (`r2-13`).

  Crop or re-source.
- **N7.** C10 Gates at 360×740: the print stops about 50 px short of the right screen edge, leaving a bright wall with a soft vertical edge (`r2-04b`). This is the phone counterpart of S4: anchor narrow prints to both edges or centre them.
- **N8.** C13 "everything," alone at 360×740 and A30 "for the" stub (known/minor).
- **N9.** B12/B13 verse at 360×740 runs to 8–9 lines at 29 px. The run-overs keep it readable; it is acceptable.

## Re-check list for round 3

1. Stacked layout at 360×740, 390×844 and 720×900, all 69 quotes: every quote line ≥ 7 : 1 at p95 on real pixels.
2. At 720×900: no face top above the timer strip and no face cropped.
3. A spot-check that the four interaction rules still hold after the fix: one change per gesture, no countdown reset, links excluded, selection intact.

**CHANGES REQUIRED**

---

# Runde 3 (re-check of R2-M1, 2026-10-05)

**Verdict: APPROVED.** R2-M1 is fixed. No regression was found at any size.

Two small items remain, and they do not block approval: the A30 stub "for the / remaining quarter." and C13's lone "everything," at 360×740.

## How I tested

As before, only the built-in pane was used; a real lock is still active. No project file was edited. I refreshed the HTTP cache of every page module (`fetch(…, {cache: 'reload'})`) before testing, so the iframes ran the builder's latest code (`quote-frame.js` 09:11, `blocked.js` 09:10).

- **All 69 quotes** were measured in iframes at 720×900, 390×844, 360×740, 900×700, 1440×900 and 1024×768 (414 renders).
- **The first-line check runs on every stacked render.** It takes the canvas × fade-mask contrast estimate under lines 1–2. It also checks that the fade ends above the quote box, and that the face starts below the timer strip and stays inside the window.
- **By use:** 26 distinct quotes in screenshots (`qa-shots/r3-*.png`), including A18, A20, A30, B02 and C10. First-line contrast was measured on real pixels with the text hidden.

## R2-M1: FIXED

- **Real pixels, line 1 and line 2 (target ≥ 7 : 1):**
  - A20 at 390×844: **17.3 : 1**;
  - A18, B02 and C10 at 360×740: **17.3 : 1** (C10's worst pixel 17.2);
  - the hidden-text frames show the print fully dissolved just above the quote (`r3-09b`, `r3-10b`, `r3-11b`, `r3-12b`).
- **All 69 quotes × 720×900, 390×844 and 360×740:**
  - the lowest estimated first-line contrast is **17.3 : 1** (the page colour), so no quote line sits on the print anywhere;
  - the fade never ends inside the quote box (0/207);
  - no face starts above the timer strip;
  - no face leaves the window (0/207).
- **Faces at 720×900 are now whole:** A30 Napoleon (`r3-01`), B20, C05, A20, E01. The text clears them.
  - 32/69 close-ups print narrower. They are centred, or offset for look room, as soft vignettes (`r3-03` Ali, `r3-14` Nadal, `r3-15` Gates).
  - The vignettes are smaller than before, but the quote is clearly the hero. That is the brief's priority, so I accept it.
- **Desktop has no regressions:**
  - at 1440×900, 1024×768 and 900×700, no text box enters the portrait zone and no text sits over the face box;
  - no print stops short of the outer edge, and every size is a scale step;
  - nothing overflows or scrolls;
  - no credit contains junk or a "…" fragment;
  - dates always align with the name.

  Sizes (min / median / max):

  | Viewport | Sizes |
  |---|---|
  | 1440×900 | 47 / 65 / 104 px, credit 1 line on 69/69 |
  | 1024×768 | 42 / 58 / 73 px, credit 1 line on 68/69 (A30 takes 2) |
  | 900×700 | 38 / 52 / 65 px, credit 1 line on 63/69 (A25, A28, A30, B07, B16, B17 take 2) |

## Another quote: still fine

- At 1440×900, a double-click, a triple-click and → give exactly 3 changes, with no text selected.
- Touch at 390×844 (synthesised): a single tap gives 0 changes; a double-tap and a triple-tap each give 1; a double-tap on the Commons link gives 0.
- The countdown stays "1:13" throughout, and the slot never moves.

## Remaining (do not block)

- **A30:** the stub "for the / remaining quarter." at 1024×768 and 900×700 (`r3-05`), and a 2-line credit at 1024×768.
- **C13:** "everything," alone at 360×740.
- **B12/B13:** verse run-overs at phone sizes. They are readable.
- **900×700:** 6 credits take 2 lines.
- **Nice to have:**
  - at 720×900 some narrow close-up vignettes look like thumbnails (a03); a slightly larger face would join picture and quote better;
  - C10's look-room offset leaves a dark side;
  - visible branding in the prints (B22 "tiff", E02 crest);
  - Jordan a02/a12 is still 398 px.

**APPROVED**
