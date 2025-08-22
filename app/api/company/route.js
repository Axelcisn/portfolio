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
    // Use the internal ibkr/basic endpoint to obtain normalized basic quote
    const r = await fetch(`/api/ibkr/basic?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' });
    // Some test mocks replace fetch with a simple function that returns an object
    // without .json(); handle that by reading text and parsing if necessary.
    let j;
    try {
      if (r && typeof r.json === 'function') {
        j = await r.json();
      } else if (r && typeof r.text === 'function') {
        const t = await r.text();
        try { j = JSON.parse(t); } catch { j = t; }
      } else {
        // If r is already a plain object (test stub), use it directly
        j = r;
      }
    } catch (err) {
      j = { ok: false, error: 'ibkr fetch failed' };
    }

    if (!r || r.ok === false || !j || j.ok === false) {
      return NextResponse.json({ error: j?.error || 'IBKR quote failed' }, { status: 200 });
    }

    // j may contain price or fields
  const safeNum = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  const px = safeNum(j.price ?? (j.fields && j.fields['31']) ?? (j.fields && j.fields[31]));
    let spot = px && px > 0 ? px : null;
    if (!spot) {
      const bid = safeNum(j.fields?.['84']);
      const ask = safeNum(j.fields?.['86']);
      if (bid && ask && bid > 0 && ask > 0) spot = (bid + ask) / 2;
    }
  let prevClose = safeNum(j.fields?.['82'] ?? j.prevClose ?? null);
    let change = null;
    let changePct = safeNum(j.fields?.['83'] ?? j.changePct ?? null);
    if (spot && prevClose) {
      change = spot - prevClose;
      if (!changePct && prevClose > 0) changePct = (change / prevClose) * 100;
    } else if (spot && changePct) {
      const pc = spot / (1 + changePct / 100);
      change = spot - pc;
      // populate prevClose for consumers/tests when only change% is provided
  if (!prevClose) prevClose = pc;
    }

    return NextResponse.json({
      symbol: j.symbol || symbol,
      currency: j.currency || j.fields?.currency || null,
      spot: spot || null,
      prevClose: Number.isFinite(prevClose) ? prevClose : null,
      change: Number.isFinite(change) ? change : null,
      changePct: Number.isFinite(changePct) ? changePct : null,
      session: 'At close',
      name: j.name || null,
      exchange: j.exchange || null,
  bid: safeNum(j.fields?.['84'] ?? null),
  ask: safeNum(j.fields?.['86'] ?? null),
  high: safeNum(j.fields?.['70'] ?? null),
  low: safeNum(j.fields?.['71'] ?? null),
  volume: safeNum(j.fields?.['87'] ?? null),
    }, { status: 200 });
  } catch (e) {
    console.error(`Failed to get quote for ${symbol}:`, e);
    return NextResponse.json({ error: e.message || 'IBKR quote failed' }, { status: 200 });
  }
}
