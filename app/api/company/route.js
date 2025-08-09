// app/api/company/route.js
import { NextResponse } from "next/server";
import { yahooQuote, yahooLiveIv, yahooDailyCloses } from "../../../lib/yahoo.js";
import { fxToEUR } from "../../../lib/fx.js";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const histDaysRaw = searchParams.get("histDays");
  const histDays = Number.isFinite(Number(histDaysRaw)) ? Math.max(5, Math.floor(Number(histDaysRaw))) : null;

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    // --- Yahoo quote (spot, currency, beta, 52w, name) ---
    const q = await yahooQuote(symbol);

    // --- Historical realized drift/vol (window = histDays or full year) ---
    let driftHist = null, ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d"); // [{t, close}]
      const closes = bars.map(b => b.close).filter(v => Number.isFinite(v));
      if (closes.length > 2) {
        const use = histDays ? closes.slice(-histDays) : closes; // trailing window if provided
        const rets = logReturns(use);
        const { driftA, volA } = annualizedFromDailyLogs(rets);
        driftHist = driftA;        // decimal (e.g., 0.07 = 7%)
        ivHist   = volA;           // decimal (e.g., 0.30 = 30%)
      }
    } catch { /* ignore */ }

    // --- Live ATM-ish IV ---
    let ivLive = null;
    try {
      if (q.spot) ivLive = await yahooLiveIv(symbol, q.spot);
    } catch { /* ignore */ }

    // --- FX to EUR (useful for downstream conversions) ---
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
      ivHist,          // decimal (windowed if histDays provided)
      driftHist,       // decimal
      fxToEUR: fx.rate,
      fxSource: fx.via
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
