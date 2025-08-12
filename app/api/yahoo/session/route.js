// app/api/yahoo/session/route.js
import {
  resetYahooSession,
  getYahooSessionInfo,
} from "../../../../lib/providers/yahooSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/yahoo/session  -> quick status probe
export async function GET() {
  try {
    const info = getYahooSessionInfo();
    return Response.json({ ok: info.ok, info });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "status failed" },
      { status: 500 }
    );
  }
}

// POST /api/yahoo/session -> force refresh cookie/crumb (Repair button)
export async function POST() {
  try {
    const refreshed = await resetYahooSession();
    return Response.json({ ok: true, refreshed });
  } catch (e) {
    return Response.json(
      { ok: false, error: e?.message || "refresh failed" },
      { status: 500 }
    );
  }
}
