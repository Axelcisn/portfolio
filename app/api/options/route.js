// app/api/options/route.js
export const dynamic = "force-dynamic";

/**
 * GET /api/options?symbol=TSLA&date=YYYY-MM-DD
 * - `symbol` required
 * - `date` optional (YYYY-MM-DD or unix seconds). If omitted, Yahoo returns the nearest expiry.
 * Returns normalized calls/puts plus meta (spot, currency, picked expiry).
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
    if (!Number.isFinite(d.getTime())) return null;
    return Math.floor(d.getTime() / 1000);
  };

  try {
    const base = "https://query2.finance.yahoo.com/v7/finance/options";
    const unix = toUnix(dateParam);
    const url =
      `${base}/${encodeURIComponent(symbol)}` +
      (unix ? `?date=${unix}` : "");

    const r = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
    });

    if (!r.ok) {
      return Response.json(
        { ok: false, error: `Yahoo ${r.status} ${r.statusText}` },
        { status: 502 }
      );
    }

    const j = await r.json();
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
    return Response.json(
      { ok: false, error: err?.message || "fetch failed" },
      { status: 500 }
    );
  }
}
