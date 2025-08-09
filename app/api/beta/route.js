// app/api/beta/route.js
import { NextResponse } from "next/server";
import { computeBeta } from "../../../lib/beta.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    const range = (searchParams.get("range") || "1y").trim();
    const interval = (searchParams.get("interval") || "1d").trim();

    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const { beta, index, points } = await computeBeta(symbol, { range, interval });
    return NextResponse.json({ symbol, beta, index, points });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
