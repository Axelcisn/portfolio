// app/api/provider/ib/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = (process.env.IB_PROXY_URL || "http://localhost:4010").replace(/\/$/, "");

const ok = (data, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) return ok({ ok: false, error: "symbol required" }, 400);

    // Ask the IB proxy
    const r = await fetch(`${BASE}/v1/company?symbol=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || j?.ok === false) {
      return ok({ ok: false, error: j?.error || "ib_unavailable" });
    }

    return ok({
      ok: true,
      source: "ib",
      symbol,
      longName: j.longName ?? null,
      currency: j.currency ?? null,
      primaryExchange: j.primaryExchange ?? null,
      exchangeName: j.primaryExchange ?? j.rawExchange ?? null,
      conid: j.conid ?? null,
      _meta: { via: BASE },
    });
  } catch (e) {
    return ok({ ok: false, error: String(e?.message ?? e) });
  }
}
