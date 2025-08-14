// lib/stats.js
// Lightweight EWMA helpers for returns & volatility.
// All outputs use plain numbers (no deps). ESM exports.

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
    // oldest has largest power, newest gets (1-λ)
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
