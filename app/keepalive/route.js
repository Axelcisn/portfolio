import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IB_PROXY_URL = process.env.IB_PROXY_URL || "http://localhost:4010";
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
};

export async function GET() {
  try {
    const r = await fetch(`${IB_PROXY_URL}/v1/ping`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      if (j?.ok || j?.up) {
        return new NextResponse("IB is awake\n", { status: 200, headers });
      }
    }
  } catch (e) {
    // ignore, fall through to asleep response
  }
  return new NextResponse("IB is asleep\n", { status: 503, headers });
}
