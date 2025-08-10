import { NextResponse } from "next/server";
import { fetchHistSigma, fetchIvATM } from "../../../lib/volatility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };
const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);

function err(status, code, message) {
  // Back-compat: plain string `error` (prevents "[object Object]"), plus structured details
  return NextResponse.json(
    { ok: false, error: message, errorObj: { code, message } },
    { status, headers: cacheHeaders }
  );
}

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const sourceRaw = (searchParams.get("source") || "iv").toLowerCase(); // "iv" | "hist"
    const days = clamp(searchParams.get("days") || 30, 1, 365);

    if (!symbol) return err(400, "SYMBOL_REQUIRED", "symbol required");

    const wantIv = sourceRaw === "iv";
    const wantHist = sourceRaw === "hist";

    let chosen = null; // { sigmaAnnual, meta? }
    let used = null;   // "iv" | "hist"

    if (wantIv) {
      try {
        const iv = await fetchIvATM(symbol, days);
        if (iv?.sigmaAnnual != null) {
          chosen = iv; used = "iv";
        }
      } catch { /* tolerate */ }
      if (!chosen) {
        try {
          const hv = await fetchHistSigma(symbol, days);
          if (hv?.sigmaAnnual != null) {
            chosen = { ...hv, meta: { ...(hv.meta || {}), fallback: true } };
            used = "hist";
          }
        } catch { /* tolerate */ }
      }
    } else if (wantHist) {
      try {
        const hv = await fetchHistSigma(symbol, days);
        if (hv?.sigmaAnnual != null) {
          chosen = hv; used = "hist";
        }
      } catch { /* tolerate */ }
      if (!chosen) {
        try {
          const iv = await fetchIvATM(symbol, days);
          if (iv?.sigmaAnnual != null) {
            chosen = { ...iv, meta: { ...(iv.meta || {}), fallback: true } };
            used = "iv";
          }
        } catch { /* tolerate */ }
      }
    }

    if (!chosen || chosen.sigmaAnnual == null) {
      return err(502, "VOL_UNAVAILABLE", "volatility unavailable");
    }

    const meta = {
      ...(chosen.meta || {}),
      days,
      sourceRequested: wantIv ? "iv" : "hist",
      sourceUsed: used,
    };

    const data = { sigmaAnnual: chosen.sigmaAnnual, meta };
    return NextResponse.json(
      { ok: true, data, ...data, _ms: Date.now() - t0 },
      { status: 200, headers: cacheHeaders }
    );
  } catch (e) {
    return err(500, "INTERNAL_ERROR", String(e?.message ?? e));
  }
}
