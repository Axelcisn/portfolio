import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const rawIB = process.env.IB_PROXY_URL || "http://localhost:4010";
// normalize: strip trailing slashes
const IB_PROXY_URL = rawIB.replace(/\/+$/, '');
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
};

export async function GET() {
  try {
    // Try expected /v1/ping first; if upstream doesn't mount /v1, try /v1/api/ping
    let r = await fetch(`${IB_PROXY_URL}/v1/ping`, { cache: "no-store" });
    if (r.status === 404) {
      r = await fetch(`${IB_PROXY_URL}/v1/api/ping`, { cache: "no-store" });
    }
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
