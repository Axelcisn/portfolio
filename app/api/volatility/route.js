// app/api/volatility/route.js
import { NextResponse } from "next/server";
import { getLiveIV, getHistVol } from "../../../lib/volatility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const mode = (searchParams.get("mode") || "live").toLowerCase(); // "live" | "hist"
  const days = searchParams.get("days");

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    if (mode === "hist") {
      const vol = await getHistVol(symbol, days ? Number(days) : 30);
      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        mode: "hist",
        days: days ? Number(days) : 30,
        sigma: vol,          // decimal or null
        via: "yahoo-closes"
      });
    } else {
      const vol = await getLiveIV(symbol);
      return NextResponse.json({
        symbol: symbol.toUpperCase(),
        mode: "live",
        sigma: vol,          // decimal or null
        via: "yahoo-options"
      });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
