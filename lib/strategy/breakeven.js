// lib/strategy/breakeven.js
// Closed-form break-even formulas for common strategies + numeric fallback.

import { normalizeLegs, inferStrategy } from "./legs.js";
import { findBreakEvens, suggestBounds } from "./payoff.js";

/* ---------- small utils ---------- */
const isNum = (x) => Number.isFinite(x);
const asc = (a, b) => a - b;
const uniq = (arr, eps = 1e-8) => {
  const out = [];
  const sorted = [...arr].sort(asc);
  for (const x of sorted) {
    if (!out.length || Math.abs(x - out[out.length - 1]) > eps) out.push(x);
  }
  return out;
};

/* ---------- leg helpers ---------- */
function splitByKind(legs) {
  const calls = [], puts = [], stocks = [];
  for (const l of legs || []) {
    if (l.kind === "call") calls.push(l);
    else if (l.kind === "put") puts.push(l);
    else if (l.kind === "stock") stocks.push(l);
  }
  return { calls, puts, stocks };
}

function countBy(legs, predicate) {
  return (legs || []).reduce((c, l) => c + (predicate(l) ? 1 : 0), 0);
}

/** Net premium for option legs only. Positive = net debit, Negative = net credit. */
function netOptionPremium(legs) {
  let net = 0;
  for (const l of legs || []) {
    if (l.kind === "call" || l.kind === "put") {
      const q = Math.max(0, Number(l.qty) || 1);
      const prem = Number(l.premium) || 0;
      net += (l.side === "long" ? +prem : -prem) * q;
    }
  }
  return net;
}

/** Return the 'short' strike for a given kind; if multiple, pick the middle. */
function shortStrike(legs, kind) {
  const ks = (legs || [])
    .filter((l) => l.kind === kind && l.side === "short")
    .map((l) => Number(l.strike))
    .filter(isNum)
    .sort(asc);
  if (!ks.length) return null;
  return ks[Math.floor(ks.length / 2)];
}

/** Min/Max strike among provided legs (already filtered by kind ideally). */
function extremeStrike(legs, _kind, which = "min") {
  const ks = (legs || [])
    .map((l) => Number(l.strike))
    .filter(isNum);
  if (!ks.length) return null;
  return which === "max" ? Math.max(...ks) : Math.min(...ks);
}

function stockBasis(legs) {
  const s = (legs || []).find((l) => l.kind === "stock");
  if (!s) return null;
  const basis = Number(s.premium);
  return isNum(basis) ? basis : null;
}

