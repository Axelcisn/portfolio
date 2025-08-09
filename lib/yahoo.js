// lib/yahoo.js
// Hardened Yahoo helpers with dual-host fallback + browser headers,
// plus Stooq fallback for price when Yahoo is unavailable.

const Y_BASES = [
  "https://query1.finance.yahoo.com",
  "https://query2.finance.yahoo.com",
];

function num(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

async function yFetchJSON(pathAndQuery) {
  let lastErr = null;
  for (const base of Y_BASES) {
    const url = `${base}${pathAndQuery}`;
    try {
      const r = await fetch(url, {
        cache: "no-store",
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          "Referer": "https://finance.yahoo.com/",
        },
      });
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return await r.json();
    } catch (e) {
      lastErr = e;
      // try next base
    }
  }
  throw lastErr || new Error("Yahoo fetch failed");
}

/* --------------------------- Yahoo: SEARCH --------------------------- */
export async function yahooSearch(q) {
  if (!q || !q.trim()) return [];
  const u = `/v1/finance/search?q=${encodeURIComponent(q.trim())}&quotesCount=10`;
  const j = await yFetchJSON(u);
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
    const j = await yFetchJSON(
      `/v7/finance/quote?symbols=${encodeURIComponent(sym)}`
    );
    const q = j?.quoteResponse?.result?.[0];
    if (q) {
      const spot =
        num(q.regularMarketPrice) ??
        num(q.postMarketPrice) ??
        num(q.bid) ??
        num(q.ask);

      if (spot && spot > 0) {
        return {
          symbol: q.symbol || sym,
          name: q.shortName || q.longName || null,
          currency: q.currency || null,
          spot,
          high52: num(q.fiftyTwoWeekHigh),
          low52: num(q.fiftyTwoWeekLow),
          beta: num(q.beta) ?? num(q.beta3Year),
        };
      }
    }
    // fall through to Stooq if price missing
    throw new Error("Yahoo empty");
  } catch (e) {
    const stq = await stooqQuote(sym);
    if (stq) return stq;
    throw e;
  }
}

/* ------------------------- Yahoo: DAILY CLOSES ----------------------- */
export async function yahooDailyCloses(symbol, range = "1y", interval = "1d") {
  const sym = String(symbol || "").trim().toUpperCase();
  const j = await yFetchJSON(
    `/v8/finance/chart/${encodeURIComponent(sym)}?range=${encodeURIComponent(
      range
    )}&interval=${encodeURIComponent(
      interval
    )}&includeAdjustedClose=true&corsDomain=finance.yahoo.com`
  );
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

/* ----------------------------- Yahoo: IV ----------------------------- */
// Lightweight probe; it’s fine if it returns null (UI handles it).
export async function yahooLiveIv(symbol /*, spot */) {
  try {
    const sym = String(symbol || "").trim().toUpperCase();
    const j = await yFetchJSON(
      `/v7/finance/options/${encodeURIComponent(sym)}`
    );
    const chain = j?.optionChain?.result?.[0];
    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];
    const pick = [...calls, ...puts]
      .filter((o) => num(o?.impliedVolatility))
      .sort(
        (a, b) =>
          Math.abs(num(a.strike) - num(chain?.quote?.regularMarketPrice)) -
          Math.abs(num(b.strike) - num(chain?.quote?.regularMarketPrice))
      )[0];
    return num(pick?.impliedVolatility);
  } catch {
    return null;
  }
}

/* --------------------------- STOOQ FALLBACK -------------------------- */
function toStooqSymbol(sym) {
  const s = String(sym).trim().toLowerCase();
  if (s.includes(".")) return s; // already suffixed (enel.mi, tsla.mx)
  if (/^[a-z]+$/i.test(s)) return `${s}.us`; // default US equities
  return s;
}
function guessCurrency(stqSymbol) {
  const s = stqSymbol.toLowerCase();
  if (s.endsWith(".us")) return "USD";
  if (s.endsWith(".mi") || s.endsWith(".de") || s.endsWith(".fr")) return "EUR";
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
  const close = num(row[6]);
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
