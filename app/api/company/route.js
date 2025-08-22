// app/api/company/route.js
// Company quote endpoint - uses IBKR exclusively
import { NextResponse } from "next/server";
import ibkrService from "../../../lib/services/ibkrService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "")
    .trim()
    .toUpperCase();
    
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  
  try {
    // Get quote data from IBKR
    const quote = await ibkrService.getQuote(symbol);
    
    // Calculate derived values
    let spot = quote.price;
    if (!spot && quote.bid && quote.ask) {
      spot = (quote.bid + quote.ask) / 2;
    } else if (!spot && quote.bid) {
      spot = quote.bid;
    } else if (!spot && quote.ask) {
      spot = quote.ask;
    }
    
    let prevClose = quote.close;
    let change = null;
    let changePct = quote.changePercent;
    
    if (spot && prevClose) {
      change = spot - prevClose;
      if (!changePct) {
        changePct = (change / prevClose) * 100;
      }
    } else if (spot && changePct) {
      prevClose = spot / (1 + changePct / 100);
      change = spot - prevClose;
    }
    
    return NextResponse.json(
      {
        symbol: quote.symbol,
        currency: quote.currency,
        spot: spot || null,
        prevClose: prevClose || null,
        change: change || null,
        changePct: changePct || null,
        session: "At close",
        // Additional fields from IBKR
        name: quote.name,
        exchange: quote.exchange,
        bid: quote.bid,
        ask: quote.ask,
        high: quote.high,
        low: quote.low,
        volume: quote.volume,
        high52Week: quote.high52Week,
        low52Week: quote.low52Week
      },
      { status: 200 }
    );
  } catch (e) {
    console.error(`Failed to get quote for ${symbol}:`, e);
    return NextResponse.json(
      { error: e.message || "IBKR quote failed" },
      { status: 502 }
    );
  }
}
