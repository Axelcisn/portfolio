// app/api/options/route.js
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { yahooJson } from "@/lib/providers/yahooSession";

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

  const base = "https://query2.finance.yahoo.com/v7/finance/options";
  const unix = toUnix(dateParam);
  const url =
    `${base}/${encodeURIComponent(symbol)}` +
    (unix ? `?date=${unix}` : "");

  try {
    // yahooJson handles cookie/crumb and 401/403/999 retry internally
    const j = await yahooJson(url);

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
    const puts  = Array.isArray(node.puts)  ? node.puts  : [];

    const mapOpt = (o) => ({
      strike: num(o?.strike),
      bid:    num(o?.bid),
      ask:    num(o?.ask),
      price:  num(o?.lastPrice ?? o?.last ?? o?.regularMarketPrice),
      ivPct:  num(o?.impliedVolatility) != null ? num(o.impliedVolatility) * 100 : null,
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
        puts:  puts.map(mapOpt).filter((x) => x.strike != null),
        meta: {
          symbol: quote?.symbol || symbol.toUpperCase(),
          currency: quote?.currency || null,
          spot,
          expiry,
        },
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "fetch failed" },
      { status: 502 }
    );
  }
}
