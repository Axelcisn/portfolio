// app/api/expiries/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { yahooJson } from "../../../lib/providers/yahooSession";

// ---- 30s micro-cache (module scoped) ----
const TTL_MS = 30 * 1000;
const CACHE = new Map(); // key: SYMBOL -> { ts, expiries: string[] }

function getCached(symbol) {
  const key = String(symbol || "").toUpperCase();
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    CACHE.delete(key);
    return null;
  }
  return hit.expiries;
}
function setCached(symbol, expiries) {
  const key = String(symbol || "").toUpperCase();
  CACHE.set(key, { ts: Date.now(), expiries: Array.isArray(expiries) ? expiries : [] });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const noCache = searchParams.get("nocache") === "1";
  const useYahoo = searchParams.get("provider") === "yahoo"; // Force Yahoo if specified

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  // Try IBKR first unless Yahoo is explicitly requested
  if (!useYahoo) {
    try {
      let ibkrUrl = `/api/ibkr/options/expiries?symbol=${encodeURIComponent(symbol)}`;
      if (noCache) {
        ibkrUrl += "&nocache=1";
      }
      
      const ibkrRes = await fetch(ibkrUrl, { cache: "no-store" });
      if (ibkrRes.ok) {
        const ibkrData = await ibkrRes.json();
        if (ibkrData.ok && ibkrData.expiries) {
          return Response.json(ibkrData);
        }
      }
    } catch (e) {
      console.error("IBKR expiries failed, falling back to Yahoo:", e);
    }
  }
  
  // serve from cache unless bypassed
  if (!noCache) {
    const cached = getCached(symbol);
    if (cached) {
      return Response.json({ ok: true, expiries: cached });
    }
  }

  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}`;
    const j = await yahooJson(url, { addCrumb: true });
    const root = j?.optionChain?.result?.[0];

    const dates = Array.isArray(root?.expirationDates) ? root.expirationDates : [];
    const expiries = dates
      .map((unix) => new Date(Number(unix) * 1000))
      .filter((d) => Number.isFinite(d?.getTime()))
      .map((d) => d.toISOString().slice(0, 10));

    // cache successful result
    setCached(symbol, expiries);

    return Response.json({ ok: true, expiries });
  } catch (err) {
    // don't cache errors
    return Response.json(
      { ok: false, error: err?.message || "fetch failed" },
      { status: 502 }
    );
  }
}
