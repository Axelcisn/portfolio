// app/api/volatility/route.js
import { NextResponse } from "next/server";
import { yahooDailyCloses, yahooLiveIv } from "../../../lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// sample stdev (population)
function stdev(arr) {
  const n = arr.length;
  if (!n) return null;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

// closes -> daily log returns
function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const p0 = closes[i - 1].close;
    const p1 = closes[i].close;
    if (p0 > 0 && p1 > 0) out.push(Math.log(p1 / p0));
  }
  return out;
}

async function histVolAnnualized(symbol, days) {
  // pull enough history depending on window
  const range = days <= 60 ? "6mo" : days <= 250 ? "1y" : "2y";
  const arr = await yahooDailyCloses(symbol, range, "1d");
  if (!arr.length) return { sigmaAnnual: null, pointsUsed: 0 };
  // take a tail a bit larger than requested window
  const tail = arr.slice(-Math.max(5, Math.min(arr.length, days + 5)));
  const rets = logReturns(tail);
  const sd = stdev(rets);
  if (sd == null) return { sigmaAnnual: null, pointsUsed: rets.length };
  // daily -> annualized (≈252 trading days)
  const sigmaAnnual = sd * Math.sqrt(252);
  return { sigmaAnnual, pointsUsed: rets.length };
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = String(searchParams.get("symbol") || "").trim();
    const source = (searchParams.get("source") || "hist").toLowerCase(); // 'iv' | 'hist'
    const days = Math.max(1, Math.min(365, Number(searchParams.get("days") || 30)));

    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    if (source === "iv") {
      // try Yahoo options IV nearest to days
      const iv = await yahooLiveIv(symbol, days);
      if (iv?.iv) {
        return NextResponse.json({
          source: "iv",
          sigmaAnnual: iv.iv, // annualized decimal
          meta: { expiry: iv.expiry, fallback: false },
        });
      }
      // fallback to historical if IV unavailable/throttled
      const hv = await histVolAnnualized(symbol, days);
      return NextResponse.json({
        source: "iv",
        sigmaAnnual: hv.sigmaAnnual,
        meta: { expiry: null, pointsUsed: hv.pointsUsed, fallback: true },
      });
    }

    // Historical
    const hv = await histVolAnnualized(symbol, days);
    return NextResponse.json({
      source: "hist",
      sigmaAnnual: hv.sigmaAnnual,
      meta: { pointsUsed: hv.pointsUsed, windowDays: days, fallback: false },
    });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
