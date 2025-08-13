// app/api/company/search/route.js
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- micro-cache & helpers ---------------- */
const TTL_MS = 60 * 1000;                 // 60s cache
const CACHE = new Map();                  // key -> { ts, payload }
const PENDING = new Map();                // key -> Promise<payload>
const UA =
  "Mozilla/5.0 (StrategyApp; Node) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

const now = () => Date.now();
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n|0));
const key = (q, limit) => `${String(q || "").trim().toLowerCase()}|${limit}`;

function getCached(k) {
  const hit = CACHE.get(k);
  if (!hit) return null;
  if (now() - hit.ts > TTL_MS) { CACHE.delete(k); return null; }
  return hit.payload;
}
function setCached(k, payload) { CACHE.set(k, { ts: now(), payload }); }

/* ---------------- normalizers ---------------- */
function normalizeQuote(q) {
  if (!q) return null;
  const type =
    q.quoteType || q.typeDisp || q.type || (q.isYahooFinance ? "EQUITY" : "");
  const name = q.longname || q.shortname || q.name || q.symbol;
  const exch = q.exchDisp || q.exchange || "";
  const cur  = q.currency || "USD";

  // keep only the common instrument types you’ll search for in the card
  const okType = /^(EQUITY|ETF|INDEX|MUTUALFUND|CURRENCY)$/i.test(String(type));
  if (!okType) return null;

  return {
    symbol: q.symbol,
    name,
    exchange: exch,
    type,
    currency: cur,
  };
}

/* ---------------- providers ---------------- */
async function yahooSearch(q, limit) {
  const headers = { "User-Agent": UA, Accept: "application/json" };

  // query2
  {
    const u = new URL("https://query2.finance.yahoo.com/v1/finance/search");
    u.searchParams.set("q", q);
    u.searchParams.set("quotesCount", String(limit));
    u.searchParams.set("newsCount", "0");
    u.searchParams.set("listsCount", "0");
    u.searchParams.set("lang", "en-US");
    u.searchParams.set("region", "US");
    const r = await fetch(u, { cache: "no-store", headers });
    if (r.ok) {
      const j = await r.json();
      const list = Array.isArray(j?.quotes) ? j.quotes : [];
      const out = list.map(normalizeQuote).filter(Boolean);
      if (out.length) return out.slice(0, limit);
    }
  }
  // query1 fallback CDN
  {
    const u = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    u.searchParams.set("q", q);
    u.searchParams.set("quotesCount", String(limit));
    u.searchParams.set("newsCount", "0");
    u.searchParams.set("lang", "en-US");
    u.searchParams.set("region", "US");
    const r = await fetch(u, { cache: "no-store", headers });
    if (r.ok) {
      const j = await r.json();
      const list = Array.isArray(j?.quotes) ? j.quotes : [];
      const out = list.map(normalizeQuote).filter(Boolean);
      if (out.length) return out.slice(0, limit);
    }
  }
  return [];
}

/* If Yahoo is down, and the query "looks like" a symbol, offer it verbatim */
function heuristicSymbolSuggestion(q) {
  const s = String(q || "").trim().toUpperCase();
  if (!s || s.length > 10) return [];
  if (!/^[A-Z0-9.\-=]+$/.test(s)) return [];
  return [{ symbol: s, name: s, exchange: "", type: "EQUITY", currency: "USD" }];
}

/* ---------------- route ---------------- */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();
  const limit = clamp(Number(searchParams.get("limit")) || 8, 2, 20);
  const nocache = searchParams.get("nocache") === "1";

  if (!qRaw) {
    return new Response(JSON.stringify({ ok: true, results: [] }), {
      headers: { "content-type": "application/json" },
    });
  }

  const k = key(qRaw, limit);

  if (!nocache) {
    const cached = getCached(k);
    if (cached) {
      return new Response(JSON.stringify({ ok: true, results: cached }), {
        headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      });
    }
    if (PENDING.has(k)) {
      const payload = await PENDING.get(k);
      return new Response(JSON.stringify({ ok: true, results: payload }), {
        headers: { "content-type": "application/json", "Cache-Control": "no-store" },
      });
    }
  }

  const promise = (async () => {
    let results = [];
    try {
      results = await yahooSearch(qRaw, limit);
    } catch { /* ignore */ }

    if (!results?.length) {
      results = heuristicSymbolSuggestion(qRaw);
    }
    setCached(k, results);
    return results;
  })();

  if (!nocache) PENDING.set(k, promise);

  try {
    const payload = await promise;
    return new Response(JSON.stringify({ ok: true, results: payload }), {
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  } finally {
    PENDING.delete(k);
  }
}
