import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  const data = { t: now, iso };

  // Back-compat: expose top-level fields + standard envelope
  return NextResponse.json({ ok: true, data, ...data }, { status: 200, headers: cacheHeaders });
}
