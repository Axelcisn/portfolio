// lib/yahoo.js
// Yahoo helpers + Stooq fallbacks that work on Vercel.
// Provides: yahooSearch, robustQuote, yahooDailyCloses, yahooLiveIv

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
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://finance.yahoo.com/",
      // UA improves odds against 401s on Yahoo infra
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
  const u = `${Y_BASE}/v1/finance/search?q=${encodeURIComponent(
    q.trim()
  )}&quotesCount=10`;
  const j = await jfetch(u).then((r) => r.json());
  const quotes = Array.isArray(j?.quotes) ? j.quotes : [];
  return quotes
    .filter((it) => it?.symbol)
    .map((it) => ({
      symbol: it.symbol,
      name:
        it.shortname ||
        it.longname ||
        it.longName ||
        it.shortName ||
        "",
      exchange: it.exch || it.exchange || it.exchDisp || "",
      exchDisp: it.exchDisp || it.exchange || "",
      type: it.quoteType || it.type || "",
      currency: it.currency || "",
    }));
}

/* ---------------------------- Yahoo: QUOTE --------------------------- */
async function yahooQuote(symbol) {
  const sym = String(symbol || "").trim();
  const u = `${Y_BASE}/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
  const j = await jfetch(u).then((r) => r.json());
  const q = j?.quoteResponse?.result?.[0];
  if (!q) return null;

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
    // Yahoo's "beta" is often stale; we compute beta elsewhere now
    beta: num(q.beta) ?? num(q.beta3Year),
  };
}

/* --------------------------- Stooq fallback -------------------------- */
function toStooqSymbol(sym) {
  const s = String(sym).trim().toLowerCase();
  if (s.includes(".")) return s; // already suffixed (enel.mi)
  if (/^[a-z]+$/i.test(s)) return `${s}.us`; // plain ticker => US
  return s;
}
function guessCurrencyFromSuffix(stq) {
  const s = stq.toLowerCase();
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
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const row = lines[1].split(",");
  const close = num(row[6]);
  if (!close || close <= 0) return null;

  return {
    symbol: symUpper.toUpperCase(),
    name: null,
    currency: guessCurrencyFromSuffix(stq) || "USD",
    spot: close,
    high52: null,
    low52: null,
    beta: null,
  };
}

/* ------------------------- Robust quote (S/ccy) ---------------------- */
export async function robustQuote(symbol) {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");
  try {
    const y = await yahooQuote(sym);
    if (y?.spot && y.spot > 0) return y;
    const s = await stooqQuote(sym);
    if (s) return s;
    throw new Error("No price");
  } catch (e) {
    const s = await stooqQuote(sym);
    if (s) return s;
    throw e;
  }
}

/* ----------------------- Yahoo: historical closes -------------------- */
export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  const sym = String(symbol || "").trim();
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
    const close = num(closes[i]);
    if (close && close > 0) out.push({ t: ts[i] * 1000, close });
  }
  return out;
}

/* ----------------------- Yahoo: options -> IV ------------------------ */
// Returns { iv: decimal, expiry: 'YYYY-MM-DD' } or null
export async function yahooLiveIv(symbol, targetDays = 30) {
  const sym = String(symbol || "").trim();
  try {
    // 1) fetch to get expirations
    const base = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
    const head = await jfetch(base).then((r) => r.json());
    const root = head?.optionChain?.result?.[0];
    const exps = Array.isArray(root?.expirationDates)
      ? root.expirationDates
      : [];
    // choose expiry closest to targetDays
    let picked = null;
    if (exps.length) {
      const now = Date.now();
      let best = Infinity;
      for (const e of exps) {
        const days = Math.round((e * 1000 - now) / (24 * 3600 * 1000));
        const dist = Math.abs(days - (Number(targetDays) || 30));
        if (dist < best) {
          best = dist;
          picked = e;
        }
      }
    }

    // 2) fetch chain for picked expiry (or nearest default)
    const url =
      picked != null ? `${base}?date=${picked}` : base;
    const j = picked != null ? await jfetch(url).then((r) => r.json()) : head;
    const chain = j?.optionChain?.result?.[0];
    const quoteSpot = num(chain?.quote?.regularMarketPrice);
    const opts = [
      ...(chain?.options?.[0]?.calls || []),
      ...(chain?.options?.[0]?.puts || []),
    ];
    if (!opts.length) return null;

    // pick option with strike closest to spot that has impliedVolatility
    const withIv = opts.filter((o) => num(o?.impliedVolatility));
    if (!withIv.length) return null;
    const pick = withIv.sort((a, b) => {
      const da = Math.abs(num(a.strike) - quoteSpot);
      const db = Math.abs(num(b.strike) - quoteSpot);
      return da - db;
    })[0];

    const iv = num(pick?.impliedVolatility);
    if (!iv) return null;
    const expiry =
      chain?.options?.[0]?.expiration ||
      picked ||
      null;
    const expiryStr = expiry
      ? new Date(expiry * 1000).toISOString().slice(0, 10)
      : null;

    // Yahoo IV is annualized (decimal)
    return { iv, expiry: expiryStr };
  } catch {
    return null; // caller may fallback to historical
  }
}
