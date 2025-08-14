// app/api/strategy/breakeven/route.js
// Next.js (App Router) API — Break-even calculator for option strategies.
// Always returns 200 with { ok:false, error } on failures (for legacy UI parity).

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "s-maxage=30, stale-while-revalidate=15" };

/* ---------------------- small helpers ---------------------- */
const isNum = (x) => Number.isFinite(Number(x));
const n = (x) => (isNum(x) ? Number(x) : null);

function ok(payload, status = 200) {
  return NextResponse.json(payload, { status, headers: cacheHeaders });
}
function err(code, message) {
  return ok({ ok: false, error: message, errorObj: { code, message } }, 200);
}
function normSide(s) {
  const v = String(s || "").toLowerCase();
  return v.startsWith("l") ? "long" : "short";
}
function normType(t) {
  const v = String(t || "").toLowerCase();
  if (v.startsWith("c")) return "call";
  if (v.startsWith("p")) return "put";
  if (v.startsWith("s")) return "stock";
  return v;
}
function slugifyStrategy(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function extremeStrike(legs, type, mode = "min") {
  const xs = legs
    .filter((l) => normType(l.type) === type && isNum(l.strike))
    .map((l) => Number(l.strike));
  if (xs.length === 0) return null;
  return mode === "max" ? Math.max(...xs) : Math.min(...xs);
}
function strikesAt(legs, type) {
  return legs
    .filter((l) => normType(l.type) === type && isNum(l.strike))
    .map((l) => Number(l.strike))
    .sort((a, b) => a - b);
}
function sumPremium(legs) {
  // Premiums are assumed per-share; qty defaults to 1; stock legs ignored.
  let paid = 0, received = 0;
  for (const l of legs) {
    const t = normType(l.type);
    if (t !== "call" && t !== "put") continue;
    const q = isNum(l.qty) ? Math.max(0, Number(l.qty)) : 1;
    const p = isNum(l.premium) ? Number(l.premium) : 0;
    if (normSide(l.side) === "long") paid += p * q;
    else received += p * q;
  }
  const net = paid - received; // >0 debit, <0 credit
  return {
    netDebit: net > 0 ? net : 0,
    netCredit: net < 0 ? -net : 0,
    paid, received
  };
}

/* --------------------- BE formula handlers --------------------- */
/**
 * Each handler receives (legs, ctx) and returns:
 *   { be: number[] | null, meta?: object }
 * where BE values are underlying prices (not percent).
 * We keep the formulas exactly as specified in your task list.
 */
const HANDLERS = {
  /* 1 */ long_call(legs) {
    const K = extremeStrike(legs, "call", "min");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K + D], meta: { used: "closed_form", K, D } };
  },

  /* 2 */ short_put(legs) {
    const K = extremeStrike(legs, "put", "max");
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(K) || !isNum(C)) return { be: null };
    return { be: [K - C], meta: { used: "closed_form", K, C } };
  },

  /* 3 */ protective_put(legs) {
    const stockBuy = legs.find((l) => normType(l.type) === "stock" && normSide(l.side)==="long");
    const Kstock = isNum(stockBuy?.price) ? Number(stockBuy.price) : null;
    const { netDebit: D } = sumPremium(legs.filter(l=>normType(l.type)==="put"));
    if (!isNum(Kstock) || !isNum(D)) return { be: null };
    return { be: [Kstock + D], meta: { used: "closed_form", stockPrice: Kstock, putCost: D } };
  },

  /* 4 */ bull_call_spread(legs) {
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="long"),"call","min");
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"call","max");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2) || !isNum(D)) return { be: null };
    return { be: [K1 + D], meta: { used: "closed_form", K1, K2, D } };
  },

  /* 5 */ bear_put_spread(legs) {
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="long"),"put","max");
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"put","min");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2) || !isNum(D)) return { be: null };
    return { be: [K2 - D], meta: { used: "closed_form", K1, K2, D } };
  },

  /* 6 */ short_strangle(legs) {
    const puts = strikesAt(legs.filter(l=>normSide(l.side)==="short"), "put");
    const calls = strikesAt(legs.filter(l=>normSide(l.side)==="short"), "call");
    const K1 = puts[0] ?? null;
    const K2 = calls[calls.length-1] ?? null;
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2) || !isNum(C)) return { be: null };
    return { be: [K1 - C, K2 + C], meta: { used: "closed_form", Kput: K1, Kcall: K2, C } };
  },

  /* 7 */ iron_condor(legs) {
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"put","min");
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"call","max");
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2) || !isNum(C)) return { be: null };
    return { be: [K1 - C, K2 + C], meta: { used: "closed_form", shortPut: K1, shortCall: K2, C } };
  },

  /* 8 */ reverse_butterfly(legs) {
    const puts = strikesAt(legs, "put");
    const calls = strikesAt(legs, "call");
    const Kmin = Math.min(puts[0] ?? Infinity, calls[0] ?? Infinity);
    const Kmax = Math.max(puts[puts.length-1] ?? -Infinity, calls[calls.length-1] ?? -Infinity);
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(Kmin) || !isNum(Kmax) || !isNum(C)) return { be: null };
    return { be: [Kmin + C, Kmax - C], meta: { used: "closed_form", Kmin, Kmax, C } };
  },

  /* 9 */ strap(legs) {
    const K = (strikesAt(legs,"call")[0] ?? strikesAt(legs,"put")[0] ?? null);
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K - D, K + D / 2], meta: { used: "closed_form", K, D } };
  },

  /* 10 */ call_ratio_spread(legs) {
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="long"),"call","min");
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"call","max");
    const { netDebit: D, netCredit: C } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2)) return { be: null };
    if (D > 0) {
      return { be: [K1 + D, 2*K2 - K1 - D], meta: { used: "closed_form_debit", K1, K2, D } };
    }
    return { be: [2*K2 - K1 + C], meta: { used: "closed_form_credit", K1, K2, C, note:"unlimited risk above BE" } };
  },

  /* 11 */ put_backspread(legs) {
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"put","max");
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="long"),"put","min");
    const { netDebit: D, netCredit: C } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2)) return { be: null };
    if (C > 0) return { be: [K1 - C, 2*K2 - K1 + C], meta: { used: "closed_form_credit", K1, K2, C } };
    return { be: [2*K2 - K1 + D], meta: { used: "approx_debit", K1, K2, D } };
  },

  /* 12 */ reversal() {
    return { be: null, meta: { used: "no_be", note: "Fixed arbitrage payoff" } };
  },

  /* 13 */ long_put(legs) {
    const K = extremeStrike(legs, "put", "max");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K - D], meta: { used: "closed_form", K, D } };
  },

  /* 14 */ covered_call(legs) {
    const stock = legs.find(l=>normType(l.type)==="stock" && normSide(l.side)==="long");
    const S = isNum(stock?.price) ? Number(stock.price) : null;
    const { netCredit: C } = sumPremium(legs.filter(l=>normType(l.type)==="call"));
    if (!isNum(S) || !isNum(C)) return { be: null };
    return { be: [S - C], meta: { used: "closed_form", stockPrice: S, C } };
  },

  /* 15 */ collar(legs) {
    const stock = legs.find(l=>normType(l.type)==="stock");
    const S = isNum(stock?.price) ? Number(stock.price) : null;
    const { netDebit: D, netCredit: C } = sumPremium(legs.filter(l=>normType(l.type)!=="stock"));
    if (!isNum(S)) return { be: null };
    const netOpt = D > 0 ? D : -C;
    return { be: [S + netOpt], meta: { used: "closed_form", stockPrice: S, netOption: netOpt } };
  },

  /* 16 */ bear_call_spread(legs) {
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"call","min");
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(K1) || !isNum(C)) return { be: null };
    return { be: [K1 + C], meta: { used: "closed_form", K1, C } };
  },

  /* 17 */ long_straddle(legs) {
    const K = (strikesAt(legs,"call")[0] ?? strikesAt(legs,"put")[0] ?? null);
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K - D, K + D], meta: { used: "closed_form", K, D } };
  },

  /* 18 */ call_calendar_spread(legs) {
    const K = strikesAt(legs,"call")[0] ?? null;
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K + D], meta: { used: "approx", K, D, note: "final expiration approximation" } };
  },

  /* 19 */ reverse_condor(legs) {
    const K1 = extremeStrike(legs.filter(l=>normType(l.type)==="put" && normSide(l.side)==="short"),"put","min");
    const K2 = extremeStrike(legs.filter(l=>normType(l.type)==="call" && normSide(l.side)==="short"),"call","max");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2) || !isNum(D)) return { be: null };
    return { be: [K1 - D, K2 + D], meta: { used: "closed_form", shortPut: K1, shortCall: K2, D } };
  },

  /* 20 */ call_butterfly(legs) {
    const Ks = strikesAt(legs, "call");
    const Kmin = Ks[0] ?? null, Kmax = Ks[Ks.length-1] ?? null;
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(Kmin) || !isNum(Kmax) || !isNum(D)) return { be: null };
    return { be: [Kmin + D, Kmax - D], meta: { used: "closed_form", Kmin, Kmax, D } };
  },

  /* 21 */ call_diagonal_spread(legs) {
    const K = extremeStrike(legs.filter(l=>normSide(l.side)==="long"), "call", "min");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K + D], meta: { used: "approx", K, D } };
  },

  /* 22 */ put_ratio_spread(legs) {
    const Klong = extremeStrike(legs.filter(l=>normSide(l.side)==="long"),"put","max");
    const Kshort = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"put","min");
    const { netDebit: D, netCredit: C } = sumPremium(legs);
    if (!isNum(Klong) || !isNum(Kshort)) return { be: null };
    if (C > 0) return { be: [2*Kshort - Klong - C], meta: { used: "closed_form_credit", Klong, Kshort, C } };
    return { be: [2*Kshort - Klong + D], meta: { used: "approx_debit", Klong, Kshort, D } };
  },

  /* 23 */ long_box_spread() {
    return { be: null, meta: { used: "no_be", note: "Fixed arbitrage payoff" } };
  },

  /* 24 */ stock_repair() {
    return { be: null, meta: { used: "approx", note: "BE lowered; depends on original stock cost and chosen 1x2 spread." } };
  },

  /* 25 */ short_call(legs) {
    const K = extremeStrike(legs, "call", "min");
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(K) || !isNum(C)) return { be: null };
    return { be: [K + C], meta: { used: "closed_form", K, C } };
  },

  /* 26 */ covered_put(legs) {
    const ss = legs.find(l=>normType(l.type)==="stock" && normSide(l.side)==="short");
    const Sshort = isNum(ss?.price) ? Number(ss.price) : null;
    const { netCredit: C } = sumPremium(legs.filter(l=>normType(l.type)==="put"));
    if (!isNum(Sshort) || !isNum(C)) return { be: null };
    return { be: [Sshort + C], meta: { used: "closed_form", shortPrice: Sshort, C } };
  },

  /* 27 */ leaps_call(legs){ return HANDLERS.long_call(legs); },
  /* 27b */ leaps_put(legs){ return HANDLERS.long_put(legs); },

  /* 28 */ bull_put_spread(legs) {
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"put","max");
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(K2) || !isNum(C)) return { be: null };
    return { be: [K2 - C], meta: { used: "closed_form", K2, C } };
  },

  /* 29 */ long_strangle(legs) {
    const K1 = extremeStrike(legs,"put","min");
    const K2 = extremeStrike(legs,"call","max");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2) || !isNum(D)) return { be: null };
    return { be: [K1 - D, K2 + D], meta: { used: "closed_form", K1, K2, D } };
  },

  /* 30 */ put_calendar_spread(legs) {
    const K = strikesAt(legs,"put")[0] ?? null;
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K - D], meta: { used: "approx", K, D, note: "final expiration approximation" } };
  },

  /* 31 */ iron_butterfly(legs) {
    const Kshort = (strikesAt(legs.filter(l=>normSide(l.side)==="short"), "call")[0]
                 ?? strikesAt(legs.filter(l=>normSide(l.side)==="short"), "put")[0]
                 ?? null);
    const { netCredit: C } = sumPremium(legs);
    if (!isNum(Kshort) || !isNum(C)) return { be: null };
    return { be: [Kshort - C, Kshort + C], meta: { used: "closed_form", Kshort, C } };
  },

  /* 32 */ put_butterfly(legs) {
    const Ks = strikesAt(legs, "put");
    const Kmin = Ks[0] ?? null, Kmax = Ks[Ks.length-1] ?? null;
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(Kmin) || !isNum(Kmax) || !isNum(D)) return { be: null };
    return { be: [Kmin + D, Kmax - D], meta: { used: "closed_form", Kmin, Kmax, D } };
  },

  /* 33 */ put_diagonal_spread(legs) {
    const K = extremeStrike(legs.filter(l=>normSide(l.side)==="long"), "put", "max");
    const { netDebit: D } = sumPremium(legs);
    if (!isNum(K) || !isNum(D)) return { be: null };
    return { be: [K - D], meta: { used: "approx", K, D } };
  },

  /* 34 */ call_backspread(legs) {
    const K1 = extremeStrike(legs.filter(l=>normSide(l.side)==="short"),"call","min");
    const K2 = extremeStrike(legs.filter(l=>normSide(l.side)==="long"),"call","max");
    const { netDebit: D, netCredit: C } = sumPremium(legs);
    if (!isNum(K1) || !isNum(K2)) return { be: null };
    if (C > 0) return { be: [K1 + C, 2*K2 - K1 - C], meta: { used: "closed_form_credit", K1, K2, C } };
    return { be: [2*K2 - K1 + D], meta: { used: "approx_debit", K1, K2, D } };
  },

  /* 35 */ short_box_spread() {
    return { be: null, meta: { used: "no_be", note: "Fixed payoff opposite of long box" } };
  },
};

