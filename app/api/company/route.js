import { NextResponse } from "next/server";
import { yahooQuote, yahooLiveIv, yahooDailyCloses } from "../../../lib/yahoo.js";
import { fxToEUR } from "../../../lib/fx.js";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });

  try {
    const q = await yahooQuote(symbol);
    // hist stats for realized vol/drift (1y)
    let hist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      const rets = logReturns(bars.map(b => b.close));
      const { driftA, volA } = annualizedFromDailyLogs(rets);
      hist = { driftA, volA };
    } catch { hist = null; }

    // live IV (ATM-ish)
    let ivLive = null;
    try { if (q.spot) ivLive = await yahooLiveIv(symbol, q.spot); } catch {}

    // FX to EUR
    const fx = await fxToEUR(q.currency || "EUR");

    return NextResponse.json({
      symbol: q.symbol,
      name: q.name,
      spot: q.spot,
      currency: q.currency,
      high52: q.high52,
      low52: q.low52,
      beta: q.beta,
      ivLive,             // decimal if present (e.g., 0.30)
      ivHist: hist?.volA ?? null, // realized annualized
      driftHist: hist?.driftA ?? null,
      fxToEUR: fx.rate,   // null if unknown
      fxSource: fx.via
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
