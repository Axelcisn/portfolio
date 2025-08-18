// app/api/provider/ib/ping/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IB_PROXY_URL = process.env.IB_PROXY_URL || "http://localhost:4010";

export async function GET() {
  try {
    const r = await fetch(`${IB_PROXY_URL}/v1/ping`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ ok: true, proxy: IB_PROXY_URL, ping: j });
  } catch (e) {
    return NextResponse.json(
      { ok: false, proxy: IB_PROXY_URL, error: String(e?.message ?? e) },
      { status: 200 }
    );
  }
}
