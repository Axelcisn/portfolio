// components/Strategy/greeks.js
"use client";

import { isCall, isPut } from "./payoffUtils";

/* --------- maths ---------- */
const SQRT2 = Math.SQRT2;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

function pdf(x) { return INV_SQRT_2PI * Math.exp(-0.5 * x * x); }
function erfApprox(x) {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
function cdf(x) { return 0.5 * (1 + erfApprox(x / SQRT2)); }

function d1(S, K, r, sigma, T) {
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}
function d2(d1, sigma, T) { return d1 - sigma * Math.sqrt(T); }

/* Greeks for ONE option (per contract, not scaled by contract size) */
export function bsGreeks(S, K, r, sigma, T, type /* 'call'|'put' */) {
  if (!(S > 0 && K > 0 && sigma > 0 && T > 0)) {
    return { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  const _d1 = d1(S, K, r, sigma, T);
  const _d2 = d2(_d1, sigma, T);
  const Nd1 = cdf(_d1), Nd2 = cdf(_d2), nd1 = pdf(_d1);
  const sqrtT = Math.sqrt(T);
  const disc = Math.exp(-r * T);

  let delta, gamma, vega, theta, rho;

  gamma = nd1 / (S * sigma * sqrtT);
  vega  = S * nd1 * sqrtT; // per 1.0 change in sigma (not /100)
  if (type === "call") {
    delta = Nd1;
    theta = -(S * nd1 * sigma) / (2 * sqrtT) - r * K * disc * Nd2;
    rho   =  K * T * disc * Nd2;
  } else {
    delta = Nd1 - 1;
    theta = -(S * nd1 * sigma) / (2 * sqrtT) + r * K * disc * cdf(-_d2);
    rho   = -K * T * disc * cdf(-_d2);
  }
  return { delta, gamma, vega, theta, rho };
}

/* Build aggregated greek series across legs, scaled by contractSize */
export function buildGreekSeries({ xs, rows, contractSize = 1, sigma, T, r, greek /* 'Delta'.. */ }) {
  const key = String(greek || "").toLowerCase();
  if (!xs?.length) return [];
  const csz = Number(contractSize) || 1;
  const ys = new Array(xs.length).fill(0);

  for (let i = 0; i < xs.length; i++) {
    const S = xs[i];
    let sum = 0;
    for (const rleg of rows) {
      const K = Number(rleg.strike);
      const vol = Number(rleg.volume || 0);
      if (!(Number.isFinite(K) && Number.isFinite(vol) && vol !== 0)) continue;
      const g = bsGreeks(S, K, r, sigma, T, isCall(rleg.position) ? "call" : "put");
      const sign = /Short/.test(rleg.position) ? -1 : +1; // short exposure opposite
      sum += sign * vol * (g[key] ?? 0);
    }
    ys[i] = sum * csz;
  }
  return ys;
}
