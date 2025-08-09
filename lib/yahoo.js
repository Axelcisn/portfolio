// lib/yahoo.js
// Quote/search helpers with resilient fallbacks.
// - Primary: Yahoo Finance v7 (quote), v1 (search)
// - Fallbacks: Yahoo v8 (chart last close), Stooq (with market suffix)

const Y_BASE = "https://query2.finance.yahoo.com";

function num(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

async function jfetch(url, opts = {}) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      // mimic a browser; helps reduce 429s
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r;
}

/* -------------------------------- SEARCH -------------------------------- */

export async function yahooSearch(q) {
  if (!q || !q.trim()) return [];
  const url = `${Y_BASE}/v1/finance/search?q=${encodeURIComponent(
    q.trim()
  )}&quotesCount=10`;
  const j = await jfetch(url).then((r) => r.json());
  const quotes = Array.isArray(j?.quotes) ? j.quotes : [];
  return quotes
    .filter((it) => it?.symbol)
    .map((it) => ({
      symbol: it.symbol,
      name:
        it.shortname ||
        it.longname ||
        it.shortName ||
        it.longName ||
        "",
      exchange: it.exch || it.exchange || it.exchDisp || "",
      exchDisp: it.exchDisp || it.exchange || "",
      type: it.quoteType || it.type || "",
      currency: it.currency || "",
    }));
}

/* -------------------------------- QUOTE ---------------------------------- */

export async function yahooQuote(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  const url = `${Y_BASE}/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
  const j = await jfetch(url).then((r) => r.json());
  const q = j?.quoteResponse?.result?.[0];
  if (!q) throw new Error("Yahoo empty");

  const spot =
    num(q.regularMarketPrice) ??
    num(q.postMarketPrice) ??
    num(q.bid) ??
    num(q.ask);

  return {
    symbol: q.symbol || sym,
    name: q.shortName || q.longName || null,
    currency: q.currency || null,
    spot: spot ?? null,
    high52: num(q.fiftyTwoWeekHigh),
    low52: num(q.fiftyTwoWeekLow),
    beta: num(q.beta) ?? num(q.beta3Year),
  };
}

/* ------------------------- YAHOO LAST CLOSE (v8) ------------------------- */

async function yahooLastClose(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  const url = `${Y_BASE}/v8/finance/chart/${encodeURIComponent(
    sym
  )}?range=5d&interval=1d&includeAdjustedClose=true`;
  const j = await jfetch(url).then((r) => r.json());
  const res = j?.chart?.result?.[0];
  if (!res) return null;

  // prefer adjusted close if present
  const adj =
    res?.indicators?.adjclose?.[0]?.adjclose ||
    res?.indicators?.quote?.[0]?.close ||
    [];
  const last = adj.filter((v) => Number.isFinite(v)).at(-1);
  return num(last);
}

/* --------------------------- DAILY CLOSE SERIES -------------------------- */

export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  const sym = String(symbol || "").trim().toUpperCase();
  const url = `${Y_BASE}/v8/finance/chart/${encodeURIComponent(
    sym
  )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(
    interval
  )}&includeAdjustedClose=true`;
  const j = await jfetch(url).then((r) => r.json());
  const res = j?.chart?.result?.[0];
  if (!res) return [];
  const closes =
    res?.indicators?.adjclose?.[0]?.adjclose ||
    res?.indicators?.quote?.[0]?.close ||
    [];
  const ts = res?.timestamp || [];
  const out = [];
  for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
    const close = num(closes[i]);
    if (close && close > 0) out.push({ t: ts[i] * 1000, close });
  }
  return out;
}

/* --------------------------------- IV ------------------------------------ */

export async function yahooLiveIv(symbol /*, spot */) {
  try {
    const sym = String(symbol || "").trim().toUpperCase();
    const url = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
    const j = await jfetch(url).then((r) => r.json());
    const chain = j?.optionChain?.result?.[0];
    const quotePx = num(chain?.quote?.regularMarketPrice);
    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];
    const all = [...calls, ...puts].filter((o) => num(o?.impliedVolatility));
    if (!all.length) return null;
    const pick = all.sort((a, b) => {
      const da = Math.abs(num(a.strike) - quotePx);
      const db = Math.abs(num(b.strike) - quotePx);
      return da - db;
    })[0];
    return num(pick?.impliedVolatility);
  } catch {
    return null;
  }
}

/* ----------------------------- STOOQ FALLBACK ---------------------------- */

// Stooq needs a market suffix (e.g., 'aapl.us', 'enel.mi'). If a symbol already
// has a dot, keep it; otherwise assume US.
function toStooqSymbol(sym) {
  const s = String(sym).trim().toLowerCase();
  if (s.includes(".")) return s;
  return `${s}.us`;
}
function guessCurrencyFromSymbol(sym) {
  const s = String(sym).toUpperCase();
  if (s.endsWith(".MI") || s.endsWith(".PA") || s.endsWith(".DE") || s.endsWith(".AS") || s.endsWith(".BR"))
    return "EUR";
  if (s.endsWith(".L")) return "GBP";
  if (s.endsWith(".TO") || s.endsWith(".V")) return "CAD";
  if (s.endsWith(".JP")) return "JPY";
  return null;
}

async function stooqQuote(symUpper) {
  const stq = toStooqSymbol(symUpper);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(
    stq
  )}&f=sd2t2ohlcv&h&e=csv`;
  const txt = await fetch(url, { cache: "no-store" }).then((r) => r.text());
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Stooq: no data");
  const row = lines[1].split(",");
  const close = num(row[6]);
  if (!close || close <= 0) throw new Error("Stooq: invalid close");

  return {
    symbol: symUpper.toUpperCase(),
    name: null,
    currency: guessCurrencyFromSymbol(symUpper) || "USD",
    spot: close,
    high52: null,
    low52: null,
    beta: null,
  };
}

/* --------------------------- ROBUST QUOTE (API) -------------------------- */

// Exported for compatibility with callers expecting robustQuote(...)
export async function robustQuote(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  // 1) Yahoo v7
  try {
    const q = await yahooQuote(sym);
    if (q?.spot && q.spot > 0) return q;
  } catch {}

  // 2) Yahoo v8 last close
  try {
    const last = await yahooLastClose(sym);
    if (last && last > 0) {
      return {
        symbol: sym,
        name: null,
        currency: guessCurrencyFromSymbol(sym),
        spot: last,
        high52: null,
        low52: null,
        beta: null,
      };
    }
  } catch {}

  // 3) Stooq
  return await stooqQuote(sym);
}
