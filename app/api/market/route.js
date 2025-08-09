import { NextResponse } from "next/server";
import { riskFreeByCcy } from "../../../lib/riskfree";
import { yahooDailyCloses } from "../../../lib/yahoo";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats";

const INDEX_MAP = {
  SPX:   "^GSPC",
  STOXX: "^STOXX",
  NDX:   "NDX"
};

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const indexKey = (searchParams.get("index") || "SPX").toUpperCase();
  const lookback = (searchParams.get("lookback") || "2y").toLowerCase();
  const currency = (searchParams.get("currency") || "EUR").toUpperCase();
  const sym = INDEX_MAP[indexKey] || "^GSPC";
  const range = lookback;

  try {
    const bars   = await yahooDailyCloses(sym, range, "1d");
    const rets   = logReturns(bars.map(b => b.close));
    const { driftA } = annualizedFromDailyLogs(rets);
    const indexAnn = driftA;

    const rf = await riskFreeByCcy(currency);
    const mrp = (indexAnn != null && Number.isFinite(indexAnn)) ? (indexAnn - rf.r) : null;

    return NextResponse.json({
      riskFree: rf.r,
      riskFreeSource: rf.source,
      mrp,
      indexAnn
    });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
