// lib/yahoo.js
// Yahoo-first helpers with resilient fallbacks (Stooq).
// No API keys. Designed for Vercel serverless.
//
// Exports (same names you already use):
// - yahooSearch(q)
// - yahooQuote(symbol)
// - yahooLiveIv(symbol, spot)
// - yahooDailyCloses(symbol, range = "1y", interval = "1d")

const YF_HOSTS = [
  "https://query2.finance.yahoo.com",
  "https://query1.finance.yahoo.com",
];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "application/json,text/plain,*/*",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function swapHost(u) {
  try {
    const url = new URL(u);
    if (url.host.startsWith("query2")) url.host = url.host.replace("query2", "query1");
    else if (url.host.startsWith("query1")) url.host = url.host.replace("query1", "query2");
    return url.toString();
  } catch {
    return u;
  }
}

async function fetchJSON(url, { tries = 3, delay = 350 } = {}) {
  let lastErr;
  let u = url;

  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(u, {
        method: "GET",
        headers: HEADERS,
        cache: "no-store",
      });

      // 2xx
      if (res.ok) return await res.json();

      // Retryable statuses
      if (res.status === 429 || res.status === 403 || res.status === 502 || res.status === 503) {
        lastErr = new Error(`HTTP ${res.status}`);
        // swap host and backoff with jitter
        u = swapHost(u);
        await sleep(delay + Math.floor(Math.random() * 250));
        continue;
      }

      // Non-retryable
      const txt = await res.text().catch(() => "");
      const err = new Error(txt || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    } catch (e) {
      lastErr = e;
      // backoff and try swap
      u = swapHost(u);
      await sleep(delay + Math.floor(Math.random() * 250));
    }
  }
  throw lastErr ?? new Error("Network error");
}

/* ---------------------------- SEARCH (suggest) ---------------------------- */

export async function yahooSearch(q) {
  const term = String(q || "").trim();
  if (!term) return [];

  const url = `${YF_HOSTS[0]}/v1/finance/search?q=${encodeURIComponent(term)}&quotesCount=8&newsCount=0`;
  try {
    const j = await fetchJSON(url, { tries: 3 });
    const quotes = j?.quotes || j?.items || [];
    return quotes
      .filter((x) => x?.symbol)
      .slice(0, 8)
      .map((x) => ({
        symbol: x.symbol,
        name: x.longname || x.shortname || x.name || "",
        exchange: x.exch || x.exchange || "",
        currency: x.currency || x.ccy || "",
      }));
  } catch {
    // Fallback: return the raw term as a single option so the user can still confirm.
    return [{ symbol: term.toUpperCase(), name: "", exchange: "", currency: "" }];
  }
}

/* ----------------------------- QUOTE (spot, beta) ----------------------------- */

function inferCurrencyFromSuffix(sym) {
  const s = String(sym || "").toUpperCase();
  if (s.endsWith(".MI") || s.endsWith(".PA") || s.endsWith(".BR") || s.endsWith(".DE") || s.endsWith(".AS"))
    return "EUR";
  if (s.endsWith(".L")) return "GBP";
  if (s.endsWith(".HK")) return "HKD";
  if (s.endsWith(".T")) return "JPY";
  if (s.endsWith(".TO") || s.endsWith(".V")) return "CAD";
  if (s.endsWith(".AX")) return "AUD";
  if (s.endsWith(".NZ")) return "NZD";
  if (s.endsWith(".SS") || s.endsWith(".SZ")) return "CNY";
  return "USD";
}

async function stooqQuote(symbol) {
  const sym = String(symbol || "").toLowerCase(); // stooq accepts lowercase
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(sym)}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA } });
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Stooq: no data");

  const row = lines[1].split(",");
  // Expected: Symbol,Date,Time,Open,High,Low,Close,Volume
  const close = Number(row[7] ?? row[6]); // sometimes columns vary; fallback
  if (!isFinite(close)) throw new Error("Stooq: invalid close");

  return {
    symbol: String(symbol).toUpperCase(),
    name: "",
    spot: close,
    currency: inferCurrencyFromSuffix(symbol),
    high52: null,
    low52: null,
    beta: null,
    via: "stooq",
  };
}

