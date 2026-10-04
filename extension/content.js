// Back/forward cache restores skip both DNR and webNavigation; ask the worker to re-check.
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  try { chrome.runtime.sendMessage({ type: 'recheck' }).catch(() => {}); } catch { /* extension reloaded */ }
});
