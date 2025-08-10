import { NextResponse } from "next/server";
import { yahooQuote, yahooDailyCloses } from "../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const source = (searchParams.get("source") || "yahoo").toLowerCase(); // "yahoo" | "calc"
    const indexParam = (searchParams.get("index") || "").trim();

    if (!symbol) {
      return NextResponse.json(
        { ok: false, error: { code: "SYMBOL_REQUIRED", message: "symbol required" } },
        { status: 400, headers: cacheHeaders }
      );
    }
    if (source !== "yahoo" && source !== "calc") {
      return NextResponse.json(
        { ok: false, error: { code: "BAD_SOURCE", message: 'source must be "yahoo" or "calc"' } },
        { status: 400, headers: cacheHeaders }
      );
    }

    if (source === "yahoo") {
      const q = await yahooQuote(symbol);
      const beta = toNum(q?.beta);
      if (beta == null) {
        return NextResponse.json(
          { ok: false, error: { code: "BETA_UNAVAILABLE", message: "beta unavailable from yahoo" } },
          { status: 502, headers: cacheHeaders }
        );
      }
      const data = { beta, via: "yahoo" };
      return NextResponse.json({ ok: true, data, ...data, _ms: Date.now() - t0 }, { headers: cacheHeaders });
    }

    // source === "calc"
    const idx = indexParam || indexForSymbol(symbol);
    const [stockBars, indexBars] = await Promise.all([
      yahooDailyCloses(symbol, "1y", "1d"),
      yahooDailyCloses(idx, "1y", "1d"),
    ]);

    const a = logReturnsFromCloses(stockBars);
    const b = logReturnsFromCloses(indexBars);
    const { aAligned, bAligned } = intersectByTime(a, b);

    if (aAligned.length < 30) {
      return NextResponse.json(
        { ok: false, error: { code: "INSUFFICIENT_DATA", message: "insufficient data for regression", via: "calc" } },
        { status: 422, headers: cacheHeaders }
      );
    }

    const varB = variance(bAligned);
    const covAB = covariance(aAligned, bAligned);
    const beta = varB > 0 ? covAB / varB : null;

    const data = { beta: toNum(beta), via: "calc", index: idx, points: aAligned.length };
    if (data.beta == null) {
      return NextResponse.json(
        { ok: false, error: { code: "BETA_UNAVAILABLE", message: "beta calculation failed", ...data } },
        { status: 502, headers: cacheHeaders }
      );
    }
    return NextResponse.json({ ok: true, data, ...data, _ms: Date.now() - t0 }, { headers: cacheHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: String(e?.message ?? e) }, _ms: Date.now() - t0 },
      { status: 500, headers: cacheHeaders }
    );
  }
}

/* ---------- helpers (local, zero-deps) ---------- */
function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function logReturnsFromCloses(bars) {
  const out = [];
  if (!Array.isArray(bars)) return out;
  for (let i = 1; i < bars.length; i++) {
    const p0 = Number(bars[i - 1]?.close);
    const p1 = Number(bars[i]?.close);
    const t = bars[i]?.t ?? i; // keep time index if present
    if (p0 > 0 && Number.isFinite(p0) && Number.isFinite(p1)) {
      out.push({ t, r: Math.log(p1 / p0) });
    }
  }
  return out;
}
function intersectByTime(a, b) {
  const map = new Map();
  for (const x of a) map.set(x.t, x.r);
  const aAligned = [], bAligned = [];
  for (const y of b) {
    if (map.has(y.t)) {
      aAligned.push(map.get(y.t));
      bAligned.push(y.r);
    }
  }
  return { aAligned, bAligned };
}
function mean(xs) {
  let s = 0;
  for (const x of xs) s += x;
  return xs.length ? s / xs.length : 0;
}
function variance(xs) {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let s2 = 0;
  for (const x of xs) s2 += (x - m) * (x - m);
  return s2 / (n - 1);
}
function covariance(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}
function indexForSymbol(sym) {
  // crude inference by suffix; defaults to S&P 500
  if (sym.endsWith(".MI")) return "^FTSEMIB.MI";
  if (sym.endsWith(".L"))  return "^FTSE";
  if (sym.endsWith(".PA")) return "^FCHI";
  if (sym.endsWith(".DE")) return "^GDAXI";
  if (sym.endsWith(".T"))  return "^N225";
  return "^GSPC";
}
