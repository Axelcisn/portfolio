// components/Strategy/defs/seedingRules.js

import priceOption from "../utils/priceOption";
import { daysToYears, toNum } from "../utils/timeAndUnits";

/**
 * Defaults used for strike placement & rounding.
 */
export const SEED_DEFAULTS = Object.freeze({
  volWidthMult: 0.75,   // width ≈ S * σ * √T * mult
  minWidthPct: 0.02,    // ≥ 2% * S
  minWidthAbs: 0.50,    // ≥ 0.50 currency units
  tick: 0.50,           // round strikes to this tick (override via env.tick)
  maxWingMult: 2.0      // wing ≈ 2 * body width (for condors/butterflies)
});

/**
 * Round a price to the nearest tick.
 */
export function roundToTick(x, tick = SEED_DEFAULTS.tick) {
  const t = toNum(tick) || SEED_DEFAULTS.tick;
  if (!Number.isFinite(x) || t <= 0) return x;
  return Math.round(x / t) * t;
}

/**
 * Suggest a symmetric strike width around ATM using S, sigma, T.
 */
export function suggestWidth(S, sigma, T, env = {}) {
  const S0 = toNum(S);
  const v = Math.max(0, toNum(sigma) ?? 0);
  const Ty = Math.max(0, toNum(T) ?? 0);
  if (!(S0 > 0) || !(Ty >= 0)) return SEED_DEFAULTS.minWidthAbs;

  const base = S0 * v * Math.sqrt(Ty) * (toNum(env.volWidthMult) || SEED_DEFAULTS.volWidthMult);
  const floorPct = S0 * (toNum(env.minWidthPct) || SEED_DEFAULTS.minWidthPct);
  const floorAbs = toNum(env.minWidthAbs) || SEED_DEFAULTS.minWidthAbs;
  const raw = Math.max(base, floorPct, floorAbs);
  return roundToTick(raw, env.tick || SEED_DEFAULTS.tick);
}

/**
 * Determine per-leg T (years). Row may carry `days`; else use env.T (years).
 */
function resolveT(row, env) {
  const days = toNum(row?.days);
  if (days && days > 0) return daysToYears(days);
  const Ty = toNum(env?.T);
  return Ty && Ty >= 0 ? Ty : 30 / 365;
}

/**
 * Core seeding: returns NEW rows with strikes/premiums filled if missing.
 * - Works purely from the row combo (lc/sc/lp/sp) and env {spot, sigma, T, r|riskFree, q|dividendYield, tick}.
 * - Leaves existing K/premium intact.
 */
export function seedFromEnv(strategyId, rows = [], env = {}) {
  const S = toNum(env?.spot);
  const sigma = Math.max(0, toNum(env?.sigma) ?? 0.2);
  const T = Math.max(0, toNum(env?.T) ?? 30 / 365);
  const r = toNum(env?.riskFree ?? env?.r) ?? 0;
  const q = toNum(env?.dividendYield ?? env?.q) ?? 0;
  const tick = toNum(env?.tick) || SEED_DEFAULTS.tick;

  if (!(S > 0)) return rows.slice(); // cannot seed without spot

  // Presence map for legs
  const present = rows.reduce((acc, r) => {
    const t = String(r?.type || "").toLowerCase();
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  const ATM = roundToTick(S, tick);
  const w = suggestWidth(S, sigma, T, env);
  const wing = roundToTick(Math.min(w * (toNum(env.maxWingMult) || SEED_DEFAULTS.maxWingMult), Math.max(S * 0.25, 3 * w)), tick);

  // Decide target strikes for common combos
  // Defaults
  let K_lc = ATM, K_sc = roundToTick(ATM + w, tick);
  let K_lp = ATM, K_sp = roundToTick(ATM - w, tick);

  // If both call legs exist, assume vertical/condor: move long call further OTM as wing
  if (present.lc && present.sc) {
    K_sc = roundToTick(ATM + w, tick);
    K_lc = roundToTick(ATM + wing, tick);
  }
  // If both put legs exist, assume vertical/condor: move long put further OTM (downside)
  if (present.lp && present.sp) {
    K_sp = roundToTick(ATM - w, tick);
    K_lp = roundToTick(ATM - wing, tick);
  }

  // Helpers to get option "type" and "side" from builder code
  const optType = (code) => (code === "lc" || code === "sc" ? "call" : "put");
  const optSide = (code) => (code === "lc" || code === "lp" ? "long" : "short");

  // Counter to support potential multiple legs of same code (rare; second gets the "wing")
  const usedIndex = { lc: 0, sc: 0, lp: 0, sp: 0 };

  const seeded = rows.map((r) => {
    const code = String(r?.type || "").toLowerCase();
    if (!["lc", "sc", "lp", "sp"].includes(code)) {
      // stock legs or unknown types: passthrough
      return { ...r };
    }

    // Determine target strike for this leg
    let targetK = toNum(r?.K);
    if (!(targetK > 0)) {
      if (code === "lc") targetK = usedIndex.lc++ === 0 ? K_lc : roundToTick(K_lc + w, tick);
      if (code === "sc") targetK = usedIndex.sc++ === 0 ? K_sc : roundToTick(K_sc + w, tick);
      if (code === "lp") targetK = usedIndex.lp++ === 0 ? K_lp : roundToTick(K_lp - w, tick);
      if (code === "sp") targetK = usedIndex.sp++ === 0 ? K_sp : roundToTick(K_sp - w, tick);
    } else {
      targetK = roundToTick(targetK, tick);
    }

    // Price premium (per share); only if missing
    let premium = toNum(r?.premium);
    if (!(premium >= 0)) {
      const Ty = resolveT(r, env);
      const { price } = priceOption({
        type: optType(code),
        side: optSide(code),
        S,
        K: targetK,
        T: Ty,
        r,
        q,
        sigma,
      });
      premium = Number.isFinite(price) ? Math.round(price * 100) / 100 : null;
    }

    return { ...r, K: targetK, premium };
  });

  return seeded;
}

export default {
  SEED_DEFAULTS,
  roundToTick,
  suggestWidth,
  seedFromEnv,
};
