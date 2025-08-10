// app/api/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";          // use Node runtime (Yahoo blocks some edge fetches)
export const dynamic = "force-dynamic";   // always fresh

/* ---------------- helpers ---------------- */

const UA = "Mozilla/5.0 (StrategyApp; Node) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

function normFromQuote(q, symbol) {
  if (!q) return null;
  const spot = Number(
    q.regularMarketPrice ??
    q.postMarketPrice ??
    q.preMarketPrice ??
    q.bid ?? q.ask
  );
  const prev = Number(q.regularMarketPreviousClose ?? q.previousClose);
  const change = Number.isFinite(spot) && Number.isFinite(prev) ? spot - prev : (
    Number(q.regularMarketChange)
  );
  const changePct = Number.isFinite(spot) && Number.isFinite(prev) && prev > 0
    ? ( (spot - prev) / prev ) * 100
    : Number(q.regularMarketChangePercent);

  const marketState = (q.marketState || "").toUpperCase();
  const session =
    marketState === "PRE"  ? "Pre‑market" :
    marketState === "POST" ? "After hours" : "At close";

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
  const changePct = Number.isFinite(spot) && Number.isFinite(prev) && prev > 0 ? ((spot - prev) / prev) * 100 : null;
  return {
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || symbol,
    exchange: meta.exchangeName || "",
    currency: meta.currency || "USD",
    spot: Number.isFinite(spot) ? spot : null,
    prevClose: Number.isFinite(prev) ? prev : null,
    change, changePct,
    marketSession: "At close",
    logoUrl: null,
  };
}

/* Yahoo: try multiple endpoints before falling back */
async function yahoo(symbol) {
  // 1) quote query2
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
  // 2) quote query1 (alt CDN)
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

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  let data = null;
  try { data = await yahoo(symbol); } catch {}
  if (!data) {
    try { data = await stooq(symbol); } catch {}
  }
  if (!data) {
    data = {
      symbol, name: symbol, exchange: "", currency: "USD",
      spot: null, prevClose: null, change: null, changePct: null,
      marketSession: "At close", logoUrl: null,
    };
  }

  // Always respond 200 with a normalized shape, so the UI never goes into "fetch failed"
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
