// app/api/expiries/volume/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { yahooJson } from "@/lib/providers/yahooSession";

// Helpers
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const isoFromUnix = (u) => new Date(Number(u) * 1000).toISOString().slice(0, 10);

/**
 * GET /api/expiries/volume?symbol=AAPL
 * Optional: &concurrency=5 (default 3) — limits parallel Yahoo calls
 * Returns: { ok: true, expiries: ["YYYY-MM-DD", ...] }
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim();
    const conc = Math.max(1, Math.min(8, Number(searchParams.get("concurrency")) || 3));

    if (!symbol) {
      return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
    }

    const base = "https://query2.finance.yahoo.com/v7/finance/options";

    // 1) Get the list of expiry timestamps
    const root = await yahooJson(`${base}/${encodeURIComponent(symbol)}`, { addCrumb: true })
      .then(j => j?.optionChain?.result?.[0] || null);

    if (!root) {
      return Response.json({ ok: false, error: "empty chain" }, { status: 502 });
    }

    const dates = Array.isArray(root.expirationDates) ? root.expirationDates.slice() : [];
    if (!dates.length) {
      return Response.json({ ok: true, expiries: [] });
    }

    // 2) For each expiry, fetch chain and compute total volume
    const out = [];
    let idx = 0;

    async function worker() {
      while (idx < dates.length) {
        const i = idx++;
        const unix = dates[i];
        try {
          const j = await yahooJson(`${base}/${encodeURIComponent(symbol)}?date=${unix}`, { addCrumb: true });
          const node = j?.optionChain?.result?.[0]?.options?.[0] || {};
          const calls = Array.isArray(node.calls) ? node.calls : [];
          const puts  = Array.isArray(node.puts)  ? node.puts  : [];

          let vol = 0;
          for (const c of calls) vol += num(c?.volume);
          for (const p of puts)  vol += num(p?.volume);

          if (vol > 0) {
            out.push({ iso: isoFromUnix(unix), volume: vol });
          }
        } catch {
          // ignore this date on failure; continue
        }
      }
    }

    // Launch limited concurrency
    await Promise.all(Array.from({ length: conc }, () => worker()));

    // 3) Sort by date asc and return just the ISO dates
    out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
    const expiries = out.map(x => x.iso);

    return Response.json({ ok: true, expiries });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "fetch failed" },
      { status: 502 }
    );
  }
}
