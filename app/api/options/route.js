// app/api/options/route.js
// Options chain endpoint - uses IBKR exclusively
import ibkrService from '../../../lib/services/ibkrService';

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ---- 30s micro-cache (module scoped) ----
const TTL_MS = 30 * 1000;
const CACHE = new Map(); // key: SYMBOL|DATE -> { ts, payload }

function getKey(symbol, expiry) {
  return `${String(symbol || "").toUpperCase()}|${String(expiry || "")}`;
}

function getCached(symbol, expiry) {
  const k = getKey(symbol, expiry);
  const hit = CACHE.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    CACHE.delete(k);
    return null;
  }
  return hit.payload;
}

function setCached(symbol, expiry, payload) {
  const k = getKey(symbol, expiry);
  CACHE.set(k, { ts: Date.now(), payload });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const expiry = (searchParams.get("date") || searchParams.get("expiry") || "").trim();
  const noCache = searchParams.get("nocache") === "1";

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  // Serve from cache if available (unless bypassed)
  if (!noCache) {
    const cached = getCached(symbol, expiry);
    if (cached) {
      return Response.json({ ...cached, source: "cache" });
    }
  }

  try {
    // Get options chain from IBKR
    const chain = await ibkrService.getOptionsChain(symbol, expiry);
    
    // Get current quote for spot price
    let spotPrice = null;
    let currency = null;
    try {
      const quote = await ibkrService.getQuote(symbol);
      spotPrice = quote.price || ((quote.bid + quote.ask) / 2) || null;
      currency = quote.currency;
    } catch (e) {
      console.warn(`Could not get spot price for ${symbol}:`, e.message);
    }
    
    // Transform to expected format
    const payload = {
      ok: true,
      data: {
        calls: chain.calls || [],
        puts: chain.puts || [],
        meta: {
          spot: spotPrice,
          currency: currency,
          expiry: chain.selectedExpiry || expiry || (chain.expiries && chain.expiries[0]) || null,
          availableExpiries: chain.expiries || []
        }
      },
      source: "ibkr"
    };
    
    // Cache successful result
    setCached(symbol, expiry, payload);
    return Response.json(payload);
  } catch (error) {
    console.error(`Failed to get options chain for ${symbol}:`, error);
    
    // Provide helpful error messages
    let errorMsg = error.message || "IBKR fetch failed";
    if (error.message.includes('not found')) {
      errorMsg = `Symbol ${symbol} not found or no options available`;
    } else if (error.message.includes('connection failed')) {
      errorMsg = "Cannot connect to IBKR gateway. Please ensure it's running and authenticated.";
    }
    
    const payload = { 
      ok: false, 
      error: errorMsg,
      symbol 
    };
    return Response.json(payload, { status: 502 });
  }
}

