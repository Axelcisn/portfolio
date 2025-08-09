import { NextResponse } from "next/server";
import { yahooDailyCloses } from "../../../lib/yahoo";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats";

export const runtime = "nodejs";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const range  = (searchParams.get("range") || "1y").trim();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  try {
    const bars   = await yahooDailyCloses(symbol, range, "1d");
    const closes = bars.map(b => b.close);
    const rets   = logReturns(closes);
    const { driftA, volA } = annualizedFromDailyLogs(rets);
    return NextResponse.json({ bars, driftA, volA });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
