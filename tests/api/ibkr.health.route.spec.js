// tests/api/ibkr.health.route.spec.js
import { GET } from "../../app/api/ibkr/health/route";
import * as ibkr from "../../lib/services/ibkrService.js";
import { describe, test, expect, vi } from "vitest";

describe("ibkr health endpoint", () => {
  test("returns connection status", async () => {
    const spy = vi.spyOn(ibkr, "checkConnection").mockResolvedValue({ connected: true });
    const res = await GET();
    const data = JSON.parse(await res.text());
    expect(spy).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(data.connected).toBe(true);
    spy.mockRestore();
  });
});
