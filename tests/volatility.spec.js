// tests/volatility.spec.js
import { describe, test, expect } from "vitest";

import { computeHistSigmaFromCloses } from "../lib/volatility.js";
import {
  cleanSeries,
  ewmaSigmaAnnual,
  riskmetricsSigmaAnnual,
} from "../lib/stats.js";

/* ---------- deterministic GBM simulator ---------- */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function randn(prng) {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = prng();
  while (v === 0) v = prng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function simulateGBM({ S0 = 100, mu = 0.07, sigma = 0.2, days = 252 * 2, seed = 42 }) {
  const r = mulberry32(seed);
  const dt = 1 / 252;
  const closes = [S0];
  for (let i = 0; i < days; i++) {
    const z = randn(r);
    const next =
      closes[closes.length - 1] *
      Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z);
    closes.push(next);
  }
  return closes;
}

/* ---------- helpers ---------- */
function pctDiff(a, b) {
  return Math.abs(a - b) / Math.max(1e-12, (Math.abs(a) + Math.abs(b)) / 2);
}

/* ---------- tests ---------- */
describe("Volatility", () => {
  test("computeHistSigmaFromCloses ~ recovers true annual sigma (±25%)", () => {
    const TRUE_SIGMA = 0.20; // 20% annual
    const closes = simulateGBM({ sigma: TRUE_SIGMA, days: 252 * 3, seed: 7 });
    const out = computeHistSigmaFromCloses(closes, 90); // 90d window
    expect(out && Number.isFinite(out.sigmaAnnual)).toBe(true);
    const est = out.sigmaAnnual;
    // Allow sampling noise
    expect(pctDiff(est, TRUE_SIGMA)).toBeLessThanOrEqual(0.25);
  });

  test("EWMA vs RiskMetrics annualized σ are in the same ballpark", () => {
    const closes = simulateGBM({ sigma: 0.25, days: 252 * 2, seed: 1337 });
    const rets = [];
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const r = cleanSeries(rets);

    const sEWMA = ewmaSigmaAnnual(r, 0.94, 252);
    const sRM = riskmetricsSigmaAnnual(r, 0.94, 252);

    expect(Number.isFinite(sEWMA)).toBe(true);
    expect(Number.isFinite(sRM)).toBe(true);
    expect(pctDiff(sEWMA, sRM)).toBeLessThan(0.35);
  });

  test("Edge cases: empty / NaN series -> nulls", () => {
    const a = computeHistSigmaFromCloses([], 30);
    expect(a.sigmaAnnual).toBeNull();
    const b = computeHistSigmaFromCloses([null, undefined, NaN], 30);
    expect(b.sigmaAnnual).toBeNull();
  });
});