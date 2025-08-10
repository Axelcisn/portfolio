import { NextResponse } from "next/server";
import { robustQuote } from "../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

function err(status, code, message) {
  // Back-compat: `error` is a STRING (UI expects this), plus structured `errorObj`
  return NextResponse.json(
    { ok: false, error: message, errorObj: { code, message } },
    { status, headers: cacheHeaders }
  );
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();

    if (!symbol) return err(400, "SYMBOL_REQUIRED", "symbol required");

    const quote = await robustQuote(symbol);
    if (!quote || !Number.isFinite(quote.spot)) {
      return err(502, "QUOTE_UNAVAILABLE", "quote unavailable");
    }

    // Back-compat: keep top-level fields AND envelope
    const payload = { ok: true, data: quote, ...quote };
    return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
  } catch (e) {
    return err(500, "INTERNAL_ERROR", String(e?.message ?? e));
  }
}
