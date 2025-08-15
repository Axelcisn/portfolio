// components/Strategy/statsBus.js
// Tiny event-bus so Strategy (StatsRail) can broadcast context to ChainTable.

export const STATS_CTX_EVENT = "stats:ctx:update";

export function publishStatsCtx(ctx) {
  try {
    window.__statsCtx = ctx;
    window.dispatchEvent(new CustomEvent(STATS_CTX_EVENT, { detail: ctx }));
  } catch {}
}

export function subscribeStatsCtx(listener) {
  const handler = (e) => listener(e.detail);
  window.addEventListener(STATS_CTX_EVENT, handler);
  // push current snapshot immediately (if any)
  if (window.__statsCtx) listener(window.__statsCtx);
  return () => window.removeEventListener(STATS_CTX_EVENT, handler);
}

export function snapshotStatsCtx() {
  return typeof window !== "undefined" ? window.__statsCtx || null : null;
}
