// tests/api/breakeven.route.spec.js
import { POST } from "../../app/api/strategy/breakeven/route";

async function post(payload) {
  const req = new Request("http://test.local/api/strategy/breakeven", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const res = await POST(req);
  const json = await res.json();
  return json;
}

describe("BE API smoke", () => {
  test("bull call spread — explicit", async () => {
    const j = await post({
      strategy: "bull_call_spread",
      legs: [
        { type: "call", side: "long",  strike: 100, premium: 5, qty: 1 },
        { type: "call", side: "short", strike: 110, premium: 2, qty: 1 },
      ],
    });
    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("bull_call_spread");
    expect(j.be).toEqual([103]);
    expect(["explicit", "inferred", "inferred_fallback"]).toContain(j.meta.resolved_by);
  });

  test("short straddle — explicit, matching strikes", async () => {
    const j = await post({
      strategy: "short_straddle",
      legs: [
        { type: "call", side: "short", strike: 100, premium: 4, qty: 1 },
        { type: "put",  side: "short", strike: 100, premium: 3, qty: 1 },
      ],
    });
    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("short_straddle");
    expect(j.be).toEqual([93, 107]);
  });

  test("short straddle — mismatched strikes → disambiguate to short_strangle", async () => {
    const j = await post({
      strategy: "short_straddle",
      legs: [
        { type: "call", side: "short", strike: 105, premium: 2.5, qty: 1 },
        { type: "put",  side: "short", strike: 95,  premium: 2.5, qty: 1 },
      ],
    });
    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("short_strangle"); // disambiguated
    expect(j.meta.disambiguated_from).toBe("short_straddle");
    expect(j.be).toEqual([92.5, 107.5]);
  });

  test("unsupported explicit → inference fallback", async () => {
    const j = await post({
      strategy: "some_unknown_name",
      legs: [
        { type: "call", side: "long",  strike: 100, premium: 5, qty: 1 },
        { type: "call", side: "short", strike: 110, premium: 2, qty: 1 },
      ],
    });
    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("bull_call_spread");
    expect(j.meta.resolved_by).toBe("inferred_fallback");
  });

  test("iron butterfly — explicit", async () => {
    const j = await post({
      strategy: "iron_butterfly",
      legs: [
        { type: "put",  side: "long",  strike: 95,  premium: 1.2, qty: 1 },
        { type: "put",  side: "short", strike: 100, premium: 3.2, qty: 1 },
        { type: "call", side: "short", strike: 100, premium: 3.3, qty: 1 },
        { type: "call", side: "long",  strike: 105, premium: 1.1, qty: 1 },
      ],
    });
    expect(j.ok).toBe(true);
    expect(j.strategy).toBe("iron_butterfly");
    expect(j.be).toEqual([95.8, 104.2]);
  });
});
