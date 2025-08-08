import { NextResponse } from "next/server";
import { riskFreeByCcy } from "../../../lib/riskfree";
import { yahooDailyCloses } from "../../../lib/yahoo";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats";

// Map UI keys → Yahoo index tickers
const INDEX_MAP = {
  SPX: "^GSPC",      // S&P 500
  STOXX: "^STOXX",   // STOXX Europe 600
  NDX: "NDX"         // Nasdaq-100 PR
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const indexKey = (searchParams.get("index") || "SPX").toUpperCase();
  const lookback = (searchParams.get("lookback") || "2y").toLowerCase(); // 1y/2y/3y/5y/10y
  const currency = (searchParams.get("currency") || "EUR").toUpperCase(); // for risk-free by listing/home
  const sym = INDEX_MAP[indexKey] || "^GSPC";

  const range = lookback; // Yahoo accepts 1y, 2y, 5y, etc.

  try {
    // index annualized average return from closes (mean(log) * 252)
    const bars = await yahooDailyCloses(sym, range, "1d");
    const rets = logReturns(bars.map(b => b.close));
    const { driftA } = annualizedFromDailyLogs(rets);
    const indexAnn = driftA; // annualized mean return

    // risk-free by currency
    const rf = await riskFreeByCcy(currency);

    // ERP (market risk premium) = indexAnn - rf
    const mrp = (indexAnn != null && Number.isFinite(indexAnn)) ? (indexAnn - rf.r) : null;

    return NextResponse.json({
      riskFree: rf.r,
      riskFreeSource: rf.source,
      mrp,
      indexAnn
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
