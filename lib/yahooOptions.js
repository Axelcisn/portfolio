// lib/yahooOptions.js
// Lightweight Yahoo Options helpers (kept separate from your existing yahoo.js)
// Exports:
//   - getExpiries(symbol) -> Promise<number[]>  (unix seconds)
//   - getOptionsChain(symbol, date?) -> Promise<NormalizedChain>

const Y_BASE = "https://query2.finance.yahoo.com";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function jfetch(url, init = {}) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

/** Return list of expiry dates (unix seconds) for a ticker. */
export async function getExpiries(symbol) {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");
  const u = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
  const j = await jfetch(u);
  const res = j?.optionChain?.result?.[0];
  const arr = Array.isArray(res?.expirationDates) ? res.expirationDates : [];
  // de-dup + sort ascending
  return [...new Set(arr)].sort((a, b) => a - b);
}

/**
 * Fetch options chain for a given ticker/expiry and return a normalized structure
 * suitable for UIs (numbers parsed, sorted by strike).
 *
 * NormalizedChain shape:
 * {
 *   symbol, expiry, quote: { spot, currency },
 *   calls: [{ strike, bid, ask, last, iv, volume, oi }],
 *   puts:  [{ ...same }]
 * }
 */
export async function getOptionsChain(symbol, date /* unix seconds, optional */) {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");

  let u = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
  if (Number.isFinite(date)) u += `?date=${date}`;

  // if specific date fails, we’ll try first available expiry
  let j;
  try {
    j = await jfetch(u);
  } catch (e) {
    if (!Number.isFinite(date)) throw e;
    // request with date failed → retry without date to get the default payload
    j = await jfetch(`${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`);
  }

  const chain = j?.optionChain?.result?.[0];
  if (!chain) throw new Error("Yahoo options: empty payload");

  // If payload didn’t include our requested date, fallback to first available
  const exp = Number.isFinite(date)
    ? date
    : Number(chain?.expirationDates?.[0]) || null;

  const q = chain?.quote || {};
  const spot =
    num(q.regularMarketPrice) ??
    num(q.postMarketPrice) ??
    num(q.bid) ??
    num(q.ask);

  const node =
    (Array.isArray(chain?.options) && chain.options[0]) ||
    { calls: [], puts: [] };

  const norm = (arr = []) =>
    arr
      .map((o) => ({
        strike: num(o.strike),
        bid: num(o.bid),
        ask: num(o.ask),
        last: num(o.lastPrice),
        iv: num(o.impliedVolatility), // already annualized at Yahoo
        volume: num(o.volume),
        oi: num(o.openInterest),
      }))
      .filter((x) => Number.isFinite(x.strike))
      .sort((a, b) => a.strike - b.strike);

  return {
    symbol: q.symbol || sym.toUpperCase(),
    expiry: exp,
    quote: { spot: spot ?? null, currency: q.currency || null },
    calls: norm(node.calls),
    puts: norm(node.puts),
  };
}
