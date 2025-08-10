import { NextResponse } from "next/server";
import { robustQuote } from "../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { ok: false, error: { code: "SYMBOL_REQUIRED", message: "symbol required" } },
        { status: 400, headers: cacheHeaders }
      );
    }

    const quote = await robustQuote(symbol);

    if (!quote || !Number.isFinite(quote.spot)) {
      return NextResponse.json(
        { ok: false, error: { code: "QUOTE_UNAVAILABLE", message: "quote unavailable" } },
        { status: 502, headers: cacheHeaders }
      );
    }

    // Backward-compatible: spread fields at top-level AND provide { ok, data }
    const payload = { ok: true, data: quote, ...quote };
    return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: String(e?.message ?? e) } },
      { status: 500, headers: cacheHeaders }
    );
  }
}
