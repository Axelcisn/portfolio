// components/Strategy/math/bsGreeks.js
// Shim: delegate all pricing/Greeks to the centralized hub in lib/quant.
// Keeps the same public API so no consumer changes are needed.

import * as Q from "../../../lib/quant";

// Resolve names defensively from the hub (supports a few common aliases)
const d1 = Q.d1 ?? Q.bsD1;
const d2 = Q.d2 ?? Q.bsD2;

const callPrice = Q.callPrice ?? Q.bsCallPrice ?? Q.priceCall ?? Q.bsPriceCall;
const putPrice  = Q.putPrice  ?? Q.bsPutPrice  ?? Q.pricePut  ?? Q.bsPricePut;

const Phi = Q.Phi ?? Q.stdNormCdf ?? Q.normalCdf;
const phi = Q.phi ?? Q.stdNormPdf ?? Q.normalPdf;

// Prefer hub-provided Greeks if present
const hubCallGreeks = Q.callGreeks ?? Q.greeksCall ?? null;
const hubPutGreeks  = Q.putGreeks  ?? Q.greeksPut  ?? null;

// Fallback Greeks built ONLY from hub primitives (no local formulas duplicated)
function fallbackCallGreeks(S, K, r, q, sigma, T) {
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
  const vegaPer1 = S * discQ * nd1 * Math.sqrt(tau); // per 1.00 vol
  const vega = vegaPer1 / 100;                        // per 1% vol
  const thetaPerYear =
    (-S * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) - r * K * discR * Nd2 + q * S * discQ * Nd1;
  const theta = thetaPerYear / 365;                   // per day
  const rho = K * tau * discR * Nd2;

  return { delta, gamma, vega, theta, rho };
}

function fallbackPutGreeks(S, K, r, q, sigma, T) {
  const tau = Math.max(Number(T) || 0, 1e-12);
  const vol = Math.max(Number(sigma) || 0, 1e-12);
  const discQ = Math.exp(-q * tau);
  const discR = Math.exp(-r * tau);

  const _d1 = d1(S, K, r, q, vol, tau);
  const _d2 = _d1 - vol * Math.sqrt(tau);
  const nd1 = phi(_d1);

  const delta = discQ * (Phi(_d1) - 1); // = -discQ * N(-d1)
  const gamma = (discQ * nd1) / (S * vol * Math.sqrt(tau));
  const vegaPer1 = S * discQ * nd1 * Math.sqrt(tau);
  const vega = vegaPer1 / 100;
  const thetaPerYear =
    (-S * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) +
    r * K * discR * (1 - Phi(_d2)) -
    q * S * discQ * (1 - Phi(_d1));
  const theta = thetaPerYear / 365;
  const rho = -K * tau * discR * (1 - Phi(_d2));

  return { delta, gamma, vega, theta, rho };
}

// Unified Greeks that prefer hub implementations
function callGreeks(S, K, r, q, sigma, T) {
  return hubCallGreeks
    ? hubCallGreeks(S, K, r, q, sigma, T)
    : fallbackCallGreeks(S, K, r, q, sigma, T);
}
function putGreeks(S, K, r, q, sigma, T) {
  return hubPutGreeks
    ? hubPutGreeks(S, K, r, q, sigma, T)
    : fallbackPutGreeks(S, K, r, q, sigma, T);
}

/**
 * Black–Scholes value for an option key.
 * Returns the *long* option price (no position sign).
 */
export function bsValueByKey(key, S, K, r, sigma, T, q = 0) {
  switch (key) {
    case "lc": return callPrice(S, K, r, q, sigma, T);
    case "sc": return callPrice(S, K, r, q, sigma, T); // chart applies sign
    case "lp": return putPrice(S, K, r, q, sigma, T);
    case "sp": return putPrice(S, K, r, q, sigma, T);
    default:   return 0;
  }
}

/**
 * Greeks for an option key at (S, K, r, q, sigma, T).
 * Returns *long* option Greeks; chart multiplies by sign × volume × contractSize.
 * Units: vega per 1% vol; theta per day.
 */
export function greeksByKey(key, S, K, r, sigma, T, q = 0) {
  switch (key) {
    case "lc": return callGreeks(S, K, r, q, sigma, T);
    case "sc": return callGreeks(S, K, r, q, sigma, T);
    case "lp": return putGreeks(S, K, r, q, sigma, T);
    case "sp": return putGreeks(S, K, r, q, sigma, T);
    default:   return { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
}

// Expose internals for tests/diagnostics (now bound to hub primitives)
export const __internals = {
  d1,
  d2,
  Phi,
  phi,
  callPrice,
  putPrice,
  callGreeks,
  putGreeks,
};
