// app/api/beta/route.js
import { NextResponse } from "next/server";
import { yahooQuote, yahooDailyCloses } from "../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Map Yahoo symbol suffixes -> market index symbols for calculated beta.
const INDEX_BY_SUFFIX = [
  [/\.MI$/i, "^FTSEMIB.MI"], // Borsa Italiana
  [/\.DE$/i, "^GDAXI"],      // Xetra/Frankfurt (DAX)
  [/\.PA$/i, "^FCHI"],       // Paris (CAC 40)
  [/\.L$/i, "^FTSE"],        // London (FTSE 100)
  [/\.HK$/i, "^HSI"],        // Hong Kong
  [/\.T$/i, "^N225"],        // Tokyo (Nikkei 225)
  [/\.TO$/i, "^GSPTSE"],     // Toronto (TSX)
  [/\.AX$/i, "^AXJO"],       // Australia (ASX 200)
];
function pickIndex(sym) {
  for (const [re, idx] of INDEX_BY_SUFFIX) if (re.test(sym)) return idx;
  return "^GSPC"; // default: S&P 500
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  const source = (searchParams.get("source") || "calc").toLowerCase();
  const indexOverride = (searchParams.get("index") || "").trim();

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    if (source === "yahoo" || source === "yahoo-exact") {
      // Exact beta as reported by Yahoo.
      const q = await yahooQuote(symbol);
      const beta = q?.beta ?? null;
      if (beta == null) throw new Error("Beta not available from Yahoo");
      return NextResponse.json({ symbol, source: "yahoo", beta });
    }

    // Calculated beta: 1Y daily log returns vs. market index.
    const indexSym = indexOverride || pickIndex(symbol);
    const [sCloses, mCloses] = await Promise.all([
      yahooDailyCloses(symbol, "1y", "1d"),
      yahooDailyCloses(indexSym, "1y", "1d"),
    ]);

    if (!sCloses.length || !mCloses.length) throw new Error("Not enough data");

    // Align by day (UTC days)
    const day = (t) => Math.floor(t / 86400000);
    const mMap = new Map(mCloses.map((b) => [day(b.t), b.close]));
    const sx = [];
    const mx = [];
    for (const b of sCloses) {
      const m = mMap.get(day(b.t));
      if (!m) continue;
      sx.push(Math.log(b.close));
      mx.push(Math.log(m));
    }
    const rs = [], rm = [];
    for (let i = 1; i < sx.length; i++) {
      rs.push(sx[i] - sx[i - 1]);
      rm.push(mx[i] - mx[i - 1]);
    }
    if (rs.length < 5) throw new Error("Insufficient overlap");

    const n = rs.length;
    const mean = (a) => a.reduce((p, c) => p + c, 0) / n;
    const ms = mean(rs), mm = mean(rm);
    let cov = 0, varM = 0;
    for (let i = 0; i < n; i++) {
      const a = rs[i] - ms, b = rm[i] - mm;
      cov += a * b;
      varM += b * b;
    }
    const beta = varM === 0 ? null : cov / varM;
    if (beta == null) throw new Error("Beta calculation failed");

    return NextResponse.json({ symbol, source: "calc", index: indexSym, beta });
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 502 }
    );
  }
}
