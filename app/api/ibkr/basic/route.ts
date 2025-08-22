import type { NextRequest } from 'next/server';
import { Agent, type Dispatcher } from 'undici';

export const dynamic = 'force-dynamic';

function getPort(): string {
  try {
    return (require('fs').readFileSync('/tmp/ibkr_gateway_port', 'utf8').trim() || '5001');
  } catch {
    return process.env.IBKR_PORT || '5001';
  }
}

const BASE = (process.env.IB_PROXY_URL || `https://localhost:${getPort()}/v1/api`).replace(/\/+$/, '');
const BEARER = process.env.IB_PROXY_TOKEN || '';
const COMMON_HEADERS: Record<string, string> = BEARER ? { Authorization: `Bearer ${BEARER}` } : {};

async function fetchText(url: string, init?: RequestInit) {
  const dispatcher: Dispatcher | undefined = url.startsWith('https:')
    ? new Agent({ connect: { rejectUnauthorized: false } })
    : undefined;
  const opts: RequestInit & { dispatcher?: Dispatcher } = {
    ...init,
    headers: { accept: 'application/json', ...COMMON_HEADERS, ...(init?.headers || {}) },
    ...(dispatcher ? { dispatcher } : {}),
  };
  const r = await fetch(url, opts);
  const text = await r.text();
  return { ok: r.ok, status: r.status, text };
}
function safeJSON<T=any>(s: string): T | null { try { return JSON.parse(s); } catch { return null; } }

type BasicOut = {
  ok: true;
  symbol: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  conid: string;
  price: number | null;
  fields?: Record<string,string>;
  ts: number;
} | { ok: false; error: string; status?: number };

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') || '').trim().toUpperCase();
  if (!symbol) {
    return new Response(JSON.stringify({ ok:false, error:'symbol required' } satisfies BasicOut), { status: 400 });
  }
  try {
  // 1) secdef/search -> pick a STK conid (fallback: first result)
  const s1 = await fetchText(`${BASE}/iserver/secdef/search?symbol=${encodeURIComponent(symbol)}`);
  if (!s1.ok) {
    return new Response(JSON.stringify({ ok:false, error:`secdef/search ${s1.status}`, status:s1.status } satisfies BasicOut), { status: s1.status || 502 });
  }
  const arr = safeJSON<any[]>(s1.text) || [];
  if (!Array.isArray(arr) || arr.length === 0) {
    return new Response(JSON.stringify({ ok:false, error:'symbol not found' } satisfies BasicOut), { status: 404 });
  }

  // Build a list of candidate STK entries
  const candidates = arr.filter(it => {
    if (!it) return false;
    if (Array.isArray(it.sections) && it.sections.some((s:any) => s?.secType === 'STK')) return true;
    const st = (it.secType || it.assetClass || it.type);
    return st === 'STK';
  });
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ ok:false, error:'symbol not found' } satisfies BasicOut), { status: 404 });
  }

  const fields = ['31','84','86','70','71','83']; // last, bid, ask, high, low, change%

  for (const pick of candidates) {
    const conid = String(pick?.conid || '');
    if (!conid) continue;

    const name  = pick?.companyName || pick?.name || '';
    const exch  = pick?.description || pick?.exchange || null;

    // 2) secdef/info -> currency (and any other metadata if needed)
    const s2 = await fetchText(`${BASE}/iserver/secdef/info?conid=${encodeURIComponent(conid)}`);
    const info = safeJSON<any>(s2.text);
    let currency: string | null = null;
    if (Array.isArray(info) && info.length) {
      currency = info[0]?.currency || null;
    } else if (info && typeof info === 'object') {
      currency = (info as any)?.currency || null;
    }

    // 3) snapshot -> last (31), bid(84), ask(86) etc.
    const s3 = await fetchText(
      `${BASE}/iserver/marketdata/snapshot?conids=${encodeURIComponent(conid)}&fields=${fields.join(',')}`
    );
    let price: number | null = null;
    let fieldMap: Record<string,string> | undefined;

    const snap = safeJSON<any>(s3.text);
    if (Array.isArray(snap) && snap.length) {
      const rec = snap[0] || {};
      fieldMap = {};
      for (const k of Object.keys(rec)) {
        if (k === 'conid' || k === 'conidEx' || k === '_updated' || k === 'server_id' || k === '6119' || k === '6508' || k === 'topic') continue;
        fieldMap[k] = String(rec[k]);
      }
      if (rec['31'] !== undefined && rec['31'] !== '') {
        const n = Number(rec['31']);
        if (Number.isFinite(n)) price = n;
      }
    }

    if (price !== null) {
      const out: BasicOut = {
        ok: true,
        symbol,
        name,
        exchange: exch || null,
        currency: currency || null,
        conid,
        price,
        fields: fieldMap,
        ts: Date.now(),
      };
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type':'application/json' }});
    }
  }

  // If none of the candidates produced a price, return an error
  return new Response(
    JSON.stringify({ ok:false, error:'no market data' } satisfies BasicOut),
    { status: 502 }
  );
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message : String(err);
    return new Response(JSON.stringify({ ok:false, error: msg } satisfies BasicOut), { status: 502 });
  }
}
