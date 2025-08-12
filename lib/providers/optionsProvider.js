// lib/providers/optionsProvider.js
// Provider-agnostic interface for option data.
// For now this uses Yahoo's public endpoints directly.
// Next step: swap fetches to a robust session wrapper (cookie/crumb w/ retry).

const Y_BASE = "https://query2.finance.yahoo.com";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function jfetch(url) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      // UA helps avoid some stricter CDNs
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Referer: "https://finance.yahoo.com/",
    },
  });
  if (!r.ok) throw new Error(`Yahoo ${r.status} ${r.statusText}`);
  return r.json();
}

/**
 * Return a list of ISO dates (YYYY-MM-DD) representing available expiries.
 * @param {string} symbol
 * @returns {Promise<string[]>}
 */
export async function getExpiries(symbol) {
  const sym = String(symbol || "").trim();
  if (!sym) return [];

  const u = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
  const j = await jfetch(u);
  const root = j?.optionChain?.result?.[0];

  const unixList = Array.isArray(root?.expirationDates)
    ? root.expirationDates
    : [];

  return unixList
    .map((s) => new Date(Number(s) * 1000))
    .filter((d) => Number.isFinite(d?.getTime()))
    .map((d) => d.toISOString().slice(0, 10));
}

/**
 * Fetch one option chain for a symbol/date and normalize fields.
 * @param {string} symbol
 * @param {string} dateISO - YYYY-MM-DD (optional; nearest expiry if omitted)
 * @returns {Promise<{calls: any[], puts: any[], meta: {symbol:string, currency:string|null, spot:number|null, expiry:string|null}}>}
 */
export async function getChain(symbol, dateISO) {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");

  let qs = "";
  if (dateISO) {
    const d = new Date(dateISO);
    if (Number.isFinite(d.getTime())) {
      const unix = Math.floor(d.getTime() / 1000);
      qs = `?date=${unix}`;
    }
  }

  const url = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}${qs}`;
  const j = await jfetch(url);
  const root = j?.optionChain?.result?.[0];
  if (!root) throw new Error("empty chain");

  const q = root.quote || {};
  const node = (root.options && root.options[0]) || {};
  const calls = Array.isArray(node.calls) ? node.calls : [];
  const puts = Array.isArray(node.puts) ? node.puts : [];

  const mapOpt = (o) => ({
    strike: num(o?.strike),
    bid: num(o?.bid),
    ask: num(o?.ask),
    price: num(o?.lastPrice ?? o?.last ?? o?.regularMarketPrice),
    ivPct:
      num(o?.impliedVolatility) != null ? num(o.impliedVolatility) * 100 : null,
    volume: num(o?.volume),
    openInterest: num(o?.openInterest),
  });

  const expiryUnix = num(node?.expiration);
  const expiry =
    expiryUnix != null
      ? new Date(expiryUnix * 1000).toISOString().slice(0, 10)
      : null;

  const spot =
    num(q.regularMarketPrice) ??
    num(q.postMarketPrice) ??
    num(q.bid) ??
    num(q.ask);

  return {
    calls: calls.map(mapOpt).filter((x) => x.strike != null),
    puts: puts.map(mapOpt).filter((x) => x.strike != null),
    meta: {
      symbol: q?.symbol || sym.toUpperCase(),
      currency: q?.currency || null,
      spot: spot ?? null,
      expiry,
    },
  };
}
