// app/api/volatility/route.js
// Volatility API with IV/Hist switching, cmDays support, unified meta, and micro-cache.

import { NextResponse } from "next/server";
import { fetchHistSigma, fetchIvATM } from "../../../lib/volatility.js";
import { mget, mset, mkey } from "../../../lib/server/mcache.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=60, stale-while-revalidate=30" };
const TTL_MS = 60 * 1000;

// --- helpers -------------------------------------------------------------

function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}
// Return 200 on errors to avoid "fetch failed" in legacy UI
function err(code, message) {
  return ok({ ok: false, error: message, errorObj: { code, message } }, 200);
}
const clamp = (x, lo, hi) => Math.min(Math.max(Number(x) || 0, lo), hi);

function normSource(s) {
  const v = String(s || "").toLowerCase();
  if (v === "iv" || v === "live" || v === "implied") return "iv";
  if (v === "hist" || v === "historical") return "hist";
  return "iv";
}

function unifyMeta(rawMeta = {}, extras = {}) {
  // Normalize common diagnostics; keep anything vendor provided.
  const asOf = rawMeta.asOf || new Date().toISOString();
  const base = {
    asOf,
    basis: 252,
    ...rawMeta,
    ...extras,
  };
  return base;
}

// --- route ---------------------------------------------------------------

export async function GET(req) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
    if (!symbol) return err("SYMBOL_REQUIRED", "symbol required");

    // Accept both `source` and legacy `volSource`
    const sourceParam = searchParams.get("source") ?? searchParams.get("volSource") ?? "iv";
    const want = normSource(sourceParam);

    // Horizons
    const days = clamp(searchParams.get("days") ?? 30, 1, 365);       // historical lookback
    const cmDays = clamp(searchParams.get("cmDays") ?? days ?? 30, 1, 365); // target days for IV

    // Micro-cache key: symbol + normalized source request + horizons
    const key = mkey("vol", symbol, want, `d${days}`, `cm${cmDays}`);
    const hit = mget(key);
    if (hit) {
      return ok({ ok: true, ...hit, _ms: Date.now() - t0, cache: "hit" });
    }

    let chosen = null; // { sigmaAnnual, meta? }
    let used = null;   // "iv" | "hist"

    // Try requested source first, then fallback to the other
    async function tryIV() {
      try {
        // fetchIvATM already takes a target horizon; we pass cmDays for constant-maturity intent.
        const iv = await fetchIvATM(symbol, cmDays);
        if (iv?.sigmaAnnual != null) {
          chosen = iv;
          used = "iv";
        }
      } catch {}
    }
    async function tryHIST() {
      try {
        const hv = await fetchHistSigma(symbol, days);
        if (hv?.sigmaAnnual != null) {
          chosen = hv;
          used = "hist";
        }
      } catch {}
    }

    if (want === "iv") {
      await tryIV();
      if (!chosen) await tryHIST();
    } else {
      await tryHIST();
      if (!chosen) await tryIV();
    }

    if (!chosen || chosen.sigmaAnnual == null) {
      return err("VOL_UNAVAILABLE", "volatility unavailable");
    }

    // Build unified meta
    const meta = unifyMeta(chosen.meta, {
      sourceRequested: want,
      sourceUsed: used,
      days: used === "hist" ? days : undefined,
      cmDays: used === "iv" ? cmDays : undefined,
    });

    const data = { sigmaAnnual: chosen.sigmaAnnual, meta };
    const payload = { ok: true, ...data, _ms: Date.now() - t0, cache: "miss" };

    // Cache and return
    mset(key, payload, TTL_MS);
    return ok(payload);
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}
