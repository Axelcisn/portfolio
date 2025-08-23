import { NextResponse } from "next/server";
import ibkrService from "../../../lib/services/ibkrService.js";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

const clampRange = (s) => {
  const ok = new Set(["3m", "6m", "1y", "2y", "5y", "10y", "ytd", "max"]);
  return ok.has(s) ? s : "1y";
};

function err(status, code, message) {
  // Back-compat: plain string `error`, plus structured `errorObj`
  return NextResponse.json(
    { ok: false, error: message, errorObj: { code, message } },
    { status, headers: cacheHeaders }
  );
}

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const rangeParam =
      (searchParams.get("range") || searchParams.get("lookback") || "1y").toLowerCase();
    const range = clampRange(rangeParam);

    if (!symbol) return err(400, "SYMBOL_REQUIRED", "symbol required");

    // Get historical data from IBKR
    const histData = await ibkrService.getHistoricalData(symbol, range, "1d");
    
    // Transform to expected format (bars with t and close)
    const bars = histData.map(bar => ({
      t: bar.time,
      close: bar.close
    }));

    if (!Array.isArray(bars) || bars.length < 2) {
      return err(502, "NO_DATA", "no chart data available");
    }

    const closes = bars.map((b) => Number(b.close)).filter(Number.isFinite);
    const rets = logReturns(closes);
    const { driftA, volA } = annualizedFromDailyLogs(rets);

    const data = { bars, driftA: Number.isFinite(driftA) ? driftA : null, volA: Number.isFinite(volA) ? volA : null };
    // Back-compat: expose top-level fields + standard envelope
    return NextResponse.json(
      { ok: true, data, ...data, _ms: Date.now() - t0 },
      { status: 200, headers: cacheHeaders }
    );
  } catch (e) {
    return err(502, "UPSTREAM_ERROR", String(e?.message ?? e));
  }
}
