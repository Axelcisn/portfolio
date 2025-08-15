// app/api/strategy/breakeven/_lib/__tests__/breakeven.spec.js

import { computeBreakEven } from "../breakeven.js";
import { normalizeStrategyKey } from "../aliases.js";
import { inferStrategy } from "../inferStrategy.js";

describe("aliases & inference", () => {
  test("normalizeStrategyKey handles variants", () => {
    expect(normalizeStrategyKey("ShortStraddle")).toBe("short_straddle");
    expect(normalizeStrategyKey("leaps")).toBe("long_call");
    expect(normalizeStrategyKey("bull-call-spread")).toBe("bull_call_spread");
  });

  test("infer verticals", () => {
    const legs = [
      { type: "call", side: "long",  strike: 100, premium: 5, qty: 1 },
      { type: "call", side: "short", strike: 110, premium: 2, qty: 1 },
    ];
    expect(inferStrategy(legs)).toBe("bull_call_spread");
  });

  test("infer short straddle vs strangle", () => {
    const straddle = [
      { type: "call", side: "short", strike: 100, premium: 4, qty: 1 },
      { type: "put",  side: "short", strike: 100, premium: 3, qty: 1 },
    ];
    expect(inferStrategy(straddle)).toBe("short_straddle");

    const strangle = [
      { type: "call", side: "short", strike: 105, premium: 2.5, qty: 1 },
      { type: "put",  side: "short", strike: 95,  premium: 2.2, qty: 1 },
    ];
    expect(inferStrategy(strangle)).toBe("short_strangle");
  });
});

describe("computeBreakEven core cases", () => {
  test("bull call spread (debit): BE = K_long + debit", () => {
    const legs = [
      { type: "call", side: "long",  strike: 100, premium: 5, qty: 1 },
      { type: "call", side: "short", strike: 110, premium: 2, qty: 1 },
    ];
    const { be, meta } = computeBreakEven(legs, "bull_call_spread");
    expect(be).toEqual([103]);
    expect(meta.used).toBe("bull_call_spread");
    expect(["explicit","inferred"]).toContain(meta.resolved_by);
  });

  test("short straddle: BE = K ± credit", () => {
    const legs = [
      { type: "call", side: "short", strike: 100, premium: 4, qty: 1 },
      { type: "put",  side: "short", strike: 100, premium: 3, qty: 1 },
    ];
    const { be } = computeBreakEven(legs, "short_straddle");
    expect(be).toEqual([93, 107]);
  });

  test("short strangle: BE = [K_put - credit, K_call + credit]", () => {
    const legs = [
      { type: "call", side: "short", strike: 105, premium: 2.5, qty: 1 },
      { type: "put",  side: "short", strike: 95,  premium: 2.5, qty: 1 },
    ];
    const { be } = computeBreakEven(legs, "short_strangle");
    expect(be).toEqual([92.5, 107.5]);
  });

  test("iron butterfly: midK ± netCredit", () => {
    const legs = [
      { type: "put",  side: "long",  strike: 95,  premium: 1.2, qty: 1 },
      { type: "put",  side: "short", strike: 100, premium: 3.2, qty: 1 },
      { type: "call", side: "short", strike: 100, premium: 3.3, qty: 1 },
      { type: "call", side: "long",  strike: 105, premium: 1.1, qty: 1 },
    ];
    const { be } = computeBreakEven(legs, "iron_butterfly");
    // net credit = 3.2+3.3 - 1.2 - 1.1 = 4.2
    expect(be).toEqual([95.8, 104.2]);
  });
});
