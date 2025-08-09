// lib/yahoo.js
// Robust Yahoo helpers with Yahoo-Chart and Stooq fallbacks.
// Also fixes Stooq symbol mapping for Borsa Italiana: *.MI -> *.it

const Y_BASE = "https://query2.finance.yahoo.com";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

async function jfetch(url, opts = {}) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      // Helps avoid 401/403 on some Yahoo edges
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      Referer: "https://finance.yahoo.com/",
    },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r;
}

/* --------------------------- Yahoo: SEARCH --------------------------- */
export async function yahooSearch(q) {
  if (!q || !q.trim()) return [];
  const u = `${Y_BASE}/v1/finance/search?q=${encodeURIComponent(
    q.trim()
  )}&quotesCount=10`;
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

/* -------------------- Yahoo: QUOTE (primary source) ------------------ */
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
    }

    // If Yahoo quote didn't yield a usable price, try chart meta/last close.
    const chart = await yahooChartLast(sym);
    if (chart?.spot) {
      return {
        symbol: sym,
        name: null,
        currency: chart.currency || null,
        spot: chart.spot,
        high52: null,
        low52: null,
        beta: null,
      };
    }

    // Fall through to Stooq
    const stq = await stooqQuote(sym);
    if (stq) return stq;

    throw new Error("Quote not available");
  } catch (e) {
    // If quote request itself failed (e.g., 401), still try chart then stooq
    try {
      const chart = await yahooChartLast(symbol);
      if (chart?.spot) {
        return {
          symbol: String(symbol).toUpperCase(),
          name: null,
          currency: chart.currency || null,
          spot: chart.spot,
          high52: null,
          low52: null,
          beta: null,
        };
      }
    } catch { /* ignore */ }

    const stq = await stooqQuote(symbol);
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

/* ------------------ Yahoo: Chart meta / last available ---------------- */
async function yahooChartLast(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  const u = `${Y_BASE}/v8/finance/chart/${encodeURIComponent(
    sym
  )}?range=1mo&interval=1d&includeAdjustedClose=true&corsDomain=finance.yahoo.com`;
  const j = await jfetch(u).then((r) => r.json()).catch(() => null);
  const res = j?.chart?.result?.[0];
  if (!res) return null;

  const metaSpot =
    n(res?.meta?.regularMarketPrice) ?? n(res?.meta?.previousClose);
  const closes =
    res?.indicators?.adjclose?.[0]?.adjclose ||
    res?.indicators?.quote?.[0]?.close ||
    [];
  const lastClose = closes.length ? n(closes[closes.length - 1]) : null;
  const spot = metaSpot || lastClose || null;

  return {
    spot,
    currency: res?.meta?.currency || null,
  };
}

/* ----------------------------- Yahoo: IV ----------------------------- */
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
      .sort(
        (a, b) =>
          Math.abs(n(a.strike) - n(chain?.quote?.regularMarketPrice)) -
          Math.abs(n(b.strike) - n(chain?.quote?.regularMarketPrice))
      )[0];
    return n(pick?.impliedVolatility);
  } catch {
    return null;
  }
}

/* --------------------------- STOOQ FALLBACK -------------------------- */
// Map Yahoo-style to Stooq-style suffixes where needed
function toStooqSymbol(sym) {
  const s = String(sym).trim().toLowerCase();

  // Already stooq-looking (has suffix)
  if (/\.[a-z]{2,3}$/.test(s)) {
    // Convert Yahoo's .mi (Milan) to Stooq's .it
    if (s.endsWith(".mi")) return s.replace(/\.mi$/, ".it");
    return s;
  }

  // Plain ticker → assume US
  if (/^[a-z0-9\-]+$/i.test(s)) return `${s}.us`;

  return s;
}

function guessCurrency(stqSymbol) {
  const s = stqSymbol.toLowerCase();
  if (s.endsWith(".us")) return "USD";
  if (s.endsWith(".it")) return "EUR"; // Borsa Italiana
  if (s.endsWith(".mi")) return "EUR"; // safety
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
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("Stooq: no data");

  const row = lines[1].split(",");
  const closeRaw = row[6]?.trim();
  const close = n(closeRaw);

  if (!close || close <= 0) throw new Error("Stooq: invalid close");

  return {
    symbol: String(symUpper || "").toUpperCase(),
    name: null,
    currency: guessCurrency(stq) || "USD",
    spot: close,
    high52: null,
    low52: null,
    beta: null,
  };
}

/* ------------ Backward-compatible alias for older imports ------------ */
export async function robustQuote(symbol) {
  return yahooQuote(symbol);
}
