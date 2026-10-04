# Verification of "Locked in" quotes

Independent check of `research/quotes.json` (100 entries), run 2026-10-04. I tried to prove each entry wrong against the cited source, or another authoritative copy where the cited link failed. Machine-readable verdicts: `research/verification.json`.

## Summary

| Verdict | Count |
|---|---|
| PASS | 70 |
| FIX | 30 |
| REJECT | 0 |

**REJECT: none.** Every display line was found in the source it is credited to, by the person it is credited to. No misattributions or invented attributions turned up, including the six "secondary" entries, which I confirmed in the books themselves (scans on archive.org, Founders Online, Wikisource).

### FIX list (exact corrections are in `verification.json` → `fix`)

**Wording of the display text**

- **q004** — Unmarked omission of "said Epictetus"; Greek has a stray article.
  - `text` → Nothing great … is produced suddenly, since not even the grape or the fig is.
- **q044** — Last word silently dropped; over 40 words.
  - `text` → I would go and look at a stone-cutter hammering away at his rock … at the hundred and first blow it would split in two … it was not that blow that did it, but all that had gone before together.
- **q093** — Display text adds "the" that is not in Dru; no source URL.
  - `text` → It is perfectly true, as philosophers say, that life must be understood backwards. But they forget the other proposition, that it must be lived forwards.
- **q032** — Over 40 words.
  - `text` → Between us and Goodness the gods have placed the sweat of our brows … but when a man has reached the top, then is she easy to reach.

**Original-language text wrong**

- **q001** — Greek original misquoted (wrong opening words).
  - `original` → Πάσης ὥρας φρόντιζε στιβαρῶς ὡς Ῥωμαῖος καὶ ἄρρην τὸ ἐν χερσὶ μετὰ τῆς ἀκριβοῦς καὶ ἀπλάστου σεμνότητος καὶ φιλοστοργίας καὶ ἐλευθερίας καὶ δικαιότητος πράσσειν, καὶ σχολὴν ἑαυτῷ ἀπὸ πασῶν τῶν ἄλλων φαντασιῶν πορίζειν.
- **q004** — Unmarked omission of "said Epictetus"; Greek has a stray article.
  - `original` → Οὐδὲν … τῶν μεγάλων ἄφνω γίνεται, ὅπου γε οὐδ᾽ ὁ βότρυς οὐδὲ σῦκον.
- **q005** — Greek original has a wrong word (δρομικὴ → τροχαστικὴ).
  - `original` → Πᾶσα ἕξις καὶ δύναμις ὑπὸ τῶν καταλλήλων ἔργων συνέχεται καὶ αὔξεται, ἡ περιπατητικὴ ὑπὸ τοῦ περιπατεῖν, ἡ τροχαστικὴ ὑπὸ τοῦ τρέχειν. ἂν θέλῃς ἀναγνωστικὸς εἶναι, ἀναγίνωσκε, ἂν γραφικός, γράφε.
- **q012** — Sanskrit transliteration typo.
  - `original` → niyataṃ kuru karma tvaṃ karma jyāyo hy akarmaṇaḥ / śarīra-yātrāpi ca te na prasiddhyed akarmaṇaḥ

**Source/locator**

- **q006** — Locator paragraph number wrong.
  - `source.locator` → Chapter 64, §2
- **q081** — Weaker (translated reported speech) source used where his own English speech exists; image credit names the uploader.
  - `source.work` → Lectures from Colombo to Almora: "The Mission of the Vedanta" (Kumbakonam, 1897), Complete Works vol. 3
  - `source.year` → 1897
  - `source.locator` → Complete Works, vol. 3 (rendering Katha Upanishad 1.3.14)
  - `source.url` → https://en.wikisource.org/wiki/The_Complete_Works_of_Swami_Vivekananda/Volume_3/Lectures_from_Colombo_to_Almora/The_Mission_of_the_Vedanta
- **q093** — Display text adds "the" that is not in Dru; no source URL.
  - `source.url` → https://archive.org/details/journalsofkierke0000kier
  - `source.locator` → Journal entry 1843 (Papirer IV A 164; SKS JJ:167); Dru selection, Harper Torchbook ed. 1959, p. 89
- **q094** — No source URL; image too small for full screen.
  - `source.url` → https://archive.org/details/grooksbypiethein0000piet
  - `source.locator` → Grooks (MIT Press, 1966), p. [10]
- **q096** — Source URL dead; text found in the book itself.
  - `source.url` → https://archive.org/details/lastflight0000amel
  - `source.locator` → Last Flight, arranged by G. P. Putnam (1937); Harbrace reprint 1965, p. 208
- **q097** — No source URL.
  - `source.url` → https://en.wikisource.org/wiki/History_of_Woman_Suffrage/Volume_5/Chapter_6
  - `source.locator` → History of Woman Suffrage, vol. 5, ch. 6 (quoting Harper, Life and Work of Susan B. Anthony, vol. 3)
- **q098** — No source URL; image PD reasoning thin.
  - `source.url` → https://archive.org/details/gravitygrace0000weil_z8j5
  - `source.locator` → "Attention and Will", p. 106 (Routledge & Kegan Paul, 1952)
- **q099** — Source cites a "1927 letter" that the cited QI article does not mention.
  - `source.work` → M. A. Rosanoff, "Edison in His Laboratory", Harper's Magazine vol. 165 (Sept. 1932), p. 406; earlier in Dyer & Martin, Edison: His Life and Inventions (1910), vol. 2, p. 607
  - `verification_note` → Per Quote Investigator: credited to Edison from 1901; in his authorised biography (1910); Edison quoted claiming it in Harper's (1932). Similar sayings predate him. No 1927 letter.
- **q100** — No source URL.
  - `source.url` → https://archive.org/details/bookoffiverings00miyarich
  - `source.locator` → The Water Book, closing passage; Harris tr., Overlook Press 1974, p. 66

**Image licence recorded wrongly (photo is CC, not PD)**

- **q033** — Image licence mis-recorded as PD; photo of a 3-D bust is CC BY 2.5.
  - `image.license` → CC BY 2.5
  - `image.license_url` → https://creativecommons.org/licenses/by/2.5
  - `image.attribution` → © Marie-Lan Nguyen / Wikimedia Commons, CC BY 2.5 (https://commons.wikimedia.org/wiki/File:Plato_Silanion_Musei_Capitolini_MC1377.png)
- **q065** — Image licence mis-recorded as PD; photo carries CC BY-SA 2.0.
  - `image.license` → CC BY-SA 2.0
  - `image.license_url` → https://creativecommons.org/licenses/by-sa/2.0
  - `image.attribution` → Boyd Dwyer, CC BY-SA 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Virgil_mosaic_in_the_Bardo_National_Museum_(Tunis)_(12241228546).jpg)
