import { readFileSync } from 'fs';
import https from 'https';

export const dynamic = 'force-dynamic';

function getPort() {
  try {
    return (readFileSync('/tmp/ibkr_gateway_port', 'utf8').trim() || '5001');
  } catch {
    return process.env.IBKR_PORT || '5001';
  }
}

async function proxy(url) {
  try {
    // Dev: allow IBKR self-signed cert locally
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const agent = new https.Agent({
      rejectUnauthorized: false
    });
    const resp = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, agent: agent});
    const text = await resp.text();
    
    // Handle authentication/gateway errors with better messages
    if (resp.status === 401) {
      return new Response(
        JSON.stringify({ 
          error: 'IBKR Gateway authentication required', 
          details: 'Please authenticate through the IBKR Client Portal at https://localhost:' + getPort() + '/',
          status: 401
        }), 
        { status: 401, headers: { 'content-type': 'application/json' }}
      );
    }
    
    if (resp.status === 500) {
      return new Response(
        JSON.stringify({ 
          error: 'IBKR Gateway internal error', 
          details: 'The gateway may not be fully initialized or connected to IBKR servers',
          status: 500
        }), 
        { status: 500, headers: { 'content-type': 'application/json' }}
      );
    }
    
    return new Response(text, { status: resp.status, headers: { 'content-type': 'application/json' }});
  } catch (error) {
    return new Response(
      JSON.stringify({ 
        error: 'Connection failed', 
        details: 'Cannot connect to IBKR Gateway. Ensure it is running on port ' + getPort(),
        status: 502
      }), 
      { status: 502, headers: { 'content-type': 'application/json' }}
    );
  }
}

export async function GET(req) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim() || '';
  if (!symbol) {
    return new Response(
      JSON.stringify({ 
        error: 'symbol required',
        details: 'Please provide a symbol parameter, e.g., ?symbol=AAPL'
      }), 
      { status: 400, headers: { 'content-type': 'application/json' }}
    );
  }
  
  const port = getPort();
  const url = `https://localhost:${port}/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`;
  return proxy(url);
}
