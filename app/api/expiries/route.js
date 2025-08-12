// app/api/expiries/route.js
import { NextResponse } from "next/server";
// Adjust the import name to whatever you exported in /lib/yahooOptions.js
import { yahooListExpiries } from "@/lib/yahooOptions";

export const dynamic = "force-dynamic";
// or: export const revalidate = 0;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();

  if (!symbol) {
    return NextResponse.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  try {
    const expiries = await yahooListExpiries(symbol); // returns array of ISO dates
    return NextResponse.json({ ok: true, symbol, expiries });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err?.message || err) },
      { status: 500 }
    );
  }
}
