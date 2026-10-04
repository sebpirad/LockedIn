// Client for the lockedind API (docs/API.md). Used by the service worker and the control page.

export const DAEMON = 'http://127.0.0.1:919';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const UNREACHABLE = 'Locked in-tjenesten svarer ikke';

export function createApi({ base = DAEMON, fetchImpl = (...a) => fetch(...a), timeoutMs = 4000 } = {}) {
  async function call(method, path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: body === undefined
          ? { 'X-LockedIn': '1' }
          : { 'X-LockedIn': '1', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: ctrl.signal,
      });
    } catch {
      throw new ApiError(0, 'unreachable', UNREACHABLE);
    } finally {
      clearTimeout(timer);
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty or non-JSON body */ }
    if (!res.ok) {
      const msg = data && typeof data.message === 'string' && data.message
        ? data.message
        : `Locked in-tjenesten svarede med fejl ${res.status}`;
      throw new ApiError(res.status, (data && data.error) || 'http_' + res.status, msg);
    }
    return data;
  }
  const enc = encodeURIComponent;
  return {
    status: () => call('GET', '/v1/status'),
    startSession: (minutes) => call('POST', '/v1/session', { minutes }),
    startUntil: (isoUntil) => call('POST', '/v1/session', { until: isoUntil }),
    heartbeat: (extensionVersion) => call('POST', '/v1/heartbeat', { extensionVersion }),
    addSite: (label, domain) => call('POST', '/v1/sites', { label, domain }),
    setSiteBlocked: (id, blocked) => call('PATCH', `/v1/sites/${enc(id)}`, { blocked }),
    deleteSite: (id) => call('DELETE', `/v1/sites/${enc(id)}`),
    installed: () => call('GET', '/v1/installed'),
    addApp: (bundleId) => call('POST', '/v1/apps', { bundleId }),
    setAppBlocked: (bundleId, blocked) => call('PATCH', `/v1/apps/${enc(bundleId)}`, { blocked }),
    deleteApp: (bundleId) => call('DELETE', `/v1/apps/${enc(bundleId)}`),
    addSchedule: (s) => call('POST', '/v1/schedules', s),
    putSchedule: (id, s) => call('PUT', `/v1/schedules/${enc(id)}`, s),
    deleteSchedule: (id) => call('DELETE', `/v1/schedules/${enc(id)}`),
  };
}

/** Minimal shape check so a garbage body is treated like "unreachable" rather than "inactive". */
export function isValidStatus(s) {
  return !!s && typeof s === 'object' && typeof s.active === 'boolean'
    && Array.isArray(s.sites) && Array.isArray(s.apps) && Array.isArray(s.schedules);
}
