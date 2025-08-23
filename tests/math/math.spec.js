import { describe, test, expect } from "vitest";
import { d1 as d1Hub, d2 as d2Hub, bsCall, bsPut, normCdf, normPdf, lognCdf } from "lib/quant/index.js";
import { computeHistSigmaFromCloses } from "lib/volatility.js";
import { cleanSeries, ewmaSigmaAnnual, riskmetricsSigmaAnnual } from "lib/stats.js";

/* ---------- deterministic GBM simulator (from volatility.spec.js) ---------- */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
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

/* ---------- tests from bsGreeks.spec.js ---------- */
describe("Black–Scholes price & Greeks sanity", () => {
  const S = 100, K = 100, r = 0.05, q = 0, sigma = 0.2, T = 1;

  test("d1/d2 spot checks", () => {
    const _d1 = d1Hub(S, K, r, q, sigma, T);
    // Support either signature: d2(d1, sigma, T) or d2(S,K,r,q,sigma,T)
    const _d2 =
      typeof d2Hub === "function"
        ? (d2Hub.length >= 5 ? d2Hub(S, K, r, q, sigma, T) : d2Hub(_d1, sigma, T))
        : _d1 - sigma * Math.sqrt(T);

    expect(_d1).toBeCloseTo(0.35, 2);
    expect(_d2).toBeCloseTo(0.15, 2);
  });

  test("call/put prices vs references", () => {
    const c = bsCall(S, K, r, q, sigma, T);
    const p = bsPut(S, K, r, q, sigma, T);
    expect(c).toBeCloseTo(10.45, 2);
    expect(p).toBeCloseTo(5.57, 2);
  });

  test("delta sanity", () => {
    const _d1 = d1Hub(S, K, r, q, sigma, T);
    const dCall = Math.exp(-q * T) * normCdf(_d1);
    expect(dCall).toBeGreaterThan(0.6);
    expect(dCall).toBeLessThan(0.7);
  });
});

/* ---------- tests from lognormal.spec.js ---------- */
describe("Normal & Lognormal math", () => {
  test("normCdf basic values", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 6);
    expect(normCdf(1)).toBeCloseTo(0.841344746, 6);
    expect(normCdf(-1)).toBeCloseTo(0.158655254, 6);
  });

  test("normPdf at 0", () => {
    expect(normPdf(0)).toBeCloseTo(0.3989422804, 6);
  });

  test("lognCdf S_T at S0 under positive drift", () => {
    const S0 = 100, mu = 0.05, sigma = 0.2, T = 1;
    // P(S_T <= S0) = Φ( (ln(1) - (μ - 0.5σ²)T) / (σ√T) ) = Φ( -0.15 ) ≈ 0.4404
    const p = lognCdf(S0, { S0, mu, sigma, T });
    expect(p).toBeCloseTo(0.4404, 3);
  });

  test("lognCdf bounds", () => {
    const S0 = 100, mu = 0.05, sigma = 0.2, T = 1;
    expect(lognCdf(1e-9, { S0, mu, sigma, T })).toBeGreaterThanOrEqual(0);
    expect(lognCdf(1e9,  { S0, mu, sigma, T })).toBeLessThanOrEqual(1);
  });
});

/* ---------- tests from volatility.spec.js ---------- */
describe("Volatility", () => {
  test("computeHistSigmaFromCloses ~ recovers true annual sigma (±25%)", () => {
    const TRUE_SIGMA = 0.20; // 20% annual
    const closes = simulateGBM({ sigma: TRUE_SIGMA, days: 252 * 3, seed: 7 });
    const out = computeHistSigmaFromCloses(closes, 90); // 90d window
    expect(out && Number.isFinite(out.sigmaAnnual)).toBe(true);
    const est = out.sigmaAnnual;
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

