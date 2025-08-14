// lib/volatility/series.js
// Utilities for realized volatility and return statistics.
// All functions are pure. Units:
// - Prices: arbitrary currency
// - Returns: daily log returns
// - Annualization basis: 252 trading days (unless overridden)

function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

/**
 * Normalize timestamps to milliseconds and pair with closes.
 * Filters out non-finite or non-positive prices.
 * @param {number[]} timestamps - seconds or milliseconds
 * @param {number[]} closes - prices
 * @returns {{t:number, p:number}[]}
 */
export function cleanPrices(timestamps = [], closes = []) {
  const out = [];
  const n = Math.min(
    Array.isArray(timestamps) ? timestamps.length : 0,
    Array.isArray(closes) ? closes.length : 0
  );
  for (let i = 0; i < n; i++) {
    const ts = timestamps[i];
    const px = closes[i];
    if (!isFiniteNumber(px) || px <= 0) continue;
    if (!isFiniteNumber(ts)) continue;
    // Heuristic: if < 1e12 assume seconds → ms
    const t = ts < 1e12 ? ts * 1000 : ts;
    out.push({ t, p: px });
  }
  // Ensure strictly increasing time
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Daily log returns r_i = ln(S_i / S_{i-1})
 * @param {{t:number, p:number}[]} series
 * @returns {number[]}
 */
export function computeLogReturns(series = []) {
  const r = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1]?.p;
    const p1 = series[i]?.p;
    if (isFiniteNumber(p0) && isFiniteNumber(p1) && p0 > 0 && p1 > 0) {
      const v = Math.log(p1 / p0);
      if (Number.isFinite(v)) r.push(v);
    }
  }
  return r;
}

export function mean(a = []) {
  if (!a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

export function stdev(a = []) {
  const n = a.length;
  if (n <= 1) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < n; i++) {
    const d = a[i] - m;
    s += d * d;
  }
  const varSample = s / (n - 1);
  return Math.sqrt(Math.max(varSample, 0));
}

/**
 * Simple percentile (p in [0,1]) using sorted copy + linear interpolation.
 */
export function quantile(a = [], p = 0.5) {
  if (!a.length) return NaN;
  if (p <= 0) return Math.min(...a);
  if (p >= 1) return Math.max(...a);
  const b = [...a].sort((x, y) => x - y);
  const idx = (b.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return b[lo];
  const w = idx - lo;
  return b[lo] * (1 - w) + b[hi] * w;
}

/**
 * Winsorize array a by clamping to [q_p, q_(1-p)]
 * @returns {number[]}
 */
export function winsorize(a = [], p = 0.01) {
  if (!a.length) return [];
  const lo = quantile(a, p);
  const hi = quantile(a, 1 - p);
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    out[i] = x < lo ? lo : x > hi ? hi : x;
  }
  return out;
}

/**
 * Annualize a standard deviation by sqrt(periods).
 * @param {number} sd - stdev of interval returns
 * @param {number} periods - periods per year (default 252)
 */
export function annualizeStdev(sd, periods = 252) {
  const s = Number(sd);
  const k = Math.sqrt(Math.max(1, Number(periods) || 252));
  return s * k;
}

/**
 * Compute summary stats from a cleaned price series.
 * - μ_geom (annualized from mean log return)
 * - μ_arith (annualized from mean simple return)
 * - σ_ann (annualized from stdev of log returns)
 */
export function statsFromSeries(series = [], periodsPerYear = 252) {
  const nPts = series.length;
  if (nPts < 2) {
    return {
      muGeom: 0,
      muArith: 0,
      sigmaAnn: 0,
      n: 0,
      startDate: null,
      endDate: null,
      ppYear: periodsPerYear,
    };
    }
  const logR = computeLogReturns(series);
  const simR = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1].p, p1 = series[i].p;
    const r = p1 / p0 - 1;
    if (Number.isFinite(r)) simR.push(r);
  }
  const muGeom = mean(logR) * periodsPerYear;         // μ_geom = \bar{r} * 252
  const muArith = mean(simR) * periodsPerYear;        // μ_arith = \bar{R} * 252
  const sigmaAnn = annualizeStdev(stdev(logR), periodsPerYear);

  return {
    muGeom,
    muArith,
    sigmaAnn,
    n: logR.length,
    startDate: new Date(series[0].t).toISOString(),
    endDate: new Date(series[series.length - 1].t).toISOString(),
    ppYear: periodsPerYear,
  };
}

/**
 * Convenience: realized annual σ with winsorization on log returns.
 * @param {{t:number,p:number}[]} series
 * @param {number} p - winsorize tail probability (e.g., 0.01)
 * @param {number} periodsPerYear
 */
export function realizedSigmaAnn(series = [], p = 0.01, periodsPerYear = 252) {
  const r = computeLogReturns(series);
  const rw = p > 0 ? winsorize(r, p) : r;
  return annualizeStdev(stdev(rw), periodsPerYear);
}

export default {
  cleanPrices,
  computeLogReturns,
  mean,
  stdev,
  quantile,
  winsorize,
  annualizeStdev,
  statsFromSeries,
  realizedSigmaAnn,
};
