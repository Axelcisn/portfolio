// components/Strategy/math/bsGreeks.js
// Black–Scholes prices & Greeks (European), with continuous dividend yield q.
// References: Wilmott, "Paul Wilmott Introduces Quantitative Finance", Ch. 8
// (formulas for price and Greeks incl. q). See tables for Δ, Γ, Θ, ν, ρ. 

/* ---------- numerics ---------- */
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function normPdf(x) {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

// CDF via erf approximation (Abramowitz–Stegun)
function normCdf(x) {
  // stable for all x
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937;
  const a4 = -1.821255978, a5 = 1.330274429;
  const L = Math.abs(x);
  const k = 1.0 / (1.0 + 0.2316419 * L);
  const poly = (((a5 * k + a4) * k + a3) * k + a2) * k + a1;
  const approx = 1.0 - normPdf(L) * poly;
  return x >= 0 ? approx : 1.0 - approx;
}

/* ---------- core d1/d2 ---------- */
function d1(S, K, r, q, sigma, T) {
  const eps = 1e-12;
  const s = Math.max(sigma, eps);
  const t = Math.max(T, eps);
  return (Math.log(S / K) + (r - q + 0.5 * s * s) * t) / (s * Math.sqrt(t));
}
function d2(S, K, r, q, sigma, T) {
  const s = Math.max(sigma, 1e-12);
  const t = Math.max(T, 1e-12);
  return d1(S, K, r, q, s, t) - s * Math.sqrt(t);
}

/* ---------- prices ---------- */
export function bsCall(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) {
    // limit as T->0: intrinsic value
    return Math.max(0, S - K);
  }
  const _d1 = d1(S, K, r, q, sigma, T);
  const _d2 = _d1 - sigma * Math.sqrt(T);
  return S * Math.exp(-q * T) * normCdf(_d1) - K * Math.exp(-r * T) * normCdf(_d2);
}
export function bsPut(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) {
    return Math.max(0, K - S);
  }
  const _d1 = d1(S, K, r, q, sigma, T);
  const _d2 = _d1 - sigma * Math.sqrt(T);
  return K * Math.exp(-r * T) * normCdf(-_d2) - S * Math.exp(-q * T) * normCdf(-_d1);
}

/* ---------- greeks (per 1.00 in the corresponding variable) ---------- */
// Delta: e^{-qT} N(d1)  |  e^{-qT} (N(d1)-1)
export function deltaCall(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return S >= K ? Math.exp(-q * T) : 0; // limit
  return Math.exp(-q * T) * normCdf(d1(S, K, r, q, sigma, T));
}
export function deltaPut(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return S < K ? -Math.exp(-q * T) : 0; // limit
  const d1v = d1(S, K, r, q, sigma, T);
  return Math.exp(-q * T) * (normCdf(d1v) - 1);
}

// Gamma: e^{-qT} φ(d1) / (S σ sqrt(T))
export function gamma(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0 || S <= 0) return 0;
  const d1v = d1(S, K, r, q, sigma, T);
  return Math.exp(-q * T) * normPdf(d1v) / (S * sigma * Math.sqrt(T));
}

// Vega: S e^{-qT} φ(d1) √T  (per 1.00 σ; divide by 100 for "per vol point")
export function vega(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1v = d1(S, K, r, q, sigma, T);
  return S * Math.exp(-q * T) * normPdf(d1v) * Math.sqrt(T);
}

// Theta (per year):
// Call: -S e^{-qT} φ(d1) σ/(2√T) - r K e^{-rT} N(d2) + q S e^{-qT} N(d1)
// Put:  -S e^{-qT} φ(d1) σ/(2√T) + r K e^{-rT} N(-d2) - q S e^{-qT} N(-d1)
export function thetaCall(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1v = d1(S, K, r, q, sigma, T);
  const d2v = d1v - sigma * Math.sqrt(T);
  const term1 = -(S * Math.exp(-q * T) * normPdf(d1v) * sigma) / (2 * Math.sqrt(T));
  const term2 = -r * K * Math.exp(-r * T) * normCdf(d2v);
  const term3 =  q * S * Math.exp(-q * T) * normCdf(d1v);
  return term1 + term2 + term3;
}
export function thetaPut(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1v = d1(S, K, r, q, sigma, T);
  const d2v = d1v - sigma * Math.sqrt(T);
  const term1 = -(S * Math.exp(-q * T) * normPdf(d1v) * sigma) / (2 * Math.sqrt(T));
  const term2 =  r * K * Math.exp(-r * T) * normCdf(-d2v);
  const term3 = -q * S * Math.exp(-q * T) * normCdf(-d1v);
  return term1 + term2 + term3;
}

// Rho (per 1.00 in rate r):
// Call:  K T e^{-rT} N(d2)
// Put:  -K T e^{-rT} N(-d2)
export function rhoCall(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1v = d1(S, K, r, q, sigma, T);
  const d2v = d1v - sigma * Math.sqrt(T);
  return K * T * Math.exp(-r * T) * normCdf(d2v);
}
export function rhoPut(S, K, r, q, sigma, T) {
  if (T <= 0 || sigma <= 0) return 0;
  const d1v = d1(S, K, r, q, sigma, T);
  const d2v = d1v - sigma * Math.sqrt(T);
  return -K * T * Math.exp(-r * T) * normCdf(-d2v);
}

/* ---------- adapters to your existing API ---------- */
// NOTE: keep signature (key, S, K, r, sigma, T). q defaults to 0.
export function bsValueByKey(key, S, K, r, sigma, T, q = 0) {
  if (key === "lc") return bsCall(S, K, r, q, sigma, T);
  if (key === "sc") return -bsCall(S, K, r, q, sigma, T);
  if (key === "lp") return bsPut(S, K, r, q, sigma, T);
  if (key === "sp") return -bsPut(S, K, r, q, sigma, T);
  return 0;
}

export function greeksByKey(key, S, K, r, sigma, T, q = 0) {
  // return long-option greeks; caller handles +/− via volume/sign
  const d = {
    delta:   key === "lp" ? deltaPut(S, K, r, q, sigma, T) : deltaCall(S, K, r, q, sigma, T),
    gamma:   gamma(S, K, r, q, sigma, T), // same for calls/puts
    vega:    vega(S, K, r, q, sigma, T),
    theta:   key === "lp" ? thetaPut(S, K, r, q, sigma, T) : thetaCall(S, K, r, q, sigma, T),
    rho:     key === "lp" ? rhoPut(S, K, r, q, sigma, T)   : rhoCall(S, K, r, q, sigma, T),
  };
  return d;
}