/** Strategy name normalization and alias map */
const ALIAS = new Map([
  // core
  ["long_call","long_call"], ["buy_call","long_call"],
  ["short_put","short_put"], ["sell_put","short_put"],
  ["protective_put","protective_put"],
  ["bull_call_spread","bull_call_spread"],
  ["bear_put_spread","bear_put_spread"],
  ["short_strangle","short_strangle"],
  ["iron_condor","iron_condor"],
  ["reverse_butterfly","reverse_butterfly"], ["short_butterfly","reverse_butterfly"],
  ["strap","strap"],
  ["call_ratio_spread","call_ratio_spread"],
  ["put_backspread","put_backspread"],
  ["reversal","reversal"],
  ["long_put","long_put"], ["buy_put","long_put"],
  ["covered_call","covered_call"],
  ["collar","collar"],
  ["bear_call_spread","bear_call_spread"],
  ["long_straddle","long_straddle"],
  ["call_calendar_spread","call_calendar_spread"], ["call_calendar","call_calendar_spread"],
  ["reverse_condor","reverse_condor"], ["long_iron_condor","reverse_condor"],
  ["call_butterfly","call_butterfly"],
  ["call_diagonal_spread","call_diagonal_spread"], ["call_diagonal","call_diagonal_spread"],
  ["put_ratio_spread","put_ratio_spread"],
  ["long_box_spread","long_box_spread"], ["long_box","long_box_spread"],
  ["stock_repair_strategy","stock_repair"], ["stock_repair","stock_repair"],
  ["short_call","short_call"], ["sell_call","short_call"],
  ["covered_put","covered_put"],
  ["leaps_option_call","leaps_call"], ["leaps_call","leaps_call"],
  ["leaps_option_put","leaps_put"], ["leaps_put","leaps_put"],
  ["bull_put_spread","bull_put_spread"],
  ["long_strangle","long_strangle"],
  ["put_calendar_spread","put_calendar_spread"],
  ["iron_butterfly","iron_butterfly"],
  ["put_butterfly","put_butterfly"],
  ["put_diagonal_spread","put_diagonal_spread"], ["put_diagonal","put_diagonal_spread"],
  ["call_backspread","call_backspread"],
  ["short_box_spread","short_box_spread"], ["short_box","short_box_spread"],
]);

