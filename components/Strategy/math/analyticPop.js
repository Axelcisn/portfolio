// components/Strategy/math/analyticPop.js
// Analytical Probability of Profit (PoP) with a lognormal model of S_T.
// Self-contained: includes erf/normCdf so we don't rely on any other file.

/* -------------------- normal cdf utilities -------------------- */
// Abramowitz & Stegun 7.1.26 approximation of erf
function erf(x) {
  const s = Math.sign(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return s * y;
}
export function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }

/* --------------------------- helpers --------------------------- */
const toNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : null);
const clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);

/** Lognormal CDF: P[S_T ≤ x] with ln S_T ~ N( ln S0 + (mu - 0.5σ²)T , (σ²)T ) */
export function cdfLognormal(x, S0, mu, sigma, T) {
  const X = toNum(x), S = toNum(S0), v = Math.max(0, toNum(sigma) ?? 0), Ty = Math.max(0, toNum(T) ?? 0);
  if (!(X > 0) || !(S > 0)) return NaN;
  if (v === 0 || Ty === 0) return X >= S ? 1 : 0; // degenerate mass at S
  const m = Math.log(S) + (mu - 0.5 * v * v) * Ty;
  const s = v * Math.sqrt(Ty);
  const z = (Math.log(X) - m) / s;
  return normCdf(z);
}

/* ----------------- payoff at expiration (per share) ----------------- */
export function pnlAt(ST, legs = []) {
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
      const price = toNum(l?.price);
      if (price != null) sum += qty * (side === "long" ? S - price : price - S);
    }
  }
  return sum;
}

/* ---------------------- probability of profit ---------------------- */
/**
 * Analytical probability of finishing with P&L ≥ 0 at expiration.
 *
 * @param {Object} p
 *  - S:      spot price
 *  - sigma:  annual volatility
 *  - T:      time in years
 *  - legs:   API-style legs ({type, side, strike?, premium?, qty?, price?})
 *  - be:     break-even array (length 1 or 2). If omitted, we can’t define a
 *            threshold under volatility → returns null (except degenerate case).
 *  - mu:     drift of ln S. If not given, uses (r - q) with defaults r=q=0.
 *  - r:      risk-free (cont.), q: dividend yield (cont.)
 */
export default function analyticPop({ S, sigma, T, legs = [], be = null, mu, r, q } = {}) {
  const S0 = toNum(S);
  const v = Math.max(0, toNum(sigma) ?? 0);
  const Ty = Math.max(0, toNum(T) ?? 0);
  const muEff = toNum(mu) ?? ((toNum(r) ?? 0) - (toNum(q) ?? 0));

  if (!(S0 > 0) || !(Ty >= 0) || !(v >= 0) || !Array.isArray(legs) || legs.length === 0) {
    return { pop: null, region: "none", be: be || null, details: { mu: muEff, sigma: v, T: Ty } };
  }

  // Normalize BE
  let BE = Array.isArray(be) ? be.filter((x) => Number.isFinite(Number(x))).map(Number) : null;
  if (Array.isArray(BE) && BE.length > 1) {
    BE.sort((a, b) => a - b);
    BE = [BE[0], BE[BE.length - 1]];
  }

  // Degenerate cases: σ=0 or T=0 → S_T collapses at S0
  if (v === 0 || Ty === 0) {
    const profitable = pnlAt(S0, legs) >= 0;
    return { pop: profitable ? 1 : 0, region: "none", be: BE, details: { mu: muEff, sigma: v, T: Ty, pnlAtSpot: pnlAt(S0, legs) } };
  }

  const CDF = (x) => cdfLognormal(x, S0, muEff, v, Ty);
  const spotPnL = pnlAt(S0, legs);

  if (!BE || BE.length === 0) {
    // Without thresholds, with volatility, probability is undefined here.
    return { pop: null, region: "none", be: null, details: { mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
  }

  if (BE.length === 1) {
    const b = BE[0];
    const sideFromSpot = S0 < b ? "below" : S0 > b ? "above" : (pnlAt(b * 1.001, legs) >= 0 ? "above" : "below");
    const profitIncludesSpot = spotPnL >= 0;
    const region = profitIncludesSpot ? sideFromSpot : (sideFromSpot === "above" ? "below" : "above");
    const pop = region === "below" ? clamp01(CDF(b)) : clamp01(1 - CDF(b));
    return { pop, region, be: [b], details: { cdfL: CDF(b), mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
  }

  // Two BE boundaries
  const [L, U] = BE[0] <= BE[1] ? BE : [BE[1], BE[0]];
  const mid = (L + U) / 2;
  const profitInside = pnlAt(mid, legs) >= 0;

  const cL = CDF(L), cU = CDF(U);
  const insideProb = clamp01(cU - cL);
  const pop = profitInside ? insideProb : clamp01(1 - insideProb);
  const region = profitInside ? "inside" : "outside";

  return { pop, region, be: [L, U], details: { cdfL: cL, cdfU: cU, mu: muEff, sigma: v, T: Ty, pnlAtSpot: spotPnL } };
}
