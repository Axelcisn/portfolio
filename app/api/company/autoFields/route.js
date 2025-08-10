import { NextResponse } from "next/server";
import { robustQuote, yahooLiveIv, yahooDailyCloses } from "../../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}

// IMPORTANT: always return 200 with { ok:false, error } so the old UI never shows "fetch failed"
function err(code, message) {
  return ok({ ok: false, error: message, errorObj: { code, message } }, 200);
}

const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);
const toNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const days = clamp(searchParams.get("days") || 30, 1, 365);
    const volSource = (searchParams.get("volSource") || "implied").toLowerCase();

    if (!symbol) return err("SYMBOL_REQUIRED", "symbol required");

    // Quote
    const q = await robustQuote(symbol);
    const currency = q?.currency ?? null;
    const spot = toNum(q?.spot);
    const beta = toNum(q?.beta);

    // Implied IV (best effort)
    let ivImplied = null;
    try {
      const iv = await yahooLiveIv(symbol);
      ivImplied = toNum(iv?.iv ?? iv?.sigmaAnnual);
    } catch {}

    // Historical IV (best effort)
    let ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      if (Array.isArray(bars) && bars.length > 1) {
        const closes = bars.map((b) => Number(b.close)).filter(Number.isFinite);
        if (closes.length > days) {
          const end = closes.length;
          const start = Math.max(0, end - (days + 1));
          const window = closes.slice(start, end);
          ivHist = histSigmaAnnual(window);
        }
      }
    } catch {}

    // Choose IV per requested source with graceful fallback
    const wantHist = volSource === "historical";
    let chosen = wantHist ? (ivHist ?? ivImplied ?? null) : (ivImplied ?? ivHist ?? null);
    const volSourceUsed =
      chosen == null ? null : wantHist
        ? (ivHist != null ? "historical" : "implied")
        : (ivImplied != null ? "implied" : "historical");

    const data = {
      currency,
      spot,
      beta,
      iv: toNum(chosen),
      ivImplied,
      ivHist,
      meta: { volSourceUsed, days },
    };

    return ok({ ok: true, data, ...data });
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}

/* ---------- helpers ---------- */
function histSigmaAnnual(closes) {
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    const p0 = closes[i - 1], p1 = closes[i];
    if (p0 > 0 && Number.isFinite(p0) && Number.isFinite(p1)) {
      rets.push(Math.log(p1 / p0));
    }
  }
  if (rets.length < 2) return null;

  const n = rets.length;
  const mean = rets.reduce((s, r) => s + r, 0) / n;
  const varSample = rets.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (n - 1);
  const sigmaDaily = Math.sqrt(varSample);
  const sigmaAnnual = sigmaDaily * Math.sqrt(252);
  return Number.isFinite(sigmaAnnual) ? sigmaAnnual : null;
}
