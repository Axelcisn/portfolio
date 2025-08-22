// tests/api/ibkr.basic.route.spec.js
import { GET } from "../../app/api/ibkr/basic/route";
import { vi } from "vitest";

describe("ibkr basic endpoint", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test("falls back to next candidate when first lacks price", async () => {
    const responses = [
      // search results with two candidates
      {
        ok: true,
        text: async () =>
          JSON.stringify([
            { conid: "1", sections: [{ secType: "STK" }], companyName: "Foo" },
            { conid: "2", sections: [{ secType: "STK" }], companyName: "Foo" },
          ]),
      },
      // secdef/info for conid 1
      { ok: true, text: async () => JSON.stringify([{ currency: "EUR" }]) },
      // snapshot for conid 1 (no price)
      { ok: true, text: async () => JSON.stringify([{ "31": "" }]) },
      // secdef/info for conid 2
      { ok: true, text: async () => JSON.stringify([{ currency: "USD" }]) },
      // snapshot for conid 2 (has price)
      {
        ok: true,
        text: async () =>
          JSON.stringify([{ "31": "150", "83": "1" }]),
      },
    ];
    global.fetch = vi.fn(async () => responses.shift());
    const req = { nextUrl: new URL("http://localhost/api/ibkr/basic?symbol=FOO") };
    const res = await GET(req);
    const data = JSON.parse(await res.text());
    expect(res.status).toBe(200);
    expect(data.price).toBe(150);
    expect(data.currency).toBe("USD");
  });
});
