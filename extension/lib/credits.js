// Quote page credit line, in Danish (proper names and licence names stay as they are).

const MONTHS = {
  january: 'januar', february: 'februar', march: 'marts', april: 'april', may: 'maj', june: 'juni', july: 'juli',
  august: 'august', september: 'september', october: 'oktober', november: 'november', december: 'december',
};

/** "c. 4th century BCE (compiled)" → "ca. 4. årh. f.Kr. (samlet)". */
export function daDates(input) {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/\b(\d{1,2})(st|nd|rd|th) (century|c\.)/g, '$1. årh.');
  s = s.replace(/\b(\d{1,2})(st|nd|rd|th)(?=–)/g, '$1.');
  s = s.replace(/\b(\d{3,4})s\b/g, "$1'erne");
  s = s.replace(/\(?\b(\d{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December)\)?/g,
    (m, d, mon) => (m.startsWith('(') ? `(${d}. ${MONTHS[mon.toLowerCase()]})` : `${d}. ${MONTHS[mon.toLowerCase()]}`));
  const words = [
    [/\bBCE\b/g, 'f.Kr.'], [/\bCE\b/g, 'e.Kr.'], [/\bc\.\s?/g, 'ca. '], [/\bfl\.\s?/g, 'virksom '],
    [/\btrad\.\s?/g, 'trad. '], [/\bcompiled\b/g, 'samlet'], [/\bcomposed\b/g, 'forfattet'], [/\bwritten\b/g, 'skrevet'],
    [/\bpubl\. posthumously\b/g, 'udg. posthumt'], [/\bposthumous(ly)?\b/g, 'posthumt'], [/\bpubl\./g, 'udg.'],
    [/\bbook (\d{4})\b/g, 'bog $1'],
  ];
  for (const [re, to] of words) s = s.replace(re, to);
  return s.replace(/\s{2,}/g, ' ').trim();
}

const CREATOR_MAX = 48;

/**
 * Parts of the quiet credit line. The locator (research detail, often English notes) is left out.
 * → { source, translator, photo: {creator, creatorFull, license, licenseUrl, commons} | null }
 */
export function creditParts(q, hasPortrait) {
  const src = (q && q.source) || {};
  const source = [src.work, daDates(src.year)].filter(Boolean).join(', ');
  const tr = q && q.translation;
  const translator = tr && tr.translator ? `Overs. ${tr.translator}` : '';
  let photo = null;
  const img = q && q.image;
  if (img && hasPortrait) {
    const full = String(img.creator || '').trim() || 'ukendt';
    const creator = full.length > CREATOR_MAX ? full.slice(0, CREATOR_MAX - 1).trimEnd() + '…' : full;
    photo = { creator, creatorFull: full, license: img.license || '', licenseUrl: img.license_url || '', commons: img.commons_page || '' };
  }
  return { source, translator, photo };
}
