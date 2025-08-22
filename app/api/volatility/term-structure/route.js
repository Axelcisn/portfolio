// app/api/volatility/term-structure/route.js
import { NextResponse } from "next/server";
import { fetchIvATM } from "../../../../lib/volatility.js";
import { mget, mset, mkey } from "../../../../lib/server/mcache.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_MS = 300 * 1000; // 5 minutes cache

/**
 * Fetch volatility term structure for a symbol
 * Returns IV for multiple expiry horizons
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const horizons = searchParams.get("horizons") || "7,14,30,60,90,180,365";
    const noCache = searchParams.get("nocache") === "1";

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    // Parse horizons
    const daysArray = horizons.split(",").map(d => parseInt(d)).filter(d => d > 0 && d <= 365);
    
    if (daysArray.length === 0) {
      return NextResponse.json({ error: "Invalid horizons" }, { status: 400 });
    }

    // Check cache
    const cacheKey = mkey("vol-term", symbol, horizons);
    if (!noCache) {
      const cached = mget(cacheKey);
      if (cached) {
        return NextResponse.json({
          ok: true,
          ...cached,
          _cache: "hit"
        });
      }
    }

    // Fetch IV for each horizon
    const termStructure = await Promise.all(
      daysArray.map(async (days) => {
        try {
          const result = await fetchIvATM(symbol, days);
          return {
            days,
            T: days / 365,
            iv: result?.sigmaAnnual || null,
            meta: result?.meta || {}
          };
        } catch (error) {
          console.warn(`Failed to fetch IV for ${symbol} at ${days} days:`, error);
          return {
            days,
            T: days / 365,
            iv: null,
            error: error.message
          };
        }
      })
    );

    // Calculate term structure metrics
    const validPoints = termStructure.filter(p => p.iv !== null);
    
    let termStructureShape = "unknown";
    let avgIV = null;
    let ivSpread = null;
    
    if (validPoints.length >= 2) {
      // Sort by days
      validPoints.sort((a, b) => a.days - b.days);
      
      // Calculate average IV
      avgIV = validPoints.reduce((sum, p) => sum + p.iv, 0) / validPoints.length;
      
      // Calculate spread (max - min)
      const ivValues = validPoints.map(p => p.iv);
      ivSpread = Math.max(...ivValues) - Math.min(...ivValues);
      
      // Determine shape (simplified)
      const shortTerm = validPoints[0]?.iv;
      const longTerm = validPoints[validPoints.length - 1]?.iv;
      
      if (shortTerm && longTerm) {
        if (longTerm > shortTerm * 1.05) {
          termStructureShape = "contango"; // Long-term vol higher
        } else if (shortTerm > longTerm * 1.05) {
          termStructureShape = "backwardation"; // Short-term vol higher
        } else {
          termStructureShape = "flat";
        }
      }
    }

    const result = {
      symbol,
      termStructure,
      summary: {
        validPoints: validPoints.length,
        totalPoints: daysArray.length,
        shape: termStructureShape,
        averageIV: avgIV,
        ivSpread,
        shortTermIV: validPoints[0]?.iv || null,
        longTermIV: validPoints[validPoints.length - 1]?.iv || null
      },
      timestamp: Date.now()
    };

    // Cache the result
    if (validPoints.length > 0) {
      mset(cacheKey, result, TTL_MS);
    }

    return NextResponse.json({
      ok: true,
      ...result,
      _cache: "miss"
    });
  } catch (error) {
    console.error("Term structure API error:", error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Failed to fetch term structure"
    }, {
      status: 500
    });
  }
}

/**
 * POST endpoint for volatility surface calculation
 * Accepts strike ranges and expiry horizons
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { 
      symbol, 
      strikes = [], // Array of strike prices or moneyness levels
      expiries = [7, 14, 30, 60, 90], // Days to expiry
      useMoneyness = false, // If true, strikes are % of spot
      spotPrice = null 
    } = body;

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    // Get current spot price if not provided
    let spot = spotPrice;
    if (!spot) {
      const priceResponse = await fetch(
        `${req.nextUrl.origin}/api/company?symbol=${encodeURIComponent(symbol)}`,
        { cache: 'no-store' }
      );
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        spot = priceData.spot;
      }
    }

    if (!spot) {
      return NextResponse.json({ error: "Unable to determine spot price" }, { status: 400 });
    }

    // Convert moneyness to strikes if needed
    let actualStrikes = strikes;
    if (useMoneyness && strikes.length > 0) {
      actualStrikes = strikes.map(m => spot * (m / 100));
    }

    // If no strikes provided, generate a default grid
    if (actualStrikes.length === 0) {
      const moneyness = [80, 85, 90, 95, 100, 105, 110, 115, 120];
      actualStrikes = moneyness.map(m => spot * (m / 100));
    }

    // Build the volatility surface
    // Note: This is a simplified implementation. In production, you'd fetch
    // actual option chain data and calculate IVs for each strike/expiry combination
    const surface = {
      spot,
      strikes: actualStrikes,
      expiries,
      grid: [], // Will contain IV values for each strike/expiry combination
      timestamp: Date.now()
    };

    // For now, we'll create a simplified surface based on ATM term structure
    // In a real implementation, this would fetch full option chains
    const atmTermStructure = await Promise.all(
      expiries.map(async (days) => {
        const result = await fetchIvATM(symbol, days);
        return result?.sigmaAnnual || null;
      })
    );

    // Generate a simple smile/skew pattern
    surface.grid = actualStrikes.map(strike => {
      const moneyness = strike / spot;
      return expiries.map((days, idx) => {
        const atmIV = atmTermStructure[idx];
        if (!atmIV) return null;
        
        // Simple volatility smile approximation
        // In reality, this would come from actual option prices
        const otmPenalty = Math.abs(1 - moneyness) * 0.1; // 10% per 100% moneyness
        const smile = atmIV * (1 + otmPenalty);
        
        return {
          strike,
          expiry: days,
          T: days / 365,
          iv: smile,
          moneyness: moneyness * 100
        };
      });
    });

    return NextResponse.json({
      ok: true,
      symbol,
      surface,
      methodology: "simplified_smile",
      note: "This is a simplified volatility surface. For production use, implement full option chain IV calculation."
    });
  } catch (error) {
    console.error("Volatility surface API error:", error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Failed to generate volatility surface"
    }, {
      status: 500
    });
  }
}
