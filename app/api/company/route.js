// app/api/company/route.js
import { NextResponse } from "next/server";
import { robustQuote, yahooLiveIv, yahooDailyCloses } from "../../../lib/yahoo.js";
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
    // robust price (Yahoo → Yahoo chart → Stooq)
    const q = await robustQuote(symbol);

    // 1y realized drift/vol (best-effort)
    let driftHist = null, ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      const closes = bars.map(b => b.close);
      if (closes.length > 2) {
        const rets = logReturns(closes);
        const { driftA, volA } = annualizedFromDailyLogs(rets);
        driftHist = driftA;
        ivHist = volA;
      }
    } catch { /* ignore */ }

    // live ATM-ish IV (best-effort)
    let ivLive = null;
    try { if (q.spot) ivLive = await yahooLiveIv(symbol); } catch {}

    // FX conversion to EUR (so you can normalize)
    const fx = await fxToEUR(q.currency || "EUR");

    return NextResponse.json({
      symbol: q.symbol,
      name: q.name,
      spot: q.spot,
      currency: q.currency,
      high52: q.high52,
      low52: q.low52,
      beta: q.beta,
      ivLive,      // decimal
      ivHist,      // decimal
      driftHist,   // decimal
      fxToEUR: fx.rate,
      fxSource: fx.via,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
