// app/api/company/route.js
import { NextResponse } from "next/server";
import { robustQuote, yahooLiveIv, yahooDailyCloses } from "../../../lib/yahoo.js";
import { fxToEUR } from "../../../lib/fx.js";

// Always server (Node), no caching
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    // Price/name/currency via Yahoo with fallback to Stooq
    const q = await robustQuote(symbol);

    // best-effort realized stats (ignore errors)
    let driftHist = null, ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      const closes = bars.map((b) => b.close);
      // simple annualized stdev (log returns not strictly required here)
      if (closes.length > 5) {
        let sum = 0, sumSq = 0;
        for (let i = 1; i < closes.length; i++) {
          const r = Math.log(closes[i] / closes[i - 1]);
          sum += r;
          sumSq += r * r;
        }
        const n = closes.length - 1;
        const mean = sum / n;
        const varD = Math.max(0, sumSq / n - mean * mean);
        driftHist = mean * 252;
        ivHist = Math.sqrt(varD * 252);
      }
    } catch {}

    // best-effort “live IV”
    let ivLive = null;
    try {
      if (q.spot) ivLive = await yahooLiveIv(symbol, q.spot);
    } catch {}

    // FX to EUR for display math
    const fx = await fxToEUR(q.currency || "EUR");

    return NextResponse.json({
      symbol: q.symbol,
      name: q.name,
      exchange: q.exchange,
      spot: q.spot,
      currency: q.currency,
      high52: q.high52,
      low52: q.low52,
      beta: q.beta,
      ivLive,     // decimal
      ivHist,     // decimal
      driftHist,  // decimal
      fxToEUR: fx.rate,
      via: q.via,
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: e?.status || 500 }
    );
  }
}
