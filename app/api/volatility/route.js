import { NextResponse } from "next/server";
import { fetchHistSigma, fetchIvATM } from "../../../lib/volatility.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=30",
};

const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    const sourceRaw = (searchParams.get("source") || "iv").toLowerCase(); // "iv" | "hist"
    const days = clamp(searchParams.get("days") || 30, 1, 365);

    if (!symbol) {
      return NextResponse.json(
        { ok: false, error: { code: "SYMBOL_REQUIRED", message: "symbol required" } },
        { status: 400, headers: cacheHeaders }
      );
    }

    // Normalize source
    const wantIv = sourceRaw === "iv";
    const wantHist = sourceRaw === "hist";

    let chosen = null; // { sigmaAnnual, meta? }
    let used = null;   // "iv" | "hist"
    let meta = null;

    if (wantIv) {
      const iv = await fetchIvATM(symbol, days);
      if (iv?.sigmaAnnual != null) {
        chosen = iv;
        used = "iv";
      } else {
        const hv = await fetchHistSigma(symbol, days);
        if (hv?.sigmaAnnual != null) {
          chosen = { ...hv, meta: { ...(hv.meta || {}), fallback: true } };
          used = "hist";
        }
      }
    } else if (wantHist) {
      const hv = await fetchHistSigma(symbol, days);
      if (hv?.sigmaAnnual != null) {
        chosen = hv;
        used = "hist";
      } else {
        const iv = await fetchIvATM(symbol, days);
        if (iv?.sigmaAnnual != null) {
          chosen = { ...iv, meta: { ...(iv.meta || {}), fallback: true } };
          used = "iv";
        }
      }
    }

    if (!chosen || chosen.sigmaAnnual == null) {
      return NextResponse.json(
        { ok: false, error: { code: "VOL_UNAVAILABLE", message: "volatility unavailable" } },
        { status: 502, headers: cacheHeaders }
      );
    }

    meta = {
      ...(chosen.meta || {}),
      days,
      sourceRequested: wantIv ? "iv" : "hist",
      sourceUsed: used,
    };

    // Backward-compatible: expose top-level fields while also returning a standard envelope
    const data = { sigmaAnnual: chosen.sigmaAnnual, meta };
    const payload = { ok: true, data, ...data, _ms: Date.now() - t0 };

    return NextResponse.json(payload, { status: 200, headers: cacheHeaders });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: String(e?.message ?? e) },
        _ms: Date.now() - t0,
      },
      { status: 500, headers: cacheHeaders }
    );
  }
}
