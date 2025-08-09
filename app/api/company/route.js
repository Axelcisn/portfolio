import { NextResponse } from "next/server";
import {
  yahooQuote,
  yahooLiveIv,
  yahooDailyCloses,
} from "../../../../lib/yahoo";
import { fxToEUR } from "../../../../lib/fx";
import { logReturns, annualizedFromDailyLogs } from "../../../../lib/stats";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  try {
    // basic quote data
    const q = await yahooQuote(symbol);

    // realised drift/vol from 1y daily closes
    let driftHist = null;
    let ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      const closes = bars.map((b) => b.close);
      const rets = logReturns(closes);
      const { driftA, volA } = annualizedFromDailyLogs(rets);
      driftHist = driftA;
      ivHist = volA;
    } catch {
      /* ignore errors on historical stats */
    }

    // live ATM-ish IV
    let ivLive = null;
    if (q.spot) {
      try {
        ivLive = await yahooLiveIv(symbol, q.spot);
      } catch {
        /* ignore */
      }
    }

    // convert currency to EUR (if needed)
    const fx = await fxToEUR(q.currency || "EUR");

    return NextResponse.json({
      symbol: q.symbol,
      name: q.name,
      spot: q.spot,
      currency: q.currency,
      high52: q.high52,
      low52: q.low52,
      beta: q.beta,
      ivLive,      // decimal (e.g., 0.30)
      ivHist,      // realised volatility (annualised)
      driftHist,   // realised drift (annualised)
      fxToEUR: fx.rate,
      fxSource: fx.via,
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
