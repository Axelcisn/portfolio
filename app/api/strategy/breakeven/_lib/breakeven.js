// app/api/strategy/breakeven/_lib/breakeven.js
import { normalizeStrategyKey } from "./aliases.js";
import { inferStrategy } from "./inferStrategy.js";

// Utilities
const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// Net premium (per-share convention). Long pays (debit +), short receives (credit -)?
// We'll compute signed premium as: long = +premium paid, short = -premium received.
// For BE (price level), we need NET_DEBIT (positive) or NET_CREDIT (positive credit = -netPremium).
function netPremiumPerShare(legs = []) {
  const p = sum(
    (legs || [])
      .filter((l) => l.type === "call" || l.type === "put")
      .map((l) => {
        const prem = toNum(l?.premium) ?? 0;
        const qty  = Math.max(0, toNum(l?.qty) ?? 1);
        return (l.side === "long" ? +prem : -prem) * qty;
      })
  );
  return p; // +debit, -credit
}

// Helpers to pick strikes
const getShortCall = (legs) => (legs || []).find(l => l.type === "call" && l.side === "short");
const getShortPut  = (legs) => (legs || []).find(l => l.type === "put"  && l.side === "short");
const getLongCall  = (legs) => (legs || []).find(l => l.type === "call" && l.side === "long");
const getLongPut   = (legs) => (legs || []).find(l => l.type === "put"  && l.side === "long");

export function computeBreakEven(legs = [], explicitStrategy = null) {
  const legsSan = (legs || []).map((l) => ({
    type: String(l?.type || "").toLowerCase(),
    side: String(l?.side || "").toLowerCase(),
    strike: toNum(l?.strike),
    premium: toNum(l?.premium),
    qty: Math.max(0, toNum(l?.qty) ?? 1),
  }));

  let used = normalizeStrategyKey(explicitStrategy);
  let resolved_by = "explicit";

  if (!used) {
    used = inferStrategy(legsSan);
    resolved_by = "inferred";
  }

  // default response if we can't compute
  const fallback = { be: null, meta: { used: used ?? null, resolved_by } };

  if (!used) return fallback;

  const np = netPremiumPerShare(legsSan); // +debit / -credit
  const credit = -np;                      // positive if net credit
  const debit  =  np;                      // positive if net debit

  // Single legs
  if (used === "long_call") {
    const K = toNum(getLongCall(legsSan)?.strike);
    if (K != null && debit != null) return { be: [K + debit], meta: { used, resolved_by } };
    return fallback;
  }
  if (used === "short_call") {
    const K = toNum(getShortCall(legsSan)?.strike);
    if (K != null && credit != null) return { be: [K + credit], meta: { used, resolved_by } };
    return fallback;
  }
  if (used === "long_put") {
    const K = toNum(getLongPut(legsSan)?.strike);
    if (K != null && debit != null) return { be: [K - debit], meta: { used, resolved_by } };
    return fallback;
  }
  if (used === "short_put") {
    const K = toNum(getShortPut(legsSan)?.strike);
    if (K != null && credit != null) return { be: [K - credit], meta: { used, resolved_by } };
    return fallback;
  }

  // Call verticals
  if (used === "bull_call_spread") {
    const Kl = toNum(getLongCall(legsSan)?.strike); // lower K typically long
    if (Kl != null && debit != null) return { be: [Kl + debit], meta: { used, resolved_by } };
    return fallback;
  }
  if (used === "bear_call_spread") {
    const Ks = toNum(getShortCall(legsSan)?.strike); // lower K typically short
    if (Ks != null && credit != null) return { be: [Ks + credit], meta: { used, resolved_by } };
    return fallback;
  }

  // Put verticals
  if (used === "bear_put_spread") {
    const Kh = toNum(getLongPut(legsSan)?.strike); // higher K typically long
    if (Kh != null && debit != null) return { be: [Kh - debit], meta: { used, resolved_by } };
    return fallback;
  }
  if (used === "bull_put_spread") {
    const Kh = toNum(getShortPut(legsSan)?.strike); // higher K typically short
    if (Kh != null && credit != null) return { be: [Kh - credit], meta: { used, resolved_by } };
    return fallback;
  }

  // Short straddle: Kshort ± netCredit
  if (used === "short_straddle") {
    const Kc = toNum(getShortCall(legsSan)?.strike);
    const Kp = toNum(getShortPut(legsSan)?.strike);
    if (Kc != null && Kp != null && Math.abs(Kc - Kp) <= 1e-8) {
      const K = Kc; // same
      return { be: [K - credit, K + credit], meta: { used, resolved_by } };
    }
    return fallback;
  }

  // Short strangle: [K_put_short - credit, K_call_short + credit]
  if (used === "short_strangle") {
    const Kc = toNum(getShortCall(legsSan)?.strike);
    const Kp = toNum(getShortPut(legsSan)?.strike);
    if (Kc != null && Kp != null) {
      const lo = Math.min(Kc, Kp), hi = Math.max(Kc, Kp);
      return { be: [Kp - credit, Kc + credit], meta: { used, resolved_by, strikes: [lo, hi] } };
    }
    return fallback;
  }

  // Iron butterfly: midK ± netCredit (includes wings)
  if (used === "iron_butterfly") {
    const KcS = toNum(getShortCall(legsSan)?.strike);
    const KpS = toNum(getShortPut(legsSan)?.strike);
    if (KcS != null && KpS != null && Math.abs(KcS - KpS) <= 1e-8) {
      const K = KcS;
      return { be: [K - credit, K + credit], meta: { used, resolved_by } };
    }
    return fallback;
  }

  // If we get here, we know the alias but haven't coded a formula
  return fallback;
}
