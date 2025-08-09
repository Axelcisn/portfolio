// app/api/beta/route.js
import { NextResponse } from "next/server";
import { yahooQuote, yahooDailyCloses } from "../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(x) {
  const v = Number(x);
  return Number.isFinite(v) ? v : null;
}

function indexForSymbol(sym) {
  const s = String(sym || "").toUpperCase();
  if (s.includes(".MI")) return "^FTSEMIB.MI";
  if (s.endsWith(".L")) return "^FTSE";
  if (s.endsWith(".PA")) return "^FCHI";
  if (s.endsWith(".DE")) return "^GDAXI";
  if (s.endsWith(".T")) return "^N225";
  // default: USA
  return "^GSPC";
}

function logReturnsFromCloses(bars) {
  const out = [];
  for (let i = 1; i < bars.length; i++) {
    const p0 = toNum(bars[i - 1]?.close);
    const p1 = toNum(bars[i]?.close);
    if (p0 && p1 && p0 > 0 && p1 > 0) {
      out.push({ t: bars[i].t, r: Math.log(p1 / p0) });
    }
  }
  return out;
}

function intersectByTime(a, b) {
  const map = new Map(b.map((x) => [x.t, x.r]));
  const A = [];
  const B = [];
  for (const x of a) {
    const rb = map.get(x.t);
    if (rb != null) {
      A.push(x.r);
      B.push(rb);
    }
  }
  return [A, B];
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let v = 0;
  for (const x of arr) v += (x - m) * (x - m);
  return v / (arr.length - 1);
}

function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let c = 0;
  for (let i = 0; i < n; i++) c += (a[i] - ma) * (b[i] - mb);
  return c / (n - 1);
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbol = (searchParams.get("symbol") || "").trim();
  const source = (searchParams.get("source") || "yahoo").trim().toLowerCase();

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  try {
    if (source === "yahoo") {
      // Safe endpoint: contains q.beta (no crumb/cookie)
      const q = await yahooQuote(symbol);
      const beta = q?.beta != null ? Number(q.beta) : null;
      return NextResponse.json({ beta, via: "yahoo" });
    }

    if (source === "calc") {
      const idx = searchParams.get("index") || indexForSymbol(symbol);
      const stock = await yahooDailyCloses(symbol, "1y", "1d");
      const bench = await yahooDailyCloses(idx, "1y", "1d");

      const rS = logReturnsFromCloses(stock);
      const rB = logReturnsFromCloses(bench);
      const [a, b] = intersectByTime(rS, rB);

      if (a.length < 30) {
        return NextResponse.json(
          { error: "insufficient data for regression", via: "calc" },
          { status: 422 }
        );
      }

      const varB = variance(b);
      const cov = covariance(a, b);
      const beta = varB > 0 ? cov / varB : null;

      return NextResponse.json({
        beta,
        via: "calc",
        index: idx,
        points: a.length,
      });
    }

    return NextResponse.json(
      { error: `unknown source "${source}"` },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
