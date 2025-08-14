// lib/strategy/legs.js
// Canonical legs model + normalizer for BE/payoff engines.

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
