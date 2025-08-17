// tests/math/bsGreeks.spec.js
// Point tests at the centralized math hub.
import { d1 as d1Hub, d2 as d2Hub, bsCall, bsPut, normCdf } from "lib/quant/index.js";

describe("Black–Scholes price & Greeks sanity", () => {
  // Classic textbook case
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
    // Known values ~10.45 and ~5.57
    expect(c).toBeCloseTo(10.45, 2);
    expect(p).toBeCloseTo(5.57, 2);
  });

  test("delta sanity", () => {
    // Delta_call = e^{-qT} * Φ(d1)
    const _d1 = d1Hub(S, K, r, q, sigma, T);
    const dCall = Math.exp(-q * T) * normCdf(_d1);
    expect(dCall).toBeGreaterThan(0.6);
    expect(dCall).toBeLessThan(0.7);
  });
});
