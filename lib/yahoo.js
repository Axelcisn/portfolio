// Lightweight helpers to hit Yahoo's (unofficial) JSON endpoints safely from the server.
// NOTE: These endpoints are undocumented and can change; we add headers + guards.

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function yjson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept": "application/json", "Referer": "https://finance.yahoo.com" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo error ${res.status} on ${url}`);
  return await res.json();
}

// --- Endpoints ---
// Search
export async function yahooSearch(q) {
  const u = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0&lang=en-US&region=US`;
  const j = await yjson(u);
  const quotes = j?.quotes ?? [];
  return quotes.map(q => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.name || q.symbol,
    exch: q.exchDisp || q.exchange || "",
    type: q.quoteType || "",
    currency: q.currency || null,
  }));
}

// Quote (price, currency, beta, 52w, name)
export async function yahooQuote(symbol) {
  const u = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const j = await yjson(u);
  const r = j?.quoteResponse?.result?.[0];
  if (!r) throw new Error("Symbol not found");
  return {
    symbol: r.symbol,
    name: r.longName || r.shortName || r.symbol,
    spot: r.regularMarketPrice ?? null,
    currency: r.currency || null,
    high52: r.fiftyTwoWeekHigh ?? null,
    low52: r.fiftyTwoWeekLow ?? null,
    beta: r.beta ?? r.beta3Year ?? r.beta5Year ?? null,
  };
}

// Options → pick ATM-ish IV for the nearest sane expiry
export async function yahooLiveIv(symbol, spot) {
  const base = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
  const root = await yjson(base); // to read expirationDates
  const exps = root?.optionChain?.result?.[0]?.expirationDates || [];
  if (!exps.length) return null;

  const now = Math.floor(Date.now() / 1000);
  // pick the first expiry at least ~14 days out, else the nearest future one
  let chosen = exps.find(t => t - now >= 14 * 86400) ?? exps[0];
  const j = await yjson(`${base}?date=${chosen}`);
  const opt = j?.optionChain?.result?.[0];
  if (!opt) return null;

  // find strike nearest spot among calls and puts; average their IVs if both exist
  const calls = opt.options?.[0]?.calls ?? [];
  const puts  = opt.options?.[0]?.puts  ?? [];
  const nearest = (arr) => {
    let best = null, bd = Infinity;
    for (const x of arr) {
      const d = Math.abs(x.strike - spot);
      if (d < bd && Number.isFinite(x.impliedVolatility)) { bd = d; best = x; }
    }
    return best;
  };
  const c = nearest(calls);
  const p = nearest(puts);
  if (c && p) return (c.impliedVolatility + p.impliedVolatility) / 2; // decimal (e.g., 0.31)
  if (c) return c.impliedVolatility;
  if (p) return p.impliedVolatility;
  return null;
}

// Chart (daily closes)
export async function yahooDailyCloses(symbol, range="1y", interval="1d") {
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
  const j = await yjson(u);
  const r = j?.chart?.result?.[0];
  if (!r) throw new Error("No chart data");
  const t = r.timestamp ?? [];
  const c = r.indicators?.quote?.[0]?.close ?? [];
  return t.map((ts, i) => ({ t: ts * 1000, close: c[i] })).filter(x => Number.isFinite(x.close));
}
