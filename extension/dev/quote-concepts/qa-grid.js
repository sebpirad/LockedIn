// DEV ONLY. See qa-grid.html.
const p = new URLSearchParams(location.search);
const w = +p.get('w') || 1440, h = +p.get('h') || 900, cols = +p.get('cols') || 3;
const ids = (p.get('ids') || '').split(',').filter(Boolean);
const scale = (innerWidth - (cols - 1) * 4) / cols / w;
document.body.style.gridTemplateColumns = `repeat(${cols}, ${w * scale}px)`;
for (const id of ids) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.style.width = `${w * scale}px`; cell.style.height = `${h * scale}px`;
  const f = document.createElement('iframe');
  f.width = w; f.height = h;
  // transform keeps the page's exact layout (zoom re-measures the type at the small size and moves line breaks)
  f.style.transform = `scale(${scale})`;
  f.src = `../../blocked.html?mock=1&q=${id}`;
  const label = document.createElement('b');
  label.textContent = id;
  cell.append(f, label);
  document.body.append(cell);
}
