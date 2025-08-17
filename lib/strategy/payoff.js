// lib/strategy/payoff.js
// Robust shim that prefers the central hub in lib/quant when present,
// and otherwise falls back to local implementations.

import quantDefault, * as hub from "../quant";

// Utility: pick a function from hub (named or default export), else fallback.
const pick = (name, fallback) => {
  const fromNamed = hub?.[name];
  const fromDefault = quantDefault?.[name];
  return typeof fromNamed === "function"
    ? fromNamed
    : typeof fromDefault === "function"
    ? fromDefault
    : fallback;
};

/* ---------------- Local fallbacks ---------------- */

function legIntrinsic(kind, S, K) {
  if (kind === "call") return Math.max(S - K, 0);
  if (kind === "put") return Math.max(K - S, 0);
  return 0;
}

/** Per-leg P/L at price S (qty already included in leg). */
function localLegPayoffAt(S, leg = {}) {
  const kind = leg?.kind;
  const side = leg?.side === "short" ? "short" : "long";
  const qty = Math.max(0, Number(leg?.qty) || 0);
  const K = Number(leg?.strike) || 0;
  const premium = Number(leg?.premium) || 0;

  if (kind === "stock") {
    // For stock, `premium` is the entry price (basis).
    return qty * (side === "long" ? S - premium : premium - S);
  }

  const intr = legIntrinsic(kind, S, K);
  return qty * (side === "long" ? intr - premium : premium - intr);
}

/** Strategy P/L at price S (bundle = { legs: [...] }). */
function localPayoffAt(S, bundle) {
  let y = 0;
  for (const leg of bundle?.legs || []) y += localLegPayoffAt(S, leg);
  return y;
}

/** Strikes where slope changes (coarse). */
function localBreakpoints(bundle) {
  const ks = new Set();
  for (const leg of bundle?.legs || []) {
    if (leg?.kind === "call" || leg?.kind === "put") {
      const K = Number(leg?.strike);
      if (Number.isFinite(K)) ks.add(K);
    }
  }
  return Array.from(ks).sort((a, b) => a - b);
}

/** Suggest plotting bounds. */
function localSuggestBounds(bundle, opts = {}) {
  const spot = Number(opts?.spot);
  const ks = localBreakpoints(bundle);
  const kMin = ks.length ? ks[0] : Number.isFinite(spot) ? spot : 100;
  const kMax = ks.length ? ks[ks.length - 1] : Number.isFinite(spot) ? spot : 100;

  let lo = Math.max(0.01, (Number.isFinite(spot) ? spot : kMin) * 0.5);
  let hi = (Number.isFinite(spot) ? spot : kMax) * 1.5;
  if (ks.length) {
    lo = Math.min(lo, kMin * 0.7);
    hi = Math.max(hi, kMax * 1.3);
  }
  if (!(hi > lo)) hi = lo + 1;
  return [lo, hi];
}

/** Find break-evens numerically over bounds via sign changes + interpolation. */
function localFindBreakEvens(bundle, opts = {}) {
  let bounds = opts;
  if (!Array.isArray(bounds)) bounds = opts?.bounds || localSuggestBounds(bundle, opts);
  const [lo, hi] = bounds;

  const N = Math.max(201, Number(opts?.samples) || 1201);
  const step = (hi - lo) / (N - 1);
  const xs = new Array(N);
  const ys = new Array(N);
  for (let i = 0; i < N; i++) {
    const S = lo + i * step;
    xs[i] = S;
    ys[i] = localPayoffAt(S, bundle);
  }

  const out = [];
  for (let i = 1; i < N; i++) {
    const y0 = ys[i - 1], y1 = ys[i];
    if ((y0 > 0 && y1 < 0) || (y0 < 0 && y1 > 0)) {
      const t = -y0 / (y1 - y0);
      out.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
  }
  // de-dupe close roots
  return Array.from(new Set(out.map((v) => +v.toFixed(6)))).sort((a, b) => a - b);
}

/* ---------------- Public API (prefer hub, else fallback) ---------------- */

export const legPayoffAt   = pick("legPayoffAt",   localLegPayoffAt);
export const payoffAt      = pick("payoffAt",      localPayoffAt);
export const breakpoints   = pick("breakpoints",   localBreakpoints);
export const suggestBounds = pick("suggestBounds", localSuggestBounds);
export const findBreakEvens = pick("findBreakEvens", localFindBreakEvens);

// Legacy default export shape
export default {
  payoffAt,
  legPayoffAt,
  breakpoints,
  suggestBounds,
  findBreakEvens,
};
