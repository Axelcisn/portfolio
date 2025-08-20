import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.IB_API_BASE || "http://127.0.0.1:5055";
const TOKEN = process.env.X_IB_BRIDGE_TOKEN || process.env.IB_BRIDGE_TOKEN || "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    const url = `${BASE}/options/chain3?symbol=${encodeURIComponent(symbol)}`;
    const headers: Record<string, string> = {};
    if (TOKEN) headers["x-ib-bridge-token"] = TOKEN;

    const r = await fetch(url, { headers, cache: "no-store" });
    const json = await r.json();
    return NextResponse.json(json, { status: r.ok ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "chain proxy failed" }, { status: 500 });
  }
}
