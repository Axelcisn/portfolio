// lib/yahoo.js
// Robust Yahoo helpers with Stooq fallback (adds proper market suffixes)

const Y_BASE = "https://query2.finance.yahoo.com";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

async function jfetch(url, opts = {}) {
  const r = await fetch(url, {
    // always go to origin; avoid Vercel caching for live data
    cache: "no-store",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r;
}

/* --------------------------- Yahoo: SEARCH --------------------------- */
export async function yahooSearch(q) {
  if (!q || !q.trim()) return [];
  const u = `${Y_BASE}/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=10`;
  const j = await jfetch(u).then((r) => r.json());

  const quotes = Array.isArray(j?.quotes) ? j.quotes : [];
  return quotes
    .filter((it) => it?.symbol)
    .map((it) => ({
      symbol: it.symbol,
      name: it.shortname || it.longname || it.longName || it.shortName || "",
      exchange: it.exch || it.exchange || it.exchDisp || "",
      exchDisp: it.exchDisp || it.exchange || "",
      type: it.quoteType || it.type || "",
      currency: it.currency || "",
    }));
}

/* ---------------------------- Yahoo: QUOTE --------------------------- */
export async function yahooQuote(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("symbol required");

  try {
    const u = `${Y_BASE}/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
    const j = await jfetch(u).then((r) => r.json());
    const q = j?.quoteResponse?.result?.[0];
    if (q) {
      const spot =
        n(q.regularMarketPrice) ??
        n(q.postMarketPrice) ??
        n(q.bid) ??
        n(q.ask);

      if (spot && spot > 0) {
        return {
          symbol: q.symbol || sym,
          name: q.shortName || q.longName || null,
          currency: q.currency || null,
          spot,
          high52: n(q.fiftyTwoWeekHigh),
          low52: n(q.fiftyTwoWeekLow),
          beta: n(q.beta) ?? n(q.beta3Year),
        };
      }
      // fall through to Stooq if spot is missing
    }
    throw new Error("Yahoo empty");
  } catch (e) {
    // Fallback to Stooq (adds market suffix)
    const stq = await stooqQuote(sym);
    if (stq) return stq;
    throw e;
  }
}

/* ------------------------- Yahoo: DAILY CLOSES ----------------------- */
export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  const sym = String(symbol || "").trim().toUpperCase();
  const u = `${Y_BASE}/v8/finance/chart/${encodeURIComponent(
    sym
  )}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(
    interval
  )}&includeAdjustedClose=true&corsDomain=finance.yahoo.com`;
  const j = await jfetch(u).then((r) => r.json());
  const res = j?.chart?.result?.[0];
  if (!res) return [];
  const closes =
    res?.indicators?.adjclose?.[0]?.adjclose ||
    res?.indicators?.quote?.[0]?.close ||
    [];
  const ts = res?.timestamp || [];
  const out = [];
  for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
    const close = n(closes[i]);
    if (close && close > 0) out.push({ t: ts[i] * 1000, close });
  }
  return out;
}

/* ----------------------------- Yahoo: IV ----------------------------- */
// (Simple ATM-ish IV probe. It’s okay if this returns null; UI handles it.)
export async function yahooLiveIv(symbol /*, spot */) {
  try {
    const sym = String(symbol || "").trim().toUpperCase();
    const u = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
    const j = await jfetch(u).then((r) => r.json());
    const chain = j?.optionChain?.result?.[0];
    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];
    const pick = [...calls, ...puts]
      .filter((o) => n(o?.impliedVolatility))
      .sort((a, b) => Math.abs(n(a.strike) - n(chain?.quote?.regularMarketPrice)) - Math.abs(n(b.strike) - n(chain?.quote?.regularMarketPrice)))[0];
    return n(pick?.impliedVolatility);
  } catch {
    return null;
  }
}

/* --------------------------- STOOQ FALLBACK -------------------------- */
// Stooq needs a MARKET SUFFIX: pure tickers => ".us", Yahoo-style "ENEL.MI" stays as-is.
function toStooqSymbol(sym) {
  const s = String(sym).trim().toLowerCase();
  if (s.includes(".")) return s;       // already suffixed (e.g., enel.mi, tsla.mx)
  if (/^[a-z]+$/i.test(s)) return `${s}.us`; // US equities
  return s;
}
function guessCurrency(stqSymbol) {
  const s = stqSymbol.toLowerCase();
  if (s.endsWith(".us")) return "USD";
  if (s.endsWith(".mi")) return "EUR";
  if (s.endsWith(".de")) return "EUR";
  if (s.endsWith(".fr")) return "EUR";
  if (s.endsWith(".uk")) return "GBP";
  if (s.endsWith(".jp")) return "JPY";
  return null;
}

async function stooqQuote(symUpper) {
  const stq = toStooqSymbol(symUpper);
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(
    stq
  )}&f=sd2t2ohlcv&h&e=csv`;
  const txt = await fetch(url, { cache: "no-store" }).then((r) => r.text());
  // CSV header: Symbol,Date,Time,Open,High,Low,Close,Volume
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Stooq: no data");
  const row = lines[1].split(",");
  const close = n(row[6]);
  if (!close || close <= 0) throw new Error("Stooq: invalid close");

  return {
    symbol: symUpper.toUpperCase(),
    name: null,
    currency: guessCurrency(stq) || "USD",
    spot: close,
    high52: null,
    low52: null,
    beta: null,
  };
}
