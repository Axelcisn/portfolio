// app/api/options/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

const toISO = (d) => {
  const nd = new Date(d);
  if (Number.isFinite(nd.getTime())) return nd.toISOString().slice(0, 10);
  const unix = Number(d);
  if (Number.isFinite(unix)) return new Date(unix * 1000).toISOString().slice(0, 10);
  return null;
};

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const dateParam = (searchParams.get("date") || "").trim();
  const noCache = searchParams.get("nocache") === "1";

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  // Serve from cache if available (unless bypassed)
  if (!noCache) {
    const cached = getCached(symbol, dateParam);
    if (cached) {
      return Response.json(cached);
    }
  }

  try {
    const base = new URL(req.url).origin;
    const url = `${base}/api/ib/chain?symbol=${encodeURIComponent(symbol)}`;

    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    
    // Handle authentication errors specifically
    if (j?.authRequired || j?.error === "unauthorized") {
      const payload = { 
        ok: false, 
        error: "Options data unavailable - authentication required. Please configure IB Bridge credentials." 
      };
      return Response.json(payload);
    }
    
    if (!r.ok || !j || j?.error) {
      const payload = { ok: false, error: j?.error || "IB fetch failed" };
      return Response.json(payload);
    }

    const src = j?.data || j || {};
    const opts = Array.isArray(src.options) ? src.options : [];
    const iso = toISO(dateParam);
    const node = iso
      ? opts.find((o) => toISO(o?.expiry || o?.expiration || o?.expirationDate) === iso) || null
      : opts[0] || null;
    if (!node) {
      // Provide more helpful error message
      const availableExpiries = opts
        .map(o => o?.expiry || o?.expiration || o?.expirationDate)
        .filter(Boolean)
        .map(d => toISO(d))
        .filter(Boolean);
      
      const errorMsg = availableExpiries.length > 0
        ? `No options data for ${dateParam || 'selected date'}. Available dates: ${availableExpiries.slice(0, 5).join(', ')}${availableExpiries.length > 5 ? '...' : ''}`
        : "No options chain data available for this symbol.";
      
      const payload = { ok: false, error: errorMsg };
      return Response.json(payload);
    }

    const calls = Array.isArray(node.calls) ? node.calls : [];
    const puts = Array.isArray(node.puts) ? node.puts : [];
    const meta = {
      spot: Number(src?.spot ?? src?.underlyingPrice ?? node?.underlyingPrice) || null,
      currency: src?.currency || node?.currency || null,
      expiry: iso || toISO(node?.expiry || node?.expiration || node?.expirationDate),
    };
    const payload = { ok: true, data: { calls, puts, meta } };

    setCached(symbol, dateParam, payload);
    return Response.json(payload);
  } catch (err) {
    const payload = { ok: false, error: err?.message || "IB fetch failed" };
    return Response.json(payload);
  }
}

