import { NextResponse } from "next/server";
import { yahooDailyCloses } from "../../../lib/yahoo.js";
import { logReturns, annualizedFromDailyLogs } from "../../../lib/stats.js";
import { riskFreeByCcy } from "../../../lib/riskfree.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
};

const INDEX_MAP = {
  SPX: "^GSPC",
  STOXX: "^STOXX", // keep existing mapping for compatibility
  NDX: "^NDX",
};

const clampRange = (s) => {
  // allow e.g. "6m","1y","2y","5y","10y" (fallback to "2y")
  const ok = new Set(["3m","6m","1y","2y","5y","10y","ytd","max"]);
  return ok.has(s) ? s : "2y";
};

export async function GET(req) {
  const started = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const indexKey = (searchParams.get("index") || "SPX").toUpperCase();
    const range = clampRange((searchParams.get("lookback") || "2y").toLowerCase());
    const currency = (searchParams.get("currency") || "EUR").toUpperCase();

    const idxSymbol = INDEX_MAP[indexKey] || INDEX_MAP.SPX;

    // Risk-free is required; if it fails, surface a 502
    const { r: riskFree, source: riskFreeSource } = await riskFreeByCcy(currency);

    // Index annualized drift is best-effort; if it fails, we return nulls (200)
    let indexAnn = null;
    try {
      const bars = await yahooDailyCloses(idxSymbol, range, "1d");
      if (Array.isArray(bars) && bars.length > 1) {
        const closes = bars.map(b => b.close).filter(Number.isFinite);
        const rets = logReturns(closes);
        const { driftA } = annualizedFromDailyLogs(rets);
        if (Number.isFinite(driftA)) indexAnn = driftA;
      }
    } catch (_) {
      // swallow to keep endpoint usable even if index fetch fails
    }

    const mrp = Number.isFinite(indexAnn) ? indexAnn - riskFree : null;

    // Backward-compatible fields at top-level + standard envelope
    const data = { riskFree, riskFreeSource, mrp, indexAnn };
    const payload = { ok: true, data, ...data, _ms: Date.now() - started };

    return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "UPSTREAM_ERROR", message: String(e?.message ?? e) },
        _ms: Date.now() - started,
      },
      { status: 502, headers: cacheHeaders }
    );
  }
}
