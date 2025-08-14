// components/Strategy/defs/materializeSeeded.js

import materializeTemplate from "./materializeTemplate";
import { seedFromEnv } from "./seedingRules";
import { toNum, daysToYears } from "../utils/timeAndUnits";

/**
 * Build strategy rows from template and seed missing strikes/premiums
 * in a deterministic way using {spot, sigma, T, r/q, tick}.
 *
 * @param {string} strategyId
 * @param {Object} env
 *  - spot: number
 *  - sigma: number (annualized)
 *  - T: number (years) OR defaultDays: number (days)
 *  - riskFree|r: number
 *  - dividendYield|q: number
 *  - tick?: number
 *  - maxWingMult?, volWidthMult?, minWidthPct?, minWidthAbs?: numbers
 * @returns {Array<Object>} rows
 */
export default function materializeSeeded(strategyId, env = {}) {
  const {
    spot,
    sigma,
    riskFree,
    r,
    dividendYield,
    q,
    tick,
    defaultDays,
  } = env || {};

  // Resolve T (years) from either env.T (years) or defaultDays (days)
  let Ty = toNum(env?.T);
  if (!(Ty > 0)) {
    const d = toNum(defaultDays);
    Ty = d && d > 0 ? daysToYears(d) : 30 / 365;
  }

  // Materialize base rows from template (uses T and defaultDays for expiries)
  const baseRows = materializeTemplate(strategyId, {
    T: Ty,
    defaultDays: toNum(defaultDays) || Math.round(Ty * 365),
  });

  // Build a normalized env for seeding
  const seedEnv = {
    spot: toNum(spot),
    sigma: toNum(sigma),
    T: Ty,
    riskFree: toNum(riskFree ?? r),
    q: toNum(dividendYield ?? q),
    tick: toNum(tick),
    // forward optional tuning knobs if present
    maxWingMult: toNum(env?.maxWingMult),
    volWidthMult: toNum(env?.volWidthMult),
    minWidthPct: toNum(env?.minWidthPct),
    minWidthAbs: toNum(env?.minWidthAbs),
  };

  // Seed strikes/premiums only where missing
  return seedFromEnv(strategyId, baseRows, seedEnv);
}

/**
 * Convenience: seed any existing rows you already have (e.g., after edits).
 */
export function seedRows(rows, env = {}, strategyId = "custom") {
  let Ty = toNum(env?.T);
  if (!(Ty > 0)) {
    const d = toNum(env?.defaultDays);
    Ty = d && d > 0 ? daysToYears(d) : 30 / 365;
  }
  const seedEnv = {
    spot: toNum(env?.spot),
    sigma: toNum(env?.sigma),
    T: Ty,
    riskFree: toNum(env?.riskFree ?? env?.r),
    q: toNum(env?.dividendYield ?? env?.q),
    tick: toNum(env?.tick),
    maxWingMult: toNum(env?.maxWingMult),
    volWidthMult: toNum(env?.volWidthMult),
    minWidthPct: toNum(env?.minWidthPct),
    minWidthAbs: toNum(env?.minWidthAbs),
  };
  return seedFromEnv(strategyId, Array.isArray(rows) ? rows : [], seedEnv);
}