- **q087** — Image licence mis-recorded as PD; photo carries CC BY 2.0.
  - `image.license` → CC BY 2.0
  - `image.license_url` → https://creativecommons.org/licenses/by/2.0
  - `image.attribution` → Ángel M. Felicísimo, CC BY 2.0, via Wikimedia Commons (https://commons.wikimedia.org/wiki/File:Retrato_de_Julio_C%C3%A9sar_(26724093101)_(cropped).jpg)

**Image creator/attribution wrong (restorer, uploader or library credited instead of photographer/artist)**

- **q010** — Image credit is a garbled Thai note implying "educational use"; licence tag itself is CC BY-SA 3.0.
  - `image.creator` → Tevaprapas Makklay (Phra Maha Tevaprapas Vajirayanamedhi)
- **q011** — Same image credit problem as q010.
  - `image.creator` → Tevaprapas Makklay (Phra Maha Tevaprapas Vajirayanamedhi)
- **q019** — Image creator is the restorer, not the photographer.
  - `image.creator` → Warren's Portraits, Boston (c. 1870); restoration by Adam Cuerden
- **q050** — Image creator recorded as "Unknown author"; photographer and CC BY credit holder are known.
  - `image.creator` → Lock & Whitfield (photographers); Wellcome Collection
- **q054** — Image creator is the restorer, not the photographer.
  - `image.creator` → Pach Brothers (1904); restoration by Adam Cuerden
- **q055** — Image creator is the restorer, not the photographer.
  - `image.creator` → Pach Brothers (1904); restoration by Adam Cuerden
- **q058** — Image creator is the restorer; weak content fit.
  - `image.creator` → Mary Garrity (c. 1893); restoration by Adam Cuerden
- **q059** — Image creator is the restorer, not the photographer.
  - `image.creator` → Bain News Service (c. 1924–26); restoration by Adam Cuerden
- **q064** — Image creator field names the ancient sculptor only.
  - `image.creator` → Photo: Jastrow (Marie-Lan Nguyen), 2006, public domain; bust: Roman copy after Lysippos
- **q079** — Image is a Karsh photograph credited as "Unknown author"; EU status doubtful.
  - `image.creator` → British Government (Imperial War Museum NYP 45063)
- **q081** — Weaker (translated reported speech) source used where his own English speech exists; image credit names the uploader.
  - `image.creator` → Unknown photographer (Chicago, September 1893)
- **q086** — Image creator is the restorer, not the photographer.
  - `image.creator` → Matzene, Chicago (Nov. 1913); restoration by Adam Cuerden
- **q092** — Image creator names the library, not the artist.
  - `image.creator` → Niels Christian Kierkegaard (sketch, c. 1840); Royal Danish Library
- **q093** — Display text adds "the" that is not in Dru; no source URL.
  - `image.creator` → Niels Christian Kierkegaard (sketch, c. 1840); Royal Danish Library

**Image to replace**

- **q079** — Image is a Karsh photograph credited as "Unknown author"; EU status doubtful.
  - `image.commons_page` → https://commons.wikimedia.org/wiki/File:Churchill_portrait_NYP_45063.jpg

### Images whose licence is doubtful for use in the EU

- **q079 Churchill**: this is Yousuf Karsh's "The Roaring Lion" (1941), credited in the JSON as "Unknown author". Commons treats it as PD in Canada and the US. In the EU it is free only through the rule of the shorter term, while Karsh died in 2002 and his estate still licenses the photo. **Replace it** (suggested: `File:Churchill_portrait_NYP_45063.jpg`, PD-UKGov).
- **q098 Simone Weil**: a 1943 ID-pass photo by an unknown photographer. Its PD status rests on PD-ID-France ("ID photos lack originality") plus PD-1996. That reasoning is thin; keep it only if you accept that.
- **q010/q011 Buddha (Sarnath)**: tagged CC BY-SA 3.0, but the author field says (in Thai) that the photo was released "for educational use". For a commercial app, either clean the credit and rely on the CC tag, or swap the image.
- **q008/q009 Confucius**: a 2007 Xinhua press photo of a Han tomb fresco, tagged PD-Art. It is very likely fine in the EU under DSM Directive Art. 14 (a faithful copy of a public-domain 2-D work). Minor doubt, and it is only 450×338 px.
- **q090 Gandhi** (Elliott & Fry 1931, PD-UK-unknown): public domain in the UK and EU, but Commons marks it **not PD in the US until 2027**. This matters only if the app is distributed in the US.
- **q100 Musashi**: the painting is 17th-century, so PD-Art is fine. The Commons file comes from an antiques shop's listing of a reproduction print, and the self-portrait attribution is traditional. A licence problem is unlikely; provenance is weak.
- **Not doubtful once corrected:** q033 (CC BY 2.5), q065 (CC BY-SA 2.0) and q087 (CC BY 2.0) need attribution. All CC BY-SA images (q001–003, q010–011, q031–032, q061–063, q065, q088) are resized in `quote-images/`. Those resized copies are adaptations and must also be offered under CC BY-SA with credit.
- **"PD-US only" is acceptable here:** q018, q048, q054–57, q058, q084, q086, q096, q097 and q099 are US works, and q022 is Canadian. Under the rule of the shorter term (Term Directive 2006/116/EC Art. 7(1)), a non-EU work whose term has expired in its country of origin is also free in the EU. A PD-US tag would *not* be enough for a European photo whose photographer died less than 70 years ago; none of the 100 is in that position. Henri Manuel †1947, Prokudin-Gorsky †1944, Paul Nadar †1939, Barnett †1948 and Pirie MacDonald †1942 are all past 70 years. Copyright claims by the National Portrait Gallery (q020, q023, q029, q047, q070, q075–76) do not hold in the EU under DSM Art. 14.

### Text-rights advisory (not counted as FIX; you asked about image rights, not text)

Short quotation is low-risk, but decorative full-screen display is not clearly covered by the EU/Danish quotation right. These display texts are translations or texts that are still protected:
- **q077, q078 Van Gogh Museum translation.** vangoghletters.org states "© 2009 Van Gogh Museum, Huygens ING. All Rights Reserved… without prior permission". This is the clearest case. Ask permission or use a public-domain translation.
- q026 Ludovici (†1971) and q064 W. D. Ross (†1971): protected in the EU/UK until 2041. q079 Churchill speech (estate, †1965). q094 Piet Hein (†1996; the grooks are actively licensed). q095 E. Roosevelt (1960, †1962). q093 Dru (†1976). q092 Steere (1938). q098 Crawford (1952). q100 Harris (1974). q060 Kellogg (†1960), if the Notes were translated.

### Over 40 words / content fit / image quality

- Over 40 words: **q044** (55; the note says 52) and **q032** (44). Both have FIXes. q001 has 39.
- Weak fit: **q058** (Ida B. Wells, about the press and lynching reports) — consider replacing. q023 (Jane Eyre, "friendless") and q011 ("as if dead already") are on-theme but heavy for a calm screen.
- Upscaled from tiny Commons originals (will look soft full-screen): q021 (231×290), q046 (250×294), q084 (274×379), q094 (305×238), q008/q009 (450×338), q022 (480×614), q082 (483×710), q012 (523×377), q092/q093 (564×796).
- Optional: q078 could keep its closing clause ("…silenced too, but precisely because of that."). q031/q032 could caption the bust as "possibly Hesiod".

### What I could not check

- Original-language fields that I did **not** re-collate: Chinese (q006–q009), Pali (q010–q011), Russian (q025), German (q026, q036, q083), French (q037, q041, q085), Latin (q027, q061–q063, q065, q087–q088), Danish (q092–q093) and Japanese (q100, given in modernised spelling). They look right to me, but I spot-checked the Greek and found 3 errors (q001, q004, q005), so treat the unchecked ones as unverified.
- q094: the middle line ("prove their worth") was not OCR-confirmed, and I could not confirm the grook's title "Problems".
- q096: the date of Earhart's note. q090: the CWMG volume number. q060: whether Curie's Autobiographical Notes are a translation.
- The University of Michigan Lincoln site and HathiTrust are behind a bot check, which I did not bypass. I used the archive.org scan of Basler vol. 2 instead.
- I did not re-verify the reasons in REJECTED-QUOTES.md. It has one typo: the Eleanor Roosevelt replacement is q095, not q093.

### Method

- Downloaded every cited Gutenberg text (58 books) and the cited Wikisource, MIT Classics, LacusCurtius, vangoghletters, ICS, FDPP, masshist, mkgandhi and QI pages. I then matched each display text, normalised for punctuation, against the source and read the surrounding text for elisions and locators. Chapter, book and section numbers were confirmed from the headings.
- Where the cited link failed or was missing, I used Founders Online (in a browser), archive.org search-inside on the scanned books, and Wikisource (History of Woman Suffrage).
- Images: I pulled the Commons API `imageinfo|extmetadata` and the page wikitext for all 79 unique files. I compared licence tags, the photographer/artist fields and descriptions with the JSON, and checked that every local file exists and has the Commons aspect ratio.
- Cache: `/private/tmp/claude-501/-Users-sebastianpirad-powerlink/92b58899-467c-424a-8ed1-d3636b2fd856/scratchpad/verify/` (`src/`, `commons/`).

## Per-quote table

| id | author | verdict | wording | attribution | image licence | notes |
|---|---|---|---|---|---|---|
| q001 | Marcus Aurelius | FIX | verbatim (Long, II.5) | OK | CC BY-SA 4.0 OK | English verbatim in Gutenberg #15877. The Greek "original" is wrong: Med. II.5 opens "Πάσης ὥρας", not "Παντὸς καιροῦ" (checked https://el.wikisource.org/wiki/Τα_εις_εαυτόν/2). 39 words. Matched against: https://www.gutenberg.org/cache/epub/15877/pg15877.txt |
| q002 | Marcus Aurelius | PASS | verbatim | OK | CC BY-SA 4.0 OK | English verbatim (Long V.1). Greek matches el.wikisource Τα εις εαυτόν/5. Matched against: https://www.gutenberg.org/cache/epub/15877/pg15877.txt |
| q003 | Marcus Aurelius | PASS | verbatim | OK | CC BY-SA 4.0 OK | English verbatim (Long X.16). Greek matches el.wikisource Τα εις εαυτόν/10. Matched against: https://www.gutenberg.org/cache/epub/15877/pg15877.txt |
| q004 | Epictetus | FIX | unmarked omission | OK (Discourses I.15 "What philosophy promises") | PD OK | Long reads "Nothing great, said Epictetus, is produced suddenly…" (Gutenberg #10661 is Long's Selection, same translation). Dropping "said Epictetus" silently breaks the "only marked elisions" rule. Greek also off: Schenkl text is "Οὐδέν, ἔφη, τῶν μεγάλων ἄφνω γίνεται, ὅπου γε οὐδ’ ὁ βότρυς οὐδὲ σῦκον" (el.wikisource Διατριβαί/Βιβλίον 1) — no "τὸ". Matched against: https://www.gutenberg.org/cache/epub/10661/pg10661.txt |
| q005 | Epictetus | FIX | verbatim | OK (Discourses II.18) | PD OK | English verbatim in Gutenberg #10661. Greek wrong word: the text reads "ἡ τροχαστικὴ ὑπὸ τοῦ τρέχειν", not "ἡ δρομικὴ" (el.wikisource Διατριβαί/Βιβλίον 2). Matched against: https://www.gutenberg.org/cache/epub/10661/pg10661.txt |
| q006 | Laozi (traditional attribution) | FIX | verbatim | OK (Laozi, attributed) | PD OK | Verbatim in Legge, Gutenberg #216, but the sentence sits in paragraph 2 of ch. 64 ("2. The tree which fills the arms…"), not §1. Matched against: https://www.gutenberg.org/cache/epub/216/pg216.txt |
| q007 | Laozi (traditional attribution) | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/216/pg216.txt |
| q008 | Confucius | PASS | verbatim | OK | Public domain OK | Verbatim, Legge Book IX ch. XVIII. Image: Xinhua 2007 press photo of a tomb fresco, PD-Art-100; acceptable under EU DSM Art. 14 (faithful reproduction of a PD 2-D work) but source is only 450×338 px, upscaled to 800 px. Matched against: https://www.gutenberg.org/cache/epub/3330/pg3330.txt |
| q009 | Confucius | PASS | verbatim | OK | Public domain OK | Verbatim, Legge Book IV ch. XXIV. Same image caveat as q008. Matched against: https://www.gutenberg.org/cache/epub/3330/pg3330.txt |
| q010 | The Buddha (as recorded in the Pali Canon) | FIX | verbatim | OK (Dhammapada 103, ch. VIII) | CC BY-SA 3.0 — attribution string garbled | Verbatim in Müller, Gutenberg #2017. Commons tag is CC BY-SA 3.0, but the Artist field (copied into "creator"/"attribution") is a Thai note saying the photographer released it "for educational use" — ambiguous for a commercial app. Clean the credit; consider a different Buddha image if you want zero ambiguity. Matched against: https://www.gutenberg.org/cache/epub/2017/pg2017.txt |
| q011 | The Buddha (as recorded in the Pali Canon) | FIX | verbatim | OK (Dhammapada 21, ch. II) | CC BY-SA 3.0 — attribution string garbled | Verbatim in Müller, Gutenberg #2017. Same image credit problem as q010. Matched against: https://www.gutenberg.org/cache/epub/2017/pg2017.txt |
| q012 | Bhagavad Gita (words of Krishna) | FIX | verbatim (Arnold) | OK (BG III.8) | PD OK (523×377 source, upscaled) | Verbatim in Arnold, Gutenberg #2388. IAST misspelt: BG 3.8 reads "na prasiddhyed akarmaṇaḥ" (double d). Matched against: https://www.gutenberg.org/cache/epub/2388/pg2388.txt |
| q013 | Leonardo da Vinci | PASS | verbatim | OK | Public domain OK | English verbatim in Richter no. 1177 (Gutenberg #5000). Italian confirmed on it.wikisource ("Aforismi, novelle e profezie"; reads "Si come"/"Sì come", JSON has "Siccome" — orthographic variant only). Matched against: https://www.gutenberg.org/cache/epub/5000/pg5000.txt |
| q014 | Booker T. Washington | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/2376/pg2376.txt |
| q015 | Thomas Carlyle | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/26159/pg26159.txt |
| q016 | Samuel Johnson | PASS | verbatim | OK | Public domain OK | Verbatim, Rasselas ch. XIII (Imlac). Correctly omits the non-existent "by" before perseverance. Matched against: https://www.gutenberg.org/cache/epub/652/pg652.txt |
| q017 | Edward Young | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/33156/pg33156.txt |
| q018 | Mark Twain | PASS | verbatim | OK | Public domain OK | Verbatim, ch. VI epigraph. Image tagged PD-US only; US-origin 1907 photo → also PD in EU by the rule of the shorter term (Term Directive Art. 7(1)). Matched against: https://www.gutenberg.org/cache/epub/102/pg102.txt |
| q019 | Louisa May Alcott | FIX | verbatim | OK (Little Women ch. 44, Amy) | PD OK — creator wrong | Verbatim in Gutenberg #514. Image "creator" names the restorer, not the photographer. Matched against: https://www.gutenberg.org/cache/epub/514/pg514.txt |
| q020 | Mary Shelley | PASS | verbatim | OK | Public domain OK | Verbatim (Letter 1; leading "for" dropped). NPG copyright claim on the scan is not valid in the EU (DSM Art. 14). Matched against: https://www.gutenberg.org/cache/epub/84/pg84.txt |
| q021 | Anne Brontë | PASS | verbatim | OK | Public domain OK | Verbatim, Agnes Grey ch. III. Image only 231×290 px on Commons (upscaled to 800 px) — will look soft full-screen. Matched against: https://www.gutenberg.org/cache/epub/767/pg767.txt |
| q022 | L. M. Montgomery | PASS | verbatim | OK | Public domain OK | Verbatim, ch. XXI ("Marilla, " dropped). Image PD-Canada only (LAC C-011299, c. 1920–30): Canadian-origin, so PD in EU by rule of the shorter term; 480×614 px. Matched against: https://www.gutenberg.org/cache/epub/45/pg45.txt |
| q023 | Charlotte Brontë | PASS | verbatim | OK | Public domain OK | Verbatim, Jane Eyre ch. XXVII. Context is Jane refusing Rochester; emotionally heavy for a focus screen but on-theme (self-command). Matched against: https://www.gutenberg.org/cache/epub/1260/pg1260.txt |
| q024 | George Eliot | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/7469/pg7469.txt |
| q025 | Leo Tolstoy | PASS | verbatim | OK | Public domain OK | Verbatim, Book Ten ch. XVI (Kutuzov). Russian not re-checked by me. Maude translation (†1938/1939) is PD. Matched against: https://www.gutenberg.org/cache/epub/2600/pg2600.txt |
| q026 | Friedrich Nietzsche | PASS | verbatim | OK | Public domain OK | Verbatim, Ludovici, Maxims §12 (Gutenberg #52263). Text rights: Ludovici †1971 → translation protected in EU/UK until 2041. Matched against: https://www.gutenberg.org/cache/epub/52263/pg52263.txt |
| q027 | Thomas à Kempis | PASS | verbatim | OK | Public domain OK | Verbatim, Benham I.XI.5. 1874 Benham edition exists (archive.org item imitationchrist01unkngoog, dated 1874). Matched against: https://www.gutenberg.org/cache/epub/1653/pg1653.txt |
| q028 | Miguel de Cervantes | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/996/pg996.txt |
| q029 | Philip Stanhope, 4th Earl of Chesterfield | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/3361/pg3361.txt |
| q030 | Sir Joshua Reynolds | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/2176/pg2176.txt |
| q031 | Hesiod | PASS | verbatim | OK | CC BY-SA 4.0 OK | Verbatim, Evelyn-White l. 311. Image is labelled "Bust of Hesiod (?)" by the museum — identification uncertain; consider captioning as such. Matched against: https://www.gutenberg.org/cache/epub/348/pg348.txt |
| q032 | Hesiod | FIX | verbatim but 44 words | OK (WD 289–292) | CC BY-SA 4.0 OK | Verbatim in Gutenberg #348 (end "though before that she was hard" trimmed). Over the 40-word limit; shorten with a marked elision that keeps the meaning (27 words). Matched against: https://www.gutenberg.org/cache/epub/348/pg348.txt |
| q033 | Plato | FIX | verbatim (trimmed) | OK (Republic 377a–b, Socrates) | WRONG licence: photo is CC BY 2.5 | Verbatim in Jowett, Gutenberg #1497. Commons wikitext: artwork PD-old-100 but photo licence {{self\|Cc-by-2.5}} with credit line "© Marie-Lan Nguyen / Wikimedia Commons" — not public domain. Matched against: https://www.gutenberg.org/cache/epub/1497/pg1497.txt |
| q034 | Robert Louis Stevenson | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/386/pg386.txt |
| q035 | Rudyard Kipling | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/556/pg556.txt |
| q036 | Johann Wolfgang von Goethe | PASS | verbatim | OK | Public domain OK | Verbatim, Saunders no. 324 ("Life and Character"), Gutenberg #33670 — numbering confirmed. Matched against: https://www.gutenberg.org/cache/epub/33670/pg33670.txt |
| q037 | Louis Pasteur | PASS | verbatim | OK | Public domain OK | Verbatim in Devonshire tr. of Vallery-Radot, ch. IV (Gutenberg #60956). Reported speech (1854 Lille lecture), correctly labelled. Matched against: https://www.gutenberg.org/cache/epub/60956/pg60956.txt |
| q038 | Benjamin Franklin | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/20203/pg20203.txt |
| q039 | Benjamin Franklin | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/20203/pg20203.txt |
| q040 | Benjamin Franklin | PASS | verbatim | OK | Public domain OK | Verbatim in the 1810 printing (#43855). The 1758 original reads "for that's the Stuff" — display follows the cited printing, acceptable. Matched against: https://www.gutenberg.org/cache/epub/43855/pg43855.txt |
| q041 | Blaise Pascal | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/46921/pg46921.txt |
| q042 | Henry David Thoreau | PASS | verbatim | OK | Public domain OK | Verbatim; "…" marks one omitted sentence; meaning intact. Matched against: https://www.gutenberg.org/cache/epub/205/pg205.txt |
| q043 | Henry David Thoreau | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/205/pg205.txt |
| q044 | Jacob A. Riis | FIX | silent change + 55 words | OK (Making of an American) | PD OK | Source ends "…but all that had gone before together." — display silently drops "together". Also 55 words (note says 52) — over 40. Proposed text restores "together" and uses two marked elisions (39 words). If you prefer the full passage, the minimum fix is to append "together" (56 words). Matched against: https://www.gutenberg.org/cache/epub/6125/pg6125.txt |
| q045 | Alfred, Lord Tennyson | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/8601/pg8601.txt |
| q046 | Christina Rossetti | PASS | verbatim | OK | Public domain OK | Verbatim, first stanza. Image only 250×294 px on Commons (upscaled). Matched against: https://www.gutenberg.org/cache/epub/16950/pg16950.txt |
| q047 | Emily Brontë | PASS | verbatim | OK | Public domain OK | Verbatim (Gutenberg #1019 includes Charlotte's 1850 note). "Last lines" is Charlotte's claim, correctly framed. Matched against: https://www.gutenberg.org/cache/epub/1019/pg1019.txt |
| q048 | Emily Dickinson | PASS | verbatim | OK | Public domain OK | Verbatim, Third Series, Life XIV "Aspiration" (Todd text; 1896 punctuation). Matched against: https://www.gutenberg.org/cache/epub/12242/pg12242.txt |
| q049 | Ralph Waldo Emerson | PASS | verbatim | OK | Public domain OK | Matches ("Power" capitalised in source). Matched against: https://www.gutenberg.org/cache/epub/2944/pg2944.txt |
| q050 | Thomas Henry Huxley | FIX | verbatim | OK (Technical Education, 1877) | CC BY 4.0 OK — creator missing | Verbatim in #52344, essay III. Image file title and category name the photographers Lock & Whitfield; the CC BY 4.0 credit should name Wellcome Collection. Matched against: https://www.gutenberg.org/cache/epub/52344/pg52344.txt |
| q051 | William James | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/57628/pg57628.txt |
| q052 | William James | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/57628/pg57628.txt |
| q053 | William James | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/57628/pg57628.txt |
| q054 | Theodore Roosevelt | FIX | verbatim | OK (opening of the 1899 speech) | PD OK — creator wrong | Verbatim in Gutenberg #58821. Image creator names the restorer (Adam Cuerden), not the photographers (Pach Brothers, 1904). Matched against: https://www.gutenberg.org/cache/epub/58821/pg58821.txt |
| q055 | Theodore Roosevelt | FIX | verbatim | OK ("Man in the Arena", Sorbonne 1910) | PD OK — creator wrong | Verbatim on Wikisource; sentence continues "because there is no effort without error…". Image creator names the restorer (Adam Cuerden), not the photographers (Pach Brothers, 1904). Matched against: https://en.wikisource.org/wiki/Citizenship_in_a_Republic |
| q056 | Helen Keller | PASS | verbatim | OK | Public domain OK | Verbatim, Part I "Optimism Within" (#31622). Matched against: https://www.gutenberg.org/cache/epub/31622/pg31622.txt |
| q057 | Helen Keller | PASS | verbatim | OK | Public domain OK | Verbatim, Part III "The Practice of Optimism". Matched against: https://www.gutenberg.org/cache/epub/31622/pg31622.txt |
| q058 | Ida B. Wells | FIX | verbatim | OK (Southern Horrors, "Self-Help") | PD OK — creator wrong | Verbatim in #14975. Content fit is weak (about the press and lynching reports, not personal focus) — consider replacing. Image creator is the restorer; photographer is Mary Garrity. Matched against: https://www.gutenberg.org/cache/epub/14975/pg14975.txt |
| q059 | Jane Addams | FIX | verbatim (clause from indirect speech) | OK with caveat | PD OK — creator wrong | Verbatim in #1325 ch. VI, but it is a clause in Addams's summary of what early Christians believed ("…believed … that action is the only medium…"); she endorses it, so acceptable. Image creator is the restorer; photo is Bain News Service. Matched against: https://www.gutenberg.org/cache/epub/1325/pg1325.txt |
| q060 | Marie Curie | PASS | verbatim | OK | Public domain OK | Verbatim, Autobiographical Notes ch. I (#69617). Title page credits the Kelloggs as translators of "Pierre Curie" and lists the Notes separately "by Marie Curie" — whether the Notes were translated is unresolved; keep original=null. If translated: Charlotte Kellogg †1960 → EU rights to 2030. Matched against: https://www.gutenberg.org/cache/epub/69617/pg69617.txt |
| q061 | Seneca | PASS | verbatim | OK | CC BY-SA 3.0 OK | Verbatim, Basore (Wikisource), 1.3; Latin correct. Matched against: https://en.wikisource.org/wiki/On_the_shortness_of_life/Chapter_I |
| q062 | Seneca | PASS | verbatim | OK | CC BY-SA 3.0 OK | Verbatim, Gummere Ep. 1 §2. Text rights: Gummere †1969 (US first publication 1917, so EU term likely follows the expired US term). Matched against: https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_1 |
| q063 | Seneca | PASS | verbatim | OK | CC BY-SA 3.0 OK | Verbatim, Gummere Ep. 2 §2. Same text-rights note as q062. Matched against: https://en.wikisource.org/wiki/Moral_letters_to_Lucilius/Letter_2 |
| q064 | Aristotle | FIX | verbatim | OK (NE II.1, 1103b1) | PD OK — creator is sculptor, not photographer | Verbatim at classics.mit.edu (Ross); Greek matches el.wikisource Ηθικά Νικομάχεια/2. Photo is by Jastrow (Marie-Lan Nguyen), PD-self. Text rights: W. D. Ross †1971 → translation protected in EU/UK until 2041. Matched against: https://classics.mit.edu/Aristotle/nicomachaen.2.ii.html |
| q065 | Virgil | FIX | verbatim (Dryden) | OK (Aen. V.231) | WRONG licence: photo is CC BY-SA 2.0 | Verbatim in #228. Commons wikitext: mosaic PD-art-100, photo licence {{cc-by-sa-2.0}} (Boyd Dwyer, Flickr). Use the CC licence to be safe. Matched against: https://www.gutenberg.org/cache/epub/228/pg228.txt |
| q066 | Charles Darwin | PASS | verbatim | OK | Public domain OK | Verbatim in #2087; letter headed "Bahia, Brazil, August 4 [1836]" — date confirmed. Matched against: https://www.gutenberg.org/cache/epub/2087/pg2087.txt |
| q067 | Thomas Jefferson | PASS | verbatim | OK | Public domain OK | Verbatim, with capitals, on Founders Online (loaded in a browser): https://founders.archives.gov/documents/Jefferson/01-11-02-0327 (PTJ 11:348–9). The note's claim that Founders could not be fetched can be updated. Matched against: https://founders.archives.gov/documents/Jefferson/01-11-02-0327 |
| q068 | Abigail Adams | PASS | verbatim | OK | Public domain OK | Verbatim; masshist page dated "March 20 1780" — confirmed. Matched against: https://www.masshist.org/publications/adams-papers/index.php/view/ADMS-04-03-02-0240 |
| q069 | Abigail Adams | PASS | verbatim | OK | Public domain OK | Verbatim; page dated 19 January 1780; one sentence elided with "…". Matched against: https://www.masshist.org/publications/adams-papers/index.php/view/ADMS-04-03-02-0207 |
| q070 | Samuel Smiles | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/935/pg935.txt |
| q071 | Ella Wheeler Wilcox | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/16776/pg16776.txt |
| q072 | Henry Wadsworth Longfellow | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/1365/pg1365.txt |
| q073 | Henry Wadsworth Longfellow | PASS | verbatim | OK | Public domain OK | Verbatim; stanza 10 confirmed by count. Matched against: https://www.gutenberg.org/cache/epub/1365/pg1365.txt |
| q074 | William Ernest Henley | PASS | verbatim | OK | Public domain OK | Verbatim on Wikisource. Image author not stated; first published by 1912 → PD. Matched against: https://en.wikisource.org/wiki/Oxford_Book_of_English_Verse_1250-1900/Invictus |
| q075 | William Shakespeare | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/100/pg100.txt |
| q076 | William Shakespeare | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/100/pg100.txt |
| q077 | Vincent van Gogh | PASS | verbatim | OK | Public domain OK | English verbatim and Dutch verbatim on vangoghletters.org (Dutch checked in the "Original text" tab). Text rights: the site states "© 2009 Van Gogh Museum, Huygens ING. All Rights Reserved… without prior permission" — the translation is not free. Matched against: https://vangoghletters.org/vg/letters/let274/letter.html |
| q078 | Vincent van Gogh | PASS | verbatim | OK | Public domain OK | English and Dutch verbatim on vangoghletters.org; sentence continues "but precisely because of that" (optional to keep). Same "All Rights Reserved" text-rights caveat as q077. Matched against: https://vangoghletters.org/vg/letters/let400/letter.html |
| q079 | Winston Churchill | FIX | verbatim (ICS transcript) | OK (Harrow, 29 Oct 1941) | DOUBTFUL — creator wrong | Quote verbatim on winstonchurchill.org. Image is Yousuf Karsh's "The Roaring Lion" (30 Dec 1941, LAC e010751643) — JSON says "Unknown author". Commons: PD-Canada + PD-US-1996 for the photo, CC BY 2.0 for the scan. Karsh †2002 and his estate still licenses this picture; EU status rests only on the rule of the shorter term. Replace with a Crown-copyright-expired IWM portrait, e.g. File:Churchill_portrait_NYP_45063.jpg (PD-UKGov) and re-download quote-images/q079.jpg. Text rights: Churchill speeches © Churchill estate (†1965). Matched against: https://winstonchurchill.org/resources/speeches/1941-1945-war-leader/never-give-in/ |
| q080 | Frederick Douglass | PASS | verbatim | OK | Public domain OK | Verbatim; FDPP page title confirms Canandaigua, 3 August 1857. Matched against: https://frederickdouglasspapersproject.com/s/digitaledition/item/10509 |
| q081 | Swami Vivekananda | FIX | verbatim | OK — better source available | PD OK — creator is the uploader | Verbatim on the cited Wikisource page, but that is a disciple's Bengali record in translation. Vivekananda said the same English words himself in "The Mission of the Vedanta" (Kumbakonam, 1897, Complete Works vol. 3), rendering Katha Upanishad 1.3.14 — use that. Image "creator" is the Wikipedia uploader (Dziewa), not the photographer. Matched against: https://en.wikisource.org/wiki/The_Complete_Works_of_Swami_Vivekananda/Volume_6/Conversations_and_Dialogues/X |
| q082 | Hippocrates (Hippocratic Corpus) | PASS | verbatim | OK | Public domain OK | Verbatim (Adams) at classics.mit.edu. Image 483×710 px engraving. Matched against: https://classics.mit.edu/Hippocrates/aphorisms.1.i.html |
| q083 | Ludwig van Beethoven | PASS | verbatim | OK | Public domain OK | Verbatim, Wallace vol. 1 letter 18 (dated by Wallace "Nov. 16, 1800"; modern 1801 — correctly noted). Matched against: https://www.gutenberg.org/cache/epub/13065/pg13065.txt |
| q084 | Kahlil Gibran | PASS | verbatim | OK | Public domain OK | Verbatim in #58585. Image 274×379 px only (upscaled); US publication 1913 → PD. Matched against: https://www.gutenberg.org/cache/epub/58585/pg58585.txt |
| q085 | Michel de Montaigne | PASS | verbatim | OK | Public domain OK | Verbatim in cited source; locator and image licence checked. Matched against: https://www.gutenberg.org/cache/epub/3600/pg3600.txt |
| q086 | Emmeline Pankhurst | FIX | verbatim | OK (My Own Story, Book I ch. III) | PD OK — creator wrong | Verbatim in #34856. Commons wikitext names the photographer "Matzene, Chicago"; JSON credits the restorer. Matched against: https://www.gutenberg.org/cache/epub/34856/pg34856.txt |
| q087 | Julius Caesar | FIX | verbatim (Rolfe) | OK (Suet. Jul. 37.2) | WRONG licence: photo is CC BY 2.0 | Verbatim on LacusCurtius. Image is the Tusculum portrait (Turin) — good likeness — but a photo of a 3-D bust; Commons gives {{cc-by-2.0}} for the photo (PD-Art does not cover 3-D objects). Matched against: https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Suetonius/12Caesars/Julius*.html |
| q088 | Augustus | PASS | verbatim | OK | CC BY-SA 4.0 OK | Verbatim on LacusCurtius (Rolfe, Aug. 25.4); reported favourite saying, correctly framed. Matched against: https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Suetonius/12Caesars/Augustus*.html |
| q089 | Maria Mitchell | PASS | verbatim | OK | Public domain OK | Verbatim in #10202 under "1866. To her students". Matched against: https://www.gutenberg.org/cache/epub/10202/pg10202.txt |
| q090 | Mahatma Gandhi | PASS | verbatim | OK | Public domain OK | Verbatim on mkgandhi.org (Young India, 11 Aug 1920). CWMG volume not confirmed (print vol. 18 is plausible). Image: PD-UK-unknown → PD in UK/EU; Commons flags it NOT PD in the US until 2027 (matters only if shipped in the US). Matched against: https://www.mkgandhi.org/nonviolence/D_sword.php |
| q091 | Abraham Lincoln | PASS | verbatim | OK | Public domain OK | Verbatim (with Lincoln's comma) in Basler, Collected Works vol. 2 p. 327, letter to Isham Reavis — confirmed by search-inside on https://archive.org/details/collectedworksof0002linc. Page number now confirmed. Matched against: https://quod.lib.umich.edu/l/lincoln/lincoln2/1:346?rgn=div1;view=fulltext |
| q092 | Søren Kierkegaard | FIX | verbatim (Steere title/thesis) | OK | PD OK — creator wrong | Steere, Harper 1938 confirmed via religion-online. Image "creator" is the holding library; the sketch is by his cousin Niels Christian Kierkegaard (c. 1840) per the Commons description. 564×796 px. Matched against: https://www.religion-online.org/book/purity-of-heart-is-to-will-one-thing/ |
| q093 | Søren Kierkegaard | FIX | WRONG — extra word | OK (Dru) | PD OK — creator wrong | Dru's text (The Journals of Kierkegaard, Harper Torchbook 1959 = Dru selection, p. 89, archive.org search-inside) reads "as philosophers say", not "as the philosophers say". Danish matches SKS JJ:167 wording. Add a URL. Same image creator fix as q092. Matched against: (none) |
| q094 | Piet Hein | FIX | verified (lines 1, 2 and 4 found by search-inside) | OK | CC BY 3.0 OK, but 305×238 px | Grooks (MIT Press, 1966), page n10 on https://archive.org/details/grooksbypiethein0000piet: "Problems worthy of attack" and "by hitting back." on the same page; "prove their worth" not OCR-confirmed. Image is only 305×238 px (upscaled ~3×). Text rights: Hein †1996, grooks actively licensed — short quote only. Matched against: (none) |
| q095 | Eleanor Roosevelt | PASS | verbatim | OK | CC BY 2.0 OK | Verified: "You must do the thing you think you cannot do." in You Learn by Living (Hutchinson, London 1961, p. 36) via https://archive.org/details/youlearnbyliving0000elea_n4p6, and QI quotes the 1960 Harper text. Text rights: E. Roosevelt †1962 → EU to 2032 (short quote). Matched against: https://quoteinvestigator.com/2013/08/09/scare/ |
| q096 | Amelia Earhart | FIX | verbatim | OK | PD OK (Harris & Ewing, LOC no known restrictions) | Cited Purdue link unreachable. Verified in Last Flight (Harbrace reprint 1965, p. 208) on https://archive.org/details/lastflight0000amel: "Please know that I am quite aware of the hazards… Women must try to do things as men have tried. When they fail, their failure must be but a challenge to others." Date of the note not established from the scan. Matched against: https://digital.library.in.gov/Record/PU_earhart-266 |
| q097 | Susan B. Anthony | FIX | verified (closing words) | OK | PD OK | Verified in History of Woman Suffrage vol. 5 (1922), ch. 6, quoting Harper's biography: "…with such women consecrating their lives—failure is impossible!" — her last public words, 15 Feb 1906. Source URL was missing. Matched against: (none) |
| q098 | Simone Weil | FIX | verified | OK | DOUBTFUL (PD-ID-France) | Verified: "Absolutely unmixed attention is prayer." in Gravity and Grace (Routledge & Kegan Paul 1952, Crawford tr., p. 106) — https://archive.org/details/gravitygrace0000weil_z8j5; identical sentence in the US Wills tr. (Putnam 1952). Image: 1943 ID-pass photo, unknown photographer, PD rests on "ID photos lack originality" (PD-ID-France) + PD-1996 — thin. Matched against: (none) |
| q099 | Thomas Edison | FIX | verbatim (as quoted by Rosanoff) | OK per QI | PD OK (US) | QI page (https://quoteinvestigator.com/2012/12/14/genius-ratio/) has NO "1927 letter" — that claim in source.work and the note is unsupported. QI's evidence: 1901 newspaper credits Edison with 1/99; Dyer & Martin, Edison: His Life and Inventions (1910) vol. 2 p. 607; M. A. Rosanoff, "Edison in His Laboratory", Harper's Magazine vol. 165 (Sept 1932) p. 406 — an article, not an interview. Matched against: https://quoteinvestigator.com/2012/12/14/genius-ratio/ |
| q100 | Miyamoto Musashi | FIX | verified (Harris) | OK | PD-Art OK, provenance weak | Verified in A Book of Five Rings, tr. Victor Harris (Overlook Press, NY 1974), p. 66 — https://archive.org/details/bookoffiverings00miyarich; Harris continues "Next, in order to beat more skilful men…", which covers the Japanese "後は上手に勝つ". Japanese given in modernised spelling (not manuscript-checked). Image source is a shop listing of a reproduction print; self-portrait attribution is traditional. Text rights: Harris 1974 translation in copyright. Matched against: (none) |

## Entrepreneurs

Independent check of `research/quotes-entrepreneur.json` (26 entries, e01–e26), run 2026-10-04. Verdicts and exact fixes are in `research/verification-entrepreneur.json`.

| Verdict | Count |
|---|---|
| PASS | 17 |
| FIX | 9 |
| REJECT | 0 |

**REJECT: none.** Every line was found in the cited source, or in the secondary source named for it (QI for e07 and e25, the NPS lesson for e11, IBM for e24). None of them is listed under "Misattributed" on Wikiquote.

**FIX**
- **e02**: the cited live Stanford page now gives the delivered wording, "Sometimes life's gonna hit you in the head with a brick". "Life hits you" survives only in the 2005 as-prepared text. Either use the delivered wording (given) or point `source.url` at the 2012 Wayback copy.
- **e11**: 44 words, over the limit. Shortened to 35 with a marked elision.
- **e13, e14**: Commons names photographer Sandra Baqirjazid. Add her to the CC BY credit.
- **e16**: the archive.org link points to a 101-issue item. Link the Oct 1996 file directly.
- **e17**: the quote is in the paperback's Reading Group Guide ("A Conversation with Arianna Huffington"), not the main text.
- **e20**: the book has no heading "Ten Rules for Building a Business". The quote is under "Running a Successful Company: Ten Rules That Worked for Me", Rule 10, p. 249.
- **e24**: IBM's page dates the NCR meeting to 1915, but Watson left NCR for CTR in 1914. Year changed to 1911.
- **e26**: the quote is in the Introduction (unnumbered), not chapter 1.

**Page numbers found (optional to add):** e18 p. 7, e19 p. 172, e21 p. 35, e22 p. 13 (Bodley Head 1965), e08/e09 p. 17 (confirmed).

**Doubtful images**
- **e07 Disney**: tagged PD-USGov-NASA, but the photo is from 1954, before NASA existed. It is likely a Disney studio photo held in NASA's archive, so its PD status is uncertain. Consider replacing it.
- **e15 Ole Kirk Christiansen**: a 1957 LEGO archive photo by an unknown photographer, tagged PD-Denmark50. That holds only if it counts as a "simple photograph". If it counts as a photographic work, it is protected until end-2027. It is also tiny (346×458).
- **e18 Phil Knight**: the licence (CC BY-SA 4.0) is fine, but the photo is a dark, blurry snapshot with someone else's finger in the frame.
- **e16 A.P. Møller**: CC BY-SA 2.0 from Maersk's own Flickr. It is small and his head is bowed. The resized copies of e16 and e18 must stay CC BY-SA.
- All other images match Commons for licence, creator and source. Each one depicts the right person, and every local file exists with the Commons aspect ratio.

**Method:** Gutenberg texts (#7213, #8581), the CBS, Harvard, Stanford (live and Wayback), Princeton (Wayback), IBM, LEGO, lex.dk and QI pages, the Inter IKEA PDF, and the archive.org OCR for Carnegie, ERIC ED440033 and Maersk Post were all searched by script. Lending-only books were checked with archive.org search-inside. Only true/false results and page numbers were read, never the surrounding text.

## Explorers

Independent check of `research/quotes-explorer.json` (24 entries, x01–x24), run 2026-10-04. Verdicts and exact fixes are in `research/verification-explorer.json`.

| Verdict | Count |
|---|---|
| PASS | 19 |
| FIX | 4 |
| REJECT | 1 |

Every display line was found verbatim (punctuation aside) in the cited source by the person it is credited to. None is in a Wikiquote "Misattributed" or "Disputed" section, and Quote Investigator has no article on any of them. Both Amundsen originals were confirmed on nb.no: Sydpolen B. 1 p. 506 and B. 2 p. 62 (Dybwad 1912).

**REJECT**
- **x13 Gertrude Bell**: genuine (first sentence of *The Desert and the Sown*, ch. I), but off-theme. It is about the exhilaration of leaving "an elaborate social order" for wild travel, which on a blocked-site screen reads as escapism. The image is weak too: the face is small, and the licence tag (PD-art|PD-anon-1923) does not fit an anonymous photo whose early publication is not documented.

**FIX**
- **x02 Nansen**: the page is **p. 27**, not 26. Page numbers in the Hogarth scan are footers. The "26" just before the sentence in the OCR is the foot of p. 26; the sentence opens p. 27.
- **x19 Nansen**: the page is **p. 19**, not 18 (same footer mistake).
- **x06 Shackleton**: two fixes.
  - **Source.** The cited scan is the 1910 Musson one-volume edition, where the line is in ch. XIII. In the 1909 Heinemann first edition it is **Vol. I, ch. XXII "On the Great Glacier", p. 321**, under 11 December. The URL now points to the 1909 scan.
  - **Image.** The photo is by Frank Hurley, who died in 1962. Commons tags it only {{PD-old}}, which is wrong. It was the frontispiece of *South* (London, 1919), so it may be protected in the UK and EU until the end of 2032. Replace it with the x05 Beresford portrait and re-download (or copy) `quote-images/x06.jpg`.
- **x08 Henson**: the chapter title is "…Lieutenant Peary's Body-Servant — First Trips to the Arctic", not "…Peary's Expeditions".

**Page numbers confirmed or found (optional):** x12 p. 7, x24 p. 12, x17 p. 381, x18 p. 20 (Dodd, Mead 1911).

**Context notes (all kept as PASS)**
- x10 drops the opening "Nonsense!".
- x23 drops a leading "That".
- x07 is the final clause of a sentence.

  All three are acceptable at the start of a quote and keep the meaning.
- x11: the book prints the verses without the title "Courage", and the comma is closed to a full stop.
- x15 is wry: the only reward is the egg itself, not money or fame. The meaning is intact, but the line is oblique out of context.
- Weak but acceptable fit: x07 (the pull of the trail), x14 ("Intellectual Passion") and x04 (sombre).

**Doubtful images**
- **x06 Hurley (†1962)**: replace it, as above.
- **x08 Henson** (NYWT&S, Roger Higgins, 1953): PD rests on the newspaper's dedication of its rights to the Library of Congress, not on an expired term. This is acceptable. The photo is landscape, and Henson holds a portrait of Peary, so two faces are in the frame.
- **x13 Bell**: see REJECT.
- **"PD-US only" is acceptable** for x01 (Lomen Bros., Nome 1920), x07, x11 (Wide World 1928, PD-Pre1978) and x21. All are US works, so they are PD in the EU by the rule of the shorter term.
- x19 (Studio Phebus, before 1927, PD-Norway50) is anonymous and more than 70 years old, so it is fine.
- x05 has an odd PD-Norway50 tag, but Beresford died in 1938, so it is PD-old anyway.
- x22 is PD-Australia (1914). It also carries a CC BY 2.0 tag, but PD is enough.
- x24's Commons source is a third-party mirror of the official NASA portrait. Low risk.
- **Quality:**
  - x14 (428×570) and x15 (586×400, landscape, with a small figure) are tiny originals.
  - x20 shows Amundsen full-length in furs, in profile, with his face barely visible.
  - x10 is a faded cabinet card.
  - x18 is full-length on a mount with handwriting.
- All 24 local files exist and match the Commons aspect ratio. Every `original_url` matches the Commons API, and every image depicts the right person (contact sheet checked).

**Text-rights advisory (not counted as FIX):** Cherry-Garrard died in 1959, so x14 and x15 are protected in the EU/UK until the end of 2029. Mawson died in 1958, so x22 is protected until the end of 2028. Both are short quotations. Henson died in 1955, so his text has been free in the EU since 1 January 2026. The NASA oral histories (x12, x24) are US-government transcripts.

**Method:** I downloaded the Gutenberg texts (#3414, #3415, #4229, #5199, #6137, #6750, #11579, #14363, #18975, #20923, #63731, #73448) and the following sources:
- the UPenn Bly transcription;
- the NASA oral-history PDFs and the ALSJ pages;
- the archive.org OCR, with djvu.xml word coordinates for the page numbers, for the Nansen *Adventure*, the Musson and 1909 Heinemann *Heart of the Antarctic*, and Peck.

I searched them by script after normalising for punctuation, OCR line-break hyphens and case. I printed only true/false, offsets, chapter headings and page numbers, never the surrounding text. I checked the Norwegian on the nb.no content-fragment API, read the Wikiquote wikitext sections, and searched Quote Investigator through its search API. For the images I used the Commons `imageinfo|extmetadata` API, the page wikitext and a contact sheet of the local files. Cache: `/private/tmp/claude-501/-Users-sebastianpirad-powerlink/92b58899-467c-424a-8ed1-d3636b2fd856/scratchpad/vx/`.

## Athletes

Independent check of `research/quotes-athlete.json` (23 entries, a01–a23), run 2026-10-04. Verdicts are in `research/verification-athlete.json`. No entry had missing fields.

| Verdict | Count |
|---|---|
| PASS | 22 |
| FIX | 1 |
| REJECT | 0 |

**REJECT: none.** I was strict about the faked names. None of the lines is the Nike "Failure" script, an anthology-only Kobe, Ali or Phelps line, or a Wikiquote "Misattributed" item:
- **Jordan**: a02 is on p. 12 of his 1994 book; a12 is in the official Hall of Fame video transcript.
- **Kobe** (a06): from the Sports Illustrated report of his jersey-retirement speech.
- **Ali** (a03): Quote Investigator traces it to 1977.
- **Pelé** (a13): his own introduction to the 1978 book, p. 7.
- **Phelps** (a17): his 2008 book, p. 14.

Search-inside also confirms one of the researcher's rejections: the popular Phelps line ("You can't put a limit on anything…") is not in No Limits.

**FIX**
- **a06 Kobe Bryant**: the shown text starts 18 words into his sentence, without marking the cut. Add a leading "…".

**Page numbers found (optional to add):** a02 p. 12, a08 Superstars p. 253, a13 p. 7, a16 p. 3, a17 p. 14, a18 p. 1, a19 p. 45, a21 pp. 119/150/168, a23 p. 150.

**Notes and doubtful images**
- **a02 Jordan photo**: a CC BY-SA 3.0 "self" upload by Commons user Cavic, credited as Steve Lipofsky. The file has no VRT ticket, so it relies on Cavic being Lipofsky. The licence risk is moderate.
- **a12**: the official YouTube upload (XLzBMGXfK4c) is a better public source than the Facebook clip, which needs a login. The image is only 398×568.
- **a13**: consider adding "with Julio Mazzei" to the source.
- **CC BY-SA images** (a02, a04–a06, a09, a11, a13, a14–a16, a19–a21): the resized copies must stay CC BY-SA with credit.
- All 22 unique images match Commons for licence, creator and source. Each one depicts the right person, and every local file exists with the Commons aspect ratio.

**Method:** Dartmouth, SI, TED, CNN, PBS and the NYT archive were searched by script. TIME, the NYT 2018 article (Wayback), Quote Investigator and the YouTube transcript were checked in a browser by script. The ten archive.org books were checked with search-inside. Only true/false results and page numbers were read, never the surrounding text.

## v2 A

Independent check of `research/quotes-v2-A.json` (34 leader and conqueror quotes, A01–A34), run 2026-10-04. Each quote had to pass two tests: it must be genuine, and its fame must be confirmed in a major quotation dictionary. Verdicts, with `fame_confirmed`, are in `research/verification-v2-A.json`.

| Verdict | Count |
|---|---|
| PASS | 17 |
| FIX | 3 |
| REJECT | 14 |

**How fame was tested.** The researcher's anthology claims were "from memory", so I checked them with archive.org search-inside in seven dictionaries:
- Oxford Dictionary of Quotations, 5th ed. (1999) and 8th ed. (2014)
- Bartlett's Familiar Quotations, 16th, 17th and 18th eds. (1992, 2002, 2012)
- Yale Book of Quotations (2006) and New Yale Book of Quotations (2021)

I used several phrasings per quote. A hit counted only when the snippet or page belonged to the right author. **Every one of the 14 rejects is genuine. They fail only the fame test.**

**REJECT (fame not confirmed in any of the seven):**
- A02 Marcus Aurelius, "obstacle on the road": the passage is famous only in Hays's wording.
- A04 T. Roosevelt, "work worth doing".
- A08 Lincoln, "resolution to succeed".
- A11 Gandhi, "indomitable will".
- A16 and A17 Jefferson.
- A18 Booker T. Washington: the claimed Bartlett's listing is not there.
- A23 and A24 King: I reached primary sources for both, the King Papers (Spelman College 1960) and Strength to Love p. 20.
- A25 Mandela. Its wording also has an unmarked cut: Long Walk to Freedom p. 542 has a 19-word sentence between the two sentences shown.
- A26 Frederick the Great.
- A27 and A28 Alexander.
- A34 Washington, "no excuse".

Several of these are popular online, but none is in ODQ, Bartlett's or Yale. If the owner accepts "popular" evidence, A23–A25 are the strongest candidates to reinstate. A25 would need "…" between its sentences.

**FIX**
- **A30 Napoleon**: the researcher's own translation is replaced by the ODQ's published English (ODQ 5th ed. 1999, p. 538, Napoleon I; whole sentence matched). The French was verified in Correspondance vol. XVII, p. 472.
- **A12 and A13 Eleanor Roosevelt**: both sentences are on p. 36 of You Learn by Living (1961 London ed.). They are upgraded from secondary to primary.

**Fame confirmed (PASS):** A01 (ODQ, in another translation), A03, A05, A06, A07, A09, A10, A14, A15, A19, A20, A21, A22, A29, A31, A32 (Bartlett's, in a modern translation) and A33. Page numbers are in the JSON.

**Images.** All 19 files match Commons for licence and creator, depict the right person, and exist locally at the Commons aspect ratio. Doubts:
- **A31/A32 Sun Tzu**: a modern bronze statue in Enchoen garden, Japan (opened 1995). The sculptor's copyright is likely still running, and Japanese freedom of panorama does not cover selling copies. Replace it with a public-domain depiction.
- **A11 Gandhi**: PD-UK-unknown, so not PD in the US until 2027.
- **A19/A20 FDR**: a 1944 Perskie photo licensed CC BY 2.0 by the FDR Library from a family gift. Acceptable.
- **CC BY-SA images**: A01/A02, A25 and A27/A28 must keep CC BY-SA on the resized copies.

**Method:** source texts (Gutenberg, Wikisource, ICS, Hansard, FDPP, mkgandhi, Monticello, APP, Beacon, King Papers, LacusCurtius, NCERT) were matched by script. Archive.org OCR and search-inside were used for the Correspondance, Œuvres, Fitzpatrick, Moores, You Learn by Living, Strength to Love, Long Walk to Freedom and the seven dictionaries. Only true/false results and page numbers were read.
