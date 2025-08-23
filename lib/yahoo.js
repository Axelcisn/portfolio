// lib/yahoo.js
// Yahoo helpers with a robust fallback to Stooq for spot/currency.
// Exports: yahooSearch, yahooQuote, yahooDailyCloses, yahooLiveIv, robustQuote

const Y_BASE = "https://query2.finance.yahoo.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function num(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

async function jfetch(url, init = {}) {
  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
    },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r;
}

/* ----------------------------- SEARCH ----------------------------- */
export async function yahooSearch(q) {
  const query = String(q || "").trim();
  if (!query) return [];
  const u = `${Y_BASE}/v1/finance/search?q=${encodeURIComponent(
    query
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
        it.longfmt ||
        "",
      exchange: it.exch || it.exchange || it.exchDisp || "",
      exchDisp: it.exchDisp || it.exchange || "",
      type: it.quoteType || it.type || "",
      currency: it.currency || "",
    }));
}

/* ----------------------------- QUOTE ------------------------------ */
export async function yahooQuote(symbol) {
  const sym = String(symbol || "").trim();
  if (!sym) throw new Error("symbol required");
  const u = `${Y_BASE}/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
  const j = await jfetch(u).then((r) => r.json());
  const q = j?.quoteResponse?.result?.[0];
  if (!q) throw new Error("Yahoo: empty");
  const spot =
    num(q.regularMarketPrice) ??
    num(q.postMarketPrice) ??
    num(q.bid) ??
    num(q.ask);
  return {
    symbol: q.symbol || sym.toUpperCase(),
    name: q.shortName || q.longName || null,
    currency: q.currency || null,
    spot: spot ?? null,
    high52: num(q.fiftyTwoWeekHigh),
    low52: num(q.fiftyTwoWeekLow),
    beta: num(q.beta) ?? num(q.beta3Year),
  };
}

/* ---------------------------- HIST CLOSES -------------------------- */
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

/* --------------------------- LIVE IV (simple) ---------------------- */
export async function yahooLiveIv(symbol) {
  try {
    const sym = String(symbol || "").trim();
    const u = `${Y_BASE}/v7/finance/options/${encodeURIComponent(sym)}`;
    const j = await jfetch(u).then((r) => r.json());
    const chain = j?.optionChain?.result?.[0];
    const quote = chain?.quote || {};
    const spot =
      num(quote.regularMarketPrice) ??
      num(quote.postMarketPrice) ??
      num(quote.bid) ??
      num(quote.ask);

    const calls = chain?.options?.[0]?.calls || [];
    const puts = chain?.options?.[0]?.puts || [];
    const all = [...calls, ...puts].filter((o) => num(o?.impliedVolatility));

    if (!all.length) return { sigmaAnnual: null, meta: { fallback: true } };

    const pick = spot
      ? all.sort(
          (a, b) =>
            Math.abs(num(a.strike) - spot) - Math.abs(num(b.strike) - spot)
        )[0]
      : all[0];

    return {
      sigmaAnnual: num(pick?.impliedVolatility) ?? null, // already annualized
      meta: {
        expiry: pick?.expiration ? new Date(pick.expiration * 1000).toISOString().slice(0, 10) : null,
        fallback: false,
      },
    };
  } catch {
    return { sigmaAnnual: null, meta: { fallback: true } };
  }
}

/* ----------------------------- STOOQ ------------------------------- */
function toStooqSymbol(sym) {
  const s = String(sym || "").trim().toLowerCase();
  if (s.includes(".")) return s; // enel.mi, tsla.mx
  if (/^[a-z]+$/i.test(s)) return `${s}.us`; // bare US tickers
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
async function stooqQuoteInternal(symUpper) {
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
    symbol: String(symUpper || "").toUpperCase(),
    name: null,
    currency: guessCurrency(stq) || "USD",
    spot: close,
    high52: null,
    low52: null,
    beta: null,
  };
}

