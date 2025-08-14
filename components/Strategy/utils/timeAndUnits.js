// components/Strategy/utils/timeAndUnits.js

/**
 * Time & units helpers for options math and display.
 * - daysToYears / yearsToDays: consistent time conversion for pricing.
 * - Contract size scaling: convert per-share values <-> lot values.
 * - Volatility helpers: annualize/deannualize using trading-day basis.
 */

export const DEFAULT_CONTRACT_SIZE = 100; // common equity option lot size

/** Convert days -> years (simple ACT/365 style) */
export function daysToYears(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return d / 365;
}

/** Convert years -> whole days (rounded) */
export function yearsToDays(years) {
  const y = Number(years);
  if (!Number.isFinite(y) || y <= 0) return 0;
  return Math.round(y * 365);
}

/** Numeric parser: returns finite number or null */
export function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/** Resolve the contract size; allow optional override via env.contractSize */
export function getContractSize(env) {
  const n = toNum(env?.contractSize);
  return n && n > 0 ? n : DEFAULT_CONTRACT_SIZE;
}

/** Scale a per-share value (e.g., P&L) to lot value using contract size */
export function perShareToLot(value, env) {
  const v = toNum(value);
  if (v == null) return null;
  return v * getContractSize(env);
}

/** Scale a lot value to per-share value using contract size */
export function lotToPerShare(value, env) {
  const v = toNum(value);
  if (v == null) return null;
  const cs = getContractSize(env);
  return cs > 0 ? v / cs : null;
}

/** Annualize a daily volatility using sqrt-time rule (basis=252 trading days) */
export function annualizeVol(sigmaDaily, basis = 252) {
  const s = toNum(sigmaDaily);
  const b = toNum(basis) || 252;
  if (s == null || s < 0) return null;
  return s * Math.sqrt(b);
}

/** Convert annual volatility to daily using sqrt-time rule (basis=252) */
export function deannualizeVol(sigmaAnnual, basis = 252) {
  const s = toNum(sigmaAnnual);
  const b = toNum(basis) || 252;
  if (s == null || s < 0 || b <= 0) return null;
  return s / Math.sqrt(b);
}

const timeAndUnits = Object.freeze({
  DEFAULT_CONTRACT_SIZE,
  daysToYears,
  yearsToDays,
  toNum,
  getContractSize,
  perShareToLot,
  lotToPerShare,
  annualizeVol,
  deannualizeVol,
});

export default timeAndUnits;
