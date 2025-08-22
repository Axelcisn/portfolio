// app/api/company/route.js
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const symbol = (req.nextUrl.searchParams.get("symbol") || "")
    .trim()
    .toUpperCase();
  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }
  try {
    const base = req.nextUrl.origin;
    const r = await fetch(
      `${base}/api/ibkr/basic?symbol=${encodeURIComponent(symbol)}`,
      { cache: "no-store" }
    );
    const text = await r.text();
    let j;
    try {
      j = JSON.parse(text);
    } catch {
      j = null;
    }
    if (!r.ok || !j || j?.ok === false) {
      const msg = (j && (j.error || j.message)) || text || "ibkr_basic_failed";
      return NextResponse.json({ error: msg });
    }
    let spot = Number(j.price);
    if (!Number.isFinite(spot) || spot <= 0) {
      const bid = j.fields ? Number(j.fields["84"]) : NaN;
      const ask = j.fields ? Number(j.fields["86"]) : NaN;
      if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
        spot = (bid + ask) / 2;
      } else if (Number.isFinite(bid) && bid > 0) {
        spot = bid;
      } else if (Number.isFinite(ask) && ask > 0) {
        spot = ask;
      } else {
        spot = NaN;
      }
    }

    let prevClose = null,
      change = null,
      changePct = null;
    if (j.fields && j.fields["83"] !== undefined && Number.isFinite(spot) && spot > 0) {
      const pct = Number(j.fields["83"]);
      if (Number.isFinite(pct)) {
        changePct = pct;
        const pc = spot / (1 + pct / 100);
        if (Number.isFinite(pc)) {
          prevClose = pc;
          change = spot - pc;
        }
      }
    }
    return NextResponse.json(
      {
        symbol: j.symbol || symbol,
        currency: j.currency || null,
        spot: Number.isFinite(spot) && spot > 0 ? spot : null,
        prevClose: Number.isFinite(prevClose) ? prevClose : null,
        change: Number.isFinite(change) ? change : null,
        changePct: Number.isFinite(changePct) ? changePct : null,
        session: "At close",
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e || "ibkr_basic_failed") });
  }
}
