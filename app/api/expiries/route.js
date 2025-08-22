// app/api/expiries/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Fetch expiries via the Interactive Brokers chain proxy

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

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
  }

  // serve from cache unless bypassed
  if (!noCache) {
    const cached = getCached(symbol);
    if (cached) {
      return Response.json({ ok: true, expiries: cached });
    }
  }

  try {
    const base = new URL(req.url).origin;
    const url = `${base}/api/ib/chain?symbol=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j?.ok === false) {
      return Response.json({ ok: false, error: j?.error || "IB fetch failed" });
    }

    let expiries = [];
    if (Array.isArray(j.expiries)) {
      expiries = j.expiries;
    } else if (Array.isArray(j.expirationDates)) {
      expiries = j.expirationDates
        .map((d) => {
          const nd = new Date(d);
          if (Number.isFinite(nd.getTime())) return nd.toISOString().slice(0, 10);
          const unix = Number(d);
          if (Number.isFinite(unix)) return new Date(unix * 1000).toISOString().slice(0, 10);
          return null;
        })
        .filter(Boolean);
    } else if (Array.isArray(j.options)) {
      expiries = j.options
        .map((o) => o?.expiry || o?.expiration || o?.expirationDate)
        .filter(Boolean)
        .map((d) => {
          const nd = new Date(d);
          if (Number.isFinite(nd.getTime())) return nd.toISOString().slice(0, 10);
          const unix = Number(d);
          if (Number.isFinite(unix)) return new Date(unix * 1000).toISOString().slice(0, 10);
          return null;
        })
        .filter(Boolean);
    }

    // cache successful result
    setCached(symbol, expiries);

    return Response.json({ ok: true, expiries });
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || "IB fetch failed" });
  }
}
