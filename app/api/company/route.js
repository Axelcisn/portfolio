// app/api/company/route.js
import { NextResponse } from "next/server";
import { fxRate } from "../../../lib/fx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------- micro cache ---------------- */
const TTL_MS = 45 * 1000; // ~1 minute
const _cache = new Map(); // key -> { ts, payload }
const getC = (k) => {
  const rec = _cache.get(k);
  return rec && (Date.now() - rec.ts) < TTL_MS ? rec.payload : null;
};
const setC = (k, payload) => _cache.set(k, { ts: Date.now(), payload });

/* ---------------- helpers ---------------- */
const UA =
  "Mozilla/5.0 (StrategyApp; Node) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function normFromQuote(q, symbol) {
  if (!q) return null;
  const spot = Number(
    q.regularMarketPrice ?? q.postMarketPrice ?? q.preMarketPrice ?? q.bid ?? q.ask
  );
  const prev = Number(q.regularMarketPreviousClose ?? q.previousClose);
  const change =
    Number.isFinite(spot) && Number.isFinite(prev) ? spot - prev : Number(q.regularMarketChange);
  const changePct =
    Number.isFinite(spot) && Number.isFinite(prev) && prev > 0
      ? ((spot - prev) / prev) * 100
      : Number(q.regularMarketChangePercent);

  const marketState = (q.marketState || "").toUpperCase();
  const session = marketState === "PRE" ? "Pre-market" : marketState === "POST" ? "After hours" : "At close";

  return {
    symbol: q.symbol || symbol,
    name: q.longName || q.shortName || q.displayName || symbol,
    exchange: q.fullExchangeName || q.exchange || "",
    currency: q.currency || "USD",
    spot: Number.isFinite(spot) ? spot : null,
    prevClose: Number.isFinite(prev) ? prev : null,
    change: Number.isFinite(change) ? change : null,
    changePct: Number.isFinite(changePct) ? changePct : null,
    marketSession: session,
    logoUrl: null,
  };
}
function normFromChart(meta, symbol) {
  if (!meta) return null;
  const spot = Number(meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose);
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = Number.isFinite(spot) && Number.isFinite(prev) ? spot - prev : null;
  const changePct =
    Number.isFinite(spot) && Number.isFinite(prev) && prev > 0 ? ((spot - prev) / prev) * 100 : null;
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.exchangeName || "",
    currency: meta.currency || "USD",
    spot: Number.isFinite(spot) ? spot : null,
    prevClose: Number.isFinite(prev) ? prev : null,
    change,
    changePct,
    marketSession: "At close",
    logoUrl: null,
  };
}

/* Yahoo: try multiple endpoints before falling back */
async function yahoo(symbol) {
  // 1) query2
  {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const q = j?.quoteResponse?.result?.[0];
      const n = normFromQuote(q, symbol);
      if (n?.spot != null) return n;
    }
  }
  // 2) query1
  {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const q = j?.quoteResponse?.result?.[0];
      const n = normFromQuote(q, symbol);
      if (n?.spot != null) return n;
    }
  }
  // 3) chart meta
  {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      const meta = j?.chart?.result?.[0]?.meta;
      const n = normFromChart(meta, symbol);
      if (n?.spot != null) return n;
    }
  }
  return null;
}

/* Stooq fallback (very permissive) */
async function stooq(symbol) {
  const s = symbol.includes(".") ? symbol.toLowerCase() : `${symbol.toLowerCase()}.us`;
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(s)}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  const txt = await r.text();
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const cols = lines[1].split(",");
  const close = Number(cols[6]);
  if (!Number.isFinite(close)) return null;
  return {
    symbol,
    name: symbol,
    exchange: "",
    currency: "USD",
    spot: close,
    prevClose: null,
    change: null,
    changePct: null,
    marketSession: "At close",
    logoUrl: null,
  };
}

function normTarget(s) {
  if (!s) return null;
  const k = String(s).trim().toUpperCase();
  return k === "USD" || k === "EUR" || k === "GBP" ? k : null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const target = normTarget(searchParams.get("target")); // optional: USD|EUR|GBP
  const nocache = searchParams.get("nocache") === "1";
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const cacheKey = `${symbol}|${target || "-"}`;
  if (!nocache) {
    const hit = getC(cacheKey);
    if (hit) return NextResponse.json(hit, { headers: { "Cache-Control": "no-store" } });
  }

  // Base data (original currency)
  let base = null;
  try {
    base = await yahoo(symbol);
  } catch {}
  if (!base) {
    try {
      base = await stooq(symbol);
    } catch {}
  }
  if (!base) {
    base = {
      symbol,
      name: symbol,
      exchange: "",
      currency: "USD",
      spot: null,
      prevClose: null,
      change: null,
      changePct: null,
      marketSession: "At close",
      logoUrl: null,
    };
  }

  // Compose payload (augment with FX if needed)
  let payload = {
    ...base,
    sourceCurrency: base.currency,
    displayCurrency: base.currency,
    displaySpot: base.spot,
  };

  if (target && target !== base.currency) {
    try {
      const fx = await fxRate(base.currency, target); // { rate, source, ts }
      const spotT = Number.isFinite(base.spot) ? base.spot * fx.rate : null;
      const prevT = Number.isFinite(base.prevClose) ? base.prevClose * fx.rate : null;

      payload = {
        ...payload,
        fx: { base: base.currency, target, rate: fx.rate, source: fx.source, ts: fx.ts },
        prevCloseTarget: prevT,
        spotTarget: spotT,
        displayCurrency: target,
        displaySpot: spotT,
      };
    } catch {
      // If FX fails, keep original currency without throwing
    }
  }

  setC(cacheKey, payload);
  return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
}
