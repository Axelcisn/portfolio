// app/api/dividends/route.js
import { NextResponse } from "next/server";
import { DividendFetcher } from "../../../lib/providers/unifiedDataProvider.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dividendFetcher = new DividendFetcher();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const period = searchParams.get("period") || "1Y"; // 1Y, 2Y, 5Y, etc.
    const source = searchParams.get("source"); // Optional: force specific source
    const noCache = searchParams.get("nocache") === "1";

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    // Configure sources based on request
    if (source) {
      dividendFetcher.sources = [source.toLowerCase()];
    }

    const data = await dividendFetcher.fetch(symbol, {
      period,
      noCache
    });

    // Add yield calculation if we have price data
    if (data.summary && data.summary.totalDividends) {
      try {
        // Fetch current price
        const priceResponse = await fetch(
          `${req.nextUrl.origin}/api/company?symbol=${encodeURIComponent(symbol)}`,
          { cache: 'no-store' }
        );
        
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          if (priceData.spot) {
            data.summary.annualYield = (data.summary.totalDividends / priceData.spot) * 100;
            data.summary.currentPrice = priceData.spot;
          }
        }
      } catch (error) {
        console.warn('Failed to fetch price for yield calculation:', error);
      }
    }

    return NextResponse.json({
      ok: true,
      symbol,
      ...data,
      _timestamp: Date.now()
    }, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=1800"
      }
    });
  } catch (error) {
    console.error('Dividend API error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Failed to fetch dividend data"
    }, {
      status: 500
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { symbols = [], period = "1Y", dataTypes = ["dividends"] } = body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "Symbols array required" }, { status: 400 });
    }

    // Batch fetch for multiple symbols
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const data = await dividendFetcher.fetch(symbol, { period });
          return { symbol, data, ok: true };
        } catch (error) {
          return { symbol, error: error.message, ok: false };
        }
      })
    );

    return NextResponse.json({
      ok: true,
      results,
      _timestamp: Date.now()
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error.message || "Batch fetch failed"
    }, {
      status: 500
    });
  }
}
