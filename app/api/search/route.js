import { NextResponse } from "next/server";
import { yahooSearch } from "../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();

    // Backward-compatible: empty query → empty results (200)
    if (!q) {
      const payload = { ok: true, data: { results: [] }, results: [] };
      return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
    }

    const results = await yahooSearch(q);

    // Backward-compatible shape: keep top-level `results` while adding { ok, data }
    const payload = { ok: true, data: { results }, results };
    return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
  } catch (e) {
    const payload = {
      ok: false,
      error: { code: "UPSTREAM_ERROR", message: String(e?.message ?? e) },
    };
    // Proper status on failure; clients that ignore status will still see no `results`
    return NextResponse.json(payload, { status: 502, headers: cacheHeaders });
  }
}
