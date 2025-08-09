// app/api/company/route.js
import { NextResponse } from "next/server";
import {
  yahooQuote,           // already robust (falls back to Stooq)
  yahooLiveIv,
  yahooDailyCloses,
} from "../../../lib/yahoo.js";
import { fxToEUR } from "../../../lib/fx.js";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    // yahooQuote already includes robust fallback; no need for another helper
    const q = await yahooQuote(symbol); // { symbol, name, currency, spot, high52, low52, beta }

    // Historical realized drift/vol (1y)
    let driftHist = null, ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      const closes = bars.map(b => b.close);
      const rets = logReturns(closes);
      const { driftA, volA } = annualizedFromDailyLogs(rets);
      driftHist = driftA; ivHist = volA;
    } catch { /* ignore */ }

    // Live ATM-ish IV
    let ivLive = null;
    try { if (q.spot) ivLive = await yahooLiveIv(symbol, q.spot); } catch { /* ignore */ }

    // FX conversion to EUR
    const fx = await fxToEUR(q.currency || "EUR");

    return NextResponse.json({
      symbol: q.symbol,
      name: q.name,
      spot: q.spot,
      currency: q.currency,
      high52: q.high52,
      low52: q.low52,
      beta: q.beta,
      ivLive,          // decimal
      ivHist,          // decimal
      driftHist,       // decimal
      fxToEUR: fx.rate,
      fxSource: fx.via,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
