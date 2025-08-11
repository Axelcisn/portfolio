// components/Strategy/math/breakevens.js

/**
 * Deduplicate sorted numbers within an absolute epsilon.
 */
function dedupeSorted(arr, eps) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (!out.length || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
  }
  return out;
}

/**
 * Find break-even crossings (roots) of y(x) == 0 from sampled arrays xs, ys.
 * - xs, ys must have equal length >= 2
 * - Returns: { points: number[], lo: number|null, hi: number|null }
 */
export function computeBreakevens(xs, ys, { eps = 1e-9 } = {}) {
  const n = Math.min(xs?.length || 0, ys?.length || 0);
  const crosses = [];
  if (n < 2) return { points: [], lo: null, hi: null };

  let plateauStart = null; // index where a flat-at-zero segment began

  const y0 = (i) => Number(ys[i]);
  const x0 = (i) => Number(xs[i]);

  for (let i = 1; i < n; i++) {
    const xa = x0(i - 1), xb = x0(i);
    const ya = y0(i - 1), yb = y0(i);

    const aZero = Math.abs(ya) <= eps;
    const bZero = Math.abs(yb) <= eps;

    // Track zero plateau (ya == 0 and continues)
    if (aZero && bZero) {
      if (plateauStart == null) plateauStart = i - 1;
      // continue extending plateau; we'll close it when it ends
      continue;
    } else if (plateauStart != null && !bZero) {
      // Plateau ended at i-1: push the two edges
      crosses.push(x0(plateauStart), x0(i - 1));
      plateauStart = null;
    }

    // Sign change or one endpoint exactly zero -> crossing in [xa, xb]
    if ((ya <= 0 && yb >= 0) || (ya >= 0 && yb <= 0)) {
      if (aZero && !bZero) {
        crosses.push(xa);
      } else if (!aZero && bZero) {
        crosses.push(xb);
      } else if (!aZero && !bZero) {
        // linear interpolation for sub-sample root
        const t = ya === yb ? 0 : (0 - ya) / (yb - ya);
        const xr = xa + t * (xb - xa);
        crosses.push(xr);
      } else {
        // both zero already handled by plateau logic
      }
    }
  }
  // Close plateau if it runs to the end
  if (plateauStart != null) {
    crosses.push(x0(plateauStart), x0(n - 1));
  }

  // Sort + dedupe
  crosses.sort((a, b) => a - b);
  const epsAbs = Math.max(eps, (crosses[crosses.length - 1] - crosses[0]) * 1e-6 || eps);
  const unique = dedupeSorted(crosses, epsAbs);

  const lo = unique.length ? unique[0] : null;
  const hi = unique.length > 1 ? unique[unique.length - 1] : (unique.length === 1 ? unique[0] : null);

  return { points: unique, lo, hi };
}

/**
 * Pretty helper to render "Low | High" given one or two BEs and edge signs.
 * If there's only one BE, we decide whether to show "— | BE" or "BE | —"
 * based on the sign of y at the edges of the domain.
 */
export function formatBE(low, high, yLeft, yRight, fmt = (v) => String(v)) {
  const dash = "—";
  if (low == null && high == null) return dash;

  // If both defined and different -> "low | high"
  if (low != null && high != null && Math.abs(low - high) > 1e-9) {
    return `${fmt(low)} | ${fmt(high)}`;
  }

  // Single value case -> orient using profits at the edges
  const v = low ?? high;
  if (!Number.isFinite(yLeft) || !Number.isFinite(yRight)) return fmt(v);

  if (yLeft > 0 && yRight < 0) return `${dash} | ${fmt(v)}`; // profitable on the left
  if (yLeft < 0 && yRight > 0) return `${fmt(v)} | ${dash}`; // profitable on the right

  // Fallback: just show the value
  return fmt(v);
}

export default computeBreakevens;
