// components/Strategy/math/analyticPop.js
// Shim: delegate Probability-of-Profit & lognormal CDF to the central hub.

import { probOfProfit as hubProbOfProfit, lognCdf } from "../../../lib/quant";

/**
 * Named export kept for backward-compat.
 * Original signature: cdfLognormal(x, S0, mu, sigma, T)
 * Hub signature:      lognCdf(S, S0, sigma, T, drift)
 */
export function cdfLognormal(x, S0, mu, sigma, T) {
  return lognCdf(x, S0, sigma, T, mu);
}

/**
 * Default export kept for backward-compat.
 * Original signature uses:
 *   { S, sigma, T, legs = [], be = null, mu, r, q }
 * We map to the hub:
 *   { S0, sigma, T, legs, be, drift }
 */
export default function analyticPop({ S, sigma, T, legs = [], be = null, mu, r, q } = {}) {
  const rNum = Number(r) || 0;
  const qNum = Number(q) || 0;
  const drift = Number.isFinite(mu) ? Number(mu) : rNum - qNum;

  return hubProbOfProfit({
    S0: Number(S),
    sigma: Number(sigma),
    T: Number(T),
    legs,
    be,
    drift,
  });
}
