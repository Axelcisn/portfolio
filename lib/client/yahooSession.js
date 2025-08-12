// lib/client/yahooSession.js
// Browser helpers for the Yahoo session status & reset button.

async function parseJson(res) {
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.ok === false) {
    const msg = j?.error || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return j.data;
}

/** GET /api/yahoo/session — returns { ok, hasCookie, hasCrumb, ageMs, lastError } */
export async function getYahooStatus() {
  const res = await fetch("/api/yahoo/session", { cache: "no-store" });
  return parseJson(res);
}

/** POST /api/yahoo/session — force refresh cookie+crumb; returns same shape as GET */
export async function repairYahoo() {
  const res = await fetch("/api/yahoo/session", { method: "POST" });
  return parseJson(res);
}

/** Optional helpers the UI can use */
export function statusSeverity(s) {
  // 0 = good, 1 = warning (partial), 2 = bad/unknown
  if (!s) return 2;
  if (s.ok && s.hasCookie) return 0;
  if (s.hasCookie || s.hasCrumb) return 1;
  return 2;
}

export function formatAge(ms) {
  if (!Number.isFinite(ms)) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}
