// app/api/strategy/breakeven/route.js
// Next.js (App Router) API — Break-even calculator for option strategies.

import { NextResponse } from "next/server";
import { computeBreakEvens } from "lib/strategy/breakeven.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=30, stale-while-revalidate=15" };

/* ---------------------- small helpers ---------------------- */
const isNum = (x) => Number.isFinite(Number(x));
const toN  = (x) => (isNum(x) ? Number(x) : null);
const normSide = (s) => (String(s || "").toLowerCase().startsWith("l") ? "long" : "short");
const normType = (t) => {
  const v = String(t || "").toLowerCase();
  if (v.startsWith("c")) return "call";
  if (v.startsWith("p")) return "put";
  if (v.startsWith("s")) return "stock";
  return v;
};
const slug = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Minimal supported keys list (for routing only; no math here) */
const SUPPORTED = new Set([
  "long_call","long_put","short_call","short_put",
  "protective_put","covered_call","covered_put","collar",
  "bull_call_spread","bear_call_spread","bear_put_spread","bull_put_spread",
  "long_straddle","short_straddle","long_strangle","short_strangle",
  "iron_condor","iron_butterfly","reverse_condor","reverse_butterfly",
  "call_butterfly","put_butterfly","call_diagonal_spread","put_diagonal_spread",
  "call_calendar_spread","put_calendar_spread",
  "call_ratio_spread","call_backspread","put_backspread","put_ratio_spread",
  "strap",
  "long_box_spread","short_box_spread","reversal",
  "leaps_call","leaps_put",
  "stock_repair"
]);

/* ---------------------- IO helpers ---------------------- */
function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}
function err(code, message) {
  return ok({ ok: false, error: message, errorObj: { code, message } }, 200);
}

async function parseInput(req) {
  const method = (req.method || "GET").toUpperCase();
  let strategy, legs;

  if (method === "POST") {
    const j = await req.json().catch(() => ({}));
    strategy = j?.strategy ?? j?.name ?? j?.key;
    legs = j?.legs;
  } else {
    const { searchParams } = new URL(req.url);
    strategy = searchParams.get("strategy") || searchParams.get("name") || searchParams.get("key");
    const legsRaw = searchParams.get("legs");
    try { legs = legsRaw ? JSON.parse(legsRaw) : null; } catch { legs = null; }
  }
  return { strategy, legs };
}

/* --------------------- light normalization --------------------- */
function normalizeLegs(legs = []) {
  return (legs || []).map((l) => {
    const kind = normType(l?.kind ?? l?.type);       // feed engine with 'kind'
    const side = normSide(l?.side);
    return {
      kind,                                          // <- engine expects this
      type: kind,                                    // <- alias for any UI that reads 'type'
      side,                                          // 'long' | 'short'
      strike: toN(l?.strike),
      premium: toN(l?.premium),
      qty: isNum(l?.qty) ? Math.max(0, Number(l.qty)) : 1,
      price: toN(l?.price),                          // for stock basis (optional)
    };
  });
}

/* --------------------- premiums & strikes (meta) --------------------- */
function sumPremium(legs = []) {
  let paid = 0, received = 0;
  for (const l of legs) {
    if (l.kind !== "call" && l.kind !== "put") continue;
    const q = isNum(l.qty) ? Math.max(0, Number(l.qty)) : 1;
    const p = isNum(l.premium) ? Number(l.premium) : 0;
    if (l.side === "long") paid += p * q;
    else received += p * q;
  }
  const net = paid - received; // >0 debit, <0 credit
  return {
    netDebit: net > 0 ? net : 0,
    netCredit: net < 0 ? -net : 0,
    paid, received,
  };
}
function strikesAt(legs, kindName) {
  return legs
    .filter((l) => l.kind === kindName && isNum(l.strike))
    .map((l) => Number(l.strike))
    .sort((a, b) => a - b);
}
function shortOptionCreditTotal(legs = []) {
  let total = 0;
  for (const l of legs) {
    if ((l.kind === "call" || l.kind === "put") && l.side === "short") {
      const q = isNum(l.qty) ? Math.max(0, Number(l.qty)) : 1;
      const p = isNum(l.premium) ? Number(l.premium) : 0;
      total += q * p;
    }
  }
  return total;
}