/* ---------- closed-form implementations ---------- */
const formulas = {
  /* 1. Long Call */
  long_call(N) {
    const { calls } = splitByKind(N.legs);
    if (calls.length !== 1 || calls[0].side !== "long") return null;
    const k = Number(calls[0].strike),
      p = Number(calls[0].premium);
    if (!isNum(k) || !isNum(p)) return null;
    return { be: [k + p], meta: { used: "closed_form", k, premium: p } };
  },

  /* 13. Long Put */
  long_put(N) {
    const { puts } = splitByKind(N.legs);
    if (puts.length !== 1 || puts[0].side !== "long") return null;
    const k = Number(puts[0].strike),
      p = Number(puts[0].premium);
    if (!isNum(k) || !isNum(p)) return null;
    return { be: [k - p], meta: { used: "closed_form", k, premium: p } };
  },

  /* 25. Short Call (naked) */
  short_call(N) {
    const { calls } = splitByKind(N.legs);
    if (calls.length !== 1 || calls[0].side !== "short") return null;
    const k = Number(calls[0].strike),
      c = Number(calls[0].premium);
    if (!isNum(k) || !isNum(c)) return null;
    return { be: [k + c], meta: { used: "closed_form", k, credit: c } };
  },

  /* 2. Short Put */
  short_put(N) {
    const { puts } = splitByKind(N.legs);
    if (puts.length !== 1 || puts[0].side !== "short") return null;
    const k = Number(puts[0].strike),
      c = Number(puts[0].premium);
    if (!isNum(k) || !isNum(c)) return null;
    return { be: [k - c], meta: { used: "closed_form", k, credit: c } };
  },

  /* 3. Protective Put (Long Stock + Long Put) */
  protective_put(N) {
    const { puts } = splitByKind(N.legs);
    if (countBy(N.legs, (l) => l.kind === "stock" && l.side === "long") !== 1)
      return null;
    if (puts.length !== 1 || puts[0].side !== "long") return null;
    const s0 = stockBasis(N.legs),
      p = Number(puts[0].premium);
    if (!isNum(s0) || !isNum(p)) return null;
    return {
      be: [s0 + p],
      meta: { used: "closed_form", stockBasis: s0, putPrem: p },
    };
  },

  /* 14. Covered Call (Long Stock + Short Call) */
  covered_call(N) {
    const { calls } = splitByKind(N.legs);
    if (countBy(N.legs, (l) => l.kind === "stock" && l.side === "long") !== 1)
      return null;
    if (calls.length !== 1 || calls[0].side !== "short") return null;
    const s0 = stockBasis(N.legs),
      c = Number(calls[0].premium);
    if (!isNum(s0) || !isNum(c)) return null;
    return {
      be: [s0 - c],
      meta: { used: "closed_form", stockBasis: s0, callCredit: c },
    };
  },

  /* 26. Covered Put (Short Stock + Short Put) */
  covered_put(N) {
    const { puts } = splitByKind(N.legs);
    if (countBy(N.legs, (l) => l.kind === "stock" && l.side === "short") !== 1)
      return null;
    if (puts.length !== 1 || puts[0].side !== "short") return null;
    const sShort = stockBasis(N.legs),
      c = Number(puts[0].premium);
    if (!isNum(sShort) || !isNum(c)) return null;
    return {
      be: [sShort + c],
      meta: { used: "closed_form", shortBasis: sShort, putCredit: c },
    };
  },

  /* 15. Collar (Long Stock + Long Put K1 + Short Call K2) */
  collar(N) {
    const { calls, puts } = splitByKind(N.legs);
    const hasLongStock =
      countBy(N.legs, (l) => l.kind === "stock" && l.side === "long") === 1;
    if (!hasLongStock || puts.length !== 1 || calls.length !== 1) return null;
    if (puts[0].side !== "long" || calls[0].side !== "short") return null;
    const s0 = stockBasis(N.legs);
    const netOpt =
      Number(puts[0].premium || 0) - Number(calls[0].premium || 0); // debit>0, credit<0
    if (!isNum(s0) || !isNum(netOpt)) return null;
    return {
      be: [s0 + netOpt],
      meta: { used: "closed_form", stockBasis: s0, netOption: netOpt },
    };
  },

  /* 4. Bull Call Spread (debit D): BE = K1 + D */
  bull_call_spread(N) {
    const { calls } = splitByKind(N.legs);
    if (calls.length !== 2) return null;
    const long = calls.find((l) => l.side === "long");
    const short = calls.find((l) => l.side === "short");
    if (!long || !short) return null;
    const D = netOptionPremium(N.legs); // > 0 debit expected
    const K1 = Number(long.strike);
    if (!isNum(D) || !isNum(K1)) return null;
    return {
      be: [K1 + Math.max(0, D)],
      meta: { used: "closed_form", K1, netDebit: Math.max(0, D) },
    };
  },

  /* 5. Bear Put Spread (debit D): BE = K2 - D */
  bear_put_spread(N) {
    const { puts } = splitByKind(N.legs);
    if (puts.length !== 2) return null;
    const long = puts.find((l) => l.side === "long");
    const short = puts.find((l) => l.side === "short");
    if (!long || !short) return null;
    const D = netOptionPremium(N.legs); // > 0 debit expected
    const K2 = Number(long.strike);
    if (!isNum(D) || !isNum(K2)) return null;
    return {
      be: [K2 - Math.max(0, D)],
      meta: { used: "closed_form", K2, netDebit: Math.max(0, D) },
    };
  },

  /* 28. Bull Put Spread (credit C): BE = K2 - C */
  bull_put_spread(N) {
    const { puts } = splitByKind(N.legs);
    if (puts.length !== 2) return null;
    const short = puts.find((l) => l.side === "short");
    if (!short) return null;
    const C = Math.max(0, -netOptionPremium(N.legs));
    const K2 = Number(short.strike);
    if (!isNum(C) || !isNum(K2)) return null;
    return { be: [K2 - C], meta: { used: "closed_form", K2, netCredit: C } };
  },

  /* 16. Bear Call Spread (credit C): BE = K1 + C */
  bear_call_spread(N) {
    const { calls } = splitByKind(N.legs);
    if (calls.length !== 2) return null;
    const short = calls.find((l) => l.side === "short");
    if (!short) return null;
    const C = Math.max(0, -netOptionPremium(N.legs));
    const K1 = Number(short.strike);
    if (!isNum(C) || !isNum(K1)) return null;
    return { be: [K1 + C], meta: { used: "closed_form", K1, netCredit: C } };
  },

  /* 6. Short Strangle (credit C): BEs = [K1 - C, K2 + C] */
  short_strangle(N) {
    const { calls, puts } = splitByKind(N.legs);
    if (calls.length !== 1 || puts.length !== 1) return null;
    if (calls[0].side !== "short" || puts[0].side !== "short") return null;
    const K2 = Number(calls[0].strike),
      K1 = Number(puts[0].strike);
    const C = Math.max(0, -netOptionPremium(N.legs));
    if (!isNum(K1) || !isNum(K2) || !isNum(C)) return null;
    return {
      be: [K1 - C, K2 + C],
      meta: { used: "closed_form", K1, K2, netCredit: C },
    };
  },

  /* 7. Iron Condor (credit C): BEs = [KputShort - C, KcallShort + C] */
  iron_condor(N) {
    const KputShort = shortStrike(N.legs, "put");
    const KcallShort = shortStrike(N.legs, "call");
    const C = Math.max(0, -netOptionPremium(N.legs));
    if (!isNum(KputShort) || !isNum(KcallShort) || !isNum(C)) return null;
    return {
      be: [KputShort - C, KcallShort + C],
      meta: { used: "closed_form", KputShort, KcallShort, netCredit: C },
    };
  },

  /* 31. Iron Butterfly (credit C): BEs = [K - C, K + C] */
  iron_butterfly(N) {
    const KshortPut = shortStrike(N.legs, "put");
    const KshortCall = shortStrike(N.legs, "call");
    if (!isNum(KshortPut) || !isNum(KshortCall)) return null;
    const K =
      Math.abs(KshortPut - KshortCall) < 1e-6
        ? KshortPut
        : (KshortPut + KshortCall) / 2;
    const C = Math.max(0, -netOptionPremium(N.legs));
    return { be: [K - C, K + C], meta: { used: "closed_form", Kshort: K, netCredit: C } };
  },

  /* 20. Call Butterfly (debit D): BEs = [Kmin + D, Kmax - D] */
  call_butterfly(N) {
    const { calls } = splitByKind(N.legs);
    if (calls.length !== 4 && calls.length !== 3) return null; // allow 1-2-1 via qty
    const D = Math.max(0, netOptionPremium(N.legs));
    const Kmin = extremeStrike(calls, "call", "min");
    const Kmax = extremeStrike(calls, "call", "max");
    if (!isNum(D) || !isNum(Kmin) || !isNum(Kmax)) return null;
    return {
      be: [Kmin + D, Kmax - D],
      meta: { used: "closed_form", Kmin, Kmax, netDebit: D },
    };
  },

  /* 32. Put Butterfly (debit D): BEs = [Kmin + D, Kmax - D] */
  put_butterfly(N) {
    const { puts } = splitByKind(N.legs);
    if (puts.length !== 4 && puts.length !== 3) return null;
    const D = Math.max(0, netOptionPremium(N.legs));
    const Kmin = extremeStrike(puts, "put", "min");
    const Kmax = extremeStrike(puts, "put", "max");
    if (!isNum(D) || !isNum(Kmin) || !isNum(Kmax)) return null;
    return {
      be: [Kmin + D, Kmax - D],
      meta: { used: "closed_form", Kmin, Kmax, netDebit: D },
    };
  },

  /* 8. Reverse Butterfly (short butterfly, credit C): BEs = [Kmin + C, Kmax - C] */
  reverse_butterfly(N) {
    const options = (N.legs || []).filter(
      (l) => l.kind === "call" || l.kind === "put"
    );
    if (options.length < 3) return null;
    const C = Math.max(0, -netOptionPremium(options));
    const Kmin = Math.min(
      ...options.map((l) => Number(l.strike)).filter(isNum)
    );
    const Kmax = Math.max(
      ...options.map((l) => Number(l.strike)).filter(isNum)
    );
    if (!isNum(C) || !isNum(Kmin) || !isNum(Kmax)) return null;
    return {
      be: [Kmin + C, Kmax - C],
      meta: { used: "closed_form", Kmin, Kmax, netCredit: C },
    };
  },

  /* 17. Long Straddle (debit D): BEs = [K - D, K + D] */
  long_straddle(N) {
    const { calls, puts } = splitByKind(N.legs);
    if (calls.length !== 1 || puts.length !== 1) return null;
    if (calls[0].side !== "long" || puts[0].side !== "long") return null;
    const Kc = Number(calls[0].strike),
      Kp = Number(puts[0].strike);
    if (!isNum(Kc) || !isNum(Kp)) return null;
    const K = Math.abs(Kc - Kp) < 1e-6 ? Kc : (Kc + Kp) / 2;
    const D = Math.max(0, netOptionPremium(N.legs));
    return { be: [K - D, K + D], meta: { used: "closed_form", K, netDebit: D } };
  },

  /* 29. Long Strangle (debit D): BEs = [K1 - D, K2 + D] */
  long_strangle(N) {
    const { calls, puts } = splitByKind(N.legs);
    if (calls.length !== 1 || puts.length !== 1) return null;
    if (calls[0].side !== "long" || puts[0].side !== "long") return null;
    const K2 = Number(calls[0].strike),
      K1 = Number(puts[0].strike);
    const D = Math.max(0, netOptionPremium(N.legs));
    if (!isNum(K1) || !isNum(K2) || !isNum(D)) return null;
    return {
      be: [K1 - D, K2 + D],
      meta: { used: "closed_form", K1, K2, netDebit: D },
    };
  },

  /* 10 & 34. Call Ratio Spread / Call Backspread (1x2) */
  call_ratio_spread(N) {
    const { calls } = splitByKind(N.legs);
    const nLong = countBy(calls, (l) => l.side === "long");
    const nShort = countBy(calls, (l) => l.side === "short");
    if (!(nLong === 1 && nShort === 2) && !(nLong === 2 && nShort === 1))
      return null;

    const K1 = extremeStrike(
      calls.filter((l) => l.side === "long"),
      "call",
      "min"
    ); // long lower strike
    const K2 = extremeStrike(
      calls.filter((l) => l.side === "short"),
      "call",
      "min"
    ); // short higher strike
    const net = netOptionPremium(N.legs);

    if (!isNum(K1) || !isNum(K2) || !isNum(net)) return null;

    if (net > 0) {
      // Net debit D
      const D = net;
      return {
        be: [K1 + D, 2 * K2 - K1 - D],
        meta: { used: "closed_form", K1, K2, netDebit: D },
      };
    } else {
      // Net credit C (unlimited risk above): single BE
      const C = -net;
      return {
        be: [2 * K2 - K1 + C],
        meta: { used: "closed_form", K1, K2, netCredit: C },
      };
    }
  },
  call_backspread(N) {
    return formulas.call_ratio_spread(N);
  },

  /* 11. Put Backspread (Short 1 @ K1, Long 2 @ K2 < K1) */
  put_backspread(N) {
    const { puts } = splitByKind(N.legs);
    const nLong = countBy(puts, (l) => l.side === "long");
    const nShort = countBy(puts, (l) => l.side === "short");
    if (!(nLong === 2 && nShort === 1)) return null;

    const K1 = extremeStrike(
      puts.filter((l) => l.side === "short"),
      "put",
      "max"
    ); // higher short
    const K2 = extremeStrike(
      puts.filter((l) => l.side === "long"),
      "put",
      "min"
    ); // lower long
    const net = netOptionPremium(N.legs);

    if (!isNum(K1) || !isNum(K2) || !isNum(net)) return null;

    if (net < 0) {
      // Net credit C
      const C = -net;
      return {
        be: [K1 - C, 2 * K2 - K1 + C],
        meta: { used: "closed_form", K1, K2, netCredit: C },
      };
    }
    // Net debit case -> use numeric fallback
    return null;
  },

  /* 18. Call Calendar (approx, debit): BE ~ K + D */
  call_calendar_spread(N) {
    const { calls } = splitByKind(N.legs);
    if (calls.length !== 2) return null;
    const sameK =
      Math.abs(Number(calls[0].strike) - Number(calls[1].strike)) < 1e-6;
    if (!sameK) return null;
    const K = Number(calls[0].strike);
    const D = Math.max(0, netOptionPremium(N.legs));
    if (!isNum(K) || !isNum(D)) return null;
    return {
      be: [K + D],
      meta: { used: "closed_form", approx: true, K, netDebit: D },
    };
  },

  /* 30. Put Calendar (approx, debit): BE ~ K - D */
  put_calendar_spread(N) {
    const { puts } = splitByKind(N.legs);
    if (puts.length !== 2) return null;
    const sameK =
      Math.abs(Number(puts[0].strike) - Number(puts[1].strike)) < 1e-6;
    if (!sameK) return null;
    const K = Number(puts[0].strike);
    const D = Math.max(0, netOptionPremium(N.legs));
    if (!isNum(K) || !isNum(D)) return null;
    return {
      be: [K - D],
      meta: { used: "closed_form", approx: true, K, netDebit: D },
    };
  },

  /* 19. Reverse Condor (long iron condor, debit D) */
  reverse_condor(N) {
    const KputShort = shortStrike(N.legs, "put");
    const KcallShort = shortStrike(N.legs, "call");
    const D = Math.max(0, netOptionPremium(N.legs));
    if (!isNum(KputShort) || !isNum(KcallShort) || !isNum(D)) return null;
    return {
      be: [KputShort - D, KcallShort + D],
      meta: { used: "closed_form", KputShort, KcallShort, netDebit: D },
    };
  },

  /* 9. Strap (2x Calls + 1x Put @ K, debit D) */
  strap(N) {
    const { calls, puts } = splitByKind(N.legs);
    if (!(calls.length >= 1 && puts.length >= 1)) return null;

    // Require "same-ish" K across legs
    const Ks = [...calls, ...puts]
      .map((l) => Number(l.strike))
      .filter(isNum);
    if (!Ks.length) return null;
    const K = Ks.reduce((a, b) => a + b, 0) / Ks.length;

    // Check quantity pattern (at least 2 long calls and 1 long put)
    const longCalls = calls
      .filter((l) => l.side === "long")
      .reduce((s, l) => s + (l.qty || 1), 0);
    const longPuts = puts
      .filter((l) => l.side === "long")
      .reduce((s, l) => s + (l.qty || 1), 0);
    if (!(longCalls >= 2 && longPuts >= 1)) return null;

    const D = Math.max(0, netOptionPremium(N.legs));
    return { be: [K - D, K + D / 2], meta: { used: "closed_form", K, netDebit: D } };
  },

  /* 12/23/35. Fixed payoff structures -> no BEs */
  reversal() {
    return { be: [], meta: { used: "closed_form", fixedPayoff: true } };
  },
  long_box_spread() {
    return { be: [], meta: { used: "closed_form", fixedPayoff: true } };
  },
  short_box_spread() {
    return { be: [], meta: { used: "closed_form", fixedPayoff: true } };
  },

  /* 21. Call Diagonal (approx, debit): BE ~ short K + D */
  call_diagonal_spread(N) {
    const K =
      shortStrike(N.legs, "call") ??
      extremeStrike(
        (N.legs || []).filter((l) => l.kind === "call"),
        "call",
        "min"
      );
    const D = Math.max(0, netOptionPremium(N.legs));
    if (!isNum(K) || !isNum(D)) return null;
    return {
      be: [K + D],
      meta: { used: "closed_form", approx: true, K, netDebit: D },
    };
  },

  /* 33. Put Diagonal (approx, debit): BE ~ short K - D */
  put_diagonal_spread(N) {
    const K =
      shortStrike(N.legs, "put") ??
      extremeStrike(
        (N.legs || []).filter((l) => l.kind === "put"),
        "put",
        "max"
      );
    const D = Math.max(0, netOptionPremium(N.legs));
    if (!isNum(K) || !isNum(D)) return null;
    return {
      be: [K - D],
      meta: { used: "closed_form", approx: true, K, netDebit: D },
    };
  },

  /* 27. LEAPS (call/put) — same as long call/put BE */
  leaps_call(N) {
    return formulas.long_call(N);
  },
  leaps_put(N) {
    return formulas.long_put(N);
  },
};

