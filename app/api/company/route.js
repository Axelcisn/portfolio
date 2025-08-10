// app/api/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";          // Yahoo blocks some edge fetches
export const dynamic = "force-dynamic";   // never cache while typing

async function yahooQuery2(symbol) {
  const url =
    `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  const r = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (StrategyApp; Node)",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      Connection: "keep-alive",
    },
  });

  if (!r.ok) {
    const err = new Error(`yahoo ${r.status}`);
    err.status = r.status;
    throw err;
  }

  const j = await r.json();
  const q = j?.quoteResponse?.result?.[0];
  if (!q) throw new Error("yahoo empty");

  const price = Number(
    q.regularMarketPrice ??
      q.postMarketPrice ??
      q.preMarketPrice ??
      q.bid ??
      q.ask
  );

  return {
    symbol: q.symbol || symbol,
    name: q.longName || q.shortName || q.displayName || symbol,
    exchange: q.fullExchangeName || q.exchange || "",
    currency: q.currency || "USD",
    spot: Number.isFinite(price) ? price : null,
    high52: Number.isFinite(+q.fiftyTwoWeekHigh) ? +q.fiftyTwoWeekHigh : null,
    low52: Number.isFinite(+q.fiftyTwoWeekLow) ? +q.fiftyTwoWeekLow : null,
    beta: Number.isFinite(+q.beta) ? +q.beta : (Number.isFinite(+q.beta3Year) ? +q.beta3Year : null),
    prevClose: Number.isFinite(+q.regularMarketPreviousClose) ? +q.regularMarketPreviousClose : null,
    change: Number.isFinite(+q.regularMarketChange) ? +q.regularMarketChange : null,
    changePct: Number.isFinite(+q.regularMarketChangePercent) ? +q.regularMarketChangePercent : null,
    marketSession:
      (q.marketState || "").toUpperCase() === "PRE"
        ? "Pre‑market"
        : (q.marketState || "").toUpperCase() === "POST"
        ? "After hours"
        : "At close",
    logoUrl: null,
  };
}

async function stooqQuote(symbol) {
  // very small CSV API — good fallback if Yahoo throttles
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(
    symbol.toLowerCase()
  )}&f=sd2t2ohlcv&h&e=csv`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`stooq ${r.status}`);
  const txt = await r.text();
  const lines = txt.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("stooq empty");
  const cols = lines[1].split(",");
  const close = Number(cols[6]);

  return {
    symbol,
    name: symbol,
    exchange: "",
    currency: "USD",
    spot: Number.isFinite(close) ? close : null,
    high52: null,
    low52: null,
    beta: null,
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
  if (!symbol) {
    return NextResponse.json({ error: "Missing symbol" }, { status: 400 });
  }

  try {
    const data = await yahooQuery2(symbol);
    // ← Top‑level fields (no {ok:…}) to match CompanyCard.jsx expectations
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    try {
      const data = await stooqQuote(symbol);
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch {
      // Final safe payload to avoid any UI error state
      const fallback = {
        symbol,
        name: symbol,
        exchange: "",
        currency: "USD",
        spot: null,
        high52: null,
        low52: null,
        beta: null,
        prevClose: null,
        change: null,
        changePct: null,
        marketSession: "At close",
        logoUrl: null,
      };
      return NextResponse.json(fallback, { headers: { "Cache-Control": "no-store" } });
    }
  }
}
