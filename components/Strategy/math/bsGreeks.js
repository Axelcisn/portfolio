// components/Strategy/math/bsGreeks.js

// ---------- Utilities: normal pdf/cdf ----------
// Numerical erf approximation (Abramowitz & Stegun 7.1.26)
function erf(x) {
  const s = Math.sign(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y =
    1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return s * y;
}

function normCdf(x) { return 0.5 * (1 + erf(x / Math.SQRT2)); }
function normPdf(x) { return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI); }

// ---------- Core d1/d2 with guards ----------
function safe(val, fallback) {
  return Number.isFinite(val) ? val : fallback;
}

function d1(S, K, r, q, sigma, T) {
  const s = Math.max(safe(S, 0), 1e-12);
  const k = Math.max(safe(K, 0), 1e-12);
  const vol = Math.max(safe(sigma, 0), 1e-12);
  const tau = Math.max(safe(T, 0), 1e-12);
  return (Math.log(s / k) + (r - q + 0.5 * vol * vol) * tau) / (vol * Math.sqrt(tau));
}

function d2(S, K, r, q, sigma, T) {
  const vol = Math.max(safe(sigma, 0), 1e-12);
  const tau = Math.max(safe(T, 0), 1e-12);
  return d1(S, K, r, q, vol, tau) - vol * Math.sqrt(tau);
}

// ---------- Black–Scholes prices ----------
function callPrice(S, K, r, q, sigma, T) {
  if (!Number.isFinite(S) || !Number.isFinite(K)) return 0;
  if (T <= 0 || sigma <= 0) {
    return Math.max(0, S - K); // intrinsic at expiry/zero vol
  }
  const _d1 = d1(S, K, r, q, sigma, T);
  const _d2 = _d1 - sigma * Math.sqrt(T);
  return S * Math.exp(-q * T) * normCdf(_d1) - K * Math.exp(-r * T) * normCdf(_d2);
}

function putPrice(S, K, r, q, sigma, T) {
  if (!Number.isFinite(S) || !Number.isFinite(K)) return 0;
  if (T <= 0 || sigma <= 0) {
    return Math.max(0, K - S);
  }
  const _d1 = d1(S, K, r, q, sigma, T);
  const _d2 = _d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * normCdf(-_d2) - S * Math.exp(-q * T) * normCdf(-_d1);
}

// ---------- Greeks (long option) ----------
// Conventions:
// - vega: per 1% change in sigma  => (classic vega) / 100
// - theta: per day                 => (classic per-year) / 365
// - gamma, delta, rho: standard
function callGreeks(S, K, r, q, sigma, T) {
  const tau = Math.max(safe(T, 0), 1e-12);
  const vol = Math.max(safe(sigma, 0), 1e-12);
  const discQ = Math.exp(-q * tau);
  const discR = Math.exp(-r * tau);

  const _d1 = d1(S, K, r, q, vol, tau);
  const _d2 = _d1 - vol * Math.sqrt(tau);
  const nd1 = normPdf(_d1);
  const Nd1 = normCdf(_d1);
  const Nd2 = normCdf(_d2);

  const delta = discQ * Nd1;
  const gamma = (discQ * nd1) / (S * vol * Math.sqrt(tau));
  const vegaPer1 = S * discQ * nd1 * Math.sqrt(tau);      // per 1.00 sigma
  const vega = vegaPer1 / 100;                            // per 1% sigma
  const thetaPerYear =
    (-S * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) - r * K * discR * Nd2 + q * S * discQ * Nd1;
  const theta = thetaPerYear / 365;                       // per day
  const rho = K * tau * discR * Nd2;

  return { delta, gamma, vega, theta, rho };
}

function putGreeks(S, K, r, q, sigma, T) {
  const tau = Math.max(safe(T, 0), 1e-12);
  const vol = Math.max(safe(sigma, 0), 1e-12);
  const discQ = Math.exp(-q * tau);
  const discR = Math.exp(-r * tau);

  const _d1 = d1(S, K, r, q, vol, tau);
  const _d2 = _d1 - vol * Math.sqrt(tau);
  const nd1 = normPdf(_d1);
  const Nd1m = normCdf(_d1) - 1; // = -N(-d1)
  const Nd2m = normCdf(_d2) - 1; // = -N(-d2)

  const delta = discQ * (Nd1m); // = -discQ * N(-d1)
  const gamma = (discQ * nd1) / (S * vol * Math.sqrt(tau));
  const vegaPer1 = S * discQ * nd1 * Math.sqrt(tau);
  const vega = vegaPer1 / 100;
  const thetaPerYear =
    (-S * discQ * nd1 * vol) / (2 * Math.sqrt(tau)) + r * K * discR * (1 - normCdf(_d2)) - q * S * discQ * (1 - normCdf(_d1));
  const theta = thetaPerYear / 365;
  const rho = -K * tau * discR * (1 - normCdf(_d2));

  return { delta, gamma, vega, theta, rho };
}

// ---------- Public API expected by the Chart ----------

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

// Optional: export internals for unit tests if you want to verify quickly.
export const __internals = { erf, normCdf, normPdf, d1, d2, callPrice, putPrice, callGreeks, putGreeks };
