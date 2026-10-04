// DEV ONLY — in-memory stand-in for lockedind, used by app.html?mock=1 and blocked.html?mock=1.
// Feeds the UI only. background.js never imports this file, so it cannot affect blocking.
//
// Query flags: locked=1 (start locked), mins=N (lock length), down=1 (daemon unreachable),
// broken=1 (enforcement problem), stale=1 (daemon tick is old).

import { ApiError } from '../lib/api.js';

const locked423 = () => new ApiError(423, 'locked', 'Kan ikke ændres under en aktiv session.');

export async function createMockApi(params = new URLSearchParams()) {
  const base = await fetch(new URL('./mock-status.json', import.meta.url)).then((r) => r.json());
  const installed = await fetch(new URL('./mock-installed.json', import.meta.url)).then((r) => r.json());
  const s = structuredClone(base);
  delete s._comment;
  let until = params.get('locked') === '1' ? Date.now() + (+params.get('mins') || 95) * 60000 : null;
  if (params.get('broken') === '1') s.enforcement.pf = false;
  const stale = params.get('stale') === '1';
  const down = params.get('down') === '1';

  const isActive = () => until != null && until > Date.now();
  const delay = () => new Promise((r) => setTimeout(r, 120));
  async function guard() {
    await delay();
    if (down) throw new ApiError(0, 'unreachable', 'Locked in-tjenesten svarer ikke');
  }

  function nextSession() {
    // Good enough for a mock: next enabled schedule, from tomorrow.
    const sc = s.schedules.find((x) => x.enabled);
    if (!sc) return null;
    const d = new Date(Date.now() + 86400000);
    const [sh, sm] = sc.start.split(':').map(Number);
    const [eh, em] = sc.end.split(':').map(Number);
    const start = new Date(d); start.setHours(sh, sm, 0, 0);
    const end = new Date(d); end.setHours(eh, em, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString(), scheduleId: sc.id, name: sc.name };
  }

  function snapshot() {
    const now = new Date();
    const active = isActive();
    return structuredClone({
      ...s,
      now: now.toISOString(),
      active,
      activeUntil: active ? new Date(until).toISOString() : null,
      activeSources: active ? ['timer'] : [],
      nextSession: nextSession(),
      enforcement: {
        ...s.enforcement,
        lastTick: new Date(stale ? Date.now() - 600000 : Date.now() - 4000).toISOString(),
        lastHeartbeat: now.toISOString(),
      },
    });
  }

  const findSite = (id) => s.sites.find((x) => x.id === id) || (() => { throw new ApiError(404, 'not_found', 'Siden findes ikke.'); })();
  const findApp = (id) => s.apps.find((x) => x.bundleId === id) || (() => { throw new ApiError(404, 'not_found', 'Appen findes ikke.'); })();

  return {
    async status() { await guard(); return snapshot(); },
    async startSession(minutes) {
      await guard();
      if (!(minutes >= 1 && minutes <= 1440)) throw new ApiError(400, 'invalid', 'Vælg mellem 1 minut og 24 timer.');
      until = Math.max(isActive() ? until : 0, Date.now() + minutes * 60000);
      return snapshot();
    },
    async startUntil(iso) {
      await guard();
      const t = Date.parse(iso);
      if (!/Z$/.test(iso) || !Number.isFinite(t) || t - Date.now() < 60000 || t - Date.now() > 1440 * 60000) {
        throw new ApiError(400, 'invalid', 'Vælg et senere tidspunkt.');
      }
      until = Math.max(isActive() ? until : 0, t);
      return snapshot();
    },
    async heartbeat() { await guard(); return { ok: true }; },
    async addSite(label, domain) {
      await guard();
      if (s.sites.some((x) => x.suffixes.includes(domain))) throw new ApiError(400, 'invalid', 'Domænet er allerede på listen.');
      s.sites.push({ id: 'c-' + domain, label, builtin: false, blocked: true, mode: 'full', suffixes: [domain], exactHosts: [], regexFilters: [], allowHosts: [] });
      return snapshot();
    },
    async setSiteBlocked(id, blocked) {
      await guard();
      if (!blocked && isActive()) throw locked423();
      findSite(id).blocked = blocked;
      return snapshot();
    },
    async deleteSite(id) {
      await guard();
      if (isActive()) throw locked423();
      if (findSite(id).builtin) throw new ApiError(400, 'invalid', 'Indbyggede sider kan ikke slettes, kun slås fra.');
      s.sites = s.sites.filter((x) => x.id !== id);
      return snapshot();
    },
    async installed() { await guard(); return { apps: installed }; },
    async addApp(bundleId) {
      await guard();
      const a = installed.find((x) => x.bundleId === bundleId);
      if (!a) throw new ApiError(404, 'not_found', 'Appen findes ikke.');
      s.apps.push({ bundleId, name: a.name, kind: a.kind, blocked: true });
      return snapshot();
    },
    async setAppBlocked(bundleId, blocked) {
      await guard();
      if (!blocked && findApp(bundleId).kind === 'browser') throw new ApiError(400, 'invalid', 'Andre browsere lukkes altid under fokus.');
      if (!blocked && isActive()) throw locked423();
      findApp(bundleId).blocked = blocked;
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
      s.schedules.push({ id: Math.random().toString(16).slice(2, 6), ...body });
      return snapshot();
    },
    async putSchedule(id, body) {
      await guard();
      if (isActive()) throw locked423();
      const i = s.schedules.findIndex((x) => x.id === id);
      if (i < 0) throw new ApiError(404, 'not_found', 'Planen findes ikke.');
      s.schedules[i] = { id, ...body };
      return snapshot();
    },
    async deleteSchedule(id) {
      await guard();
      if (isActive()) throw locked423();
      s.schedules = s.schedules.filter((x) => x.id !== id);
      return snapshot();
    },
  };
}
