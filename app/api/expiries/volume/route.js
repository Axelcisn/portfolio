// app/api/expiries/volume/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Aggregate volumes per expiry using the Interactive Brokers chain proxy

// Helpers
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const toISO = (d) => {
  const nd = new Date(d);
  if (Number.isFinite(nd.getTime())) return nd.toISOString().slice(0, 10);
  const unix = Number(d);
  if (Number.isFinite(unix)) return new Date(unix * 1000).toISOString().slice(0, 10);
  return null;
};

/**
 * GET /api/expiries/volume?symbol=AAPL
 * Returns: { ok: true, expiries: ["YYYY-MM-DD", ...] }
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();

    if (!symbol) {
      return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
    }

    const base = new URL(req.url).origin;
    const url = `${base}/api/ib/chain?symbol=${encodeURIComponent(symbol)}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j?.ok === false) {
      return Response.json({ ok: false, error: j?.error || "IB fetch failed" });
    }

    const opts = Array.isArray(j.options) ? j.options : [];
    const out = [];
    for (const node of opts) {
      const expiry = toISO(node?.expiry || node?.expiration || node?.expirationDate);
      if (!expiry) continue;
      const calls = Array.isArray(node.calls) ? node.calls : [];
      const puts  = Array.isArray(node.puts)  ? node.puts  : [];
      let vol = 0;
      for (const c of calls) vol += num(c?.volume);
      for (const p of puts)  vol += num(p?.volume);
      if (vol > 0) out.push({ iso: expiry, volume: vol });
    }

    out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
    const expiries = out.map((x) => x.iso);

    return Response.json({ ok: true, expiries });
  } catch (err) {
    return Response.json({ ok: false, error: err?.message || "fetch failed" });
  }
}
