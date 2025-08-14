// components/Strategy/utils/priceOption.js

import { d1 as d1RN, d2 as d2RN, normCdf } from "../math/lognormal";

/**
 * Black–Scholes premium for European options with continuous dividend yield q.
 * Returns a positive per-share premium. Use `side` to also get a signed premium.
 *
 * @param {Object} p
 * @param {"call"|"put"} p.type
 * @param {number} p.S       - spot price
 * @param {number} p.K       - strike
 * @param {number} p.T       - time in years
 * @param {number} [p.r=0]   - risk-free rate (cont. comp)
 * @param {number} [p.q=0]   - dividend yield (cont. comp)
 * @param {number} p.sigma   - annual volatility
 * @param {"long"|"short"} [p.side] - optional; for signedPremium
 * @returns {{ price:number, signedPremium?:number }}
 */
export function blackScholesPrice({ type, S, K, T, r = 0, q = 0, sigma }) {
  if (!(S > 0) || !(K > 0) || !(T >= 0) || !(sigma >= 0)) return { price: NaN };

  // Degenerate fallback: zero time or zero vol -> option is intrinsic on the forward
  if (T === 0 || sigma === 0) {
    const F = S * Math.exp((r - q) * T);
    const disc = Math.exp(-r * T);
    if (type === "call") return { price: disc * Math.max(F - K, 0) };
    if (type === "put") return { price: disc * Math.max(K - F, 0) };
    return { price: NaN };
  }

  const d1 = d1RN(S, K, sigma, T, r, q);
  const d2 = d2RN(S, K, sigma, T, r, q);
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return { price: NaN };

  const df_r = Math.exp(-r * T);
  const df_q = Math.exp(-q * T);

  if (type === "call") {
    const price = df_q * S * normCdf(d1) - df_r * K * normCdf(d2);
    return { price };
  } else if (type === "put") {
    const price = df_r * K * normCdf(-d2) - df_q * S * normCdf(-d1);
    return { price };
  }
  return { price: NaN };
}

/**
 * Convenience wrapper that can also return a signed premium if `side` is given.
 * - `price` is always >= 0 (per-share).
 * - `signedPremium` is +price for long, -price for short (useful for net debit/credit).
 */
export default function priceOption(params) {
  const { type, S, K, T, r = 0, q = 0, sigma, side } = params || {};
  const { price } = blackScholesPrice({ type, S, K, T, r, q, sigma });
  if (!Number.isFinite(price)) return { price: NaN };
  if (side === "long") return { price, signedPremium: +price };
  if (side === "short") return { price, signedPremium: -price };
  return { price };
}
