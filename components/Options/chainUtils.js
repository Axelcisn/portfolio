// components/Options/chainUtils.js
"use client";

/**
 * Numeric helpers (null-safe)
 */
export function toNum(v) {
  if (v == null) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export const isFiniteNum = (v) => Number.isFinite(toNum(v));
export const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

/**
 * Mid price between bid and ask.
 * - Returns { mid, hasBid, hasAsk, hasBoth }
 * - mid = null if either side is not finite
 */
export function midPrice(bid, ask) {
  const b = toNum(bid);
  const a = toNum(ask);
  const hasBid = Number.isFinite(b);
  const hasAsk = Number.isFinite(a);
  const hasBoth = hasBid && hasAsk;
  return {
    mid: hasBoth ? (b + a) / 2 : null,
    hasBid,
    hasAsk,
    hasBoth,
  };
}

/**
 * Formatters (locale-aware, tabular-friendly)
 * Keep them minimal; UI can add `font-variant-numeric: tabular-nums`.
 */
export function fmtNumber(x, opts = {}) {
  const n = toNum(x);
  if (!Number.isFinite(n)) return "—";
  const { min = 0, max = 2 } = opts;
  return n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });
}
export function fmtPct(x, opts = {}) {
  const n = toNum(x);
  if (!Number.isFinite(n)) return "—";
  const { min = 0, max = 2 } = opts;
  return (n / 1).toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}
export function fmtMoney(x, currency = "USD", opts = {}) {
  const n = toNum(x);
  if (!Number.isFinite(n)) return "—";
  const { min = 2, max = 2 } = opts;
  try {
    return n.toLocaleString(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  } catch {
    // Fallback if currency code is odd
    return `${n.toFixed(max)} ${currency}`;
  }
}

/**
 * Settings preset for Greeks toggles (persist to localStorage in ChainSettings).
 * Attach under settings.greeks.*
 */
export const DEFAULT_GREEKS_FLAGS = {
  delta: false,
  gamma: false,
  theta: false,
  vega:  false,
  rho:   false,
};
