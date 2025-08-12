// lib/client/yahooAdmin.js
// Tiny client-side helpers to interact with our server Yahoo session endpoints.

async function jsonOrThrow(res) {
  let j = null;
  try { j = await res.json(); } catch {}
  if (!res.ok || j?.ok === false) {
    const msg = j?.error || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return j;
}

/** Get current Yahoo session status (cookie/crumb freshness, etc.) */
export async function getYahooStatus() {
  // cache: no-store so the UI always reflects the latest state
  const res = await fetch("/api/yahoo/session", { cache: "no-store" });
  return jsonOrThrow(res); // -> { ok, hasCookie, hasCrumb, ageMs, lastError }
}

/** Try to refresh cookie+crumb on the server. Returns the new status. */
export async function repairYahoo() {
  // Prefer POST; fall back to GET if needed.
  try {
    const res = await fetch("/api/yahoo/reset", { method: "POST" });
    return jsonOrThrow(res); // -> { ok, crumb: boolean, lastError }
  } catch {
    const res = await fetch("/api/yahoo/reset");
    return jsonOrThrow(res);
  }
}
