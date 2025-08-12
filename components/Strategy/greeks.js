// components/Strategy/greeks.js
"use client";

// Compatibility shim that forwards to the canonical BS implementation.
// Conventions: vega per 1% vol, theta per day (matching the Chart).
import { greeksByKey } from "./math/bsGreeks";
import { isCall } from "./payoffUtils";

// Keep the old signature but route to the new engine.
export function bsGreeks(S, K, r, sigma, T, type /* 'call' | 'put' */) {
  const key = type === "call" ? "lc" : "lp"; // long option greeks
  return greeksByKey(key, Number(S), Number(K), Number(r), Number(sigma), Number(T), 0);
}

/**
 * Legacy helper kept for backwards-compat.
 * Builds an aggregated greek series across legs (scaled by contractSize).
 * `greek` can be: 'delta' | 'gamma' | 'theta' | 'rho' | 'vega' (case-insensitive)
 * Uses long-option greeks and applies sign (+1 long, -1 short), volume, and contractSize.
 */
export function buildGreekSeries({ xs, rows, contractSize = 1, sigma, T, r, greek }) {
  if (!Array.isArray(xs) || xs.length === 0) return [];
  const want = String(greek || "vega").toLowerCase();

  return xs.map((S) => {
    let sum = 0;
    for (const leg of rows || []) {
      const K = Number(leg.strike ?? leg.K);
      const vol = Number(leg.volume ?? leg.qty ?? 0);
      if (!Number.isFinite(K) || !Number.isFinite(vol) || vol === 0) continue;

      const longKey = isCall(leg.position) || leg.key === "lc" || leg.key === "sc" ? "lc" : "lp";
      const g = greeksByKey(longKey, Number(S), K, Number(r), Number(sigma), Number(T), 0);

      const val =
        want === "delta" ? g.delta :
        want === "gamma" ? g.gamma :
        want === "theta" ? g.theta :
        want === "rho"   ? g.rho   :
        g.vega; // default vega

      const isShort = /Short/.test(leg.position) || leg.key === "sc" || leg.key === "sp";
      const sign = isShort ? -1 : +1;
      sum += sign * vol * val;
    }
    return sum * (Number(contractSize) || 1);
  });
}
