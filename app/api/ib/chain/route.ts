import { NextResponse } from "next/server";
import { Agent, type Dispatcher } from "undici";
import { generateMockChain } from "lib/providers/mockOptionsData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow enabling mock mode via environment variable
const USE_MOCK = process.env.OPTIONS_DATA_SOURCE === "mock" || process.env.USE_MOCK_OPTIONS === "true";

// Try mock server first, then fallback to IB bridge
const MOCK_BASE = "http://localhost:4010";
const IB_BASE = "http://127.0.0.1:5055";
const BASE = (process.env.IB_PROXY_URL || process.env.IB_API_BASE || IB_BASE).replace(/\/+$/, "");
const BEARER = process.env.IB_PROXY_TOKEN || "";
const BRIDGE = process.env.X_IB_BRIDGE_TOKEN || process.env.IB_BRIDGE_TOKEN || "";

async function fetchChain(url: string, skipAuth: boolean = false) {
  const dispatcher: Dispatcher | undefined = url.startsWith("https:")
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;
  const headers: Record<string, string> = { accept: "application/json" };
  
  // Only add auth headers if not skipped (for mock server)
  if (!skipAuth) {
    if (BEARER) headers["Authorization"] = `Bearer ${BEARER}`;
    else if (BRIDGE) headers["x-ib-bridge-token"] = BRIDGE;
  }
  
  const opts: RequestInit & { dispatcher?: Dispatcher } = {
    headers,
    cache: "no-store",
    ...(dispatcher ? { dispatcher } : {}),
  };
  const r = await fetch(url, opts);
  const json = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, json };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").toUpperCase();
    if (!symbol) {
      return NextResponse.json({ error: "symbol is required" }, { status: 400 });
    }
    
    // Check if we should use mock data
    const forceMock = searchParams.get("mock") === "true";
    if (USE_MOCK || forceMock) {
      console.log('[IB Chain] Using mock data for symbol:', symbol);
      const mockData = generateMockChain(symbol);
      return NextResponse.json(mockData, { status: 200 });
    }
    
    // Try primary URL first
    const primaryUrl = `${BASE}/options/chain3?symbol=${encodeURIComponent(symbol)}`;
    
    // Debug logging
    console.log('[IB Chain] Primary BASE URL:', BASE);
    console.log('[IB Chain] Primary Full URL:', primaryUrl);
    console.log('[IB Chain] Using Bearer:', !!BEARER);
    console.log('[IB Chain] Using Bridge Token:', !!BRIDGE);
    
    const { ok, status, json } = await fetchChain(primaryUrl);
    
    // Log response status
    console.log('[IB Chain] Primary response status:', status, 'ok:', ok);
    
    // If we get an auth error, try fallbacks
    if (!ok && (status === 401 || json?.authRequired || json?.error === "unauthorized")) {
      console.log('[IB Chain] Auth failed, trying fallbacks...');
      
      // First try mock server if available
      const mockUrl = `${MOCK_BASE}/options/chain3?symbol=${encodeURIComponent(symbol)}`;
      
      try {
        const mockResult = await fetchChain(mockUrl, true); // Skip auth for mock server
        console.log('[IB Chain] Mock server response status:', mockResult.status, 'ok:', mockResult.ok);
        
        if (mockResult.ok && mockResult.json) {
          return NextResponse.json(mockResult.json, { status: 200 });
        }
      } catch (mockErr) {
        console.log('[IB Chain] Mock server failed:', mockErr);
      }
      
      // If mock server fails, use generated mock data
      console.log('[IB Chain] Falling back to generated mock data for symbol:', symbol);
      const mockData = generateMockChain(symbol);
      return NextResponse.json(mockData, { status: 200 });
    }
    
    return NextResponse.json(json, { status: ok ? 200 : status || 500 });
  } catch (err: any) {
    console.error('[IB Chain] Error:', err?.message);
    return NextResponse.json({ error: err?.message || "chain proxy failed" }, { status: 500 });
  }
}
