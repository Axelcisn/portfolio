// app/api/company/route.js
import { NextResponse } from "next/server";
import { robustQuote } from "@/lib/yahoo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) {
      return NextResponse.json({ error: "symbol required" }, { status: 400 });
    }

    const q = await robustQuote(symbol);
    if (!q || q.spot == null) {
      return NextResponse.json({ error: "quote unavailable" }, { status: 502 });
    }

    return NextResponse.json(q, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
