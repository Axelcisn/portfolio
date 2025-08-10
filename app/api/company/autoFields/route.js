import { NextResponse } from "next/server";
import { robustQuote, yahooLiveIv, yahooDailyCloses } from "../../../../lib/yahoo.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

function err(status, code, message) {
  // Back-compat: plain string `error`, plus structured `errorObj`
  return NextResponse.json(
    { ok: false, error: message, errorObj: { code, message } },
    { status, headers: cacheHeaders }
  );
}

const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);
const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const days = clamp(searchParams.get("days") || 30, 1, 365);
    const volSource = (searchParams.get("volSource") || "implied").toLowerCase(); // "implied" | "historical"

    if (!symbol) return err(400, "SYMBOL_REQUIRED", "symbol required");
    const wantHist = volSource === "historical";

    // --- Quote (currency/spot/beta) ---
    const q = await robustQuote(symbol);
    const currency = q?.currency ?? null;
    const spot = toNum(q?.spot);
    const beta = toNum(q?.beta);

    // --- Implied IV (best effort) ---
    let ivImplied = null;
    try {
      const iv = await yahooLiveIv(symbol);
      // accept either { iv } or { sigmaAnnual }
      ivImplied = toNum(iv?.iv ?? iv?.sigmaAnnual);
    } catch { /* tolerate upstream errors */ }

    // --- Historical IV (trailing `days`) ---
    let ivHist = null;
    try {
      const bars = await yahooDailyCloses(symbol, "1y", "1d");
      if (Array.isArray(bars) && bars.length > 1) {
        const closes = bars.map((b) => Number(b.close)).filter(Number.isFinite);
        if (closes.length > days) {
          const end = closes.length;
          const start = Math.max(0, end - (days + 1));
          const window = closes.slice(start, end);
          ivHist = histSigmaAnnual(window); // sample vol of daily log returns, annualized
        }
      }
    } catch { /* tolerate upstream errors */ }

    // --- Choose IV per requested source with graceful fallback ---
    let chosen = null;
    let volSourceUsed = null;
    if (wantHist) {
      chosen = ivHist ?? ivImplied ?? null;
      volSourceUsed = ivHist != null ? "historical" : (ivImplied != null ? "implied" : null);
    } else {
      chosen = ivImplied ?? ivHist ?? null;
      volSourceUsed = ivImplied != null ? "implied" : (ivHist != null ? "historical" : null);
    }

    const data = {
      currency,
      spot,
      beta,
      iv: toNum(chosen),
      ivImplied,
      ivHist,
      meta: { volSourceUsed, days },
    };

    // Back-compat: expose fields at top-level too
    return NextResponse.json(
      { ok: true, data, ...data, _ms: Date.now() - t0 },
      { status: 200, headers: cacheHeaders }
    );
  } catch (e) {
    return err(500, "INTERNAL_ERROR", String(e?.message ?? e));
  }
}

/* ---------- helpers ---------- */
function histSigmaAnnual(closes) {
  // closes: array of prices length >= 2
  const rets = [];
  for (let i = 1; i < closes.length; i++) {
    const p0 = closes[i - 1];
    const p1 = closes[i];
    if (p0 > 0 && Number.isFinite(p0) && Number.isFinite(p1)) {
      rets.push(Math.log(p1 / p0));
    }
  }
  if (rets.length < 2) return null;

  // sample variance (n-1)
  const n = rets.length;
  let sum = 0;
  for (const r of rets) sum += r;
  const mean = sum / n;
  let s2 = 0;
  for (const r of rets) s2 += (r - mean) * (r - mean);
  const varSample = s2 / (n - 1);
  const sigmaDaily = Math.sqrt(varSample);
  const sigmaAnnual = sigmaDaily * Math.sqrt(252);
  return Number.isFinite(sigmaAnnual) ? sigmaAnnual : null;
}
