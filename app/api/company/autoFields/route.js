import { NextResponse } from "next/server";
import { robustQuote } from "../../../../lib/yahoo.js";
import { fetchIvATM, fetchHistSigma } from "../../../../lib/volatility.js";
import { mget, mset, mkey } from "../../../../lib/mcache.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };

function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}
// Always 200 with ok:false to keep legacy UIs calm
function err(code, message, extra = {}) {
  return ok({ ok: false, error: message, errorObj: { code, message }, ...extra }, 200);
}

const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);
const toNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);

function normVolSource(param) {
  const s = String(param || "").toLowerCase();
  if (s === "historical" || s === "hist") return "hist";
  if (s === "implied" || s === "live" || s === "iv") return "iv";
  if (s === "auto" || s === "") return "auto";
  return "auto";
}

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return err("SYMBOL_REQUIRED", "symbol required");

    // Accept both ?volSource= and ?source= for robustness
    const volSourceRaw = searchParams.get("volSource") ?? searchParams.get("source") ?? "auto";
    const volSource = normVolSource(volSourceRaw);

    const days = clamp(searchParams.get("days") || 30, 1, 365);      // hist window
    const cmDays = clamp(searchParams.get("cmDays") || 30, 7, 365);  // IV constant-maturity

    // Micro-cache
    const key = mkey("autoFields", symbol, volSource, days, cmDays);
    const cached = mget(key);
    if (cached) return ok({ ...cached, _ms: Date.now() - t0, cached: true });

    // Quote bundle (spot, currency, beta, 52W range) — best effort
    let currency = null, spot = null, beta = null, high52 = null, low52 = null;
    try {
      const q = await robustQuote(symbol);
      currency = q?.currency ?? null;
      spot = toNum(q?.spot ?? q?.regularMarketPrice ?? q?.price);
      beta = toNum(q?.beta);
      high52 = toNum(q?.high52 ?? q?.fiftyTwoWeekHigh ?? q?.price?.fiftyTwoWeekHigh);
      low52  = toNum(q?.low52  ?? q?.fiftyTwoWeekLow  ?? q?.price?.fiftyTwoWeekLow);
    } catch {
      // keep nulls; volatility can still be useful downstream
    }

    // Volatility selection
    let ivRes = null, hvRes = null, chosen = null, sourceUsed = null;

    const want = volSource; // "auto" | "iv" | "hist"
    const tryIv = async () => {
      try {
        const r = await fetchIvATM(symbol, cmDays);
        if (r && typeof r.sigmaAnnual === "number") return r;
      } catch {}
      return null;
    };
    const tryHist = async () => {
      try {
        const r = await fetchHistSigma(symbol, days);
        if (r && typeof r.sigmaAnnual === "number") return r;
      } catch {}
      return null;
    };

    if (want === "iv") {
      ivRes = await tryIv();
      chosen = ivRes || null;
      if (!chosen) { hvRes = await tryHist(); chosen = hvRes || null; }
      sourceUsed = chosen === ivRes ? "iv" : (chosen ? "hist" : null);
    } else if (want === "hist") {
      hvRes = await tryHist();
      chosen = hvRes || null;
      if (!chosen) { ivRes = await tryIv(); chosen = ivRes || null; }
      sourceUsed = chosen === hvRes ? "hist" : (chosen ? "iv" : null);
    } else {
      // auto: prefer IV then fallback to hist
      ivRes = await tryIv();
      chosen = ivRes || null;
      if (!chosen) { hvRes = await tryHist(); chosen = hvRes || null; }
      sourceUsed = chosen === ivRes ? "iv" : (chosen ? "hist" : null);
    }

    if (!chosen) {
      const payload = {
        ok: false,
        symbol,
        currency,
        spot,
        beta,
        high52,
        low52,
        sigmaAnnual: null,
        iv: null,
        ivImplied: ivRes?.sigmaAnnual ?? null,
        ivHist: hvRes?.sigmaAnnual ?? null,
        meta: {
          sourceRequested: want,
          sourceUsed: null,
          days,
          cmDays,
          fallback: true,
        },
        _ms: Date.now() - t0,
      };
      // tiny cache to avoid hammering during outages
      mset(key, payload, 15_000);
      return ok(payload);
    }

    const sigmaAnnual = chosen.sigmaAnnual;
    const meta = {
      ...(chosen.meta || {}),
      sourceRequested: want,
      sourceUsed,
      days,
      cmDays: sourceUsed === "iv" ? cmDays : undefined,
    };

    const out = {
      ok: true,
      symbol,
      currency,
      spot,
      beta,
      high52,
      low52,
      sigmaAnnual,
      // Back-compat fields:
      iv: sigmaAnnual,
      ivImplied: ivRes?.sigmaAnnual ?? null,
      ivHist: hvRes?.sigmaAnnual ?? null,
      meta,
      _ms: Date.now() - t0,
    };

    mset(key, out, 45_000);
    return ok(out);
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}
