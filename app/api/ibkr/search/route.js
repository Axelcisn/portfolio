// app/api/ibkr/search/route.js
// IBKR search endpoint - wrapper around ibkrService
import { NextResponse } from "next/server";
import ibkrService from "../../../../lib/services/ibkrService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeQuery(q) { 
  return (q || "").trim(); 
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const query = normalizeQuery(searchParams.get("q"));
  const limit = Math.min(20, Math.max(1, +(searchParams.get("limit") || 8)));
  
  if (!query) {
    return NextResponse.json({ ok: true, source: "ibkr", q: query, count: 0, data: [] });
  }
  
  try {
    const data = await ibkrService.searchSymbols(query, limit);
    return NextResponse.json({ 
      ok: true, 
      source: "ibkr", 
      q: query, 
      count: data.length, 
      data 
    });
  } catch (err) {
    console.error(`IBKR search failed for "${query}":`, err);
    
    // Return error instead of falling back to mock
    // The service should handle connection issues internally
    return NextResponse.json({ 
      ok: false, 
      error: err.message || "IBKR search failed",
      q: query 
    }, { status: 502 });
  }
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const query = normalizeQuery(body.q || body.query || body.symbol);
  const limit = Math.min(20, Math.max(1, +(body.limit || 8)));
  
  if (!query) {
    return NextResponse.json({ ok: true, source: "ibkr", q: query, count: 0, data: [] });
  }
  
  try {
    const data = await ibkrService.searchSymbols(query, limit);
    return NextResponse.json({ 
      ok: true, 
      source: "ibkr", 
      q: query, 
      count: data.length, 
      data 
    });
  } catch (err) {
    console.error(`IBKR search failed for "${query}":`, err);
    return NextResponse.json({ 
      ok: false, 
      error: err.message || "IBKR search failed" 
    }, { status: 502 });
  }
}