/* ---------- strategy aliasing ---------- */
const ALIAS = {
  buy_call: "long_call",
  buy_put: "long_put",
  naked_call: "short_call",
  naked_put: "short_put",

  ratio_call_spread: "call_ratio_spread",
  call_backspread: "call_ratio_spread",
  backspread_call: "call_ratio_spread",
  backspread_put: "put_backspread",

  calendar_call: "call_calendar_spread",
  calendar_put: "put_calendar_spread",

  long_iron_condor: "reverse_condor",
  long_box: "long_box_spread",
  short_box: "short_box_spread",

  butterfly_call: "call_butterfly",
  butterfly_put: "put_butterfly",
};

/* ---------- public API ---------- */
/**
 * computeBreakEvens(input, opts?)
 * @param input  legs[] OR { legs, strategy? }
 * @param opts   { strategy?: string }
 * @returns { be: number[], meta: {...} }
 */
export function computeBreakEvens(input, opts = {}) {
  const N = input?.legs ? normalizeLegs(input.legs) : normalizeLegs(input);
  const forced = opts.strategy || input?.strategy;
  const guessed = forced || (inferStrategy ? inferStrategy(N)?.type : null);
  const stratRaw = (guessed || "unknown").toLowerCase().replace(/\s+/g, "_");
  const strat = ALIAS[stratRaw] || stratRaw;

  // Try closed form first
  let out = null;
  if (formulas[strat]) {
    try {
      out = formulas[strat](N, { strategy: strat });
    } catch {
      /* ignore */
    }
  }

  // A few extra alias fallbacks that depend on structure
  if (!out && strat === "iron_condor_long") out = formulas.reverse_condor?.(N);

  if (out && out.be) {
    return {
      be: uniq(out.be),
      meta: { ...out.meta, strategy: strat, method: "closed_form" },
    };
  }

  // Numeric fallback (piecewise-linear root search)
  const bounds = suggestBounds(N);
  const be = findBreakEvens(N, { bounds });
  return {
    be: uniq(be),
    meta: { strategy: strat, method: "numeric_fallback", bounds },
  };
}

export default { computeBreakEvens };
