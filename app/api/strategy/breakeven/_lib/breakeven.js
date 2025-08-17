// app/api/strategy/breakeven/_lib/breakeven.js
import { normalizeStrategyKey } from "./aliases.js";
import { inferStrategy } from "./inferStrategy.js";

// Hub payoff primitives (single source of truth)
import {
  payoffAt as payoffAtHub,
  suggestBounds as suggestBoundsHub,
} from "lib/strategy/payoff";

/* ---------------- util ---------------- */
const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

const isOpt = (l) => l?.type === "call" || l?.type === "put";
const clampPos = (v, min = 0) => Math.max(min, Number(v) || 0);

/* Normalize incoming legs into a clean shape */
function sanitizeLegs(legs = []) {
  return (legs || []).map((l) => ({
    type: String(l?.type || "").toLowerCase(),      // 'call' | 'put' | 'stock' (optional)
    side: String(l?.side || "").toLowerCase(),      // 'long' | 'short'
    strike: toNum(l?.strike),
    premium: clampPos(toNum(l?.premium) ?? 0),      // per-share premium/entry (unsigned)
    qty: clampPos(toNum(l?.qty) ?? 1),              // per-contract count (per-share scale handled in chart)
  }));
}

/* Build hub payoff bundle */
function toBundle(legs = []) {
  const out = [];
  for (const l of legs) {
    if (l.type === "call" || l.type === "put") {
      out.push({
        kind: l.type,
        side: l.side === "short" ? "short" : "long",
        strike: clampPos(l.strike ?? 0),
        premium: clampPos(l.premium ?? 0),
        qty: clampPos(l.qty ?? 0),
      });
    } else if (l.type === "stock") {
      // premium = basis for stock legs
      out.push({
        kind: "stock",
        side: l.side === "short" ? "short" : "long",
        premium: clampPos(l.premium ?? 0),
        qty: clampPos(l.qty ?? 0),
      });
    }
  }
  return { legs: out };
}

/* Net premium per share:
   +debit if you paid (long options), -credit if you received (short options) */
function netPremiumPerShare(legs = []) {
  const p = sum(
    (legs || [])
      .filter(isOpt)
      .map((l) => {
        const prem = clampPos(l?.premium ?? 0);
        const qty = clampPos(l?.qty ?? 1);
        return (l.side === "long" ? +prem : -prem) * qty;
      })
  );
  return p; // +debit, -credit
}

// Helpers to pick strikes
const getShortCall = (legs) => (legs || []).find((l) => l.type === "call" && l.side === "short");
const getShortPut  = (legs) => (legs || []).find((l) => l.type === "put"  && l.side === "short");
const getLongCall  = (legs) => (legs || []).find((l) => l.type === "call" && l.side === "long");
const getLongPut   = (legs) => (legs || []).find((l) => l.type === "put"  && l.side === "long");

/* ---------------- numeric BE solver (local, uses hub payoff) ---------------- */
function uniqueSorted(xs, digits = 6) {
  return Array.from(new Set(xs.map((v) => +v.toFixed(digits)))).sort((a, b) => a - b);
}

function suggestBoundsLocal(bundle, { spot } = {}) {
  try {
    const b = suggestBoundsHub(bundle, { spot });
    if (Array.isArray(b) && b.length === 2 && b[1] > b[0]) return b;
  } catch {}
  // Fallback: derive from strikes and spot
  const ks = (bundle?.legs || [])
    .map((l) => (l.kind === "call" || l.kind === "put" ? Number(l.strike) : null))
    .filter((v) => Number.isFinite(v));
  const kMin = ks.length ? Math.min(...ks) : Number.isFinite(spot) ? spot : 100;
  const kMax = ks.length ? Math.max(...ks) : Number.isFinite(spot) ? spot : 100;
  const base = Number.isFinite(spot) ? spot : (kMin + kMax) / 2;
  const lo = Math.max(0.01, Math.min(base, kMin) * 0.5);
  const hi = Math.max(lo * 1.2, Math.max(base, kMax) * 1.5);
  return [lo, hi];
}

