// DEV ONLY — in-memory stand-in for lockedind v1.2 (lists), used by app.html?mock=1 / blocked.html?mock=1
// when served outside the extension. background.js never imports this file.
//
// Query flags: locked=1 (start locked), mins=N (lock length), list=<id> (list of that lock),
// elapsed=N (the lock started N minutes ago), down=1, broken=1, stale=1.

import { ApiError } from '../lib/api.js';
import { cphDate, dateTimeInstant, occurrences, chainEnd, nextOccurrence } from '../lib/plan.js';
import { cphParts } from '../lib/time.js';

const locked423 = () => new ApiError(423, 'locked', 'Kan ikke ændres under en aktiv session.');
const bad = (m) => new ApiError(400, 'invalid', m);
const DAY = 24 * 60 * 60000;

export async function createMockApi(params = new URLSearchParams()) {
  const base = await fetch(new URL('./mock-status.json', import.meta.url)).then((r) => r.json());
  const installed = await fetch(new URL('./mock-installed.json', import.meta.url)).then((r) => r.json());
  const s = structuredClone(base);
  delete s._comment;
  for (const sc of s.schedules) { if (sc.date === 'TOMORROW') sc.date = cphDate(Date.now(), 1); sc.skip = sc.skip || []; }
  // planNow=1: a single period happening right now (for "frozen" during a lock).
  // planSoon=1: a single period starting in ~30 min (for the confirmation's overlap warning).
  if (params.get('planSoon') === '1') {
    const p2 = (n) => String(n).padStart(2, '0');
    const hm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    const r5 = (x) => { const [hh, mm] = x.split(':').map(Number); const m = Math.ceil(mm / 5) * 5; return m === 60 ? `${p2((hh + 1) % 24)}:00` : `${p2(hh)}:${p2(m)}`; };
    s.schedules.push({ id: 'soon1', name: '', weekdays: [], start: r5(hm(new Date(Date.now() + 30 * 60000))), end: r5(hm(new Date(Date.now() + 90 * 60000))), enabled: true, list: 'l2', date: cphDate(Date.now(), 0), skip: [] });
  }
  if (params.get('planNow') === '1') {
    const p2 = (n) => String(n).padStart(2, '0');
    const t = new Date(Date.now() - 30 * 60000), e = new Date(Date.now() + 60 * 60000);
    const hm = (d) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    const r5 = (x) => { const [hh, mm] = x.split(':').map(Number); const m = Math.floor(mm / 5) * 5; return `${p2(hh)}:${p2(m)}`; };
    s.schedules.push({ id: 'now1', name: '', weekdays: [], start: r5(hm(t)), end: r5(hm(e)), enabled: true, list: 'l2', date: cphDate(Date.now(), 0), skip: [] });
  }

  let until = params.get('locked') === '1' ? Date.now() + (+params.get('mins') || 95) * 60000 : null;
  let since = until ? Date.now() - (+params.get('elapsed') || 0) * 60000 : null;
  let timerLists = until ? [params.get('list') || s.lists[0].id] : [];
  if (params.get('broken') === '1') s.enforcement.pf = false;
  const stale = params.get('stale') === '1';
  const down = params.get('down') === '1';

  const isActive = () => until != null && until > Date.now();
  // The running lock: the timer, continued through any planned period it touches (like the daemon).
  const lockEnd = () => (isActive() ? chainEnd(Date.now(), until, occurrences(s.schedules, Date.now(), Date.now() + 2 * DAY)).end : null);
  const frozenIds = () => {
    const end = lockEnd();
    if (!end) return new Set();
    return new Set(occurrences(s.schedules, Date.now(), end).filter((o) => !o.skipped && o.start < end).map((o) => o.sc.id));
  };
  const activeLists = () => {
    if (!isActive()) return [];
    const ids = [...timerLists, ...s.schedules.filter((x) => frozenIds().has(x.id)).map((x) => x.list)];
    return [...new Set(ids)].filter((id) => s.lists.some((l) => l.id === id));
  };
  const listById = (id) => s.lists.find((l) => l.id === id) || (() => { throw new ApiError(404, 'not_found', 'Listen findes ikke.'); })();
  const guard = async () => {
    await new Promise((r) => setTimeout(r, 80));
    if (down) throw new ApiError(0, 'unreachable', 'LockedIn-tjenesten svarer ikke');
  };

  function lockUntil(t, list) {
    const start = isActive() ? since : Date.now();
    const end = Math.max(isActive() ? until : 0, t);
    if (end > start + DAY) throw bad('En samlet lås kan højst vare 24 timer.');
    const id = list && s.lists.some((l) => l.id === list) ? list : s.lists[0].id;
    if (!isActive()) timerLists = [];
    if (!timerLists.includes(id)) timerLists.push(id);
    since = start;
    until = end;
  }

  function nextSession() {
    const o = nextOccurrence(s.schedules, lockEnd() || Date.now());
    if (!o) return null;
    const l = s.lists.find((x) => x.id === o.sc.list);
    return {
      start: new Date(o.start).toISOString(), end: new Date(o.end).toISOString(), scheduleId: o.sc.id,
      name: o.sc.name, list: o.sc.list, listName: l ? l.name : '',
    };
  }

  function snapshot() {
    const now = new Date();
    const act = activeLists();
    const lists = s.lists.filter((l) => act.includes(l.id));
    const sitesOn = new Set(lists.flatMap((l) => l.sites));
    const appsOn = new Set(lists.flatMap((l) => l.apps));
    return structuredClone({
      ...s,
      now: now.toISOString(),
      active: isActive(),
      activeUntil: isActive() ? new Date(lockEnd()).toISOString() : null,
      activeSince: isActive() ? new Date(since).toISOString() : null,
      activeSources: isActive() ? ['timer', ...[...frozenIds()].map((id) => 'schedule:' + id)] : [],
      activeLists: act,
      schedules: s.schedules.map((x) => ({ ...x, frozen: frozenIds().has(x.id) })),
      nextSession: nextSession(),
      sites: s.sites.map((x) => ({ ...x, blocked: sitesOn.has(x.id) })),
      apps: s.apps.map((a) => ({ ...a, inActiveList: appsOn.has(a.bundleId) })),
      enforcement: {
        ...s.enforcement,
        lastTick: new Date(stale ? Date.now() - 600000 : Date.now() - 4000).toISOString(),
        lastHeartbeat: now.toISOString(),
      },
    });
  }

  const cleanName = (n) => {
    const name = String(n || '').trim();
    if (!name || name.length > 40) throw bad('Navnet skal være 1–40 tegn.');
    return name;
  };

  // Icons for own sites (the real ones come from the service worker). Never while the site is blocked.
  const icons = {};
  function drawIcon(domain) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    if (domain === 'x.com') {
      g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(18, 16); g.lineTo(46, 48); g.moveTo(46, 16); g.lineTo(18, 48); g.stroke();
    } else if (domain.endsWith('reddit.com')) {
      g.fillStyle = '#ff4500'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(32, 36, 18, 13, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff4500'; g.beginPath(); g.arc(25, 35, 3.4, 0, 7); g.arc(39, 35, 3.4, 0, 7); g.fill();
    } else {
      return null; // no icon found → the letter tile stays
    }
    return c.toDataURL('image/png');
  }
  async function fetchIcon(domain) {
    await new Promise((r) => setTimeout(r, 400));
    const site = s.sites.find((x) => x.suffixes.includes(domain));
    const blockedNow = site && activeLists().some((id) => listById(id).sites.includes(site.id));
    if (blockedNow) return { skipped: 'blocked' };
    const data = drawIcon(domain);
    icons[domain] = data ? { data, at: Date.now() } : { none: true, at: Date.now() };
    return icons[domain];
  }
  // Lazily, like the worker: own sites without an icon.
  setTimeout(() => { for (const x of s.sites.filter((y) => !y.builtin)) if (!icons[x.suffixes[0]]) fetchIcon(x.suffixes[0]); }, 300);

  return {
    icons: () => ({ ...icons }),
    fetchIcon,
    async status() { await guard(); return snapshot(); },
    async startSession(minutes, list) {
      await guard();
      if (!(minutes >= 1 && minutes <= 1440)) throw bad('Vælg mellem 1 minut og 24 timer.');
      lockUntil(Date.now() + minutes * 60000, list);
      return snapshot();
    },
    async startUntil(iso, list) {
      await guard();
      const t = Date.parse(iso);
      if (!/Z$/.test(iso) || !Number.isFinite(t) || t - Date.now() < 60000 || t - Date.now() > DAY) throw bad('Vælg et senere tidspunkt.');
      lockUntil(t, list);
      return snapshot();
    },
    async heartbeat() { await guard(); return { ok: true }; },

    async addList(name, sites = [], apps = []) {
      await guard();
      if (s.lists.length >= 20) throw bad('Der kan højst være 20 lister.');
      s.lists.push({
        id: 'l' + Math.random().toString(16).slice(2, 8), name: cleanName(name),
        sites: sites.filter((id) => s.sites.some((x) => x.id === id)), apps: apps.filter((id) => s.apps.some((a) => a.bundleId === id)),
      });
      return snapshot();
    },
    async putList(id, body) {
      await guard();
      const l = listById(id);
      const name = cleanName(body.name);
      const sites = (body.sites || []).filter((x) => s.sites.some((y) => y.id === x));
      const apps = (body.apps || []).filter((x) => s.apps.some((y) => y.bundleId === x));
      if (activeLists().includes(id) && (!l.sites.every((x) => sites.includes(x)) || !l.apps.every((x) => apps.includes(x)))) throw locked423();
      Object.assign(l, { name, sites, apps });
      return snapshot();
    },
    async deleteList(id) {
      await guard();
      listById(id);
      if (activeLists().includes(id)) throw locked423();
      if (s.lists.length <= 1) throw bad('Der skal være mindst én liste.');
      if (s.schedules.some((x) => x.list === id)) throw bad('Listen bruges af en planlagt periode.');
      s.lists = s.lists.filter((l) => l.id !== id);
      return snapshot();
    },

    async addSite(label, domain, list) {
      await guard();
      let site = s.sites.find((x) => x.suffixes.includes(domain));
      if (!site) {
        site = { id: 'c-' + domain.replace(/\./g, '-'), label: cleanName(label), builtin: false, blocked: false, mode: 'full', suffixes: [domain], exactHosts: [], regexFilters: [], allowHosts: [] };
        s.sites.push(site);
      }
      if (list) { const l = listById(list); if (!l.sites.includes(site.id)) l.sites.push(site.id); }
      return snapshot();
    },
    async deleteSite(id) {
      await guard();
      if (activeLists().some((l) => listById(l).sites.includes(id))) throw locked423();
      s.sites = s.sites.filter((x) => x.id !== id);
      for (const l of s.lists) l.sites = l.sites.filter((x) => x !== id);
      return snapshot();
    },
    async installed() { await guard(); return { apps: installed }; },
    async addApp(bundleId, list) {
      await guard();
      const a = installed.find((x) => x.bundleId === bundleId);
      if (!a) throw bad('Vælg en app fra listen.');
      if (!s.apps.some((x) => x.bundleId === bundleId)) s.apps.push({ bundleId, name: a.name, kind: a.kind, blocked: a.kind === 'browser' });
      if (list) { const l = listById(list); if (!l.apps.includes(bundleId)) l.apps.push(bundleId); }
      return snapshot();
    },
    async setAppBlocked(bundleId, blocked) {
      await guard();
      const a = s.apps.find((x) => x.bundleId === bundleId);
      if (!a) throw new ApiError(404, 'not_found', 'Appen findes ikke.');
      if (!blocked && a.kind === 'browser') throw bad('Andre browsere end Chrome er altid lukket under fokus.');
      if (!blocked && a.blocked && isActive()) throw locked423();
      a.blocked = blocked;
      return snapshot();
    },
    async deleteApp(bundleId) {
      await guard();
      if (isActive()) throw locked423();
      s.apps = s.apps.filter((x) => x.bundleId !== bundleId);
      return snapshot();
    },

    async addSchedule(body) {
      await guard();
      if (!s.lists.some((l) => l.id === body.list)) throw bad('Vælg en liste.');
      if (body.date && !(dateTimeInstant(body.date, body.start) > Date.now())) throw bad('En enkelt periode skal ligge i fremtiden.');
      s.schedules.push({ id: Math.random().toString(16).slice(2, 6), name: '', enabled: true, weekdays: [], date: null, skip: [], ...body });
      return snapshot();
    },
    async putSchedule(id, body) {
      await guard();
      const i = s.schedules.findIndex((x) => x.id === id);
      if (i < 0) throw new ApiError(404, 'not_found', 'Perioden findes ikke.');
      if (frozenIds().has(id)) throw locked423();
      s.schedules[i] = { ...s.schedules[i], ...body, id };
      return snapshot();
    },
    async deleteSchedule(id) {
      await guard();
      if (frozenIds().has(id)) throw locked423();
      s.schedules = s.schedules.filter((x) => x.id !== id);
      return snapshot();
    },
    async skip(id, date) {
      await guard();
      const sc = s.schedules.find((x) => x.id === id);
      if (!sc) throw new ApiError(404, 'not_found', 'Perioden findes ikke.');
      if (sc.date) throw bad('Kun ugentlige perioder kan springes over.');
      const occ = occurrences([sc], Date.now() - DAY, Date.now() + 15 * DAY).find((o) => o.date === date);
      if (!occ) throw bad('Perioden ligger ikke den dag.');
      if (frozenIds().has(id) && occ.start < lockEnd()) throw locked423();
      if (!sc.skip.includes(date)) sc.skip.push(date);
      return snapshot();
    },
    async unskip(id, date) {
      await guard();
      const sc = s.schedules.find((x) => x.id === id);
      if (!sc) throw new ApiError(404, 'not_found', 'Perioden findes ikke.');
      sc.skip = sc.skip.filter((d) => d !== date);
      return snapshot();
    },
  };
}
