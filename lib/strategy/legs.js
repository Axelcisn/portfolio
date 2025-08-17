// lib/strategy/legs.js
// Canonical legs model + normalizer for BE/payoff engines.
// Adds a lightweight `inferStrategy` for common patterns.

const dnum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Normalize a raw legs array into a consistent shape the engines can use.
 * - kind:  'call' | 'put' | (optionally 'stock')
 * - side:  'long' | 'short'
 * - qty:   number (>=0)
 * - strike:number (required for options)
 * - premium:number per-share (positive value; sign handled by side)
 * - multiplier:number per-contract (default 100, not used in per-share P&L)
 *
 * Returns:
 * {
 *   legs: [...],         // normalized legs
 *   strikes: number[],   // sorted unique strikes asc
 *   K: number[],         // alias to strikes
 *   netPremium: number,  // +debit (paid), -credit (received), per-share
 *   sign: 'debit'|'credit'
 * }
 */
export function normalizeLegs(input, opt = {}) {
  const defMult = Number.isFinite(opt.defaultMult) ? opt.defaultMult : 100;

  const legs = (Array.isArray(input) ? input : [])
    .filter(Boolean)
    .map((l) => ({
      kind: (l.kind || '').toLowerCase(),           // 'call' | 'put' | 'stock'
      side: (l.side || '').toLowerCase(),           // 'long' | 'short'
      qty: Math.max(0, Math.abs(dnum(l.qty, 1))),
      strike: dnum(l.strike, NaN),
      expiry: l.expiry || null,
      premium: dnum(l.premium, 0),                  // per-share
      multiplier: dnum(l.multiplier, defMult) || defMult,
    }))
    .filter((l) => l.kind && l.side && (l.kind === 'stock' || Number.isFinite(l.strike)));

  // Net option premium per share (long pays +, short receives -)
  let netPremium = 0;
  for (const l of legs) {
    if (l.kind === 'call' || l.kind === 'put') {
      const sgn = l.side === 'long' ? +1 : -1;
      netPremium += sgn * l.premium * (l.qty || 1);
    }
  }

  const strikes = Array.from(
    new Set(legs.filter(l => l.kind !== 'stock').map((l) => l.strike))
  ).sort((a, b) => a - b);

  return {
    legs,
    strikes,
    K: strikes,
    netPremium,                               // +debit (paid), -credit (received)
    sign: netPremium > 0 ? 'debit' : 'credit',
  };
}

/* ---------- Convenience pickers (optional helpers) ---------- */
export const pick = {
  shortCallStrikes(N) {
    return N.legs.filter((l) => l.kind === 'call' && l.side === 'short')
      .map((l) => l.strike).sort((a, b) => a - b);
  },
  shortPutStrikes(N) {
    return N.legs.filter((l) => l.kind === 'put' && l.side === 'short')
      .map((l) => l.strike).sort((a, b) => a - b);
  },
  longCallStrikes(N) {
    return N.legs.filter((l) => l.kind === 'call' && l.side === 'long')
      .map((l) => l.strike).sort((a, b) => a - b);
  },
  longPutStrikes(N) {
    return N.legs.filter((l) => l.kind === 'put' && l.side === 'long')
      .map((l) => l.strike).sort((a, b) => a - b);
  },
};

/* ---------- Strategy inference (lightweight) ---------- */
function splitByKind(legs) {
  const calls = [], puts = [], stocks = [];
  for (const l of legs || []) {
    if (l.kind === 'call') calls.push(l);
    else if (l.kind === 'put') puts.push(l);
    else if (l.kind === 'stock') stocks.push(l);
  }
  return { calls, puts, stocks };
}
const isNum = (x) => Number.isFinite(x);
const asc = (a, b) => a - b;
const approxEq = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

function hasOne(legs, kind, side) {
  return legs.filter(l => l.kind === kind && l.side === side).length === 1;
}
function count(legs, kind, side) {
  return legs.filter(l => l.kind === kind && (!side || l.side === side)).length;
}
function strikesOf(legs, kind, side) {
  return legs
    .filter(l => l.kind === kind && (!side || l.side === side))
    .map(l => Number(l.strike))
    .filter(isNum)
    .sort(asc);
}

/**
 * Try to classify the normalized legs into a known strategy slug used by BE formulas.
 * Returns { type: string, confidence: number }.
 */
