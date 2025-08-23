// app/api/yahoo/status/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { getYahooSessionInfo } from "../../../../lib/yahoo.js";

export async function GET() {
  try {
    const session = getYahooSessionInfo(); // does NOT make a network call
    return Response.json({ ok: true, session });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "status failed" },
      { status: 500 }
    );
  }
}
