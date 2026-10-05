// DEV ONLY. See d2-frame.html.
const p = new URLSearchParams(location.search);
const src = /^d2-[ab]\.html$/.test(p.get('src') || '') ? p.get('src') : 'd2-a.html';
const w = +p.get('w') || 390, h = +p.get('h') || 844;
['src', 'w', 'h'].forEach((k) => p.delete(k));
const f = document.createElement('iframe');
f.width = w; f.height = h;
f.src = `${src}?${p}`;
document.body.append(f);
