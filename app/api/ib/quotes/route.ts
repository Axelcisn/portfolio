import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.IB_API_BASE || "http://127.0.0.1:5055";
const TOKEN = process.env.X_IB_BRIDGE_TOKEN || process.env.IB_BRIDGE_TOKEN || "";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conids = (searchParams.get("conids") || "").trim();

    if (!conids) {
      return NextResponse.json({ error: "conids are required" }, { status: 400 });
    }

    const url = `${BASE}/options/quotes4?conids=${encodeURIComponent(conids)}`;
    const headers: Record<string, string> = {};
    if (TOKEN) headers["x-ib-bridge-token"] = TOKEN;

    const r = await fetch(url, { headers, cache: "no-store" });
    const json = await r.json();
    return NextResponse.json(json, { status: r.ok ? 200 : 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "quotes proxy failed" }, { status: 500 });
  }
}
