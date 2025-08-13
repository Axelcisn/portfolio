// lib/fx.js
// Lightweight FX helper for USD/EUR/GBP with a 30m TTL cache.
// Usage:
//   const { rate } = await fxRate('USD', 'EUR');        // multiplier
//   const eur = await convert(100, 'USD', 'EUR');       // -> 100 * rate
//
// Notes:
// - Tries Yahoo pair quote first (e.g., USDGBP=X or GBPUSD=X), then exchangerate.host
// - Cache key: "USD->EUR"; value { rate, source, ts }

const TTL_MS = 30 * 60 * 1000;

// Module-scoped cache
const _fxCache = new Map();

const UA =
  "Mozilla/5.0 (StrategyApp; Node) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const CCY = new Set(["USD", "EUR", "GBP"]);

function normCcy(s) {
  const k = String(s || "").trim().toUpperCase();
  if (!CCY.has(k)) throw new Error(`Unsupported currency: ${s}`);
  return k;
}

function fresh(rec) {
  return rec && (Date.now() - rec.ts) < TTL_MS && Number.isFinite(rec.rate) && rec.rate > 0;
}

async function yahooPairRate(base, target) {
  // Try direct pair first (BASE+TARGET=X). If missing, try inverted and flip.
  const direct = `${base}${target}=X`;
  const inverted = `${target}${base}=X`;

  // Helper to fetch a single pair
  const hit = async (symbol) => {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json().catch(() => ({}));
    const q = j?.quoteResponse?.result?.[0];
    const px =
      Number(q?.regularMarketPrice) ??
      Number(q?.postMarketPrice) ??
      Number(q?.preMarketPrice);
    return Number.isFinite(px) && px > 0 ? px : null;
  };

  let px = await hit(direct);
  if (px != null) return { rate: px, source: "yahoo:direct" };

  px = await hit(inverted);
  if (px != null) return { rate: 1 / px, source: "yahoo:invert" };

  return null;
}

async function hostRate(base, target) {
  // exchangerate.host has permissive CORS + no key
  const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(
    target
  )}`;
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  const px = Number(j?.rates?.[target]);
  return Number.isFinite(px) && px > 0 ? { rate: px, source: "host" } : null;
}

/**
 * Get the multiplier to convert BASE → TARGET (e.g., USD→EUR).
 * Returns { rate, source, ts }.
 */
export async function fxRate(base, target) {
  const from = normCcy(base);
  const to = normCcy(target);

  // Identity
  if (from === to) return { rate: 1, source: "identity", ts: Date.now() };

  const key = `${from}->${to}`;
  const cached = _fxCache.get(key);
  if (fresh(cached)) return cached;

  // Try Yahoo, then exchangerate.host
  let rec = await yahooPairRate(from, to);
  if (!rec) rec = await hostRate(from, to);

  // Final fallback: if still nothing, try going through EUR (only for USD↔GBP)
  if (!rec && (from === "USD" || from === "GBP") && (to === "USD" || to === "GBP")) {
    // USD→GBP ≈ USD→EUR * EUR→GBP
    const a = await fxRate(from, "EUR");
    const b = await fxRate("EUR", to);
    if (a?.rate && b?.rate) rec = { rate: a.rate * b.rate, source: "composed", ts: Date.now() };
  }

  // If everything failed, throw (caller can decide to keep source currency)
  if (!rec) throw new Error(`FX rate unavailable: ${from}->${to}`);

  const out = { rate: rec.rate, source: rec.source, ts: Date.now() };
  _fxCache.set(key, out);
  return out;
}

/** Convert an amount from BASE to TARGET using fxRate. */
export async function convert(amount, base, target) {
  const { rate } = await fxRate(base, target);
  const n = Number(amount);
  return Number.isFinite(n) ? n * rate : NaN;
}
