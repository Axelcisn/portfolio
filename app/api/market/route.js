import { NextResponse } from "next/server";
import { riskFreeByCcy } from "../../../lib/riskfree";
import { yahooDailyCloses } from "../../../lib/yahoo";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats";

// Map UI keys → Yahoo index symbols
const INDEX_MAP = {
  SPX:   "^GSPC",   // S&P 500
  STOXX: "^STOXX",  // STOXX Europe 600
  NDX:   "NDX"      // Nasdaq‑100 price return
};

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const indexKey  = (searchParams.get("index") || "SPX").toUpperCase();
  const lookback  = (searchParams.get("lookback") || "2y").toLowerCase();
  const currency  = (searchParams.get("currency") || "EUR").toUpperCase();
  const sym       = INDEX_MAP[indexKey] || "^GSPC";
  const range     = lookback;  // e.g. "2y", "5y"

  try {
    // compute annualised mean log return for the index
    const bars = await yahooDailyCloses(sym, range, "1d");
    const closes = bars.map(b => b.close);
    const rets   = logReturns(closes);
    const { driftA } = annualizedFromDailyLogs(rets);
    const indexAnn = driftA;

    // risk‑free by currency (EUR, USD, fallback)
    const rf = await riskFreeByCcy(currency);

    // market risk premium = indexAnn − rf
    const mrp = (indexAnn != null && Number.isFinite(indexAnn))
      ? indexAnn - rf.r
      : null;

    return NextResponse.json({
      riskFree: rf.r,
      riskFreeSource: rf.source,
      mrp,
      indexAnn
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
}
