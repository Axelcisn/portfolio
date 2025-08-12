// app/api/options/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { yahooGetJson } from "@/lib/yahooSession";

/**
 * GET /api/options?symbol=TSLA&date=YYYY-MM-DD
 * Returns: { ok, data: { calls, puts, meta } }
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const dateParam = (searchParams.get("date") || "").trim();

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

  try {
    const unix = toUnix(dateParam);
    // yahooSession attaches cookie + crumb and retries on 401/403.
    const url =
      `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}` +
      (unix ? `?date=${unix}` : "");

    const j = await yahooGetJson(url); // <- centralized session

    const root = j?.optionChain?.result?.[0];
    if (!root) {
      return Response.json({ ok: false, error: "empty chain" }, { status: 502 });
    }

    const quote = root.quote || {};
    const spot =
      num(quote.regularMarketPrice) ??
      num(quote.postMarketPrice) ??
      num(quote.bid) ??
      num(quote.ask);

    const node = (root.options && root.options[0]) || {};
    const calls = Array.isArray(node.calls) ? node.calls : [];
    const puts = Array.isArray(node.puts) ? node.puts : [];

    const mapOpt = (o) => ({
      strike: num(o?.strike),
      bid: num(o?.bid),
      ask: num(o?.ask),
      price: num(o?.lastPrice ?? o?.last ?? o?.regularMarketPrice),
      ivPct: num(o?.impliedVolatility) != null ? num(o.impliedVolatility) * 100 : null,
    });

    const expiryUnix = num(node?.expiration);
    const expiry =
      expiryUnix != null
        ? new Date(expiryUnix * 1000).toISOString().slice(0, 10)
        : null;

    return Response.json({
      ok: true,
      data: {
        calls: calls.map(mapOpt).filter((x) => x.strike != null),
        puts: puts.map(mapOpt).filter((x) => x.strike != null),
        meta: {
          symbol: quote?.symbol || symbol.toUpperCase(),
          currency: quote?.currency || null,
          spot,
          expiry,
        },
      },
    });
  } catch (err) {
    // yahooGetJson throws with network/status info when it can’t recover
    return Response.json(
      { ok: false, error: err?.message || "fetch failed" },
      { status: 502 }
    );
  }
}
