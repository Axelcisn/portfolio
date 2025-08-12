// lib/client/yahooSession.js
// Lightweight client helpers for Yahoo session health + repair.
// Use from the browser (components) without changing existing UI.

// GET /api/yahoo/status -> { ok, session: { ok, hasCookie, hasCrumb, ageMs, lastError } }
export async function getYahooStatus() {
  try {
    const res = await fetch("/api/yahoo/status", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json?.ok === false) {
      throw new Error(json?.error || `${res.status} ${res.statusText}`);
    }
    return json.session || { ok: false };
  } catch (e) {
    return { ok: false, lastError: e?.message || "status failed" };
  }
}

// POST /api/yahoo/repair -> { ok, crumb: boolean, lastError }
export async function repairYahoo() {
  const res = await fetch("/api/yahoo/repair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `${res.status} ${res.statusText}`);
  }
  return json; // { ok, crumb, lastError }
}

/**
 * Optional helper to derive a simple UI state for a badge/button:
 * - state: "ok" | "warn" | "bad"
 *   - ok: session fresh & valid
 *   - warn: valid but old (>20min)
 *   - bad: not valid
 */
export function statusToBadge(session) {
  const s = session || {};
  const healthy = !!s.ok && !!s.hasCookie;
  const age = typeof s.ageMs === "number" ? s.ageMs : null;

  if (!healthy) return { state: "bad", healthy: false, ageMs: age };
  if (age != null && age > 20 * 60 * 1000) {
    return { state: "warn", healthy: true, ageMs: age };
  }
  return { state: "ok", healthy: true, ageMs: age };
}
