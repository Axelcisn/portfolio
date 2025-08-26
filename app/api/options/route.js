// app/api/options/route.js
// Options chain endpoint - uses custom bridge or falls back to IBKR
import ibkrService from '../../../lib/services/ibkrService';
import bridgeService from '../../../lib/services/customBridgeService';

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
    let chain;
    let useBridge = true;
    
    // Try custom bridge first if it's configured
    if (process.env.IB_BRIDGE_URL || process.env.NEXT_PUBLIC_BRIDGE_URL) {
      try {
        // Parse window parameter if provided
        const window = searchParams.get("window") ? parseInt(searchParams.get("window")) : 3;
        chain = await bridgeService.getOptionsChain(symbol, window);
      } catch (bridgeError) {
        console.warn(`Bridge service failed, falling back to IBKR:`, bridgeError.message);
        useBridge = false;
      }
    } else {
      useBridge = false;
    }
    
    // Fall back to IBKR service if bridge failed or not configured
    if (!useBridge) {
      chain = await ibkrService.getOptionsChain(symbol, expiry);
    }
    
    // Get current quote for spot price
    let spotPrice = null;
    let currency = null;
    try {
      const quote = useBridge ? await bridgeService.getQuote(symbol) : await ibkrService.getQuote(symbol);
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
      source: useBridge ? "bridge" : "ibkr"
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
    // Return 200 with error payload to keep API consumer expectations stable (tests expect 200)
    return Response.json(payload, { status: 200 });
  }
}

