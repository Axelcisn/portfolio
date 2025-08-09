// app/api/beta/route.js
import { NextResponse } from "next/server";
import { yahooQuote } from "../../../lib/yahoo.js";
import { computeBeta } from "../../../lib/beta.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const source = (searchParams.get("source") || "yahoo").toLowerCase();

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    if (source === "yahoo") {
      const q = await yahooQuote(symbol);
      const beta = Number.isFinite(q?.beta) ? q.beta : null;
      return NextResponse.json({
        beta,
        sourceUsed: "yahoo",
        note: beta == null ? "Yahoo did not provide beta; choose Calculated or Manual." : null,
      });
    }

    if (source === "calc" || source === "calculated") {
      const { beta, n, benchmark } = await computeBeta(symbol, "1y", "1d");
      return NextResponse.json({
        beta,
        sourceUsed: "calculated (1y daily)",
        n,
        benchmark,
      });
    }

    if (source === "manual") {
      return NextResponse.json({
        beta: null,
        sourceUsed: "manual",
        note: "Provide beta manually in the UI.",
      });
    }

    // Placeholders (can wire with scrapers later)
    if (source === "tradingview" || source === "marketwatch") {
      return NextResponse.json({
        beta: null,
        sourceUsed: source,
        note: `${source} direct fetch not enabled yet. Use Manual or Yahoo/Calculated.`,
      });
    }

    return NextResponse.json({ error: "unknown source" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
