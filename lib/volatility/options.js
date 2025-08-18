// lib/volatility/options.js
// Utilities for options-chain based implied volatility work.
//
// Focus:
//  • nearestExpiriesToDays: pick expiries bracketing a target maturity
//  • atmByForward: choose ATM strike by forward F0 = S0 * e^{(r - q)T}
//  • ivFromChainMid: prefer vendor IV; else invert BS from mid price
//  • varianceBlend: constant-maturity variance blending
//
// Notes:
//  • All volatilities are decimals (e.g., 0.25 = 25%).
//  • Time T in years; days use ACT/365 for simplicity here.
//  • Chain tolerance: accepts a variety of Yahoo-like shapes.
//
// Math source of truth: lib/quant (centralized hub)

import {
  d1 as d1RN,
  d2 as d2RN,
  callPrice,
  putPrice,
  vega as vegaRN,
  impliedVol,
} from "../quant/index.js";

// ---- Small local utilities (non-formula orchestration) ----
function isFiniteNum(x) {
  return typeof x === "number" && Number.isFinite(x);
}

export function yearFracFromDays(days, basisDays = 365) {
  const d = Math.max(0, Number(days) || 0);
  const b = Math.max(1, Number(basisDays) || 365);
  return d / b;
}

export function daysBetween(nowMs, futureEpochSec) {
  const futureMs = (Number(futureEpochSec) || 0) * 1000;
  const dms = Math.max(0, futureMs - nowMs);
  return dms / (1000 * 60 * 60 * 24);
}

/** Normalize an options chain to [{expSec, calls:[], puts:[]}, ...] */
export function normalizeChain(chain) {
  if (!chain) return [];
  // Common Yahoo response shapes:
  // - { result:[{ options:[{expirationDate, calls, puts}, ...] }] }
  // - { options:[{expirationDate, calls, puts}, ...] }
  // - array of { expiration|expirationDate|exp, calls, puts }
  let opts = [];
  if (Array.isArray(chain)) {
    opts = chain;
  } else if (Array.isArray(chain?.options)) {
    opts = chain.options;
  } else if (Array.isArray(chain?.result?.[0]?.options)) {
    opts = chain.result[0].options;
  } else if (chain?.chain && Array.isArray(chain.chain)) {
    opts = chain.chain;
  }

  const out = [];
  for (const it of opts) {
    const exp =
      it?.expirationDate ?? it?.expiration ?? it?.exp ?? it?.expirationTime;
    const calls = Array.isArray(it?.calls) ? it.calls : [];
    const puts = Array.isArray(it?.puts) ? it.puts : [];
    if (isFiniteNum(exp) && (calls.length || puts.length)) {
      out.push({ expSec: Number(exp), calls, puts });
    }
  }
  // Sort by expiry ascending
  out.sort((a, b) => a.expSec - b.expSec);
  return out;
}

/** Pick two expiries around target cmDays; fallback to single nearest. */
export function nearestExpiriesToDays(chain, cmDays = 30, nowMs = Date.now()) {
  const norm = normalizeChain(chain);
  if (!norm.length) return { below: null, above: null, list: [] };

  const list = norm.map((e) => {
    const days = daysBetween(nowMs, e.expSec);
    return { ...e, days, T: yearFracFromDays(days) };
  });

  // Partition around cmDays
  let below = null;
  let above = null;
  for (const e of list) {
    if (e.days < cmDays) below = e;
    if (e.days >= cmDays) {
      above = e;
      break;
    }
  }
  if (!below) below = list[0] || null;
  if (!above) above = list[list.length - 1] || null;

  return { below, above, list };
}

/** Black–Scholes helpers (delegated to centralized hub). */
export const d1 = d1RN;
export const d2 = d2RN;
export const vega = vegaRN;

/** Positional wrappers for convenience (match legacy local signature). */
export function bsCall(S, K, r = 0, q = 0, sigma, T) {
  return callPrice({ S0: Number(S), K: Number(K), T: Number(T), sigma: Number(sigma), r: Number(r) || 0, q: Number(q) || 0 });
}
export function bsPut(S, K, r = 0, q = 0, sigma, T) {
  return putPrice({ S0: Number(S), K: Number(K), T: Number(T), sigma: Number(sigma), r: Number(r) || 0, q: Number(q) || 0 });
}

/** IV inversion via central hub solver (Newton + bisection). */
export function invertIV({ isCall, S, K, r = 0, q = 0, T, priceMid, sigmaInit = 0.25 }) {
  if (!isFiniteNum(S) || !isFiniteNum(K) || !isFiniteNum(T) || !isFiniteNum(priceMid)) return null;
  if (!(priceMid > 0)) return null;
  const type = isCall ? "call" : "put";
  const sigma = impliedVol({ type, price: priceMid, S0: S, K, T, r, q, sigmaInit });
  return isFiniteNum(sigma) ? sigma : null;
}

/** Normalize vendor IV; if missing, try inversion from mid (bid/ask). */
export function ivFromChainMid(opt, { S, r = 0, q = 0, T }) {
  if (!opt) return null;
  // Prefer vendor impliedVolatility (Yahoo style).
  let iv = opt.impliedVolatility;
  if (isFiniteNum(iv)) {
    if (iv > 1) iv = iv / 100;
    if (iv > 0 && iv < 10) return iv;
  }
  // Mid from quotes
  const bid = Number(opt.bid),
    ask = Number(opt.ask),
    last = Number(opt.lastPrice ?? opt.last ?? opt.price);
  let mid = null;
  if (isFiniteNum(bid) && isFiniteNum(ask) && bid > 0 && ask > 0) mid = (bid + ask) / 2;
  else if (isFiniteNum(last) && last > 0) mid = last;
  if (!isFiniteNum(mid) || mid <= 0) return null;

  const K = Number(opt.strike);
  const isCall =
    String(opt.contractSymbol || opt.contract || "").includes("C") ||
    opt?.type === "call";
  if (!isFiniteNum(K) || K <= 0) return null;

  const sigma = invertIV({ isCall, S, K, r, q, T, priceMid: mid });
  return isFiniteNum(sigma) ? sigma : null;
}

