// components/Strategy/statsBus.js
'use client';

// Safe, SSR-friendly singleton bus for Stats context (with backward compatibility)
import { useSyncExternalStore } from "react";

const GLOBAL_KEY = "__STATS_BUS_SINGLETON__";
const root = typeof globalThis !== "undefined" ? globalThis : {};

// Initialize singleton container once (works with HMR)
if (!root[GLOBAL_KEY]) {
  root[GLOBAL_KEY] = {
    ctx: /** @type {Partial<StatsCtx>} */ ({}),
    listeners: new Set(),
  };
}

const BUS = root[GLOBAL_KEY];

/**
 * @typedef {Object} StatsCtx
 * @property {number|null} days       // days to expiry
 * @property {number}       basis     // day-count basis (e.g., 365 or 252)
 * @property {number|null}  sigma     // annualized vol (decimal, e.g., 0.25)
 * @property {"CAPM"|"R-N"|string} driftMode // drift source/mode
 * @property {number}       rf        // risk-free rate (annual, decimal)
 * @property {number}       q         // dividend yield (annual, decimal)
 * @property {number}       muCapm    // CAPM expected return (annual, decimal)
 * @property {number|null}  spot      // current underlying price
 */

// ---- helpers ----
function toNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function sanitize(partial = {}) {
  const out = {};
  if ("days" in partial) out.days = toNum(partial.days, null);
  if ("basis" in partial) out.basis = toNum(partial.basis, 365);
  if ("sigma" in partial) out.sigma = toNum(partial.sigma, null);
  if ("driftMode" in partial) out.driftMode = partial.driftMode ?? "R-N";
  if ("rf" in partial) out.rf = toNum(partial.rf, 0);
  if ("q" in partial) out.q = toNum(partial.q, 0);
  if ("muCapm" in partial) out.muCapm = toNum(partial.muCapm, 0);
  if ("spot" in partial) out.spot = toNum(partial.spot, null);
  return out;
}

// ---- public API (store) ----
/** Get current snapshot */
export function snapshotStatsCtx() {
  return BUS.ctx;
}

/**
 * Subscribe to updates (listener is called immediately with the current snapshot).
 * @param {(ctx: Partial<StatsCtx>) => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeStatsCtx(listener) {
  if (typeof listener !== "function") return () => {};
  BUS.listeners.add(listener);
  try { listener(BUS.ctx); } catch {}
  return () => BUS.listeners.delete(listener);
}

/**
 * Merge and broadcast new values (sanitized). Use for updates from StatsRail.
 * @param {Partial<StatsCtx>} partial
 */
export function setStatsCtx(partial) {
  BUS.ctx = Object.freeze({ ...BUS.ctx, ...sanitize(partial) });
  for (const l of Array.from(BUS.listeners)) {
    try { l(BUS.ctx); } catch {}
  }
}

/** Clear context (rare) */
export function clearStatsCtx() {
  BUS.ctx = Object.freeze({});
  for (const l of Array.from(BUS.listeners)) {
    try { l(BUS.ctx); } catch {}
  }
}

// ---- consumer hook (new) ----
/**
 * React hook to consume the Stats context with concurrent/SSR safety.
 * @returns {Partial<StatsCtx>}
 */
export function useStatsCtx() {
  // subscribe function for useSyncExternalStore
  const subscribe = (onStoreChange) => subscribeStatsCtx(onStoreChange);
  const getSnapshot = () => BUS.ctx;
  const getServerSnapshot = () => BUS.ctx || {};
  // returns a stable object snapshot; components re-render on updates
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---- backward compatibility shims ----
export const STATS_CTX_EVENT = "stats:ctx:update";

/** Legacy name: now simply delegates to setStatsCtx */
export function publishStatsCtx(ctx) {
  setStatsCtx(ctx);
}

export default {
  snapshotStatsCtx,
  subscribeStatsCtx,
  setStatsCtx,
  clearStatsCtx,
  publishStatsCtx,
  useStatsCtx,
  STATS_CTX_EVENT,
};