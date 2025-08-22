// tests/api/company.route.spec.js
import { GET } from "../../app/api/company/route";
import { vi } from "vitest";

describe("company price from IB", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test("returns normalized price data", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      text: async () => JSON.stringify({
        ok: true,
        symbol: "AAPL",
        currency: "USD",
        price: 101,
        fields: { "83": "1" },
      }),
    }));
    const req = { nextUrl: new URL("http://localhost/api/company?symbol=AAPL") };
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.symbol).toBe("AAPL");
    expect(data.currency).toBe("USD");
    expect(data.spot).toBe(101);
    expect(data.prevClose).toBeCloseTo(100);
    expect(data.change).toBeCloseTo(1);
    expect(data.changePct).toBe(1);
  });

  test("handles upstream failure", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => JSON.stringify({ error: "bad" }),
    }));
    const req = { nextUrl: new URL("http://localhost/api/company?symbol=FAIL") };
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(502);
    expect(data.error).toBeDefined();
  });
});
