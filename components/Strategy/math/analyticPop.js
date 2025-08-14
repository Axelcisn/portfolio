// components/Strategy/math/analyticPop.js

import { normCdf } from "./lognormal"; // uses the shared standard normal CDF

/* --------------------------- small utils --------------------------- */
const toNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/**
 * Lognormal CDF P[S_T <= x] where
 * ln S_T ~ N( ln S0 + (mu - 0.5*sigma^2) T,  (sigma^2) T )
 */
export function cdfLognormal(x, S0, mu, sigma, T) {
  const X = toNum(x), S = toNum(S0), v = toNum(sigma), Ty = toNum(T);
  if (!(X > 0) || !(S > 0) || !(v >= 0) || !(Ty >= 0)) return NaN;
  if (v === 0 || Ty === 0) return X >= S ? 1 : 0; // degenerate
  const m = Math.log(S) + (mu - 0.5 * v * v) * Ty;
  const s = v * Math.sqrt(Ty);
  const z = (Math.log(X) - m) / s;
  return normCdf(z);
}

/* --------------- expiration P&L for generic legs (per share) --------------- */
function pnlAt(ST, legs = []) {
  let sum = 0;
  const S = toNum(ST);
  if (!(S >= 0)) return NaN;

  for (const l of legs || []) {
    const t = String(l?.type || "").toLowerCase(); // "call" | "put" | "stock"
    const side = String(l?.side || "").toLowerCase().startsWith("s") ? "short" : "long";
    const qty = Math.max(0, toNum(l?.qty) ?? 1);

    if (t === "call") {
      const K = toNum(l?.strike);
      const prem = Math.max(0, toNum(l?.premium) ?? 0);
      if (!(K >= 0)) continue;
      const payoff = Math.max(S - K, 0);
      sum += qty * (side === "long" ? payoff - prem : prem - payoff);
    } else if (t === "put") {
      const K = toNum(l?.strike);
      const prem = Math.max(0, toNum(l?.premium) ?? 0);
      if (!(K >= 0)) continue;
      const payoff = Math.max(K - S, 0);
      sum += qty * (side === "long" ? payoff - prem : prem - payoff);
    } else if (t === "stock") {
      // For stock legs we only compute P&L if an entry price is present.
      const price = toNum(l?.price);
      if (price != null) {
        sum += qty * (side === "long" ? S - price : price - S);
      }
    }
  }
  return sum;
}

/* ---------------------- probability of profit ---------------------- */
/**
 * Analytical probability of finishing with P&L >= 0 at expiration.
 *
 * @param {Object} p
 *  - S:      spot price (today)
 *  - sigma:  annual volatility
 *  - T:      time in years
 *  - legs:   array of API-style legs ({type, side, strike?, premium?, qty?, price?})
 *  - be:     break-even array from BE engine (length 1 or 2). If not provided,
 *            this function can still determine the profit side using P&L at S,
 *            but probability will be 0 or 1 (no threshold) — so pass BE when possible.
 *  - mu:     drift of ln S (default r - q). Optional: supply r and q instead.
 *  - r:      risk-free rate (continuous)
 *  - q:      dividend yield (continuous)
 *
 * @returns {{
 *   pop: number|null,             // probability in [0,1] (null if unavailable)
 *   region: "inside"|"outside"|"above"|"below"|"none",
 *   be: number[]|null,
 *   details: {
 *     cdfL?: number, cdfU?: number,
 *     mu: number, sigma: number, T: number,
 *     pnlAtSpot?: number
 *   }
 * }}
 */
export default function analyticPop({ S, sigma, T, legs = [], be = null, mu, r, q } = {}) {
  const S0 = toNum(S);
  const v = Math.max(0, toNum(sigma) ?? 0);
  const Ty = Math.max(0, toNum(T) ?? 0);
  const muEff = toNum(mu) ?? ((toNum(r) ?? 0) - (toNum(q) ?? 0));

  if (!(S0 > 0) || !(Ty >= 0) || !(v >= 0)) {
    return { pop: null, region: "none", be: be || null, details: { mu: muEff, sigma: v, T: Ty } };
  }
  if (!Array.isArray(legs) || legs.length === 0) {
    return { pop: null, region: "none", be: be || null, details: { mu: muEff, sigma: v, T: Ty } };
  }

  // Normalize and sort BE (if present)
  let BE = Array.isArray(be) ? be.filter((x) => Number.isFinite(Number(x))).map(Number) : null;
  if (Array.isArray(BE) && BE.length > 1) {
    BE.sort((a, b) => a - b);
    BE = [BE[0], BE[BE.length - 1]];
  }

  // Fast path: no vol or no time → degenerate at S0
  if (v === 0 || Ty === 0) {
    const profitable = pnlAt(S0, legs) >= 0;
    return {
      pop: profitable ? 1 : 0,
      region: "none",
      be: BE,
      details: { mu: muEff, sigma: v, T: Ty, pnlAtSpot: pnlAt(S0, legs) },
    };
  }

  // Helper to compute CDF(S_T <= x)
  const CDF = (x) => cdfLognormal(x, S0, muEff, v, Ty);

  // Determine profit region using P&L sign at informative points
  const spotPnL = pnlAt(S0, legs);
  if (!BE || BE.length === 0) {
    // If no thresholds are known, we can only say "probability at spot" (0/1) under degenerate;
    // with volatility, without BE we cannot define a boundary → return null.
    return { pop: null, region: "none", be: null, details: { mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
  }

  // One BE (threshold above or below)
  if (BE.length === 1) {
    const b = BE[0];
    // Decide which side is profitable using P&L infinitesimally around b:
    // Use PnL at spot; if spot equals b, nudge using b*(1±1e-6).
    const sideFromSpot = S0 < b ? "below" : S0 > b ? "above" : (pnlAt(b * 1.001, legs) >= 0 ? "above" : "below");
    const profitIncludesSpot = spotPnL >= 0;

    // If our inferred side doesn't include spot but PnL at spot is profitable, flip it.
    const region = profitIncludesSpot ? sideFromSpot : (sideFromSpot === "above" ? "below" : "above");
    const pop = region === "below" ? clamp01(CDF(b)) : clamp01(1 - CDF(b));

    return { pop, region, be: [b], details: { cdfL: CDF(b), mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
  }

  // Two BE (interval vs outside)
  if (BE.length === 2) {
    const [L, U] = BE[0] <= BE[1] ? BE : [BE[1], BE[0]];

    // Determine if profit is INSIDE or OUTSIDE by checking PnL at midpoint (stable)
    const mid = (L + U) / 2;
    const profitInside = pnlAt(mid, legs) >= 0;

    const cL = CDF(L);
    const cU = CDF(U);
    const insideProb = clamp01(cU - cL);
    const pop = profitInside ? insideProb : clamp01(1 - insideProb);
    const region = profitInside ? "inside" : "outside";

    return { pop, region, be: [L, U], details: { cdfL: cL, cdfU: cU, mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
  }

  // Fallback (shouldn't happen)
  return { pop: null, region: "none", be: BE, details: { mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
}
