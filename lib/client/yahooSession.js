// lib/client/yahooSession.js
// Client helpers for the Yahoo session tools UI.

// Get current Yahoo session status.
export async function getYahooStatus() {
  try {
    const r = await fetch("/api/yahoo/status", { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(j?.error || `${r.status} ${r.statusText}`);
    // expected shape: { ok, hasCookie, hasCrumb, ageMs, lastError }
    return j;
  } catch (e) {
    return {
      ok: false,
      hasCookie: false,
      hasCrumb: false,
      ageMs: null,
      lastError: e?.message || "failed",
    };
  }
}

// Try to repair the Yahoo session (refresh cookie/crumb).
export async function repairYahoo() {
  async function call(method) {
    const r = await fetch("/api/yahoo/repair", { method, cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) throw new Error(j?.error || `${r.status} ${r.statusText}`);
    return j; // { ok, crumb: boolean, lastError }
  }
  // Prefer POST; fall back to GET if the route only supports GET.
  try {
    return await call("POST");
  } catch {
    return await call("GET");
  }
}

// Map status -> badge state used by the UI.
export function statusToBadge(s = {}) {
  if (!s.ok) return { state: "bad" }; // not valid
  const age = typeof s.ageMs === "number" ? s.ageMs : Infinity;
  // Warn if older than ~25 minutes (TTL is 30m server-side).
  if (age > 25 * 60 * 1000) return { state: "warn" };
  return { state: "ok" };
}
