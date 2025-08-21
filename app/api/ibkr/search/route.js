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
  // Dev: allow IBKR self-signed cert locally
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const agent = new https.Agent({
    rejectUnauthorized: false
  });
  const resp = await fetch(url, { method: 'GET', headers: { accept: 'application/json' }, agent: agent});
  const text = await resp.text();
  return new Response(text, { status: resp.status, headers: { 'content-type': 'application/json' }});
}

export async function GET(req) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.trim() || '';
  if (!symbol) return new Response(JSON.stringify({ error: 'symbol required' }), { status: 400 });
  const port = getPort();
  const url = `https://localhost:${port}/v1/api/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`;
  return proxy(url);
}
