import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs'; // ensure Node.js runtime (not Edge) 
export const dynamic = 'force-dynamic';

const BASE = process.env.IB_BRIDGE_URL || '';

function join(base: string, parts: string[]) {
  const b = base.replace(/\/+$/, '');
  const p = (parts || []).join('/');
  return `${b}/${p}`;
}

async function proxy(_req: NextRequest, path: string[]) {
  if (!BASE) return NextResponse.json({ error: 'IB_BRIDGE_URL not set' }, { status: 500 });
  const url = join(BASE, path || []);
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal
    });
    const text = await res.text();
    const headers = new Headers({ 'content-type': res.headers.get('content-type') || 'application/json' });
    return new NextResponse(text, { status: res.status, headers });
  } catch (e: any) {
    return NextResponse.json({ error: 'UPSTREAM_FAIL', message: e?.message || 'fetch failed' }, { status: 502 });
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: NextRequest, ctx: { params: { path?: string[] } }) {
  return proxy(req, ctx.params.path || []);
}
