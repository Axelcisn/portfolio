// app/api/ibkr/options/expiries/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IB_PROXY_URL = process.env.IB_PROXY_URL || "http://localhost:5001";

// 30s micro-cache
const TTL_MS = 30 * 1000;
const CACHE = new Map();

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
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const noCache = searchParams.get("nocache") === "1";

    if (!symbol) {
      return NextResponse.json({ ok: false, error: "symbol required" }, { status: 400 });
    }

    // Serve from cache unless bypassed
    if (!noCache) {
      const cached = getCached(symbol);
      if (cached) {
        return NextResponse.json({ ok: true, expiries: cached, source: "cache" });
      }
    }

    // Step 1: Search for the stock contract
    const searchUrl = `${IB_PROXY_URL}/v1/portal/iserver/secdef/search`;
    const searchRes = await fetch(searchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, secType: "STK" }),
      cache: "no-store",
    });

    if (!searchRes.ok) {
      throw new Error(`Search failed: ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const stockContract = searchData?.find(c => c.symbol === symbol && c.secType === "STK");
    
    if (!stockContract?.conid) {
      return NextResponse.json({ 
        ok: false, 
        error: "Stock not found",
        expiries: [] 
      }, { status: 404 });
    }

    // Step 2: Get option chains for the stock
    const secdefUrl = `${IB_PROXY_URL}/v1/portal/iserver/secdef/info`;
    const secdefRes = await fetch(secdefUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    if (!secdefRes.ok) {
      throw new Error(`Secdef info failed: ${secdefRes.status}`);
    }

    const secdefData = await secdefRes.json();

    // Step 3: Get strikes and expiries using the stock conid
    const strikesUrl = `${IB_PROXY_URL}/v1/portal/iserver/secdef/strikes`;
    const strikesRes = await fetch(strikesUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    let expiries = [];
    
    if (strikesRes.ok) {
      const strikesData = await strikesRes.json();
      
      // Extract expiries from the response
      // The format may vary, so we handle multiple possibilities
      if (strikesData?.expirations) {
        expiries = strikesData.expirations;
      } else if (Array.isArray(strikesData)) {
        // Sometimes it returns an array of dates
        expiries = strikesData;
      }
    }

    // Alternative: Try the option chains endpoint
    if (expiries.length === 0) {
      const chainsUrl = `${IB_PROXY_URL}/v1/portal/iserver/secdef/option-chains?symbol=${symbol}`;
      const chainsRes = await fetch(chainsUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (chainsRes.ok) {
        const chainsData = await chainsRes.json();
        if (chainsData?.expirations) {
          expiries = chainsData.expirations;
        }
      }
    }

    // Format expiries to ISO date strings (YYYY-MM-DD)
    const formattedExpiries = expiries
      .map(exp => {
        // Handle different date formats from IB
        if (typeof exp === "string") {
          // If it's YYYYMMDD format
          if (/^\d{8}$/.test(exp)) {
            return `${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`;
          }
          // If it's already in ISO format
          if (/^\d{4}-\d{2}-\d{2}/.test(exp)) {
            return exp.slice(0, 10);
          }
        }
        // If it's a timestamp
        if (typeof exp === "number") {
          return new Date(exp * 1000).toISOString().slice(0, 10);
        }
        return null;
      })
      .filter(Boolean)
      .sort();

    // Cache successful result
    setCached(symbol, formattedExpiries);

    return NextResponse.json({ 
      ok: true, 
      expiries: formattedExpiries,
      source: "ibkr"
    });

  } catch (error) {
    console.error("IBKR expiries error:", error);
    
    // Fallback to Yahoo if IBKR fails
    try {
      const yahooRes = await fetch(`/api/expiries?symbol=${searchParams.get("symbol")}`, {
        cache: "no-store"
      });
      
      if (yahooRes.ok) {
        const yahooData = await yahooRes.json();
        return NextResponse.json({
          ...yahooData,
          source: "yahoo_fallback"
        });
      }
    } catch {}

    return NextResponse.json(
      { ok: false, error: error?.message || "Failed to fetch expiries" },
      { status: 502 }
    );
  }
}
