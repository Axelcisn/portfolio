// app/api/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";         // ensure Node runtime (Yahoo blocks some edge fetches)
export const dynamic = "force-dynamic";  // never cache while you type/search

function mapQuote(q, symbol) {
  const spot =
    Number(q?.regularMarketPrice ?? q?.postMarketPrice ?? q?.preMarketPrice ?? q?.bid ?? q?.ask) ?? null;

  const prev =
    Number(q?.regularMarketPreviousClose ?? q?.previousClose) ?? null;

  const change =
    Number(q?.regularMarketChange ?? (spot != null && prev != null ? spot - prev : null)) ?? null;

  const changePct =
    Number(q?.regularMarketChangePercent ??
      (spot != null && prev > 0 ? ((spot - prev) / prev) * 100 : null)) ?? null;

  const marketState = (q?.marketState || "").toUpperCase();
  const marketSession =
    marketState === "PRE" ? "Pre‑market" :
    marketState === "POST" ? "After hours" : "At close";

  return {
    symbol: q?.symbol || symbol,
    name: q?.longName || q?.shortName || q?.displayName || symbol,
    exchange: q?.fullExchangeName || q?.exchange || "",
    currency: q?.currency || "USD",
    spot,
    prevClose: prev,
    change,
    changePct,
    marketSession,
    logoUrl: null, // keep null-friendly; you can enrich later if you add a logo source
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }

  // Primary source: Yahoo finance quote
  const url =
    "https://query1.finance.yahoo.com/v7/finance/quote?symbols=" +
    encodeURIComponent(symbol);

  try {
    const r = await fetch(url, {
      // Yahoo is picky; setting UA helps avoid sporadic blocks
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StrategyApp/1.0)" },
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!r.ok) throw new Error(`Upstream ${r.status}`);

    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];

    if (!q) throw new Error("No quote result");

    const data = mapQuote(q, symbol);
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    // Never surface a network-level failure to the client (avoids “fetch failed” in UI).
    // Return a minimal, safe payload so the page can continue to work.
    const fallback = {
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
    return NextResponse.json(
      { ok: false, error: String(err?.message || err), data: fallback },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
