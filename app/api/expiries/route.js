// app/api/expiries/route.js
export const dynamic = "force-dynamic";

import { yahooListExpiries } from "../../../lib/yahooOptions.js";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  try {
    const expiries = await yahooListExpiries(symbol);
    return Response.json({ ok: true, data: expiries }, { status: 200 });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "failed to fetch expiries" },
      { status: 500 }
    );
  }
}
