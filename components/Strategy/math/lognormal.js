// components/Strategy/math/lognormal.js
// Shim: forward all normal/lognormal helpers to the centralized hub.
// Keeps legacy API and argument order for a drop-in swap.

import {
  Phi,
  phi,
  d1 as hubD1,
  d2 as hubD2,
  lognCdf as hubLognCdf,
  lognPdf as hubLognPdf,
} from "../../../lib/quant";

// ---- Legacy names preserved ----
export function normCdf(x) {
  return Phi(x);
}

export function normPdf(x) {
  return phi(x);
}

// NOTE: Local callers use signature (S, K, sigma, T, r = 0, q = 0).
// Hub uses (S, K, r, q, sigma, T). We adapt here.
export function d1(S, K, sigma, T, r = 0, q = 0) {
  return hubD1(S, K, r, q, sigma, T);
}

export function d2(S, K, sigma, T, r = 0, q = 0) {
  return hubD2(S, K, r, q, sigma, T);
}

// Lognormal distribution for S_T
export function lognCdf(S, S0, sigma, T, drift = 0) {
  return hubLognCdf(S, S0, sigma, T, drift);
}

export function lognPdf(S, S0, sigma, T, drift = 0) {
  return hubLognPdf(S, S0, sigma, T, drift);
}

// Default export for compatibility with existing imports
const lognormal = { normPdf, normCdf, lognPdf, lognCdf, d1, d2 };
export default lognormal;