export async function yahooQuote(symbol) {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");

  const url = `${YF_HOSTS[0]}/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
  try {
    const j = await fetchJSON(url, { tries: 3 });
    const r = j?.quoteResponse?.result?.[0];
    if (!r) throw new Error("Yahoo: empty result");

    return {
      symbol: r.symbol || sym.toUpperCase(),
      name: r.longName || r.shortName || "",
      spot: Number(r.regularMarketPrice ?? r.postMarketPrice ?? r.preMarketPrice ?? NaN),
      currency: r.currency || r.financialCurrency || inferCurrencyFromSuffix(sym),
      high52: r.fiftyTwoWeekHigh ?? null,
      low52: r.fiftyTwoWeekLow ?? null,
      beta: r.beta ?? r.beta3Year ?? null,
      via: "yahoo",
    };
  } catch {
    // Rate-limited or blocked → fallback to Stooq
    return await stooqQuote(sym);
  }
}

/* ------------------------------ LIVE IV (ATM-ish) ------------------------------ */

export async function yahooLiveIv(symbol, spot) {
  // Keep this best-effort; return null on failure (don’t break UX).
  const sym = String(symbol || "").trim();
  if (!sym || !isFinite(Number(spot))) return null;

  const url = `${YF_HOSTS[0]}/v7/finance/options/${encodeURIComponent(sym)}`;
  try {
    const j = await fetchJSON(url, { tries: 2 });
    const chain = j?.optionChain?.result?.[0];
    if (!chain) return null;

    const expiry = chain.expirationDates?.[0] || null;
    const quotes = chain.options?.[0] || {};
    const calls = quotes.calls || [];
    if (!calls.length) return null;

    // Find strike closest to spot and take its impliedVolatility
    let best = null;
    let bestDiff = Infinity;
    for (const c of calls) {
      const k = Number(c?.strike);
      const iv = Number(c?.impliedVolatility);
      if (!isFinite(k) || !isFinite(iv)) continue;
      const d = Math.abs(k - Number(spot));
      if (d < bestDiff) {
        bestDiff = d;
        best = iv; // Yahoo gives decimal (e.g., 0.28)
      }
    }
    return isFinite(best) ? best : null;
  } catch {
    return null;
  }
}

/* -------------------------- DAILY CLOSES (hist prices) ------------------------- */

async function stooqDailyCloses(symbol, wanted = 252) {
  const sym = String(symbol || "").toLowerCase();
  // daily historical CSV (full); we'll slice the last N closes
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(sym)}&i=d`;
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": UA } });
  const csv = await res.text();
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Stooq: no hist");

  const rows = lines.slice(1).map((ln) => ln.split(","));
  const closes = rows.map((r) => Number(r[4])).filter((x) => isFinite(x));
  const tail = closes.slice(-wanted);
  return tail.map((close) => ({ close }));
}

function rangeToDays(r) {
  const s = String(r || "").toLowerCase();
  if (s === "6mo") return 126;
  if (s === "2y") return 504;
  if (s === "5y") return 1260;
  return 252; // default 1y
}

export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");

  const url = `${YF_HOSTS[0]}/v8/finance/chart/${encodeURIComponent(
    sym
  )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&events=div`;
  try {
    const j = await fetchJSON(url, { tries: 3 });
    const res = j?.chart?.result?.[0];
    const ts = res?.timestamp || [];
    const closes = res?.indicators?.quote?.[0]?.close || [];
    const out = [];
    for (let i = 0; i < ts.length && i < closes.length; i++) {
      const c = Number(closes[i]);
      if (isFinite(c)) out.push({ t: ts[i] * 1000, close: c });
    }
    if (!out.length) throw new Error("Yahoo: no chart");
    return out;
  } catch {
    // Fallback to Stooq daily CSV
    const wanted = rangeToDays(range);
    return await stooqDailyCloses(sym, wanted);
  }
}
