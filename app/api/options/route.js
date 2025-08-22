// app/api/options/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { yahooJson } from "../../../lib/providers/yahooSession";

// ---- 30s micro-cache (module scoped) ----
const TTL_MS = 30 * 1000;
const CACHE = new Map(); // key: SYMBOL|DATE -> { ts, payload }

function getKey(symbol, dateISO) {
  return `${String(symbol || "").toUpperCase()}|${String(dateISO || "")}`;
}
function getCached(symbol, dateISO) {
  const k = getKey(symbol, dateISO);
  const hit = CACHE.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > TTL_MS) {
    CACHE.delete(k);
    return null;
  }
  return hit.payload;
}
function setCached(symbol, dateISO, payload) {
  const k = getKey(symbol, dateISO);
  CACHE.set(k, { ts: Date.now(), payload });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const dateParam = (searchParams.get("date") || "").trim();
  const noCache = searchParams.get("nocache") === "1";
  const useYahoo = searchParams.get("provider") === "yahoo"; // Force Yahoo if specified

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const toUnix = (v) => {
    if (!v) return null;
    if (/^\d{10}$/.test(v)) return Number(v);
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? Math.floor(d.getTime() / 1000) : null;
  };

  // Try IBKR first unless Yahoo is explicitly requested
  if (!useYahoo) {
    try {
      let ibkrUrl = `/api/ibkr/options/chain?symbol=${encodeURIComponent(symbol)}`;
      if (dateParam) {
        ibkrUrl += `&date=${encodeURIComponent(dateParam)}`;
      }
      if (noCache) {
        ibkrUrl += "&nocache=1";
      }
      
      const ibkrRes = await fetch(ibkrUrl, { cache: "no-store" });
      if (ibkrRes.ok) {
        const ibkrData = await ibkrRes.json();
        if (ibkrData.ok) {
          return Response.json(ibkrData);
        }
      }
    } catch (e) {
      console.error("IBKR options failed, falling back to Yahoo:", e);
    }
  }
  
  // Serve from cache if available (unless bypassed)
  if (!noCache) {
    const cached = getCached(symbol, dateParam);
    if (cached) {
      return Response.json(cached);
    }
  }

  // Build Yahoo URL (crumb added by yahooSession)
  const base = "https://query2.finance.yahoo.com/v7/finance/options";
  const unix = toUnix(dateParam);
  const url = `${base}/${encodeURIComponent(symbol)}${unix ? `?date=${unix}` : ""}`;

  let j;
  try {
    // yahooJson handles cookie+crumb and 1x retry on 401/403/999
    j = await yahooJson(url, { addCrumb: true });
  } catch (e) {
    const payload = { ok: false, error: e?.message || "Yahoo fetch failed" };
    return Response.json(payload, { status: 502 });
  }

  try {
    const root = j?.optionChain?.result?.[0];
    if (!root) {
      const payload = { ok: false, error: "empty chain" };
      return Response.json(payload, { status: 502 });
    }

    const quote = root.quote || {};
    const spot =
      num(quote.regularMarketPrice) ??
      num(quote.postMarketPrice) ??
      num(quote.bid) ??
      num(quote.ask);

    const node = (root.options && root.options[0]) || {};
    const calls = Array.isArray(node.calls) ? node.calls : [];
    const puts  = Array.isArray(node.puts)  ? node.puts  : [];

    // 🔵 Only change: include `volume`
    const mapOpt = (o) => ({
      strike: num(o?.strike),
      bid:    num(o?.bid),
      ask:    num(o?.ask),
      price:  num(o?.lastPrice ?? o?.last ?? o?.regularMarketPrice),
      ivPct:  num(o?.impliedVolatility) != null ? num(o.impliedVolatility) * 100 : null,
      volume: num(o?.volume), // ← NEW
    });

    const expiryUnix = num(node?.expiration);
    const expiry =
      expiryUnix != null
        ? new Date(expiryUnix * 1000).toISOString().slice(0, 10)
        : null;

    const payload = {
      ok: true,
      data: {
        calls: calls.map(mapOpt).filter((x) => x.strike != null),
        puts:  puts.map(mapOpt).filter((x) => x.strike != null),
        meta: {
          symbol: quote?.symbol || symbol.toUpperCase(),
          currency: quote?.currency || null,
          spot,
          expiry,
        },
      },
    };

    // Cache success
    setCached(symbol, dateParam, payload);

    return Response.json(payload);
  } catch (err) {
    const payload = { ok: false, error: err?.message || "parse failed" };
    return Response.json(payload, { status: 500 });
  }
}
