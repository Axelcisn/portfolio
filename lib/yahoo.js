// lib/yahoo.js
// Robust helpers around Yahoo Search (for names/symbols) and Stooq (for prices/history)
// so we avoid Yahoo quote 429s from serverless regions.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- tiny fetch helpers ----------
async function getJSON(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "application/json, text/plain, */*",
      ...init.headers,
    },
    // never cache on server: let Vercel cache at the function layer instead
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function getText(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { "User-Agent": UA, ...init.headers },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// ---------- Yahoo SEARCH (works reliably) ----------
export async function yahooSearch(q) {
  if (!q || !q.trim()) return [];
  const url =
    "https://query2.finance.yahoo.com/v1/finance/search?" +
    new URLSearchParams({
      q: q.trim(),
      quotesCount: "10",
      newsCount: "0",
      listsCount: "0",
      enableFuzzyQuery: "true",
      quotesQueryId: "tss_match_phrase_query",
    });

  const data = await getJSON(url);
  const arr = Array.isArray(data?.quotes) ? data.quotes : [];
  return arr.map((x) => ({
    symbol: x.symbol,
    name: x.shortname || x.longname || x.name || x.symbol,
    exchDisp: x.exchDisp || x.exchangeDisp || "",
    type: x.quoteType || x.typeDisp || "",
  }));
}

// ---------- Symbol/exchange normalization for Stooq ----------
/*
 Stooq uses different suffixes than Yahoo for many markets.
 We translate the most common ones here and also map a default currency.
 This makes ENEL.MI (Yahoo) become enel.it (Stooq) and so on.
*/
const SUFFIX_MAP = [
  // [yahooSuffix, stooqSuffix, currency, note]
  [".MI", ".it", "EUR"], // Borsa Italiana
  [".PA", ".fr", "EUR"], // Euronext Paris
  [".AS", ".nl", "EUR"], // Euronext Amsterdam
  [".DE", ".de", "EUR"], // Xetra
  [".BE", ".be", "EUR"], // Brussels
  [".BR", ".br", "EUR"], // Brussels (alt)
  [".MC", ".es", "EUR"], // Madrid
  [".L", ".gb", "GBX"],  // London (prices in pence on Stooq)
  [".TO", ".ca", "CAD"], // Toronto
  [".HK", ".hk", "HKD"], // Hong Kong
  [".T", ".jp", "JPY"],  // Tokyo
];

function normalizeSymbolForStooq(yahooSymbol) {
  const s = (yahooSymbol || "").trim();
  if (!s) return { stooq: null, currency: null };

  const lower = s.toLowerCase();
  for (const [y, stooq, cur] of SUFFIX_MAP) {
    if (lower.endsWith(y.toLowerCase())) {
      return {
        stooq: lower.replace(y.toLowerCase(), stooq),
        currency: cur,
      };
    }
  }

  // US or already stooq-style:
  // - If it already has a stooq suffix like .us/.de/etc. keep it.
  // - Otherwise, Stooq accepts plain tickers for many US names (aapl, msft),
  //   and also aapl.us. We’ll prefer plain to avoid accidental mismaps.
  const hasDot = lower.includes(".");
  return {
    stooq: hasDot ? lower : lower, // 'aapl' works fine on Stooq
    currency: "USD",
  };
}

function currencyFromGuess(yahooSymbol) {
  const { currency } = normalizeSymbolForStooq(yahooSymbol);
  return currency || "USD";
}

function normalizePriceForCurrency(price, currency) {
  // London quotes are GBX (pence). Convert to GBP so downstream math is sane.
  if (currency === "GBX") return { price: price / 100, currency: "GBP" };
  return { price, currency };
}

// ---------- Stooq: quote & history ----------
async function stooqQuote(yahooSymbol) {
  const { stooq, currency: guessedCur } = normalizeSymbolForStooq(yahooSymbol);
  if (!stooq) throw new Error("Stooq: empty symbol");

  // CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
  const url =
    "https://stooq.com/q/l/?" +
    new URLSearchParams({
      s: stooq,
      f: "sd2t2ohlcv",
      h: "",
      e: "csv",
    });

  const csv = await getText(url);
  // pick the first non-empty, non-header line
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) throw new Error("Stooq: empty response");

  const row = lines[1].split(",");
  // safety against unexpected formats
  const closeStr = row[6]?.trim();
  const close = Number(closeStr);
  if (!isFinite(close) || close <= 0) {
    throw new Error("Stooq: invalid close");
  }

  const { price, currency } = normalizePriceForCurrency(close, guessedCur);

  return {
    symbol: yahooSymbol,
    name: null, // we’ll fill from Yahoo Search if needed
    spot: price,
    currency,
    high52: null,
    low52: null,
    beta: null,
  };
}

async function stooqDailyCloses(yahooSymbol) {
  const { stooq, currency: guessedCur } = normalizeSymbolForStooq(yahooSymbol);
  if (!stooq) throw new Error("Stooq: empty symbol");

  // CSV: Date,Open,High,Low,Close,Volume
  const url =
    "https://stooq.com/q/d/l/?" +
    new URLSearchParams({ s: stooq, i: "d" });

  const csv = await getText(url);
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    // guard
    const c = Number(parts[4]);
    if (!isFinite(c) || c <= 0) continue;

    const { price } = normalizePriceForCurrency(c, guessedCur);
    out.push({
      date: parts[0],
      close: price,
    });
  }
  return out;
}

// ---------- Public: quote + history with Yahoo-search enrichment ----------

export async function yahooQuote(symbol) {
  // Try Stooq for the price, then enrich with Yahoo SEARCH for a nice name.
  const q = await stooqQuote(symbol);

  try {
    const meta = await yahooSearch(symbol);
    const best =
      meta.find((m) => m.symbol?.toUpperCase() === symbol?.toUpperCase()) ||
      meta[0];
    if (best) {
      q.name = best.name || q.name;
      // If Yahoo tells us the market currency (rare in search), prefer that.
      // Otherwise keep our guessed/normalized currency.
    }
  } catch {
    // ignore search failures — price already obtained
  }

  return q;
}

export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  // We only support daily bars from Stooq for reliability (no Yahoo 429s).
  // The signature matches existing callers.
  const bars = await stooqDailyCloses(symbol);
  if (range === "1y" && interval === "1d") return bars.slice(-252);
  // fall back: just return what we have
  return bars;
}

// Not implemented (kept for compatibility with your API route)
export async function yahooLiveIv(/* symbol, spot */) {
  return null;
}
