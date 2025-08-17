// tests/api/breakeven.api.spec.js
import { POST } from "../../app/api/strategy/breakeven/route";

// Minimal helper to mimic a Next.js "Request" for POST
function makePost(body) {
  return {
    method: "POST",
    json: async () => body,
  };
}

describe("Breakeven API — smoke tests", () => {
  test("bull_call_spread (explicit) → BE = K_long + netDebit", async () => {
    const legs = [
      { type: "call", side: "long",  strike: 100, premium: 5 },
      { type: "call", side: "short", strike: 110, premium: 2 },
    ];

    const res = await POST(makePost({ strategy: "bull_call_spread", legs }));
    const j = await res.json();

    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("bull_call_spread");
    expect(Array.isArray(j.be)).toBe(true);
    expect(j.be).toHaveLength(1);
    // netDebit = 5 - 2 = 3 → BE = 100 + 3 = 103
    expect(j.be[0]).toBeCloseTo(103, 6);
    expect(j.meta?.resolved_by).toBe("explicit");
  });

  test("short_straddle (equal strikes) → stays straddle, BE = K ± netCredit", async () => {
    const legs = [
      { type: "call", side: "short", strike: 100, premium: 3 },
      { type: "put",  side: "short", strike: 100, premium: 4 },
    ];

    const res = await POST(makePost({ strategy: "short_straddle", legs }));
    const j = await res.json();

    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("short_straddle");
    // netCredit = 3 + 4 = 7 → 100 ± 7
    expect(Array.isArray(j.be) && j.be.length === 2).toBe(true);
    expect(j.be[0]).toBeCloseTo(93, 6);
    expect(j.be[1]).toBeCloseTo(107, 6);
    expect(j.meta?.resolved_by).toBe("explicit");
  });

  test("short_straddle (mismatched strikes) → disambiguates to short_strangle", async () => {
    const legs = [
      { type: "call", side: "short", strike: 105, premium: 3 },
      { type: "put",  side: "short", strike: 95,  premium: 4 },
    ];

    const res = await POST(makePost({ strategy: "short_straddle", legs }));
    const j = await res.json();

    expect(j.ok).toBe(true);
    // server disambiguates to short_strangle
    expect(j.strategy).toBe("short_strangle");
    // netCredit = 3 + 4 = 7 → [95 - 7, 105 + 7] = [88, 112]
    expect(Array.isArray(j.be) && j.be.length === 2).toBe(true);
    expect(j.be[0]).toBeCloseTo(88, 6);
    expect(j.be[1]).toBeCloseTo(112, 6);
    expect(j.meta?.resolved_by).toBe("explicit_disambiguated");
    expect(j.meta?.disambiguated_from).toBe("short_straddle");
  });

  test("iron_butterfly (explicit) → BE = Kshort ± netCredit", async () => {
    const legs = [
      { type: "put",  side: "long",  strike: 90,  premium: 2 },
      { type: "put",  side: "short", strike: 100, premium: 6 },
      { type: "call", side: "short", strike: 100, premium: 5 },
      { type: "call", side: "long",  strike: 110, premium: 2 },
    ];

    const res = await POST(makePost({ strategy: "iron_butterfly", legs }));
    const j = await res.json();

    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("iron_butterfly");
    // netCredit = (6+5) - (2+2) = 7 → 100 ± 7
    expect(Array.isArray(j.be) && j.be.length === 2).toBe(true);
    expect(j.be[0]).toBeCloseTo(93, 6);
    expect(j.be[1]).toBeCloseTo(107, 6);
    expect(j.meta?.resolved_by).toBe("explicit");
  });

  test("unsupported explicit key → infer from legs (bear_put_spread)", async () => {
    const legs = [
      { type: "put", side: "short", strike: 100, premium: 4 },
      { type: "put", side: "long",  strike: 110, premium: 8 },
    ];

    const res = await POST(makePost({ strategy: "some_weird_name", legs }));
    const j = await res.json();

    expect(j.ok).toBe(true);
    // debit: 8 - 4 = 4 → bear_put_spread BE = K_long - D = 110 - 4 = 106
    expect(j.strategy).toBe("bear_put_spread");
    expect(Array.isArray(j.be) && j.be.length === 1).toBe(true);
    expect(j.be[0]).toBeCloseTo(106, 6);
    expect(j.meta?.resolved_by).toBe("inferred_fallback");
  });
});