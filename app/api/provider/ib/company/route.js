// app/api/provider/ib/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IB_PROXY_URL = process.env.IB_PROXY_URL || "http://localhost:4010";

function ok(json, status = 200) {
  return NextResponse.json(json, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
function err(code, message, status = 200) {
  // return 200 to keep frontend tolerant, include error payload
  return ok({ ok: false, error: message, errorObj: { code, message } }, status);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  if (!symbol) return err("SYMBOL_REQUIRED", "symbol required");

  const u = `${IB_PROXY_URL}/v1/company?symbol=${encodeURIComponent(symbol)}`;

  try {
    const r = await fetch(u, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));

    // Proxy through but always add a tiny bit of context for debugging
    return ok({
      _via: "ib-proxy",
      _target: IB_PROXY_URL,
      ok: j?.ok !== false, // most proxy responses don't set ok=false on success
      ...j,
    });
  } catch (e) {
    return err("PROXY_FETCH_FAILED", String(e?.message ?? e));
  }
}
