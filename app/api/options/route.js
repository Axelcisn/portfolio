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
    let url = `${base}/api/ib/chain?symbol=${encodeURIComponent(symbol)}`;
    if (dateParam) url += `&date=${encodeURIComponent(dateParam)}`;

    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j?.ok === false) {
      const payload = { ok: false, error: j?.error || "IB fetch failed" };
      return Response.json(payload);
    }

    setCached(symbol, dateParam, j);
    return Response.json(j);
  } catch (err) {
    const payload = { ok: false, error: err?.message || "IB fetch failed" };
    return Response.json(payload);
  }
}

