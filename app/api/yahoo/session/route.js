// app/api/yahoo/session/route.js
import { getYahooSessionInfo, resetYahooSession } from "../../../../lib/yahoo.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/yahoo/session  -> session status (no network calls) */
export async function GET() {
  try {
    const info = getYahooSessionInfo();
    return Response.json({ ok: true, data: info });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "status failed" },
      { status: 500 }
    );
  }
}

/** POST /api/yahoo/session  -> force refresh cookie+crumb */
export async function POST() {
  try {
    const res = await resetYahooSession();
    return Response.json({ ok: true, data: res });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "reset failed" },
      { status: 500 }
    );
  }
}