function pickStrategyKey(name) {
  const slug = slugifyStrategy(name);
  return ALIAS.get(slug) || slug; // try alias, else pass-through (allows future additions)
}

/* -------- NEW: minimal inference when strategy is missing -------- */
function inferStrategyKeyFromLegs(legs) {
  const calls = legs.filter(l => normType(l.type) === "call");
  const puts  = legs.filter(l => normType(l.type) === "put");
  const { netDebit, netCredit } = sumPremium(legs);

  // Single-leg
  if (calls.length === 1 && puts.length === 0) {
    return normSide(calls[0].side) === "long" ? "long_call" : "short_call";
  }
  if (puts.length === 1 && calls.length === 0) {
    return normSide(puts[0].side) === "long" ? "long_put" : "short_put";
  }

  // Two-leg verticals (decide bull/bear by debit/credit)
  const longCalls  = calls.filter(l => normSide(l.side) === "long");
  const shortCalls = calls.filter(l => normSide(l.side) === "short");
  const longPuts   = puts.filter(l => normSide(l.side) === "long");
  const shortPuts  = puts.filter(l => normSide(l.side) === "short");

  if (longCalls.length === 1 && shortCalls.length === 1 && puts.length === 0) {
    return netDebit > 0 ? "bull_call_spread" : "bear_call_spread";
  }
  if (longPuts.length === 1 && shortPuts.length === 1 && calls.length === 0) {
    return netDebit > 0 ? "bear_put_spread" : "bull_put_spread";
  }

  // Unknown -> let caller decide (will error nicely)
  return null;
}

