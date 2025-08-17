// components/Strategy/math/bsGreeks.js
// Shim: delegate to centralized math in lib/quant (ESM-safe import), with safe fallbacks.
// Public API unchanged: bsValueByKey, greeksByKey, __internals.

// NOTE: explicit file path for ESM
import * as Quant from "../../../lib/quant/index.js";

/* ---------------- utilities ---------------- */
const hasFn = (f) => typeof f === "function";

/* ---------- erf/Phi/phi (prefer hub, else local) ---------- */
function erfApprox(x) {
  const s = x < 0 ? -1 : 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t) * t) * Math.exp(-x * x);
  return s * y;
}
const Phi = hasFn(Quant.Phi) ? Quant.Phi : (z) => 0.5 * (1 + erfApprox(z / Math.SQRT2));
const phi = hasFn(Quant.phi) ? Quant.phi : (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/* ---------- d1/d2 (prefer hub’s dual-signature) ---------- */
const d1 = hasFn(Quant.d1)
  ? Quant.d1
  : function d1_fallback(S, K, r, q, sigma, T) {
      const s = Math.max(Number(S) || 0, 1e-12);
      const k = Math.max(Number(K) || 0, 1e-12);
      const vol = Math.max(Number(sigma) || 0, 1e-12);
      const tau = Math.max(Number(T) || 0, 1e-12);
      return (Math.log(s / k) + (Number(r) - Number(q) + 0.5 * vol * vol) * tau) / (vol * Math.sqrt(tau));
    };

const d2 = hasFn(Quant.d2)
  ? Quant.d2
  : function d2_fallback(S, K, r, q, sigma, T) {
      const vol = Math.max(Number(sigma) || 0, 1e-12);
      const tau = Math.max(Number(T) || 0, 1e-12);
      return d1(S, K, r, q, vol, tau) - vol * Math.sqrt(tau);
    };

/* ---------- Prices: wrap hub to accept positional args; else closed-form fallback ---------- */
function callPrice(S, K, r, q, sigma, T) {
  if (hasFn(Quant.callPrice)) {
    return Quant.callPrice({ S0: S, K, T, sigma, r, q });
  }
  if (hasFn(Quant.bsCall)) {
    return Quant.bsCall({ S0: S, K, T, sigma, r, q });
  }
  if (hasFn(Quant.bsCallPrice)) {
    return Quant.bsCallPrice({ S0: S, K, T, sigma, r, q });
  }
  // fallback closed form
  if (!Number.isFinite(S) || !Number.isFinite(K)) return 0;
  if (!(sigma > 0) || !(T > 0)) return Math.max(0, S - K);
  const _d1 = d1(S, K, r, q, sigma, T);
  const _d2 = _d1 - sigma * Math.sqrt(T);
  return S * Math.exp(-q * T) * Phi(_d1) - K * Math.exp(-r * T) * Phi(_d2);
}

function putPrice(S, K, r, q, sigma, T) {
  if (hasFn(Quant.putPrice)) {
    return Quant.putPrice({ S0: S, K, T, sigma, r, q });
  }
  if (hasFn(Quant.bsPut)) {
    return Quant.bsPut({ S0: S, K, T, sigma, r, q });
  }
  if (hasFn(Quant.bsPutPrice)) {
    return Quant.bsPutPrice({ S0: S, K, T, sigma, r, q });
  }
  // fallback closed form
  if (!Number.isFinite(S) || !Number.isFinite(K)) return 0;
  if (!(sigma > 0) || !(T > 0)) return Math.max(0, K - S);
  const _d1 = d1(S, K, r, q, sigma, T);
  const _d2 = _d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * Phi(-_d2) - S * Math.exp(-q * T) * Phi(-_d1);
}

/* ---------- Greeks (prefer hub if exposed; otherwise derive locally) ---------- */
const hubCallGreeks = Quant.callGreeks ?? Quant.greeksCall ?? null;
const hubPutGreeks  = Quant.putGreeks  ?? Quant.greeksPut  ?? null;

function callGreeks(S, K, r, q, sigma, T) {
  if (hubCallGreeks) return hubCallGreeks(S, K, r, q, sigma, T);

  const tau = Math.max(Number(T) || 0, 1e-12);
  const vol = Math.max(Number(sigma) || 0, 1e-12);
  const discQ = Math.exp(-q * tau);
  const discR = Math.exp(-r * tau);

  const _d1 = d1(S, K, r, q, vol, tau);
  const _d2 = _d1 - vol * Math.sqrt(tau);
  const nd1 = phi(_d1);
  const Nd1 = Phi(_d1);
  const Nd2 = Phi(_d2);

  const delta = discQ * Nd1;
  const gamma = (discQ * nd1) / (S * vol * Math.sqrt(tau));
  const vegaPer1 = S * discQ * nd1 * Math.sqrt(tau);
  const vega = vegaPer1 / 100; // per 1% vol
  const thetaPerYear =
    (-S * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) - r * K * Math.exp(-r * tau) * Nd2 + q * S * discQ * Nd1;
  const theta = thetaPerYear / 365; // per day
  const rho = K * tau * Math.exp(-r * tau) * Nd2;

  return { delta, gamma, vega, theta, rho };
}

function putGreeks(S, K, r, q, sigma, T) {
  if (hubPutGreeks) return hubPutGreeks(S, K, r, q, sigma, T);

  const tau = Math.max(Number(T) || 0, 1e-12);
  const vol = Math.max(Number(sigma) || 0, 1e-12);
  const discQ = Math.exp(-q * tau);
  const discR = Math.exp(-r * tau);

  const _d1 = d1(S, K, r, q, vol, tau);
  const _d2 = _d1 - vol * Math.sqrt(tau);
  const nd1 = phi(_d1);

  const delta = discQ * (Phi(_d1) - 1); // -discQ * N(-d1)
  const gamma = (discQ * nd1) / (S * vol * Math.sqrt(tau));
  const vegaPer1 = S * discQ * nd1 * Math.sqrt(tau);
  const vega = vegaPer1 / 100;
  const thetaPerYear =
    (-S * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) +
    r * K * Math.exp(-r * tau) * (1 - Phi(_d2)) -
    q * S * discQ * (1 - Phi(_d1));
  const theta = thetaPerYear / 365;
  const rho = -K * tau * Math.exp(-r * tau) * (1 - Phi(_d2));

  return { delta, gamma, vega, theta, rho };
}

/* ---------- Public API (unchanged) ---------- */

/** Long option price for the given leg key (chart applies sign itself). */
export function bsValueByKey(key, S, K, r, sigma, T, q = 0) {
  switch (key) {
    case "lc": return callPrice(S, K, r, q, sigma, T);
    case "sc": return callPrice(S, K, r, q, sigma, T);
    case "lp": return putPrice(S, K, r, q, sigma, T);
    case "sp": return putPrice(S, K, r, q, sigma, T);
    default:   return 0;
  }
}

/** Long option Greeks for the given leg key (chart multiplies by sign×qty×mult). */
export function greeksByKey(key, S, K, r, sigma, T, q = 0) {
  switch (key) {
    case "lc": return callGreeks(S, K, r, q, sigma, T);
    case "sc": return callGreeks(S, K, r, q, sigma, T);
    case "lp": return putGreeks(S, K, r, q, sigma, T);
    case "sp": return putGreeks(S, K, r, q, sigma, T);
    default:   return { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
}

/* ---------- Internals for tests/diagnostics ---------- */
export const __internals = {
  Phi, phi, d1, d2, callPrice, putPrice, callGreeks, putGreeks,
};