function findBreakEvensNumeric(legs, { spot } = {}) {
  const bundle = toBundle(legs);
  const [lo0, hi0] = suggestBoundsLocal(bundle, { spot });

  const search = (lo, hi, samples = 2001) => {
    const step = (hi - lo) / (samples - 1);
    const xs = new Array(samples);
    const ys = new Array(samples);
    for (let i = 0; i < samples; i++) {
      const S = lo + i * step;
      xs[i] = S;
      ys[i] = payoffAtHub(S, bundle); // hub payoff
    }
    const out = [];
    for (let i = 1; i < samples; i++) {
      const y0 = ys[i - 1], y1 = ys[i];
      if ((y0 > 0 && y1 < 0) || (y0 < 0 && y1 > 0)) {
        const t = -y0 / (y1 - y0);
        out.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
      }
    }
    return uniqueSorted(out);
  };

  // Try base, then progressively widen if nothing found (up to 2x twice)
  let be = search(lo0, hi0);
  if (!be.length) {
    const span = hi0 - lo0;
    be = search(Math.max(0.01, lo0 - span * 0.5), hi0 + span * 0.5);
  }
  if (!be.length) {
    const span = hi0 - lo0;
    be = search(Math.max(0.01, lo0 - span), hi0 + span);
  }
  return be;
}

/* ---------------- main ---------------- */
export function computeBreakEven(legs = [], explicitStrategy = null /* backward compat */) {
  const legsSan = sanitizeLegs(legs);
  if (!legsSan.length) return { be: null, meta: { used: null, resolved_by: "none" } };

  let used = normalizeStrategyKey(explicitStrategy);
  let resolved_by = "explicit";
  if (!used) {
    used = inferStrategy(legsSan);
    resolved_by = "inferred";
  }

  const fallback = { be: null, meta: { used: used ?? null, resolved_by } };
  const np = netPremiumPerShare(legsSan); // +debit / -credit
  const credit = -np;                      // positive if net credit
  const debit  =  np;                      // positive if net debit

  // --- Closed-form quick paths (per-share) ---
  if (used === "long_call") {
    const K = toNum(getLongCall(legsSan)?.strike);
    if (K != null && debit != null) return { be: [K + debit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }
  if (used === "short_call") {
    const K = toNum(getShortCall(legsSan)?.strike);
    if (K != null && credit != null) return { be: [K + credit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }
  if (used === "long_put") {
    const K = toNum(getLongPut(legsSan)?.strike);
    if (K != null && debit != null) return { be: [K - debit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }
  if (used === "short_put") {
    const K = toNum(getShortPut(legsSan)?.strike);
    if (K != null && credit != null) return { be: [K - credit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }

  // Call verticals
  if (used === "bull_call_spread") {
    const Kl = toNum(getLongCall(legsSan)?.strike);
    if (Kl != null && debit != null) return { be: [Kl + debit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }
  if (used === "bear_call_spread") {
    const Ks = toNum(getShortCall(legsSan)?.strike);
    if (Ks != null && credit != null) return { be: [Ks + credit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }

  // Put verticals
  if (used === "bear_put_spread") {
    const Kh = toNum(getLongPut(legsSan)?.strike);
    if (Kh != null && debit != null) return { be: [Kh - debit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }
  if (used === "bull_put_spread") {
    const Kh = toNum(getShortPut(legsSan)?.strike);
    if (Kh != null && credit != null) return { be: [Kh - credit], meta: { used, resolved_by, method: "formula" } };
    return fallback;
  }

  // Short straddle: Kshort ± netCredit
  if (used === "short_straddle") {
    const Kc = toNum(getShortCall(legsSan)?.strike);
    const Kp = toNum(getShortPut(legsSan)?.strike);
    if (Kc != null && Kp != null && Math.abs(Kc - Kp) <= 1e-8) {
      const K = Kc;
      return { be: [K - credit, K + credit], meta: { used, resolved_by, method: "formula" } };
    }
    // fall through → numeric
  }

  // Short strangle: [K_put_short - credit, K_call_short + credit]
  if (used === "short_strangle") {
    const Kc = toNum(getShortCall(legsSan)?.strike);
    const Kp = toNum(getShortPut(legsSan)?.strike);
    if (Kc != null && Kp != null) {
      return { be: [Kp - credit, Kc + credit], meta: { used, resolved_by, method: "formula", strikes: [Math.min(Kc, Kp), Math.max(Kc, Kp)] } };
    }
    // fall through → numeric
  }

  // Iron butterfly: midK ± netCredit (includes wings)
  if (used === "iron_butterfly") {
    const KcS = toNum(getShortCall(legsSan)?.strike);
    const KpS = toNum(getShortPut(legsSan)?.strike);
    if (KcS != null && KpS != null && Math.abs(KcS - KpS) <= 1e-8) {
      const K = KcS;
      return { be: [K - credit, K + credit], meta: { used, resolved_by, method: "formula" } };
    }
    // fall through → numeric
  }

  // --- Fallback: numeric roots using hub payoff ---
  try {
    const be = findBreakEvensNumeric(legsSan, { /* spot: optional (not required) */ });
    return { be: be.length ? be : null, meta: { used, resolved_by, method: "numeric" } };
  } catch {
    return fallback;
  }
}
