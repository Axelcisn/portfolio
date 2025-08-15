// tests/math/bsGreeks.spec.js

import { d1, d2, bsPrice, bsGreek } from "../../components/Strategy/math/bsGreeks";

describe("Black–Scholes price & Greeks sanity", () => {
  // Classic textbook case
  const S = 100, K = 100, r = 0.05, q = 0, sigma = 0.2, T = 1;

  test("d1/d2 spot checks", () => {
    const _d1 = d1(S, K, r, q, sigma, T);
    const _d2 = d2(_d1, sigma, T);
    expect(_d1).toBeCloseTo(0.35, 2);
    expect(_d2).toBeCloseTo(0.15, 2);
  });

  test("call/put prices vs references", () => {
    const c = bsPrice({ S, K, r, q, sigma, T, type: "call" });
    const p = bsPrice({ S, K, r, q, sigma, T, type: "put" });
    // Known values ~10.45 and ~5.57
    expect(c).toBeCloseTo(10.45, 2);
    expect(p).toBeCloseTo(5.57, 2);
  });

  test("delta sanity", () => {
    const dCall = bsGreek({ which: "delta", S, K, r, q, sigma, T, type: "call" });
    expect(dCall).toBeGreaterThan(0.6);
    expect(dCall).toBeLessThan(0.7);
  });
});
