// app/api/optionChain/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase();
  const windowParam = searchParams.get('window') || '3';
  const base = process.env.NEXT_PUBLIC_BRIDGE_BASE || 'http://127.0.0.1:8788';

  const url = `${base}/optionChain?symbol=${encodeURIComponent(symbol)}&window=${encodeURIComponent(windowParam)}`;
  const r = await fetch(url, { cache: 'no-store' });
  const text = await r.text();
  return new Response(text, { status: r.status, headers: { 'content-type': 'application/json' } });
}
