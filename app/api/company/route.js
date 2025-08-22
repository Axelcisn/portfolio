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
    const j = await r.json();
    if (!r.ok || j?.ok === false) {
      return NextResponse.json(
        { error: j?.error || "ibkr_basic_failed" },
        { status: 502 }
      );
    }
    const spot = Number(j.price);
    let prevClose = null,
      change = null,
      changePct = null;
    if (j.fields && j.fields["83"] !== undefined && Number.isFinite(spot)) {
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
        spot: Number.isFinite(spot) ? spot : null,
        prevClose: Number.isFinite(prevClose) ? prevClose : null,
        change: Number.isFinite(change) ? change : null,
        changePct: Number.isFinite(changePct) ? changePct : null,
        session: "At close",
      },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e || "ibkr_basic_failed") },
      { status: 502 }
    );
  }
}
