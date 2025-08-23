// app/api/expiries/route.js
// Options expiries endpoint - uses IBKR exclusively
import ibkrService from '../../../lib/services/ibkrService.js';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---- 30s micro-cache (module scoped) ----
const TTL_MS = 30 * 1000;
const CACHE = new Map(); // key: SYMBOL -> { ts, expiries: string[] }

function getCached(symbol) {
  const key = String(symbol || "").toUpperCase();
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.expiries;
}

function setCached(symbol, expiries) {
  const key = String(symbol || "").toUpperCase();
  CACHE.set(key, { ts: Date.now(), expiries: Array.isArray(expiries) ? expiries : [] });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const noCache = searchParams.get("nocache") === "1";

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  // serve from cache unless bypassed
  if (!noCache) {
    const cached = getCached(symbol);
    if (cached) {
      return Response.json({ ok: true, expiries: cached, source: "cache" });
    }
  }

  try {
    // Get expiries from IBKR
    const expiries = await ibkrService.getOptionExpiries(symbol);
    
    // Cache successful result
    setCached(symbol, expiries);
    
    return Response.json({ 
      ok: true, 
      expiries, 
      source: "ibkr",
      symbol 
    });
  } catch (error) {
    console.error(`Failed to get expiries for ${symbol}:`, error);
    return Response.json({ 
      ok: false, 
      error: error.message || "IBKR fetch failed",
      symbol 
    }, { status: 502 });
  }
}
