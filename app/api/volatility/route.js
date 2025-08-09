// app/api/volatility/route.js
import { NextResponse } from "next/server";
import { fetchHistSigma, fetchIvATM } from "../../../lib/volatility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const source = (searchParams.get("source") || "iv").trim().toLowerCase(); // 'iv' | 'hist'
  const days = Number(searchParams.get("days") || 30);

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    let data;
    if (source === "hist") {
      data = await fetchHistSigma(symbol, days);
      const res = NextResponse.json(
        { symbol, source: "hist", ...data },
        { status: 200 }
      );
      res.headers.set("Cache-Control", "s-maxage=21600, stale-while-revalidate=600"); // 6h
      return res;
    }

    // source === 'iv' (default) -> try IV first, then fall back to hist if needed
    const iv = await fetchIvATM(symbol, days);
    if (iv?.sigmaAnnual && iv.sigmaAnnual > 0) {
      const res = NextResponse.json(
        { symbol, source: "iv", sigmaAnnual: iv.sigmaAnnual, meta: iv.meta || {} },
        { status: 200 }
      );
      res.headers.set("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
      return res;
    }

    // fallback to historical if IV unavailable
    const hist = await fetchHistSigma(symbol, days);
    const res = NextResponse.json(
      {
        symbol,
        source: "hist",
        ...hist,
        meta: { ...(hist.meta || {}), fallback: true },
      },
      { status: 200 }
    );
    res.headers.set("Cache-Control", "s-maxage=600, stale-while-revalidate=120");
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
