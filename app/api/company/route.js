import { NextResponse } from "next/server";
import { yahooQuote, yahooLiveIv, yahooDailyCloses } from "../../../lib/yahoo";
import { fxToEUR } from "../../../lib/fx";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  try {
    const q = await yahooQuote(symbol);
    let driftHist = null, ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      const closes = bars.map(b => b.close);
      const rets = logReturns(closes);
      const { driftA, volA } = annualizedFromDailyLogs(rets);
      driftHist = driftA;
      ivHist = volA;
    } catch {}
    let ivLive = null;
    if (q.spot) {
      try { ivLive = await yahooLiveIv(symbol, q.spot); } catch {}
    }
    const fx = await fxToEUR(q.currency || "EUR");
    return NextResponse.json({
      symbol: q.symbol,
      name: q.name,
      spot: q.spot,
      currency: q.currency,
      high52: q.high52,
      low52: q.low52,
      beta: q.beta,
      ivLive,
      ivHist,
      driftHist,
      fxToEUR: fx.rate,
      fxSource: fx.via,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
