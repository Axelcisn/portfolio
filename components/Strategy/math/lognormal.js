// components/Strategy/math/lognormal.js

/**
 * Normal & lognormal utilities for GBM-based pricing/probabilities.
 * Drift parameter:
 *   - Use (r - q) for risk-neutral tasks.
 *   - Use (mu - q) for real-world probability tasks when desired.
 */

// ---- Normal distribution ----
function erf(x) {
  // Abramowitz & Stegun 7.1.26
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normPdf(x) {
  if (!Number.isFinite(x)) return 0;
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function normCdf(x) {
  if (x === Infinity) return 1;
  if (x === -Infinity) return 0;
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// ---- Black–Scholes helpers (risk-neutral form by default) ----
export function d1(S, K, sigma, T, r = 0, q = 0) {
  if (!(S > 0) || !(K > 0) || !(sigma > 0) || !(T > 0)) return NaN;
  const vsqrtT = sigma * Math.sqrt(T);
  return (Math.log(S / K) + ((r - q) + 0.5 * sigma * sigma) * T) / vsqrtT;
}

export function d2(S, K, sigma, T, r = 0, q = 0) {
  const v = sigma * Math.sqrt(T);
  return d1(S, K, sigma, T, r, q) - v;
}

// ---- Lognormal distribution for S_T ----
// S_T = S0 * exp((drift - 0.5 σ^2)T + σ√T * Z),  Z ~ N(0,1)
export function lognCdf(S, S0, sigma, T, drift = 0) {
  if (!(S > 0) || !(S0 > 0)) return 0;
  if (!(sigma > 0) || !(T > 0)) {
    // Degenerate at deterministic forward level
    const ST = S0 * Math.exp(drift * (T || 0));
    return S >= ST ? 1 : 0;
  }
  const z =
    (Math.log(S / S0) - (drift - 0.5 * sigma * sigma) * T) /
    (sigma * Math.sqrt(T));
  return normCdf(z);
}

export function lognPdf(S, S0, sigma, T, drift = 0) {
  if (!(S > 0) || !(S0 > 0) || !(sigma > 0) || !(T > 0)) return 0;
  const denom = S * sigma * Math.sqrt(2 * Math.PI * T);
  const m = (drift - 0.5 * sigma * sigma) * T;
  const z = (Math.log(S / S0) - m) / (sigma * Math.sqrt(T));
  return Math.exp(-0.5 * z * z) / denom;
}

const lognormal = { normPdf, normCdf, lognPdf, lognCdf, d1, d2 };
export default lognormal;
