// app/api/yahoo/session/route.js
import {
  getYahooSessionInfo,
  resetYahooSession,
} from "@/lib/providers/yahooSession";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/yahoo/session  -> inspect current session health
export async function GET() {
  try {
    const info = getYahooSessionInfo();
    return new Response(
      JSON.stringify({ ok: true, session: info }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "inspect failed" }),
      { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
}

// POST /api/yahoo/session -> force refresh (repair)
export async function POST() {
  try {
    const res = await resetYahooSession();
    const info = getYahooSessionInfo();
    return new Response(
      JSON.stringify({ ok: !!res?.ok, session: info }),
      { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "reset failed" }),
      { status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
    );
  }
}