/* --------------------------- handlers --------------------------- */

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
    try {
      legs = legsRaw ? JSON.parse(legsRaw) : null;
    } catch {
      legs = null;
    }
  }

  return { strategy, legs, method };
}

/** GET (and POST) /api/strategy/breakeven */
export async function GET(req) { return handle(req); }
export async function POST(req) { return handle(req); }

async function handle(req) {
  try {
    const { strategy, legs } = await parseInput(req);
    if (!Array.isArray(legs) || legs.length === 0) {
      return err("LEGS_REQUIRED", "legs[] required");
    }

    // normalize legs
    const normLegs = legs.map((l) => ({
      type: normType(l.type),
      side: normSide(l.side),
      strike: n(l.strike),
      premium: n(l.premium),
      qty: isNum(l.qty) ? Number(l.qty) : 1,
      price: n(l.price),
    }));

    // Strategy: explicit -> alias; otherwise infer basic patterns
    const explicitKey = strategy ? pickStrategyKey(strategy) : null;
    const inferredKey = explicitKey || inferStrategyKeyFromLegs(normLegs);
    if (!inferredKey) {
      return err("STRATEGY_REQUIRED", "strategy required (could not infer from legs)");
    }

    const fn = HANDLERS[inferredKey];
    if (typeof fn !== "function") {
      return err("UNSUPPORTED_STRATEGY", `strategy '${explicitKey || inferredKey}' not supported`);
    }

    const out = fn(normLegs, {});
    const { netDebit, netCredit, paid, received } = sumPremium(normLegs);

    return ok({
      ok: true,
      strategy: inferredKey,
      be: Array.isArray(out?.be) ? out.be : null,
      meta: {
        ...(out?.meta || {}),
        premiums: { paid, received, netDebit, netCredit },
        legs: normLegs.length,
        resolved_by: explicitKey ? "explicit" : "inferred",
      },
    });
  } catch (e) {
    return err("INTERNAL_ERROR", String(e?.message || e));
  }
}
