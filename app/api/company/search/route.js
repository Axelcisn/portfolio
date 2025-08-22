// app/api/company/search/route.js
// Company search endpoint - uses IBKR exclusively
import { NextResponse } from "next/server";
import ibkrService from "../../../../lib/services/ibkrService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") || searchParams.get("query") || "").trim();
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") || "10")));
  
  if (!query) {
    return NextResponse.json(
      { ok: false, error: "query required" },
      { status: 400 }
    );
  }
  
  try {
    const results = await ibkrService.searchSymbols(query, limit);
    
    return NextResponse.json({
      ok: true,
      source: "ibkr",
      query,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error(`Search failed for "${query}":`, error);
    return NextResponse.json(
      { ok: false, error: error.message || "IBKR search failed" },
      { status: 502 }
    );
  }
}