/* --------------- ROBUST: Yahoo first, Stooq on failure ------------- */
export async function robustQuote(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  try {
    const q = await yahooQuote(sym);
    if (num(q.spot)) return q;
    // no spot → try stooq
    return await stooqQuoteInternal(sym);
  } catch {
    return await stooqQuoteInternal(sym);
  }
}

// ---------------- Yahoo session (cookie + crumb) -------------------

const HOMEPAGE = "https://finance.yahoo.com/";
const CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";

let _sess = { cookie: null, crumb: null, ts: 0, lastError: null };
const TTL_MS = 30 * 60 * 1000; // 30 minutes

function isFresh() {
  return _sess.cookie && Date.now() - _sess.ts < TTL_MS;
}

function toCookieHeader(setCookieHeader) {
  const raw = String(setCookieHeader || "");
  if (!raw) return null;
  const pairs = raw
    .split(/,(?=[^;]+?=)/g)
    .map((s) => s.split(";")[0].trim())
    .filter(Boolean);
  const wanted = [];
  for (const p of pairs) {
    const name = p.split("=")[0].trim().toUpperCase();
    if (name === "A1" || name === "A3" || name === "B") wanted.push(p);
  }
  const finalPairs = wanted.length ? wanted : pairs;
  return finalPairs.join("; ");
}

async function initSession() {
  try {
    const r = await fetch(HOMEPAGE, {
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    const setCookie = r.headers.get("set-cookie");
    const cookieHeader = toCookieHeader(setCookie);
    if (!cookieHeader) {
      throw new Error("No Set-Cookie from Yahoo homepage");
    }
    let crumb = null;
    try {
      const rc = await fetch(CRUMB_URL, {
        cache: "no-store",
        headers: {
          "User-Agent": UA,
          Accept: "text/plain,*/*",
          Cookie: cookieHeader,
          Referer: HOMEPAGE,
        },
      });
      if (rc.ok) {
        crumb = (await rc.text()).trim() || null;
      }
    } catch (e) {
      _sess.lastError = `crumb fetch failed: ${e?.message || "unknown"}`;
    }
    _sess = { cookie: cookieHeader, crumb, ts: Date.now(), lastError: null };
  } catch (err) {
    _sess = { cookie: null, crumb: null, ts: 0, lastError: err?.message || String(err) };
    throw err;
  }
}

async function ensureSession() {
  if (isFresh()) return;
  await initSession();
}

function withCrumb(url, crumb, addCrumb = true) {
  if (!addCrumb || !crumb) return url;
  const hasQ = url.includes("?");
  const sep = hasQ ? "&" : "?";
  if (/\bcrumb=/.test(url)) return url;
  return `${url}${sep}crumb=${encodeURIComponent(crumb)}`;
}

export async function yahooJson(url, opts = {}) {
  const { addCrumb = true, init = {} } = opts;
  await ensureSession();
  let finalUrl = withCrumb(url, _sess.crumb, addCrumb);
  const baseHeaders = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Cookie: _sess.cookie,
    Referer: HOMEPAGE,
  };
  const doFetch = async (u) =>
    fetch(u, { cache: "no-store", ...init, headers: { ...baseHeaders, ...(init.headers || {}) } });
  let res = await doFetch(finalUrl);
  if ([401, 403, 999].includes(res.status)) {
    await initSession();
    finalUrl = withCrumb(url, _sess.crumb, addCrumb);
    res = await doFetch(finalUrl);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yahoo ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 140)}` : ""}`);
  }
  return res.json();
}

export async function resetYahooSession() {
  await initSession();
  return { ok: !!_sess.cookie, crumb: !!_sess.crumb, lastError: _sess.lastError || null };
}

export function getYahooSessionInfo() {
  return {
    ok: isFresh(),
    hasCookie: !!_sess.cookie,
    hasCrumb: !!_sess.crumb,
    ageMs: _sess.ts ? Date.now() - _sess.ts : null,
    lastError: _sess.lastError || null,
  };
}

