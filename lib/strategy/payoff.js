// lib/strategy/payoff.js
// Generic payoff engine + break-even solver (per-share P/L).
// Works with raw legs or a normalized bundle from lib/strategy/legs.js.

import { normalizeLegs } from './legs.js';

const isNum = (x) => Number.isFinite(x);

/* ---------- Payoff primitives (per-share) ---------- */
/**
 * Per-share payoff for a single leg at price S.
 * Assumptions:
 * - For options, `premium` is per-share paid/received at entry.
 * - For stock, `premium` is the entry basis (purchase price or short-sale price).
 * - qty is the count of contracts/units; multiplier is ignored (per-share math).
 */
export function legPayoffAt(S, leg) {
  const qty = Math.max(0, Number(leg.qty) || 1);

  if (leg.kind === 'call') {
    const intrinsic = Math.max(0, S - leg.strike);
    return leg.side === 'long'
      ? qty * (intrinsic - (leg.premium || 0))
      : qty * ((leg.premium || 0) - intrinsic);
  }

  if (leg.kind === 'put') {
    const intrinsic = Math.max(0, leg.strike - S);
    return leg.side === 'long'
      ? qty * (intrinsic - (leg.premium || 0))
      : qty * ((leg.premium || 0) - intrinsic);
  }

  if (leg.kind === 'stock') {
    // premium = entry basis
    const basis = Number(leg.premium) || 0;
    return leg.side === 'long'
      ? qty * (S - basis)
      : qty * (basis - S);
  }

  return 0;
}

/** Total per-share P/L for a set of legs at price S. */
export function payoffAt(S, legsOrBundle) {
  const N = legsOrBundle?.legs ? legsOrBundle : normalizeLegs(legsOrBundle);
  let p = 0;
  for (const l of N.legs) p += legPayoffAt(S, l);
  return p;
}

/* ---------- Structure helpers ---------- */

/** Sorted unique strike "kinks" (piecewise-linear breakpoints). */
export function breakpoints(legsOrBundle) {
  const N = legsOrBundle?.legs ? legsOrBundle : normalizeLegs(legsOrBundle);
  const Ks = Array.from(
    new Set(N.legs.filter(l => l.kind !== 'stock').map(l => Number(l.strike)).filter(isNum))
  ).sort((a, b) => a - b);
  return Ks;
}

/** Heuristic bounds around strikes/stock basis for root bracketing. */
export function suggestBounds(legsOrBundle) {
  const N = legsOrBundle?.legs ? legsOrBundle : normalizeLegs(legsOrBundle);
  const Ks = breakpoints(N);
  let minK = isNum(Ks[0]) ? Ks[0] : null;
  let maxK = isNum(Ks[Ks.length - 1]) ? Ks[Ks.length - 1] : null;

  // If stock leg exists, include its basis as an anchor.
  const stockBasis = N.legs.find(l => l.kind === 'stock')?.premium;
  const basis = Number(stockBasis);
  if (isNum(basis)) {
    minK = (minK == null) ? basis : Math.min(minK, basis);
    maxK = (maxK == null) ? basis : Math.max(maxK, basis);
  }

  if (minK == null || maxK == null) {
    // Fallback generic window if no anchors exist.
    return { lo: 0, hi: 1000 };
  }

  const span = Math.max(1, maxK - minK);
  const pad = Math.max(5, span * 2);
  const lo = Math.max(0, minK - pad);
  const hi = maxK + pad;
  return { lo, hi };
}

/* ---------- Root finding ---------- */

function bisection(fn, a, b, eps = 1e-6, maxIter = 64) {
  let fa = fn(a), fb = fn(b);
  if (!isNum(fa) || !isNum(fb)) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null; // not bracketed

  let left = a, right = b, fL = fa, fR = fb;
  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (left + right);
    const fM = fn(mid);
    if (!isNum(fM)) return null;
    if (Math.abs(fM) < eps || Math.abs(right - left) < eps) return mid;
    if (fL * fM <= 0) { right = mid; fR = fM; }
    else { left = mid; fL = fM; }
  }
  return 0.5 * (left + right);
}

/**
 * Find break-even points (payoff == 0) by bracketing between regions
 * split by option strikes. Works because payoff is piecewise linear in S.
 *
 * Options:
 *  - bounds: {lo, hi} override suggestedBounds
 *  - eps: root tolerance
 *  - maxIter: bisection iterations
 *  - dedupeEps: tolerance when merging near-identical roots
 */
export function findBreakEvens(legsOrBundle, opts = {}) {
  const N = legsOrBundle?.legs ? legsOrBundle : normalizeLegs(legsOrBundle);
  const Ks = breakpoints(N);
  const { lo, hi } = opts.bounds || suggestBounds(N);
  const eps = Number(opts.eps) || 1e-6;
  const maxIter = Number(opts.maxIter) || 64;
  const dedupeEps = Number(opts.dedupeEps) || 1e-4;

  // Build region edges: lo, K0, K1, ..., hi
  const edges = [lo, ...Ks, hi].filter(isNum);
  const regions = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i], b = edges[i + 1];
    // sample slightly inside each region to avoid kinks exactly at K
    const mid = (a + b) / 2;
    regions.push({ a, b, mid });
  }

  const f = (S) => payoffAt(S, N);

  // Evaluate signs by region, then solve where sign flips.
  const be = [];
  let prev = null;
  for (const r of regions) {
    const val = f(r.mid);
    if (!isNum(val)) continue;

    if (prev && prev.sign * val < 0) {
      // sign change between prev.mid and r.mid -> root in [prev.mid, r.mid]
      const root = bisection(f, prev.mid, r.mid, eps, maxIter);
      if (isNum(root)) be.push(root);
    }

    // Also check at kinks (some credit spreads cross exactly at a strike)
    // Try a tiny left/right probe around each interior edge.
    if (isNum(r.a) && r.a !== lo) {
      const leftProbe  = Math.max(lo, r.a - Math.max(1e-6, Math.abs(r.a) * 1e-8));
      const rightProbe = Math.min(hi, r.a + Math.max(1e-6, Math.abs(r.a) * 1e-8));
      const fl = f(leftProbe), fr = f(rightProbe);
      if (isNum(fl) && isNum(fr) && fl * fr <= 0) {
        const root = bisection(f, leftProbe, rightProbe, eps, maxIter);
        if (isNum(root)) be.push(root);
      }
    }

    prev = { mid: r.mid, sign: Math.sign(val) || 0 };
  }

  // Merge near-duplicates and sort
  be.sort((a, b) => a - b);
  const merged = [];
  for (const x of be) {
    if (!merged.length || Math.abs(x - merged[merged.length - 1]) > dedupeEps) {
      merged.push(x);
    }
  }
  return merged;
}

/* ---------- Convenience bundle ---------- */
export default {
  payoffAt,
  legPayoffAt,
  breakpoints,
  suggestBounds,
  findBreakEvens,
};