/** Choose ATM strike by forward; returns {strike, side:"call"|"put", opt} */
export function atmByForward(expiryRec, { S0, r = 0, q = 0, T }) {
  if (!expiryRec) return null;
  const calls = Array.isArray(expiryRec.calls) ? expiryRec.calls : [];
  const puts = Array.isArray(expiryRec.puts) ? expiryRec.puts : [];
  if (!calls.length && !puts.length) return null;

  const F0 = S0 * Math.exp((r - q) * T);
  let best = null;
  let bestDiff = Infinity;

  const scan = (arr, side) => {
    for (const o of arr) {
      const K = Number(o?.strike);
      if (!isFiniteNum(K) || K <= 0) continue;
      const d = Math.abs(K - F0);
      if (d < bestDiff) {
        best = { strike: K, side, opt: o };
        bestDiff = d;
      }
    }
  };
  scan(calls, "call");
  scan(puts, "put");
  return best;
}

/** Constant-maturity variance blend between two IV points. */
export function varianceBlend(iv1, T1, iv2, T2, Tstar) {
  if (!isFiniteNum(iv1) || !isFiniteNum(iv2) || !isFiniteNum(T1) || !isFiniteNum(T2) || !isFiniteNum(Tstar)) {
    return null;
  }
  if (T1 === T2) return iv1;
  const [Ta, Tb] = T1 < T2 ? [T1, T2] : [T2, T1];
  const [iva, ivb] = T1 < T2 ? [iv1, iv2] : [iv2, iv1];
  const T = Math.min(Math.max(Tstar, Ta), Tb);
  const w1 = (Tb - T) / (Tb - Ta);
  const w2 = 1 - w1;
  const varStar = w1 * (iva * iva) + w2 * (ivb * ivb);
  return Math.sqrt(Math.max(varStar, 0));
}

/**
 * Compute constant-maturity ATM IV at target cmDays.
 * Inputs:
 *  - chain: raw Yahoo-like options chain
 *  - S0: spot
 *  - r, q: annual decimals
 *  - cmDays: target maturity in days
 * Returns: { iv: number|null, meta: { Tstar, below, above, strikes } }
 */
export function constantMaturityATM(chain, { S0, r = 0, q = 0, cmDays = 30, nowMs = Date.now() }) {
  const { below, above, list } = nearestExpiriesToDays(chain, cmDays, nowMs);
  if (!below && !above) return { iv: null, meta: { note: "no_expiries" } };

  // If only one expiry exists, just compute ATM IV there.
  if (!below || !above || below.expSec === above.expSec) {
    const days = (below || above).days;
    const T = yearFracFromDays(days);
    const atm = atmByForward(below || above, { S0, r, q, T });
    if (!atm) return { iv: null, meta: { note: "no_atm_options" } };
    const iv = ivFromChainMid(atm.opt, { S: S0, r, q, T });
    return {
      iv,
      meta: {
        method: "atm_single",
        T,
        days,
        strike: atm.strike,
        side: atm.side,
      },
    };
  }

  // Two expiries bracketing the target → variance blend
  const T1 = yearFracFromDays(below.days);
  const T2 = yearFracFromDays(above.days);
  const Tstar = yearFracFromDays(cmDays);

  const atm1 = atmByForward(below, { S0, r, q, T: T1 });
  const atm2 = atmByForward(above, { S0, r, q, T: T2 });
  if (!atm1 || !atm2) {
    return { iv: null, meta: { note: "missing_atm", T1, T2, Tstar } };
  }

  const iv1 = ivFromChainMid(atm1.opt, { S: S0, r, q, T: T1 });
  const iv2 = ivFromChainMid(atm2.opt, { S: S0, r, q, T: T2 });
  if (!isFiniteNum(iv1) && !isFiniteNum(iv2)) {
    return { iv: null, meta: { note: "no_iv", T1, T2, Tstar } };
  }
  // If only one IV is available, use it.
  if (!isFiniteNum(iv1)) {
    return {
      iv: iv2,
      meta: {
        method: "atm_single",
        T: T2,
        days: above.days,
        strike: atm2.strike,
        side: atm2.side,
      },
    };
  }
  if (!isFiniteNum(iv2)) {
    return {
      iv: iv1,
      meta: {
        method: "atm_single",
        T: T1,
        days: below.days,
        strike: atm1.strike,
        side: atm1.side,
      },
    };
  }

  const ivStar = varianceBlend(iv1, T1, iv2, T2, Tstar);
  return {
    iv: ivStar,
    meta: {
      method: "cm_variance_blend",
      T1,
      T2,
      Tstar,
      days1: below.days,
      days2: above.days,
      strike1: atm1.strike,
      strike2: atm2.strike,
    },
  };
}

export default {
  normalizeChain,
  nearestExpiriesToDays,
  yearFracFromDays,
  daysBetween,
  d1,
  d2,
  bsCall,
  bsPut,
  vega,
  invertIV,
  ivFromChainMid,
  atmByForward,
  varianceBlend,
  constantMaturityATM,
};