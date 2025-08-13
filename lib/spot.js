// lib/spot.js
/**
 * Canonical spot fetcher for the whole app (client-friendly).
 * - Pulls from your normalized /api/company endpoint
 * - Module-scoped micro-cache (TTL) to keep S consistent across views
 * - Optional nocache bypass for a forced refresh
 *
 * Returns:
 * {
 *   symbol, currency, spot, prevClose,
 *   change, changePct, session, lastUpdated
 * }
 */

const CACHE_TTL_MS = 30 * 1000; // 30s: short, avoids spam & keeps S aligned
const _cache = new Map(); // symbol -> { data, ts }

/** Clear cache (all or one symbol) */
export function clearSpotCache(symbol) {
  if (!symbol) {
    _cache.clear();
    return;
  }
  _cache.delete(String(symbol).trim().toUpperCase());
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function robustSpot(symbol, { nocache = false } = {}) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  // serve from cache if fresh
  const hit = _cache.get(sym);
  if (!nocache && hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }

  const url =
    `/api/company?symbol=${encodeURIComponent(sym)}` +
    (nocache ? "&nocache=1" : "");

  let payload;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();

    const spot = num(j?.spot);
    const prev = num(j?.prevClose);
    const change = (spot != null && prev != null) ? (spot - prev) : num(j?.change);
    const changePct =
      (spot != null && prev != null && prev > 0)
        ? (change / prev) * 100
        : num(j?.changePct);

    payload = {
      symbol: j?.symbol || sym,
      currency: j?.currency || "USD",
      spot,
      prevClose: prev,
      change,
      changePct,
      session: j?.marketSession || j?.session || "At close",
      lastUpdated: Date.now(),
    };
  } catch {
    // graceful fallback shape
    payload = {
      symbol: sym,
      currency: "USD",
      spot: null,
      prevClose: null,
      change: null,
      changePct: null,
      session: "At close",
      lastUpdated: Date.now(),
    };
  }

  _cache.set(sym, { data: payload, ts: Date.now() });
  return payload;
}
