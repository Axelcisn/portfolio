// components/Strategy/math/bsGreeks.js

const SQRT2PI = Math.sqrt(2 * Math.PI);

function normPdf(z) {
  return Math.exp(-0.5 * z * z) / SQRT2PI;
}
function normCdf(z) {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d =
    0.319381530 * t -
    0.356563782 * t ** 2 +
    1.781477937 * t ** 3 -
    1.821255978 * t ** 4 +
    1.330274429 * t ** 5;
  const nd = 1 - normPdf(z) * d;
  return z >= 0 ? nd : 1 - nd;
}

function getD1D2(S, K, r, sigma, T) {
  const s = Number(S), k = Number(K);
  const vol = Math.max(1e-12, Number(sigma));
  const tt = Math.max(1e-12, Number(T));
  if (!isFinite(s) || !isFinite(k) || s <= 0 || k <= 0) return { d1: NaN, d2: NaN, vol: vol, sqrtT: Math.sqrt(tt) };
  const sqrtT = Math.sqrt(tt);
  const d1 = (Math.log(s / k) + (r + 0.5 * vol * vol) * tt) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  return { d1, d2, vol, sqrtT };
}

/** Prices */
export function bsCall(S, K, r = 0, sigma = 0.2, T = 30 / 365) {
  const { d1, d2 } = getD1D2(S, K, r, sigma, T);
  if (!isFinite(d1)) return 0;
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}
export function bsPut(S, K, r = 0, sigma = 0.2, T = 30 / 365) {
  const { d1, d2 } = getD1D2(S, K, r, sigma, T);
  if (!isFinite(d1)) return 0;
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

/** Greeks (annualized). */
export function greeks(S, K, r = 0, sigma = 0.2, T = 30 / 365, type = "call") {
  const { d1, d2, vol, sqrtT } = getD1D2(S, K, r, sigma, T);
  if (!isFinite(d1)) return { delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };

  const pdf = normPdf(d1);
  const Nd1 = normCdf(type === "call" ? d1 : -d1);
  const Nd2 = normCdf(type === "call" ? d2 : -d2);

  const delta = type === "call" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf / (S * vol * sqrtT);
  const vega = S * pdf * sqrtT; // per 1.00 vol (not per 1%)
  const theta =
    type === "call"
      ? (-S * pdf * vol) / (2 * sqrtT) - r * K * Math.exp(-r * T) * normCdf(d2)
      : (-S * pdf * vol) / (2 * sqrtT) + r * K * Math.exp(-r * T) * normCdf(-d2);
  const rho =
    type === "call"
      ? K * T * Math.exp(-r * T) * normCdf(d2)
      : -K * T * Math.exp(-r * T) * normCdf(-d2);

  return { delta, gamma, vega, theta, rho };
}

/** Helper: BS value by type key "lc"/"sc"/"lp"/"sp" (long/short handled by sign externally) */
export function bsValueByKey(typeKey, S, K, r, sigma, T) {
  if (typeKey === "lc" || typeKey === "sc") return bsCall(S, K, r, sigma, T);
  if (typeKey === "lp" || typeKey === "sp") return bsPut(S, K, r, sigma, T);
  return 0;
}
export function greeksByKey(typeKey, S, K, r, sigma, T) {
  const opt = typeKey === "lc" || typeKey === "sc" ? "call" : "put";
  return greeks(S, K, r, sigma, T, opt);
}
ì