/* ---------- tiny inference (only for labeling & test parity) ---------- */
function inferStrategyKeyFromLegs(legs) {
  const calls = legs.filter(l => l.kind === "call");
  const puts  = legs.filter(l => l.kind === "put");
  const longCalls  = calls.filter(l => l.side === "long");
  const shortCalls = calls.filter(l => l.side === "short");
  const longPuts   = puts.filter(l => l.side === "long");
  const shortPuts  = puts.filter(l => l.side === "short");

  // Single-leg
  if (calls.length === 1 && puts.length === 0) {
    return calls[0].side === "long" ? "long_call" : "short_call";
  }
  if (puts.length === 1 && calls.length === 0) {
    return puts[0].side === "long" ? "long_put" : "short_put";
  }

  // Straddles/strangles
  if (calls.length === 1 && puts.length === 1) {
    const Kc = calls[0].strike, Kp = puts[0].strike;
    const sameK = isNum(Kc) && isNum(Kp) && Math.abs(Kc - Kp) < 1e-6;
    const bothShort = calls[0].side === "short" && puts[0].side === "short";
    const bothLong  = calls[0].side === "long"  && puts[0].side === "long";
    if (bothShort) return sameK ? "short_straddle" : "short_strangle";
    if (bothLong)  return sameK ? "long_straddle"  : "long_strangle";
  }

  // Two-leg verticals (decide bull/bear by debit/credit)
  if (longCalls.length === 1 && shortCalls.length === 1 && puts.length === 0) {
    const { netDebit } = sumPremium(legs);
    return netDebit > 0 ? "bull_call_spread" : "bear_call_spread";
  }
  if (longPuts.length === 1 && shortPuts.length === 1 && calls.length === 0) {
    const { netDebit } = sumPremium(legs);
    return netDebit > 0 ? "bear_put_spread" : "bull_put_spread";
  }

  return null;
}

/* ----- explicit straddle → strangle disambiguation (server-side) ----- */
function disambiguateStraddle(explicitKey, legs) {
  const key = slug(explicitKey);
  if (key !== "short_straddle" && key !== "long_straddle") return null;
  const side = key.startsWith("short") ? "short" : "long";
  const calls = strikesAt(legs.filter((l) => l.kind === "call" && l.side === side), "call");
  const puts  = strikesAt(legs.filter((l) => l.kind === "put"  && l.side === side), "put");
  const Kc = calls[0] ?? null, Kp = puts[0] ?? null;
  if (isNum(Kc) && isNum(Kp) && Math.abs(Kc - Kp) > 1e-6) {
    return side === "short" ? "short_strangle" : "long_strangle";
  }
  return null;
}

/* ------------------ local closed-form fallbacks / overrides ------------------ */
// Short straddle: BE = K ± (total net credit)
function localShortStraddleBE(legs) {
  const calls = strikesAt(legs.filter(l => l.kind === "call" && l.side === "short"), "call");
  const puts  = strikesAt(legs.filter(l => l.kind === "put"  && l.side === "short"), "put");
  const K = (calls[0] ?? puts[0] ?? null);
  const C = shortOptionCreditTotal(legs);
  if (!isNum(K) || !isNum(C)) return null;
  return [K - C, K + C];
}

// Short strangle: BE = [Kput - (total credit), Kcall + (total credit)]
function localShortStrangleBE(legs) {
  const Kput  = strikesAt(legs.filter(l => l.kind === "put"  && l.side === "short"), "put")[0] ?? null;
  const Kcall = strikesAt(legs.filter(l => l.kind === "call" && l.side === "short"), "call").slice(-1)[0] ?? null;
  const C = shortOptionCreditTotal(legs); // TOTAL credit across both short legs
  if (!isNum(Kput) || !isNum(Kcall) || !isNum(C)) return null;
  return [Kput - C, Kcall + C];
}

// Debit call vertical (bull call): BE = K_long + netDebit
function localBullCallSpreadBE(legs, premiums) {
  const Klong = strikesAt(legs.filter(l => l.kind === "call" && l.side === "long"), "call")[0] ?? null;
  if (!isNum(Klong)) return null;
  const D = premiums?.netDebit ?? sumPremium(legs).netDebit;
  if (!isNum(D)) return null;
  return [Klong + D];
}

// Debit put vertical (bear put): BE = K_long - netDebit
function localBearPutSpreadBE(legs, premiums) {
  const longPuts = strikesAt(legs.filter(l => l.kind === "put" && l.side === "long"), "put");
  const Klong = longPuts.length ? longPuts.slice(-1)[0] : null; // highest strike
  if (!isNum(Klong)) return null;
  const D = premiums?.netDebit ?? sumPremium(legs).netDebit;
  if (!isNum(D)) return null;
  return [Klong - D];
}

// Credit call vertical (bear call): BE = K_short + netCredit
function localBearCallSpreadBE(legs, premiums) {
  const Kshort = strikesAt(legs.filter(l => l.kind === "call" && l.side === "short"), "call")[0] ?? null; // lower strike
  if (!isNum(Kshort)) return null;
  const C = premiums?.netCredit ?? sumPremium(legs).netCredit;
  if (!isNum(C)) return null;
  return [Kshort + C];
}

