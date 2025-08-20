import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.IB_API_BASE || "http://127.0.0.1:5055";
const TOKEN = process.env.X_IB_BRIDGE_TOKEN || process.env.IB_BRIDGE_TOKEN || "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    const expiry = searchParams.get("expiry") || "";
    const right = (searchParams.get("right") || "C").toUpperCase();
    const strikes = searchParams.get("strikes") || "";

    if (!symbol || !expiry || !right || !strikes) {
      return NextResponse.json(
        { error: "symbol, expiry, right, strikes are required" },
        { status: 400 }
      );
    }

    const url = `${BASE}/options/contracts2?symbol=${encodeURIComponent(symbol)}&expiry=${encodeURIComponent(expiry)}&right=${encodeURIComponent(right)}&strikes=${encodeURIComponent(strikes)}`;
    const headers: Record<string, string> = {};
    if (TOKEN) headers["x-ib-bridge-token"] = TOKEN;

    const r = await fetch(url, { headers, cache: "no-store" });
    const json = await r.json();
    return NextResponse.json(json, { status: r.ok ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "contracts proxy failed" }, { status: 500 });
  }
}
