// lib/quant/index.js
// Barrel file for the centralized quant math.
//
// Usage:
//   import { breakEven, expectedProfit, gbmMean, gbmCI95 } from "lib/quant";
//   import quant from "lib/quant";  // quant.breakEven(...), quant.gbmMean(...)

export * from "./formulas";

import * as f from "./formulas";
import formulas from "./formulas";

/* ---------------- Back-compat shims (no-op if hub already exports) ---------------- */

/** Geometric Brownian Motion mean: E[S_T] = S0 * e^{mu T} */
export function gbmMean(S0, mu = 0, T = 0) {
  if (typeof f.gbmMean === "function") return f.gbmMean(S0, mu, T);
  if (typeof formulas?.gbmMean === "function") return formulas.gbmMean(S0, mu, T);
  // Safe fallback so legacy callers never crash:
  return Number(S0) * Math.exp(Number(mu) * Number(T));
}

/** 95% CI under GBM for S_T (lognormal): exp(m ± 1.9599 * v) */
export function gbmCI95(S0, mu = 0, sigma = 0, T = 0) {
  if (typeof f.gbmCI95 === "function") return f.gbmCI95(S0, mu, sigma, T);
  if (typeof formulas?.gbmCI95 === "function") return formulas.gbmCI95(S0, mu, sigma, T);
  const v = Number(sigma) * Math.sqrt(Math.max(0, Number(T)));
  const m = Math.log(Math.max(1e-12, Number(S0))) + (Number(mu) - 0.5 * Number(sigma) ** 2) * Number(T);
  const z975 = 1.959963984540054;
  const lo = Math.exp(m - z975 * v);
  const hi = Math.exp(m + z975 * v);
  return [lo, hi];
}

/* ---------------- Default export with aliases merged ---------------- */

const quant = { ...formulas, gbmMean, gbmCI95 };
export default quant;
export { quant };
