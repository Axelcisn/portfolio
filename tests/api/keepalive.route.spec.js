// tests/api/keepalive.route.spec.js
import { GET } from "../../app/keepalive/route";
import { vi } from "vitest";

describe("keepalive status", () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  test("reports awake when IB proxy responds", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, up: true }),
    }));
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text).toMatch(/awake/);
  });

  test("reports asleep on error", async () => {
    global.fetch = vi.fn(async () => { throw new Error("fail"); });
    const res = await GET();
    const text = await res.text();
    expect(res.status).toBe(503);
    expect(text).toMatch(/asleep/);
  });
});
