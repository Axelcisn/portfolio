// tests/strategy/breakeven.engine.spec.js
// Unit tests for the authoritative engine: lib/strategy/breakeven.js

import breakevenEngine from "lib/strategy/breakeven";
import { describe, it, expect } from "vitest";

const { computeBreakEvens } = breakevenEngine;

describe("Breakeven Engine (authoritative)", () => {
  it("exports default with computeBreakEvens()", () => {
    expect(typeof computeBreakEvens).toBe("function");
  });

  it("bull call spread (debit): BE = K_long + netDebit", () => {
    const legs = [
      { kind: "call", side: "long",  strike: 100, premium: 5, qty: 1 },
      { kind: "call", side: "short", strike: 110, premium: 2, qty: 1 },
    ];
    const { be, meta } = computeBreakEvens({ legs, strategy: "bull_call_spread" });
    expect(be).toEqual([103]);
    expect(meta?.method).toBeDefined();
  });

  it("short strangle (credit): BEs = [K_put - C, K_call + C] using total credit", () => {
    const legs = [
      { kind: "put",  side: "short", strike: 95,  premium: 3, qty: 1 },
      { kind: "call", side: "short", strike: 105, premium: 4, qty: 1 },
    ];
    // total credit = 3 + 4 = 7 → [88, 112]
    const { be, meta } = computeBreakEvens({ legs, strategy: "short_strangle" });
    expect(Array.isArray(be)).toBe(true);
    expect(be[0]).toBeCloseTo(88, 6);
    expect(be[1]).toBeCloseTo(112, 6);
    expect(meta?.strategy || meta?.used).toBeDefined();
  });

  it("iron butterfly: BE = Kshort ± netCredit", () => {
    const legs = [
      { kind: "put",  side: "long",  strike: 95,  premium: 1.2, qty: 1 },
      { kind: "put",  side: "short", strike: 100, premium: 3.2, qty: 1 },
      { kind: "call", side: "short", strike: 100, premium: 3.3, qty: 1 },
      { kind: "call", side: "long",  strike: 105, premium: 1.1, qty: 1 },
    ];
    // net credit = 3.2 + 3.3 − 1.2 − 1.1 = 4.2 → [95.8, 104.2]
    const { be } = computeBreakEvens({ legs, strategy: "iron_butterfly" });
    expect(be).toEqual([95.8, 104.2]);
  });

  it("falls back to numeric roots when closed-form isn't available", () => {
    // A slightly odd structure to force numeric search:
    const legs = [
      { kind: "call", side: "short", strike: 110, premium: 1.0, qty: 1 },
      { kind: "put",  side: "long",  strike: 90,  premium: 1.1, qty: 1 },
    ];
    const { be, meta } = computeBreakEvens({ legs });
    expect(meta?.method).toMatch(/numeric/i);
    // Could be 1 or 2 roots depending on payoffs; just ensure it's finite numbers when present
    if (be) {
      for (const x of be) expect(Number.isFinite(x)).toBe(true);
    }
  });
});