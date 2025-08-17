// lib/stats.js
// Lightweight EWMA helpers for returns & volatility + shims that re-export
// core stats from the centralized quant hub (with safe fallbacks). ESM exports.

// Prefer hub implementations to keep a single source of truth.
import * as Quant from "./quant/index.js";

const isFiniteNum = (x) => Number.isFinite(Number(x));

/** Return a cleaned numeric array, removing null/NaN/inf. */
export function cleanSeries(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const v = Number(arr[i]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** Clamp λ to a safe range. */
function clampLambda(lambda) {
  const L = Number(lambda);
  if (!Number.isFinite(L)) return 0.94;
  return Math.min(Math.max(L, 0.5), 0.9999);
}

/**
 * Exponential weights for n points (oldest → newest).
 * w_i = (1-λ) * λ^(n-1-i), normalized to sum=1.
 */
export function expWeights(n, lambda = 0.94) {
  const λ = clampLambda(lambda);
  const w = new Array(Math.max(0, n)).fill(0);
  if (n <= 0) return w;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const power = (n - 1 - i);
    const wi = (1 - λ) * Math.pow(λ, power);
    w[i] = wi;
    sum += wi;
  }
  if (sum > 0) {
    for (let i = 0; i < n; i++) w[i] /= sum;
  }
  return w;
}

/**
 * EWMA mean (oldest->newest); newest has the largest weight.
 * @param {number[]} values chronological series
 * @param {number} lambda decay parameter in (0,1)
 * @returns {number|null} weighted mean or null if not computable
 */
export function ewma(values, lambda = 0.94) {
  const x = cleanSeries(values);
  if (x.length === 0) return null;
  const w = expWeights(x.length, lambda);
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * w[i];
  return s;
}

/**
 * EWMA variance around the EWMA mean (normalized weights version).
 * More "statistical" form (not the RiskMetrics recursion).
 */
export function ewmaVar(returns, lambda = 0.94) {
  const r = cleanSeries(returns);
  if (r.length < 2) return null;
  const w = expWeights(r.length, lambda);
  let mu = 0;
  for (let i = 0; i < r.length; i++) mu += r[i] * w[i];
  let v = 0;
  for (let i = 0; i < r.length; i++) {
    const d = r[i] - mu;
    v += w[i] * d * d;
  }
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** Annualize a daily sigma by √periodsPerYear (default 252). */
export function annualizeSigma(sigmaDaily, periodsPerYear = 252) {
  const s = Number(sigmaDaily);
  if (!Number.isFinite(s) || s < 0) return null;
  return s * Math.sqrt(Math.max(1, periodsPerYear));
}

/** EWMA sigma annualized using weight-normalized variance. */
export function ewmaSigmaAnnual(returns, lambda = 0.94, periodsPerYear = 252) {
  const v = ewmaVar(returns, lambda);
  if (v == null) return null;
  const sdDaily = Math.sqrt(v);
  return annualizeSigma(sdDaily, periodsPerYear);
}

/**
 * RiskMetrics recursive variance:
 * σ_t^2 = λ σ_{t-1}^2 + (1-λ) r_{t-1}^2
 * Feed chronological returns (oldest→newest). Seed with first squared return.
 */
export function riskmetricsVar(returns, lambda = 0.94, seedVar = null) {
  const r = cleanSeries(returns);
  if (r.length === 0) return null;
  const λ = clampLambda(lambda);
  let varPrev = seedVar != null && isFiniteNum(seedVar) ? Number(seedVar) : r[0] * r[0];
  for (let i = 1; i < r.length; i++) {
    varPrev = λ * varPrev + (1 - λ) * (r[i - 1] * r[i - 1]);
  }
  return Number.isFinite(varPrev) && varPrev >= 0 ? varPrev : null;
}

/** RiskMetrics sigma annualized (√variance · √252). */
export function riskmetricsSigmaAnnual(returns, lambda = 0.94, periodsPerYear = 252, seedVar = null) {
  const v = riskmetricsVar(returns, lambda, seedVar);
  if (v == null) return null;
  return annualizeSigma(Math.sqrt(v), periodsPerYear);
}

/* -------------------- Shims to satisfy API imports on Vercel -------------------- */

/**
 * Daily log returns from a price series.
 * - Prefer the centralized hub; if absent, use the local fallback.
 */
export function logReturns(series = []) {
  if (typeof Quant.logReturns === "function") return Quant.logReturns(series);
  const vals = Array.isArray(series)
    ? series.map((x) =>
        typeof x === "number"
          ? x
          : (isFiniteNum(x?.close) ? Number(x.close)
            : isFiniteNum(x?.value) ? Number(x.value)
            : Number(x))
      )
    : [];
  const logs = [];
  for (let i = 1; i < vals.length; i++) {
    const p0 = Number(vals[i - 1]);
    const p1 = Number(vals[i]);
    if (p0 > 0 && p1 > 0) logs.push(Math.log(p1 / p0));
  }
  return logs;
}

/**
 * From DAILY log returns, compute daily & annualized mean/vol.
 * - Prefer the hub; if absent, compute locally.
 */
export function annualizedFromDailyLogs(logs = [], basis = 252) {
  if (typeof Quant.annualizedFromDailyLogs === "function") {
    return Quant.annualizedFromDailyLogs(logs, basis);
  }
  const xs = (Array.isArray(logs) ? logs : []).filter((z) => Number.isFinite(z));
  const n = xs.length;
  if (n === 0) {
    return {
      meanDaily: null, stdevDaily: null,
      meanAnnual: null, stdevAnnual: null,
      // aliases
      muDaily: null, sigmaDaily: null,
      muAnn: null, sigmaAnn: null,
      meanAnn: null, stdevAnn: null,
      n: 0, basis
    };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const varPop = xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
  const stdev = Math.sqrt(Math.max(0, varPop));
  const meanAnnual = mean * basis;
  const stdevAnnual = stdev * Math.sqrt(basis);
  return {
    meanDaily: mean,
    stdevDaily: stdev,
    meanAnnual,
    stdevAnnual,
    // aliases for compatibility
    muDaily: mean,
    sigmaDaily: stdev,
    muAnn: meanAnnual,
    sigmaAnn: stdevAnnual,
    meanAnn: meanAnnual,
    stdevAnn: stdevAnnual,
    n, basis
  };
}