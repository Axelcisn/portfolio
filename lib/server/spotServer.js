// lib/server/spotServer.js
// Node-only canonical spot fetcher with micro-cache.
// Reuse in API routes to keep S consistent across the app.

export const runtime = "nodejs"; // explicit intent (for API routes that import us)

const TTL_MS = 30 * 1000; // 30s
const UA =
  "Mozilla/5.0 (StrategyApp; Node) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

const _cache = new Map(); // SYM -> { data, ts }

function now() { return Date.now(); }
function fresh(entry) { return entry && (now() - entry.ts) < TTL_MS; }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }

export function clearCanonicalSpotCache(symbol) {
  if (!symbol) { _cache.clear(); return; }
  _cache.delete(String(symbol).trim().toUpperCase());
}

/* -------------- Yahoo helpers (same shape as /api/company) -------------- */

function normFromQuote(q, symbol) {
  if (!q) return null;
  const spot = num(
    q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? q.bid ?? q.ask
  );
  const prev = num(q.regularMarketPreviousClose ?? q.previousClose);
  const change = (spot != null && prev != null) ? (spot - prev) : num(q.regularMarketChange);
  const changePct =
    (spot != null && prev != null && prev > 0)
      ? ((spot - prev) / prev) * 100
      : num(q.regularMarketChangePercent);

  const marketState = (q.marketState || "").toUpperCase();
  const session =
    marketState === "PRE" ? "Pre-market" :
    marketState === "POST" ? "After hours" : "At close";

  return {
    symbol: q.symbol || symbol,
    currency: q.currency || "USD",
    spot, prevClose: prev, change, changePct,
    session,
  };
}

function normFromChart(meta, symbol) {
  if (!meta) return null;
  const spot = num(meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose);
  const prev  = num(meta.chartPreviousClose ?? meta.previousClose);
  const change = (spot != null && prev != null) ? (spot - prev) : null;
  const changePct =
    (spot != null && prev != null && prev > 0) ? (change / prev) * 100 : null;

  return {
    symbol: meta.symbol || symbol,
    currency: meta.currency || "USD",
    spot, prevClose: prev, change, changePct,
    session: "At close",
  };
}

async function yahoo(symbol) {
  // 1) quote on query2
  {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) {
      const j = await r.json();
      const q = j?.quoteResponse?.result?.[0];
      const n = normFromQuote(q, symbol);
      if (n?.spot != null) return n;
    }
  }
  // 2) quote on query1 (alt CDN)
  {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) {
      const j = await r.json();
      const q = j?.quoteResponse?.result?.[0];
      const n = normFromQuote(q, symbol);
      if (n?.spot != null) return n;
    }
  }
  // 3) chart meta
  {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json" } });
    if (r.ok) {
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      const n = normFromChart(meta, symbol);
      if (n?.spot != null) return n;
    }
  }
  return null;
}

/* Stooq fallback (very permissive) */
async function stooq(symbol) {
  const s = symbol.includes(".") ? symbol.toLowerCase() : `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const txt = await r.text();
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  const close = num(cols[6]);
  if (close == null) return null;
  return {
    symbol,
    currency: "USD",
    spot: close,
    prevClose: null,
    change: null,
    changePct: null,
    session: "At close",
  };
}

/* -------------- Public API -------------- */

/**
 * Fetch canonical spot for `symbol`.
 * @param {string} symbol
 * @param {{ nocache?: boolean }} opts
 */
export async function getCanonicalSpot(symbol, { nocache = false } = {}) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  // cache hit
  const hit = _cache.get(sym);
  if (!nocache && fresh(hit)) return hit.data;

  let data = null;
  try { data = await yahoo(sym); } catch {}
  if (!data) {
    try { data = await stooq(sym); } catch {}
  }
  if (!data) {
    data = { symbol: sym, currency: "USD", spot: null, prevClose: null, change: null, changePct: null, session: "At close" };
  }
  const out = { ...data, ts: now() };
  _cache.set(sym, { data: out, ts: now() });
  return out;
}
