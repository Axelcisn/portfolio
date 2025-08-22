// tests/api/company.route.spec.js
import { GET } from "../../app/api/company/route";
import { vi } from "vitest";

describe("company price from IB", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test("returns normalized price data", async () => {
    const responses = [
      {
        ok: true,
        text: async () =>
          JSON.stringify([
            { conid: "1", symbol: "AAPL", companyName: "Apple", exchange: "NASDAQ" },
          ]),
      },
      { ok: true, text: async () => JSON.stringify([{ currency: "USD" }]) },
      {
        ok: true,
        text: async () => JSON.stringify([{ "31": "101", "82": "100", "83": "1" }]),
      },
    ];
    global.fetch = vi.fn(async () => responses.shift());
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

  test("computes mid price from bid/ask when last is 0", async () => {
    const responses = [
      {
        ok: true,
        text: async () =>
          JSON.stringify([{ conid: "1", symbol: "AAPL", companyName: "Apple" }]),
      },
      { ok: true, text: async () => JSON.stringify([{ currency: "USD" }]) },
      {
        ok: true,
        text: async () =>
          JSON.stringify([{ "31": "", "84": "101", "86": "103", "82": "100", "83": "2" }]),
      },
    ];
    global.fetch = vi.fn(async () => responses.shift());
    const req = { nextUrl: new URL("http://localhost/api/company?symbol=AAPL") };
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.spot).toBe(102);
    expect(data.prevClose).toBeCloseTo(100);
    expect(data.change).toBeCloseTo(2);
    expect(data.changePct).toBe(2);
  });

  test("handles upstream failure", async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      text: async () => JSON.stringify({ error: "bad" }),
    }));
    const req = { nextUrl: new URL("http://localhost/api/company?symbol=FAIL") };
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.error).toBeDefined();
  });
});
