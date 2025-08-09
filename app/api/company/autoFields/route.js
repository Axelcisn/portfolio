// app/api/company/autoFields/route.js
import { NextResponse } from "next/server";
import {
  robustQuote,
  yahooLiveIv,
  yahooDailyCloses,
} from "../../../../lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function n(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function annualizeHistVol(closes, days) {
  if (!Array.isArray(closes) || closes.length < 3) return null;
  const tail = closes.slice(-Math.max(days + 1, 2));
  const rets = [];
  for (let i = 1; i < tail.length; i++) {
    const a = n(tail[i - 1]?.close);
    const b = n(tail[i]?.close);
    if (!a || !b) continue;
    rets.push(Math.log(b / a));
  }
  if (rets.length < 2) return null;
  const mean =
    rets.reduce((acc, v) => acc + v, 0) / Math.max(rets.length, 1);
  const variance =
    rets.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) /
    Math.max(rets.length - 1, 1);
  const daily = Math.sqrt(Math.max(variance, 0));
  return daily * Math.sqrt(252);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const days = Math.min(Math.max(Number(searchParams.get("days") || 30), 1), 365);
    const volSource = (searchParams.get("volSource") || "implied").toLowerCase(); // implied | historical

    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    // Quote (currency, spot, beta if Yahoo provides)
    const q = await robustQuote(symbol);

    // IV (implied)
    let ivImplied = await yahooLiveIv(symbol).catch(() => null);

    // Historical
    const closes = await yahooDailyCloses(symbol, "1y", "1d").catch(() => []);
    const ivHist = annualizeHistVol(closes, days);

    // Pick current iv based on requested source; may be null
    const iv =
      volSource === "historical"
        ? ivHist ?? ivImplied ?? null
        : ivImplied ?? ivHist ?? null;

    return NextResponse.json(
      {
        currency: q?.currency ?? null,
        spot: n(q?.spot),
        beta: q?.beta == null ? null : n(q.beta),
        iv: iv == null ? null : iv,
        ivImplied: ivImplied == null ? null : ivImplied,
        ivHist: ivHist == null ? null : ivHist,
        meta: { volSourceUsed: volSource === "historical" ? (ivHist != null ? "historical" : (ivImplied != null ? "implied" : null)) : (ivImplied != null ? "implied" : (ivHist != null ? "historical" : null)), days },
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
