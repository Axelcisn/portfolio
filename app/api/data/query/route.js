// app/api/data/query/route.js
import { NextResponse } from "next/server";
import { queryRegistry, QueryComposer, DynamicQueryBuilder } from "../../../../lib/providers/queryTemplates.js";
import { dataProvider } from "../../../../lib/providers/unifiedDataProvider.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET endpoint to list available query templates
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const templateName = searchParams.get("template");

    // If specific template requested, return its details
    if (templateName) {
      const template = queryRegistry.get(templateName);
      if (!template) {
        return NextResponse.json({
          ok: false,
          error: `Template '${templateName}' not found`
        }, { status: 404 });
      }

      return NextResponse.json({
        ok: true,
        template: {
          name: template.name,
          description: template.description,
          parameters: template.parameters,
          sources: template.sources,
          cacheTime: template.cacheTime
        }
      });
    }

    // Return list of all available templates
    const templates = queryRegistry.list();
    
    return NextResponse.json({
      ok: true,
      templates,
      count: templates.length,
      categories: {
        market_data: ['earnings_calendar', 'analyst_ratings', 'short_interest'],
        options: ['options_flow', 'historical_volatility'],
        fundamentals: ['peer_comparison', 'insider_trading'],
        technical: ['technical_indicators', 'market_correlations'],
        sentiment: ['news_sentiment']
      }
    });
  } catch (error) {
    console.error('Query template GET error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Failed to retrieve templates"
    }, { status: 500 });
  }
}

/**
 * POST endpoint to execute query templates
 */
export async function POST(req) {
  try {
    const body = await req.json();
    const { 
      template,      // Single template name
      templates,     // Multiple templates for composition
      params = {},   // Parameters for the query
      mode = 'single', // 'single', 'compose', 'sequential', 'dynamic'
      query          // For dynamic query mode
    } = body;

    // Mode: Single Template Execution
    if (mode === 'single') {
      if (!template) {
        return NextResponse.json({
          ok: false,
          error: "Template name required for single mode"
        }, { status: 400 });
      }

      try {
        const result = await queryRegistry.execute(template, params);
        
        return NextResponse.json({
          ok: true,
          template,
          result,
          timestamp: Date.now()
        });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          template,
          error: error.message
        }, { status: 500 });
      }
    }

    // Mode: Compose Multiple Templates
    if (mode === 'compose' || mode === 'sequential') {
      if (!templates || !Array.isArray(templates)) {
        return NextResponse.json({
          ok: false,
          error: "Templates array required for compose mode"
        }, { status: 400 });
      }

      const composer = new QueryComposer();
      
      // Add each template to the composer
      templates.forEach(t => {
        if (typeof t === 'string') {
          composer.add(t, params);
        } else if (typeof t === 'object' && t.name) {
          composer.add(t.name, t.params || params);
        }
      });

      try {
        const results = mode === 'sequential' 
          ? await composer.executeSequential()
          : await composer.execute();
        
        return NextResponse.json({
          ok: true,
          mode,
          results,
          timestamp: Date.now()
        });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          mode,
          error: error.message
        }, { status: 500 });
      }
    }

    // Mode: Dynamic Query Building
    if (mode === 'dynamic') {
      if (!query || typeof query !== 'object') {
        return NextResponse.json({
          ok: false,
          error: "Query object required for dynamic mode"
        }, { status: 400 });
      }

      // Example dynamic query structure:
      // {
      //   "dataType": "dividend",
      //   "symbols": ["AAPL", "MSFT"],
      //   "period": "1Y",
      //   "aggregate": "sum"
      // }

      try {
        const { dataType, symbols, ...options } = query;
        
        if (!dataType || !symbols || !Array.isArray(symbols)) {
          return NextResponse.json({
            ok: false,
            error: "Dynamic query requires dataType and symbols array"
          }, { status: 400 });
        }

        // Execute dynamic query across multiple symbols
        const results = await Promise.all(
          symbols.map(async symbol => {
            try {
              const data = await dataProvider.fetch(dataType, symbol, options);
              return { symbol, data, ok: true };
            } catch (error) {
              return { symbol, error: error.message, ok: false };
            }
          })
        );

        // Apply aggregation if requested
        let aggregated = null;
        if (query.aggregate) {
          aggregated = aggregateResults(results, query.aggregate);
        }

        return NextResponse.json({
          ok: true,
          mode: 'dynamic',
          query,
          results,
          aggregated,
          timestamp: Date.now()
        });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          mode: 'dynamic',
          error: error.message
        }, { status: 500 });
      }
    }

    // Mode: Unified Data Fetch (using the unified provider)
    if (mode === 'unified') {
      const { symbol, dataTypes = ['dividend', 'corporate', 'fundamental'] } = body;
      
      if (!symbol) {
        return NextResponse.json({
          ok: false,
          error: "Symbol required for unified mode"
        }, { status: 400 });
      }

      try {
        const result = await dataProvider.fetchAll(symbol, dataTypes, params);
        
        return NextResponse.json({
          ok: true,
          mode: 'unified',
          symbol,
          ...result
        });
      } catch (error) {
        return NextResponse.json({
          ok: false,
          mode: 'unified',
          error: error.message
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: false,
      error: `Unknown mode: ${mode}. Valid modes are: single, compose, sequential, dynamic, unified`
    }, { status: 400 });

  } catch (error) {
    console.error('Query template POST error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message || "Failed to execute query"
    }, { status: 500 });
  }
}

/**
 * Helper function to aggregate results
 */
function aggregateResults(results, aggregationType) {
  const successful = results.filter(r => r.ok);
  
  switch (aggregationType) {
    case 'sum':
      return successful.reduce((acc, r) => {
        if (r.data?.summary?.totalDividends) {
          acc.totalDividends = (acc.totalDividends || 0) + r.data.summary.totalDividends;
        }
        if (r.data?.summary?.totalActions) {
          acc.totalActions = (acc.totalActions || 0) + r.data.summary.totalActions;
        }
        return acc;
      }, {});
    
    case 'average':
      const values = successful
        .map(r => r.data?.summary?.annualYield)
        .filter(v => v !== null && v !== undefined);
      return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
    
    case 'count':
      return {
        total: results.length,
        successful: successful.length,
        failed: results.length - successful.length
      };
    
    default:
      return null;
  }
}
