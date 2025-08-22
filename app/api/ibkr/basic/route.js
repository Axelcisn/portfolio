// app/api/ibkr/basic/route.js
// IBKR basic quote endpoint - wrapper around ibkrService
import ibkrService from '../../../../lib/services/ibkrService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || '').trim().toUpperCase();
  
  if (!symbol) {
    return Response.json({ ok: false, error: 'symbol required' }, { status: 400 });
  }
  
  try {
    // Get quote from IBKR service
    const quote = await ibkrService.getQuote(symbol);
    
    // Transform to basic format (backward compatibility)
    const fields = {};
    if (quote.bid !== null) fields['84'] = String(quote.bid);
    if (quote.ask !== null) fields['86'] = String(quote.ask);
    if (quote.high !== null) fields['70'] = String(quote.high);
    if (quote.low !== null) fields['71'] = String(quote.low);
    if (quote.changePercent !== null) fields['83'] = String(quote.changePercent);
    if (quote.price !== null) fields['31'] = String(quote.price);
    
    const out = {
      ok: true,
      symbol: quote.symbol,
      name: quote.name,
      exchange: quote.exchange,
      currency: quote.currency,
      conid: quote.conid,
      price: quote.price,
      fields,
      ts: quote.timestamp || Date.now()
    };
    
    return Response.json(out);
  } catch (err) {
    console.error(`Failed to get basic quote for ${symbol}:`, err);
    return Response.json(
      { ok: false, error: err.message || 'IBKR fetch failed' },
      { status: 502 }
    );
  }
}
