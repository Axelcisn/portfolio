// app/api/volatility/route.js
// Volatility API with IV/Hist switching, cmDays support, unified meta, and micro-cache.

import { NextResponse } from "next/server";
import { fetchHistSigma, fetchIvATM } from "../../../lib/volatility.js";
import { constantMaturityATM } from "../../../lib/volatility/options.js";
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
  const asOf = rawMeta.asOf || new Date().toISOString();
  return {
    asOf,
    basis: 252,
    ...rawMeta,
    ...extras,
  };
}

// --- GET: symbol-driven path (micro-cached) ------------------------------

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
    const days = clamp(searchParams.get("days") ?? 30, 1, 365);            // historical lookback
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
        // fetchIvATM takes a target horizon; we pass cmDays for constant-maturity intent.
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
      fallback: used !== want,                 // <-- add reliable fallback flag
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

// --- POST: direct-chain path (offline-friendly) ---------------------------
// Accepts a JSON body like:
// {
//   "S0": 100, "r": 0, "q": 0, "cmDays": 30,
//   "chain": { "options": [ { "expirationDate": 1234567890, "calls":[...], "puts":[...] }, ... ] }
// }
export async function POST(req) {
  const t0 = Date.now();
  try {
    const body = await req.json().catch(() => ({}));

    // If a raw options chain is provided, compute IV locally (no external fetch).
    if (body?.chain) {
      const S0 = Number(body.S0 ?? body.spot ?? body.price);
      const r = Number(body.r ?? 0) || 0;
      const q = Number(body.q ?? 0) || 0;
      const cmDays = clamp(body.cmDays ?? 30, 1, 365);

      if (!(S0 > 0)) return err("S0_REQUIRED", "S0 (spot) must be > 0");

      const { iv, meta } = constantMaturityATM(body.chain, { S0, r, q, cmDays, nowMs: Date.now() });

      if (!(iv > 0)) return err("IV_UNAVAILABLE", "could not derive IV from provided chain");

      const unified = unifyMeta(meta, {
        sourceRequested: "iv",
        sourceUsed: "iv",
        fallback: false,                       // computed from chain → never a fallback
        cmDays,
      });

      return ok({ ok: true, sigmaAnnual: iv, meta: unified, _ms: Date.now() - t0, cache: "bypass" });
    }

    // Otherwise allow POST with { symbol, source?, days?, cmDays? } as a convenience.
    const symbol = (body?.symbol || "").trim().toUpperCase();
    if (!symbol) return err("SYMBOL_OR_CHAIN_REQUIRED", "provide either a symbol or an options chain");

    const want = normSource(body?.source ?? body?.volSource ?? "iv");
    const days = clamp(body?.days ?? 30, 1, 365);
    const cmDays = clamp(body?.cmDays ?? days ?? 30, 1, 365);

    let chosen = null;
    let used = null;

    if (want === "iv") {
      try { const iv = await fetchIvATM(symbol, cmDays); if (iv?.sigmaAnnual != null) { chosen = iv; used = "iv"; } } catch {}
      if (!chosen) { try { const hv = await fetchHistSigma(symbol, days); if (hv?.sigmaAnnual != null) { chosen = hv; used = "hist"; } } catch {} }
    } else {
      try { const hv = await fetchHistSigma(symbol, days); if (hv?.sigmaAnnual != null) { chosen = hv; used = "hist"; } } catch {}
      if (!chosen) { try { const iv = await fetchIvATM(symbol, cmDays); if (iv?.sigmaAnnual != null) { chosen = iv; used = "iv"; } } catch {} }
    }

    if (!chosen || chosen.sigmaAnnual == null) {
      return err("VOL_UNAVAILABLE", "volatility unavailable");
    }

    const meta = unifyMeta(chosen.meta, {
      sourceRequested: want,
      sourceUsed: used,
      fallback: used !== want,                 // <-- add reliable fallback flag
      days: used === "hist" ? days : undefined,
      cmDays: used === "iv" ? cmDays : undefined,
    });

    return ok({ ok: true, sigmaAnnual: chosen.sigmaAnnual, meta, _ms: Date.now() - t0, cache: "bypass" });
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message ?? e));
  }
}
