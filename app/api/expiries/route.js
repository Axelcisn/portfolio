// app/api/expiries/route.js
export const dynamic = "force-dynamic";

import { yahooJson } from "../../../lib/providers/yahooSession";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();

  if (!symbol) {
    return Response.json({ ok: false, error: "symbol required" }, { status: 400 });
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

    return Response.json({ ok: true, expiries });
  } catch (err) {
    return Response.json(
      { ok: false, error: err?.message || "fetch failed" },
      { status: 502 }
    );
  }
}