export function inferStrategy(input) {
  const N = input?.legs ? normalizeLegs(input.legs) : normalizeLegs(input);
  const { calls, puts, stocks } = splitByKind(N.legs);

  const nLC = count(N.legs, 'call', 'long');
  const nSC = count(N.legs, 'call', 'short');
  const nLP = count(N.legs, 'put', 'long');
  const nSP = count(N.legs, 'put', 'short');
  const nLS = count(N.legs, 'stock', 'long');
  const nSS = count(N.legs, 'stock', 'short');

  // Single option legs
  if (calls.length === 1 && puts.length === 0 && stocks.length === 0) {
    return { type: calls[0].side === 'long' ? 'long_call' : 'short_call', confidence: 0.9 };
  }
  if (puts.length === 1 && calls.length === 0 && stocks.length === 0) {
    return { type: puts[0].side === 'long' ? 'long_put' : 'short_put', confidence: 0.9 };
  }

  // Stock combos
  if (nLS === 1 && hasOne(N.legs, 'put', 'long') && puts.length === 1 && calls.length === 0) {
    return { type: 'protective_put', confidence: 0.9 };
  }
  if (nLS === 1 && hasOne(N.legs, 'call', 'short') && calls.length === 1 && puts.length === 0) {
    return { type: 'covered_call', confidence: 0.9 };
  }
  if (nSS === 1 && hasOne(N.legs, 'put', 'short') && puts.length === 1 && calls.length === 0) {
    return { type: 'covered_put', confidence: 0.8 };
  }

  // Two-leg spreads
  if (calls.length === 2 && nLC === 1 && nSC === 1) {
    const Kl = strikesOf(N.legs, 'call', 'long')[0];
    const Ks = strikesOf(N.legs, 'call', 'short')[0];
    if (isNum(Kl) && isNum(Ks)) {
      return { type: Kl < Ks ? 'bull_call_spread' : 'bear_call_spread', confidence: 0.85 };
    }
  }
  if (puts.length === 2 && nLP === 1 && nSP === 1) {
    const Kl = strikesOf(N.legs, 'put', 'long')[0];
    const Ks = strikesOf(N.legs, 'put', 'short')[0];
    if (isNum(Kl) && isNum(Ks)) {
      // Long higher strike => bear put (debit); long lower => bull put (credit)
      return { type: Kl > Ks ? 'bear_put_spread' : 'bull_put_spread', confidence: 0.85 };
    }
  }

  // Straddles / Strangles
  if (calls.length === 1 && puts.length === 1 && stocks.length === 0) {
    const Kc = Number(calls[0].strike), Kp = Number(puts[0].strike);
    const bothLong = calls[0].side === 'long' && puts[0].side === 'long';
    const bothShort = calls[0].side === 'short' && puts[0].side === 'short';
    if (bothLong && approxEq(Kc, Kp)) return { type: 'long_straddle', confidence: 0.9 };
    if (bothLong && !approxEq(Kc, Kp)) return { type: 'long_strangle', confidence: 0.8 };
    if (bothShort && !approxEq(Kc, Kp)) return { type: 'short_strangle', confidence: 0.8 };
  }

  // Iron Condor / Iron Butterfly (4 legs typical)
  if (calls.length >= 2 && puts.length >= 2 && nLC >= 1 && nSC >= 1 && nLP >= 1 && nSP >= 1) {
    const Ksc = strikesOf(N.legs, 'call', 'short')[0];
    const Ksp = strikesOf(N.legs, 'put', 'short')[0];
    if (isNum(Ksc) && isNum(Ksp)) {
      if (approxEq(Ksc, Ksp)) {
        return { type: 'iron_butterfly', confidence: 0.75 };
      }
      return { type: 'iron_condor', confidence: 0.75 };
    }
  }

  // Calendars (same strike, mixed sides)
  if (calls.length === 2 && nLC === 1 && nSC === 1) {
    const Kc = strikesOf(N.legs, 'call')[0];
    const Kc2 = strikesOf(N.legs, 'call')[1];
    if (isNum(Kc) && isNum(Kc2) && approxEq(Kc, Kc2)) {
      return { type: 'call_calendar_spread', confidence: 0.7 };
    }
  }
  if (puts.length === 2 && nLP === 1 && nSP === 1) {
    const Kp = strikesOf(N.legs, 'put')[0];
    const Kp2 = strikesOf(N.legs, 'put')[1];
    if (isNum(Kp) && isNum(Kp2) && approxEq(Kp, Kp2)) {
      return { type: 'put_calendar_spread', confidence: 0.7 };
    }
  }

  // Backspreads / Ratio (1x2)
  if (calls.length === 3 && ((nLC === 2 && nSC === 1) || (nLC === 1 && nSC === 2))) {
    return { type: 'call_ratio_spread', confidence: 0.7 };
  }
  if (puts.length === 3 && nLP === 2 && nSP === 1) {
    return { type: 'put_backspread', confidence: 0.7 };
  }

  // Strap (2x long calls + 1x long put @ ~same K)
  if (nLC >= 2 && nLP >= 1 && nSC === 0 && nSP === 0) {
    const Ks = [...calls, ...puts].map(l => Number(l.strike)).filter(isNum);
    if (Ks.length >= 3) {
      const avg = Ks.reduce((a, b) => a + b, 0) / Ks.length;
      const maxDev = Math.max(...Ks.map(k => Math.abs(k - avg)));
      if (maxDev <= 0.01 * avg) return { type: 'strap', confidence: 0.6 };
    }
  }

  // LEAPS — same as long single-leg call/put (already caught above)
  // Fallback
  return { type: 'unknown', confidence: 0.0 };
}

export default { normalizeLegs, inferStrategy, pick };