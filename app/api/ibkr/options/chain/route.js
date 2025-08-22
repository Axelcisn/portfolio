// app/api/ibkr/options/chain/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IB_PROXY_URL = process.env.IB_PROXY_URL || "http://localhost:5001";

// 30s micro-cache
const TTL_MS = 30 * 1000;
const CACHE = new Map();

function getKey(symbol, dateISO) {
  return `${String(symbol || "").toUpperCase()}|${String(dateISO || "")}`;
}

function getCached(symbol, dateISO) {
  const k = getKey(symbol, dateISO);
  const hit = CACHE.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    CACHE.delete(k);
    return null;
  }
  return hit.payload;
}

function setCached(symbol, dateISO, payload) {
  const k = getKey(symbol, dateISO);
  CACHE.set(k, { ts: Date.now(), payload });
}

// Helper to convert date to IB format (YYYYMMDD)
function toIBDateFormat(dateStr) {
  if (!dateStr) return null;
  
  // Handle ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.replace(/-/g, '').slice(0, 8);
  }
  
  // Handle YYYYMMDD format
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Try to parse as date
  const d = new Date(dateStr);
  if (Number.isFinite(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }
  
  return null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const dateParam = (searchParams.get("date") || "").trim();
    const noCache = searchParams.get("nocache") === "1";

    if (!symbol) {
      return NextResponse.json({ ok: false, error: "symbol required" }, { status: 400 });
    }

    // Serve from cache unless bypassed
    if (!noCache) {
      const cached = getCached(symbol, dateParam);
      if (cached) {
        return NextResponse.json(cached);
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
        error: "Stock not found"
      }, { status: 404 });
    }

    // Step 2: Get market data for spot price
    const spotUrl = `${IB_PROXY_URL}/v1/portal/iserver/marketdata/snapshot`;
    const spotRes = await fetch(spotUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    let spotPrice = null;
    let currency = "USD";
    
    if (spotRes.ok) {
      const spotData = await spotRes.json();
      if (Array.isArray(spotData) && spotData[0]) {
        // Field 31 is typically last price
        spotPrice = spotData[0]["31"] || spotData[0]["84"] || null; // 84 is bid if no last
        currency = spotData[0].currency || "USD";
      }
    }

    // Step 3: Get option contracts for the specified expiry
    const ibDate = toIBDateFormat(dateParam);
    
    // Search for option contracts
    const optSearchUrl = `${IB_PROXY_URL}/v1/portal/iserver/secdef/search`;
    const optSearchBody = {
      symbol: symbol,
      secType: "OPT",
      // Add expiry filter if provided
      ...(ibDate && { expiry: ibDate })
    };

    const optSearchRes = await fetch(optSearchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(optSearchBody),
      cache: "no-store",
    });

    if (!optSearchRes.ok) {
      throw new Error(`Option search failed: ${optSearchRes.status}`);
    }

    const optionContracts = await optSearchRes.json();
    
    // Separate calls and puts
    const calls = [];
    const puts = [];
    
    // Get market data for each option contract
    const conidList = [];
    const contractMap = {};
    
    for (const contract of optionContracts) {
      if (!contract.conid) continue;
      
      // Parse contract details
      const isCall = contract.right === "C" || (contract.description && contract.description.includes("CALL"));
      const strike = parseFloat(contract.strike);
      
      if (!Number.isFinite(strike)) continue;
      
      conidList.push(contract.conid);
      contractMap[contract.conid] = {
        strike,
        type: isCall ? "CALL" : "PUT",
        expiry: contract.expiry || dateParam
      };
    }

    // Batch request market data for all options
    if (conidList.length > 0) {
      const marketDataUrl = `${IB_PROXY_URL}/v1/portal/iserver/marketdata/snapshot`;
      const marketDataRes = await fetch(marketDataUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });

      if (marketDataRes.ok) {
        const marketData = await marketDataRes.json();
        
        // Process market data for each contract
        for (const data of marketData) {
          const conid = data.conid;
          const contract = contractMap[conid];
          
          if (!contract) continue;
          
          const optionData = {
            strike: contract.strike,
            bid: parseFloat(data["84"]) || null,    // Field 84: Bid
            ask: parseFloat(data["86"]) || null,    // Field 86: Ask
            price: parseFloat(data["31"]) || null,  // Field 31: Last price
            ivPct: parseFloat(data["87"]) || null,  // Field 87: Implied volatility (might need adjustment)
            volume: parseInt(data["87"]) || null,   // Field 87: Volume
            openInterest: parseInt(data["88"]) || null, // Field 88: Open interest
          };
          
          if (contract.type === "CALL") {
            calls.push(optionData);
          } else {
            puts.push(optionData);
          }
        }
      }
    }

    // Sort by strike price
    calls.sort((a, b) => a.strike - b.strike);
    puts.sort((a, b) => a.strike - b.strike);

    const payload = {
      ok: true,
      data: {
        calls,
        puts,
        meta: {
          symbol,
          currency,
          spot: spotPrice,
          expiry: dateParam || null,
        },
      },
      source: "ibkr"
    };

    // Cache successful result
    setCached(symbol, dateParam, payload);

    return NextResponse.json(payload);

  } catch (error) {
    console.error("IBKR chain error:", error);
    
    // Fallback to Yahoo if IBKR fails
    try {
      const yahooUrl = `/api/options?symbol=${searchParams.get("symbol")}`;
      if (searchParams.get("date")) {
        yahooUrl += `&date=${searchParams.get("date")}`;
      }
      
      const yahooRes = await fetch(yahooUrl, {
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
      { ok: false, error: error?.message || "Failed to fetch option chain" },
      { status: 502 }
    );
  }
}
