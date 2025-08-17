// components/Strategy/greeks.js
"use client";

// Centralized Greeks: prefer the hub in lib/quant; fallback to local shim.
// Conventions preserved: vega per 1% vol, theta per day.
import * as q from "lib/quant/index.js";
import { greeksByKey as shimGreeksByKey } from "./math/bsGreeks";

// Pick hub if available, else shim.
const hubGreeksByKey =
  typeof q?.greeksByKey === "function" ? q.greeksByKey : shimGreeksByKey;

/**
 * Thin wrapper for direct BS greeks by option type.
 * @param {number} S
 * @param {number} K
 * @param {number} r
 * @param {number} sigma
 * @param {number} T      (years)
 * @param {'call'|'put'} type
 */
export function bsGreeks(S, K, r, sigma, T, type) {
  const key = type === "call" ? "lc" : "lp"; // always use long-option greeks
  return hubGreeksByKey(
    key,
    Number(S),
    Number(K),
    Number(r),
    Number(sigma),
    Number(T),
    0 // q (dividend yield)
  );
}

/* ------------ helpers for row/leg normalization ------------ */

function num(x, d = null) {
  const v = Number(x);
  return Number.isFinite(v) ? v : d;
}

/**
 * Determine long-key ('lc' or 'lp') and sign (+1 long, -1 short)
 * from heterogeneous leg/row shapes.
 * Supports:
 *  - builder rows: { type/key: 'lc'|'sc'|'lp'|'sp', K, qty }
 *  - generic legs: { kind: 'call'|'put', side: 'long'|'short', strike, volume }
 *  - legacy: { position: 'Long Call' | 'Short Put', ... }
 */
function parseLegMeta(leg) {
  const rawKey = String(leg?.key ?? leg?.type ?? "").toLowerCase();
  const position = String(leg?.position ?? "").toLowerCase();
  const kind = String(leg?.kind ?? "").toLowerCase();
  const side = String(leg?.side ?? "").toLowerCase();

  // Determine long/short sign.
  const isShortKey = rawKey === "sc" || rawKey === "sp";
  const isShortPos = /short/.test(position) || side === "short";
  const sign = isShortKey || isShortPos ? -1 : +1;

  // Determine option kind for long-key (we always request long greeks).
  let isCall =
    rawKey === "lc" ||
    rawKey === "sc" ||
    kind === "call" ||
    /call/.test(position);

  // Default to put if we can't detect call.
  if (!isCall && (rawKey === "lp" || rawKey === "sp" || kind === "put" || /put/.test(position))) {
    isCall = false;
  }

  const longKey = isCall ? "lc" : "lp";

  // Strike and quantity/volume
  const K =
    num(leg?.strike) ??
    num(leg?.K) ??
    null;

  const vol =
    num(leg?.volume) ??
    num(leg?.qty) ??
    0;

  return { longKey, sign, K, vol };
}

/**
 * Aggregated greek series across legs (scaled by contractSize).
 * `greek` in: 'delta' | 'gamma' | 'theta' | 'rho' | 'vega' (case-insensitive)
 * Uses long-option greeks and applies sign (+1 long, -1 short), volume, and contractSize.
 */
export function buildGreekSeries({
  xs,
  rows,
  contractSize = 1,
  sigma,
  T,
  r,
  greek,
}) {
  if (!Array.isArray(xs) || xs.length === 0) return [];
  const want = String(greek || "vega").toLowerCase();
  const Tyrs = num(T, 0);

  return xs.map((S) => {
    let sum = 0;
    for (const leg of rows || []) {
      const { longKey, sign, K, vol } = parseLegMeta(leg);
      if (!Number.isFinite(K) || !Number.isFinite(vol) || vol === 0) continue;

      const G = hubGreeksByKey(
        longKey,          // always LONG greeks
        num(S, 0),
        K,
        num(r, 0),
        num(sigma, 0),
        Tyrs,
        0                 // q (dividend yield)
      );

      const val =
        want === "delta" ? G.delta :
        want === "gamma" ? G.gamma :
        want === "theta" ? G.theta :
        want === "rho"   ? G.rho   :
        G.vega; // default to vega

      sum += sign * vol * (Number.isFinite(val) ? val : 0);
    }
    return sum * (Number(contractSize) || 1);
  });
}

export default { bsGreeks, buildGreekSeries };