// Credit put vertical (bull put): BE = K_short - netCredit
function localBullPutSpreadBE(legs, premiums) {
  const shortPuts = strikesAt(legs.filter(l => l.kind === "put" && l.side === "short"), "put");
  const Kshort = shortPuts.length ? shortPuts.slice(-1)[0] : null; // higher strike
  if (!isNum(Kshort)) return null;
  const C = premiums?.netCredit ?? sumPremium(legs).netCredit;
  if (!isNum(C)) return null;
  return [Kshort - C];
}

// Iron butterfly: BE = Kshort ± netCredit
function localIronButterflyBE(legs, premiums) {
  const KcShort = strikesAt(legs.filter(l => l.kind === "call" && l.side === "short"), "call")[0] ?? null;
  const KpShort = strikesAt(legs.filter(l => l.kind === "put"  && l.side === "short"), "put")[0] ?? null;
  const Kshort = isNum(KcShort) ? KcShort : KpShort;
  const C = (premiums?.netCredit ?? sumPremium(legs).netCredit);
  if (!isNum(Kshort) || !isNum(C)) return null;
  return [Kshort - C, Kshort + C];
}

/* --------------------------- handlers --------------------------- */

export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }

async function handle(req) {
  try {
    const { strategy, legs } = await parseInput(req);
    if (!Array.isArray(legs) || legs.length === 0) {
      return err("LEGS_REQUIRED", "legs[] required");
    }

    const normLegs = normalizeLegs(legs);
    const premiums = sumPremium(normLegs);

    // Resolve strategy selection semantics (no math here)
    const explicitKey = strategy ? slug(strategy) : null;
    let usedKey = null;
    let resolved_by = "inferred";
    let disambiguated_from = null;

    if (explicitKey) {
      if (!SUPPORTED.has(explicitKey)) {
        usedKey = null; // let engine infer; we'll mark as fallback
        resolved_by = "inferred_fallback";
      } else {
        const alt = disambiguateStraddle(explicitKey, normLegs);
        if (alt) {
          disambiguated_from = explicitKey;
          usedKey = alt;
          resolved_by = "explicit_disambiguated";
        } else {
          usedKey = explicitKey;
          resolved_by = "explicit";
        }
      }
    }

    // Delegate to authoritative engine
    const eng = computeBreakEvens({ legs: normLegs, strategy: usedKey || undefined });
    const beFromEngine = Array.isArray(eng?.be) ? eng.be : null;

    // Prefer a non-'unknown' engine strategy; otherwise fall back to our inference
    const engineStrategy = (eng?.meta?.strategy && eng.meta.strategy !== "unknown") ? eng.meta.strategy : null;
    const inferred = inferStrategyKeyFromLegs(normLegs);
    const finalStrategy =
      usedKey ||
      engineStrategy ||
      inferred ||
      (explicitKey && SUPPORTED.has(explicitKey) ? explicitKey : null) ||
      "unknown";

    // Always enforce spec-consistent formulas for these shapes (override engine if needed)
    const overrideByStrategy = {
      short_straddle: () => localShortStraddleBE(normLegs),
      short_strangle: () => localShortStrangleBE(normLegs),
      iron_butterfly: () => localIronButterflyBE(normLegs, premiums),
    };

    let beOut = beFromEngine;

    if (overrideByStrategy[finalStrategy]) {
      const o = overrideByStrategy[finalStrategy]();
      if (Array.isArray(o)) beOut = o;
    }

    // If still missing/invalid, use broader fallbacks for common spreads
    if (!Array.isArray(beOut) || beOut.length === 0 || beOut.some((x) => !isNum(x))) {
      switch (finalStrategy) {
        case "bull_call_spread": {
          const be = localBullCallSpreadBE(normLegs, premiums);
          if (Array.isArray(be)) beOut = be;
          break;
        }
        case "bear_put_spread": {
          const be = localBearPutSpreadBE(normLegs, premiums);
          if (Array.isArray(be)) beOut = be;
          break;
        }
        case "bear_call_spread": {
          const be = localBearCallSpreadBE(normLegs, premiums);
          if (Array.isArray(be)) beOut = be;
          break;
        }
        case "bull_put_spread": {
          const be = localBullPutSpreadBE(normLegs, premiums);
          if (Array.isArray(be)) beOut = be;
          break;
        }
        default:
          break;
      }
    }

    return ok({
      ok: true,
      strategy: finalStrategy,
      be: Array.isArray(beOut) ? beOut : null,
      meta: {
        ...(eng?.meta || {}),
        premiums,
        legs: normLegs.length,
        resolved_by,
        ...(disambiguated_from ? { disambiguated_from } : {}),
      },
    });
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message || e));
  }
}