// components/Strategy/utils/priceOption.js
// Shim: delegate pricing to the centralized hub only.

import { callPrice, putPrice } from "../../../lib/quant";

/**
 * Black–Scholes premium for European options with continuous dividend yield q.
 * Returns a positive per-share premium. Use `side` in the default export to get a signed premium.
 *
 * @param {Object} p
 * @param {"call"|"put"} p.type
 * @param {number} p.S       - spot price
 * @param {number} p.K       - strike
 * @param {number} p.T       - time in years
 * @param {number} [p.r=0]   - risk-free rate (cont. comp)
 * @param {number} [p.q=0]   - dividend yield (cont. comp)
 * @param {number} p.sigma   - annual volatility
 * @returns {{ price:number }}
 */
export function blackScholesPrice({ type, S, K, T, r = 0, q = 0, sigma }) {
  if (type === "call") {
    return { price: callPrice(S, K, r, q, sigma, T) };
  }
  if (type === "put") {
    return { price: putPrice(S, K, r, q, sigma, T) };
  }
  return { price: NaN };
}

/**
 * Convenience wrapper that can also return a signed premium if `side` is given.
 * - `price` is always >= 0 (per-share).
 * - `signedPremium` is +price for long, -price for short (useful for net debit/credit).
 */
export default function priceOption(params = {}) {
  const { type, S, K, T, r = 0, q = 0, sigma, side } = params;
  const { price } = blackScholesPrice({ type, S, K, T, r, q, sigma });
  if (!Number.isFinite(price)) return { price: NaN };
  if (side === "long") return { price, signedPremium: +price };
  if (side === "short") return { price, signedPremium: -price };
  return { price };
}
