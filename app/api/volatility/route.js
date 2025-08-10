import { NextResponse } from "next/server";
import { fetchHistSigma, fetchIvATM } from "../../../lib/volatility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}
// Return 200 on errors to avoid "fetch failed" in legacy UI
function err(code, message) {
  return ok({ ok: false, error: message, errorObj: { code, message } }, 200);
}

const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const sourceRaw = (searchParams.get("source") || "iv").toLowerCase(); // "iv" | "hist"
    const days = clamp(searchParams.get("days") || 30, 1, 365);

    if (!symbol) return err("SYMBOL_REQUIRED", "symbol required");

    const wantIv = sourceRaw === "iv";
    let chosen = null; // { sigmaAnnual, meta? }
    let used = null;   // "iv" | "hist"

    if (wantIv) {
      try {
        const iv = await fetchIvATM(symbol, days);
        if (iv?.sigmaAnnual != null) { chosen = iv; used = "iv"; }
      } catch {}
      if (!chosen) {
        try {
          const hv = await fetchHistSigma(symbol, days);
          if (hv?.sigmaAnnual != null) { chosen = { ...hv, meta: { ...(hv.meta||{}), fallback:true } }; used = "hist"; }
        } catch {}
      }
    } else {
      try {
        const hv = await fetchHistSigma(symbol, days);
        if (hv?.sigmaAnnual != null) { chosen = hv; used = "hist"; }
      } catch {}
      if (!chosen) {
        try {
          const iv = await fetchIvATM(symbol, days);
          if (iv?.sigmaAnnual != null) { chosen = { ...iv, meta: { ...(iv.meta||{}), fallback:true } }; used = "iv"; }
        } catch {}
      }
    }

    if (!chosen || chosen.sigmaAnnual == null) return err("VOL_UNAVAILABLE", "volatility unavailable");

    const meta = { ...(chosen.meta || {}), days, sourceRequested: wantIv ? "iv" : "hist", sourceUsed: used };
    const data = { sigmaAnnual: chosen.sigmaAnnual, meta };

    return ok({ ok: true, data, ...data, _ms: Date.now() - t0 });
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}
