import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BRIDGE_DEFAULT = 'http://127.0.0.1:8788';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get('symbol') || '').trim().toUpperCase();
  const windowParam = url.searchParams.get('window') || '3';
  if (!symbol) return Response.json({ error: 'missing_symbol' }, { status: 400 });

  const BRIDGE = process.env.IB_BRIDGE_URL || BRIDGE_DEFAULT;
  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(BRIDGE);
  if (process.env.VERCEL && isLocal) {
    return Response.json(
      {
        error: 'bridge_not_public',
        hint:
          'Set IB_BRIDGE_URL and NEXT_PUBLIC_BRIDGE_URL to a public https tunnel that forwards to your IB bridge.'
      },
      { status: 503 }
    );
  }

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort('timeout'), 15_000);

  try {
    const r = await fetch(
      `${BRIDGE}/optionChain?symbol=${encodeURIComponent(symbol)}&window=${encodeURIComponent(windowParam)}`,
      { signal: ctl.signal }
    );
    clearTimeout(to);
    if (!r.ok) {
      return Response.json({ error: 'bridge_error', status: r.status }, { status: 502 });
    }
    const data = await r.json();
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    clearTimeout(to);
    return Response.json({ error: 'bridge_unreachable' }, { status: 502 });
  }
}
