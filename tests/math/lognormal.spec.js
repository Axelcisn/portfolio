// tests/math/lognormal.spec.js
// Point tests at the centralized math hub.
import { normCdf, normPdf, lognCdf } from "lib/quant/index.js";

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
