import { NextResponse } from 'next/server';

const BASE = process.env.NEXT_PUBLIC_BRIDGE_BASE || 'http://127.0.0.1:8788';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get('symbol') || 'AAPL').toUpperCase();
  const r = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
  if (!r.ok) {
    return NextResponse.json({ ok:false, error:`bridge ${r.status}` }, { status: r.status });
  }
  const data = await r.json();
  return NextResponse.json(data);
}
