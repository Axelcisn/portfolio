// lib/spot.js
/**
 * Canonical spot fetcher for the whole app.
 * - Uses your normalized /api/company endpoint
 * - Optional nocache bypass for forced refreshes
 * - Returns a consistent shape + `ts` for "Last updated"
 *
 * Shape:
 * {
 *   symbol, currency, spot, prevClose,
 *   change, changePct, session, ts
 * }
 */
export async function robustSpot(symbol, { nocache = false } = {}) {
  if (!symbol) throw new Error("symbol required");

  const url =
    `/api/company?symbol=${encodeURIComponent(symbol)}` +
    (nocache ? `&nocache=1` : "");

  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json();

  // Normalize numbers
  const spot = Number(j?.spot);
  const prev = Number(j?.prevClose);
  const change = Number.isFinite(spot) && Number.isFinite(prev)
    ? (spot - prev)
    : (Number(j?.change) || null);

  const changePct = Number.isFinite(spot) && Number.isFinite(prev) && prev > 0
    ? (change / prev) * 100
    : (Number(j?.changePct) || null);

  return {
    symbol: j?.symbol || symbol,
    currency: j?.currency || "USD",
    spot: Number.isFinite(spot) ? spot : null,
    prevClose: Number.isFinite(prev) ? prev : null,
    change,
    changePct,
    session: j?.marketSession || "At close",
    ts: Date.now(),
  };
}
