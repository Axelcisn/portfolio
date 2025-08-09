// lib/yahoo.js
// Small, headered fetchers + resilient quote fallback (Yahoo -> Stooq)

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    // avoid over-aggressive caching on serverless
    cache: "no-store",
    headers: {
      "user-agent": UA,
      accept: "application/json,text/plain,*/*",
      ...init.headers,
    },
    ...init,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const err = new Error(`${res.status} ${res.statusText} on ${url}`);
    err.status = res.status;
    err.body = txt;
    throw err;
  }
  return res.json();
}

/** ---------- Yahoo endpoints ---------- **/

export async function yahooAutocomplete(q) {
  if (!q || !q.trim()) return [];
  const u =
    "https://query1.finance.yahoo.com/v1/finance/search?" +
    new URLSearchParams({
      q,
      lang: "en-US",
      region: "US",
      quotesCount: "10",
      newsCount: "0",
    }).toString();

  const j = await getJson(u);
  const quotes = Array.isArray(j?.quotes) ? j.quotes : [];
  return quotes.map((r) => ({
    symbol: r.symbol,
    name: r.shortname || r.longname || r.name || r.symbol,
    exch: r.exchange || r.exch,
    exchange: r.exchDisp || r.exchangeDisp || r.exchange,
    type: r.quoteType || r.typeDisp,
  }));
}

export async function yahooQuote(symbol) {
  const u =
    "https://query2.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbol);
  const j = await getJson(u);
  const r = j?.quoteResponse?.result?.[0];
  if (!r) throw new Error(`Yahoo: no result for ${symbol}`);

  return {
    symbol: r.symbol,
    name: r.shortName || r.longName || r.displayName || r.symbol,
    currency: r.currency || null,
    spot: typeof r.regularMarketPrice === "number" ? r.regularMarketPrice : null,
    high52: r.fiftyTwoWeekHigh ?? null,
    low52: r.fiftyTwoWeekLow ?? null,
    beta: r.beta ?? r.beta3Year ?? null,
    exchange: r.fullExchangeName || r.exchange || null,
  };
}

// Lightweight “live IV” placeholder.
// Keep it tolerant—if Yahoo denies, we just return null.
export async function yahooLiveIv(symbol, spot) {
  try {
    const u =
      "https://query2.finance.yahoo.com/v7/finance/quote?symbols=" +
      encodeURIComponent(symbol);
    const j = await getJson(u);
    const r = j?.quoteResponse?.result?.[0];
    // Yahoo doesn't give ATM IV directly for equities; use impliedVolatility if present.
    const iv =
      typeof r?.impliedVolatility === "number" ? r.impliedVolatility : null;
    return iv; // decimal (e.g., 0.30)
  } catch {
    return null;
  }
}

// Minimal daily closes for realized stats if you need them later.
export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  const u =
    "https://query1.finance.yahoo.com/v8/finance/chart/" +
    encodeURIComponent(symbol) +
    "?" +
    new URLSearchParams({ range, interval }).toString();
  const j = await getJson(u);
  const r = j?.chart?.result?.[0];
  const t = r?.timestamp || [];
  const c = r?.indicators?.quote?.[0]?.close || [];
  const out = [];
  for (let i = 0; i < Math.min(t.length, c.length); i++) {
    const close = c[i];
    if (typeof close === "number") out.push({ ts: t[i] * 1000, close });
  }
  return out;
}

/** ---------- Stooq fallback ---------- **/

// Try multiple market suffixes until one returns a valid close.
// We test several known mappings (US, Milan, Paris, London, Toronto, HK, etc.)
function stooqCandidates(ySymbol) {
  const s = String(ySymbol || "").toUpperCase().trim();
  if (!s) return [];

  // If Yahoo gave "BASE.SUF"
  const dot = s.indexOf(".");
  if (dot > 0) {
    const base = s.slice(0, dot);
    const suf = s.slice(dot + 1);

    switch (suf) {
      case "MI": // Borsa Italiana
        return [`${base}.mi`, `${base}.it`, base.toLowerCase()];
      case "PA": // Paris
        return [`${base}.fr`, `${base}.pa`, base.toLowerCase()];
      case "L": // London
        return [`${base}.gb`, `${base}.l`, base.toLowerCase()];
      case "DE": // Xetra/Frankfurt
        return [`${base}.de`, base.toLowerCase()];
      case "AS": // Amsterdam
        return [`${base}.nl`, `${base}.as`, base.toLowerCase()];
      case "MC": // Madrid
        return [`${base}.es`, `${base}.mc`, base.toLowerCase()];
      case "TO": // Toronto
        return [`${base}.to`, base.toLowerCase()];
      case "V": // TSXV
        return [`${base}.v`, base.toLowerCase()];
      case "HK": // Hong Kong
        return [`${base}.hk`, base.toLowerCase()];
      default:
        return [`${base}.${suf.toLowerCase()}`, base.toLowerCase()];
    }
  }

  // Bare ticker: assume US first, then the bare symbol.
  return [`${s}.us`, s.toLowerCase()];
}

// Currency guess by suffix (only used when we fall back to Stooq)
function currencyGuess(ySymbol) {
  const s = String(ySymbol || "").toUpperCase();
  if (s.endsWith(".MI") || s.endsWith(".PA") || s.endsWith(".MC")) return "EUR";
  if (s.endsWith(".L")) return "GBX"; // pence on many LSE listings
  if (s.endsWith(".TO") || s.endsWith(".V")) return "CAD";
  if (s.endsWith(".HK")) return "HKD";
  return "USD";
}

async function stooqSpotCore(code) {
  const url =
    "https://stooq.com/q/l/?" +
    new URLSearchParams({
      s: code,
      f: "sd2t2ohlcv", // includes "c" = close
      h: "1",
      e: "json",
    }).toString();

  const j = await getJson(url);
  const row = Array.isArray(j?.data) ? j.data[0] : null;
  const close = row && typeof row.close === "number" ? row.close : null;
  if (!close || !isFinite(close)) {
    const msg = row?.close ?? "N/A";
    const err = new Error(`Stooq: invalid close (${msg}) for ${code}`);
    err.code = code;
    throw err;
  }
  return close;
}

export async function stooqSpot(symbol) {
  const tries = stooqCandidates(symbol);
  let lastErr = null;
  for (const code of tries) {
    try {
      const px = await stooqSpotCore(code);
      return { spot: px, used: code };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Stooq: all candidates failed");
}

/** ---------- Unified quote with fallback ---------- **/

export async function robustQuote(symbol) {
  // 1) Try Yahoo with headers (works most of the time)
  try {
    const q = await yahooQuote(symbol);
    if (q.spot != null) return { ...q, via: "yahoo" };
    // If Yahoo gives no spot, still fall back for price only
  } catch (e) {
    // If not rate-limit (429), we still fall back—no log noise here
    // console.warn("Yahoo quote failed:", e?.status || "", e?.message);
  }

  // 2) Fall back to Stooq for spot, and keep Yahoo-derived name/currency if possible
  let name = null;
  let currency = currencyGuess(symbol);
  try {
    const y = await yahooAutocomplete(symbol);
    if (y?.[0]) {
      name = y[0].name || name;
      // rough currency hint by exchange, but we already guessed above
    }
  } catch {}

  const s = await stooqSpot(symbol);
  return {
    symbol,
    name: name || symbol,
    currency,
    spot: s.spot,
    high52: null,
    low52: null,
    beta: null,
    exchange: null,
    via: `stooq:${s.used}`,
  };
}
