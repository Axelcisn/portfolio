// app/api/corporate-actions/route.js
import { NextResponse } from "next/server";
import { CorporateActionsFetcher } from "../../../lib/providers/unifiedDataProvider.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corporateFetcher = new CorporateActionsFetcher();

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const period = searchParams.get("period") || "5Y"; // Default to 5 years of history
    const actionType = searchParams.get("type"); // Optional: filter by type (split, merger, etc.)
    const source = searchParams.get("source"); // Optional: force specific source
    const noCache = searchParams.get("nocache") === "1";

    if (!symbol) {
      return NextResponse.json({ error: "Symbol required" }, { status: 400 });
    }

    // Configure sources based on request
    if (source) {
      corporateFetcher.sources = [source.toLowerCase()];
    }

    const data = await corporateFetcher.fetch(symbol, {
      period,
      noCache
    });

    // Filter by action type if requested
    if (actionType && data?.actions) {
      data.actions = data.actions.filter(action => 
        action.type?.toLowerCase() === actionType.toLowerCase()
      );
      
      // Rebuild summary
      data.summary = {
        totalActions: data.actions.length,
        splits: actionType === 'split' ? data.actions : [],
        mergers: actionType === 'merger' ? data.actions : [],
        spinoffs: actionType === 'spinoff' ? data.actions : [],
        other: !['split', 'merger', 'spinoff'].includes(actionType) ? data.actions : []
      };
    }

    return NextResponse.json({
      ok: true,
      symbol,
      ...data,
      _timestamp: Date.now()
    }, {
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=43200" // Cache for 24h
      }
    });
  } catch (error) {
    console.error('Corporate actions API error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Failed to fetch corporate actions"
    }, {
      status: 500
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { 
      symbols = [], 
      period = "5Y",
      actionTypes = [], // Filter for specific action types
      startDate = null,
      endDate = null
    } = body;

    if (!Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "Symbols array required" }, { status: 400 });
    }

    // Batch fetch for multiple symbols
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const data = await corporateFetcher.fetch(symbol, { period });
          
          // Apply date filtering if provided
          if (data?.actions && (startDate || endDate)) {
            const start = startDate ? new Date(startDate) : new Date(0);
            const end = endDate ? new Date(endDate) : new Date();
            
            data.actions = data.actions.filter(action => {
              const actionDate = new Date(action.date);
              return actionDate >= start && actionDate <= end;
            });
          }
          
          // Apply type filtering if provided
          if (data?.actions && actionTypes.length > 0) {
            data.actions = data.actions.filter(action =>
              actionTypes.includes(action.type)
            );
          }
          
          return { symbol, data, ok: true };
        } catch (error) {
          return { symbol, error: error.message, ok: false };
        }
      })
    );

    // Aggregate statistics across all symbols
    const aggregateStats = {
      totalActions: 0,
      byType: {},
      bySymbol: {}
    };

    results.forEach(result => {
      if (result.ok && result.data?.actions) {
        aggregateStats.totalActions += result.data.actions.length;
        aggregateStats.bySymbol[result.symbol] = result.data.actions.length;
        
        result.data.actions.forEach(action => {
          const type = action.type || 'other';
          aggregateStats.byType[type] = (aggregateStats.byType[type] || 0) + 1;
        });
      }
    });

    return NextResponse.json({
      ok: true,
      results,
      aggregateStats,
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
