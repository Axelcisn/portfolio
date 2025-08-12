// lib/providers/yahooSession.js
// Server-only Yahoo session wrapper (cookie + crumb) with 1x retry on auth errors.
// Usage:
//   import { yahooJson } from './yahooSession';
//   const data = await yahooJson('https://query2.finance.yahoo.com/v7/finance/options/AAPL');

const HOMEPAGE = "https://finance.yahoo.com/";
const CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb";

// Module-scoped cache (survives across invocations within the same runtime)
let _sess = {
  cookie: null,   // e.g. "A1=...; A3=...; B=...;"
  crumb: null,    // e.g. "v8y1x2..."
  ts: 0,          // epoch ms of last refresh
  lastError: null // last init error message (optional telemetry)
};

// Session TTL (Yahoo rotates cookies sometimes; keep it fresh)
const TTL_MS = 30 * 60 * 1000; // 30 minutes

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function isFresh() {
  return _sess.cookie && (Date.now() - _sess.ts) < TTL_MS;
}

function toCookieHeader(setCookieHeader) {
  const raw = String(setCookieHeader || "");
  if (!raw) return null;

  // Split multiple Set-Cookie headers, keep only the "name=value" part
  const pairs = raw
    .split(/,(?=[^;]+?=)/g)
    .map(s => s.split(";")[0].trim())
    .filter(Boolean);

  // Prefer A1/A3/B if present; otherwise send all pairs
  const wanted = [];
  for (const p of pairs) {
    const name = p.split("=")[0].trim().toUpperCase();
    if (name === "A1" || name === "A3" || name === "B") wanted.push(p);
  }
  const finalPairs = wanted.length ? wanted : pairs;
  return finalPairs.join("; ");
}

async function initSession() {
  try {
    // 1) Hit homepage to obtain cookies
    const r = await fetch(HOMEPAGE, {
      cache: "no-store",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" }
    });

    const setCookie = r.headers.get("set-cookie");
    const cookieHeader = toCookieHeader(setCookie);
    if (!cookieHeader) {
      throw new Error("No Set-Cookie from Yahoo homepage");
    }

    // 2) Use those cookies to request a crumb token
    let crumb = null;
    try {
      const rc = await fetch(CRUMB_URL, {
        cache: "no-store",
        headers: {
          "User-Agent": UA,
          Accept: "text/plain,*/*",
          Cookie: cookieHeader,
          Referer: HOMEPAGE
        }
      });
      if (rc.ok) {
        crumb = (await rc.text()).trim();
        if (!crumb) crumb = null;
      }
    } catch (e) {
      _sess.lastError = `crumb fetch failed: ${e?.message || "unknown"}`;
    }

    _sess = {
      cookie: cookieHeader,
      crumb,
      ts: Date.now(),
      lastError: null
    };
  } catch (err) {
    _sess = { cookie: null, crumb: null, ts: 0, lastError: err?.message || String(err) };
    throw err;
  }
}

async function ensureSession() {
  if (isFresh()) return;
  await initSession();
}

function withCrumb(url, crumb, addCrumb = true) {
  if (!addCrumb || !crumb) return url;
  const hasQ = url.includes("?");
  const sep = hasQ ? "&" : "?";
  if (/\bcrumb=/.test(url)) return url;
  return `${url}${sep}crumb=${encodeURIComponent(crumb)}`;
}

/**
 * Fetch JSON from Yahoo with session headers & optional crumb.
 * Retries once on 401/403/999 by refreshing the session.
 * @param {string} url - Full Yahoo endpoint URL
 * @param {{ addCrumb?: boolean, init?: RequestInit }} [opts]
 */
export async function yahooJson(url, opts = {}) {
  const { addCrumb = true, init = {} } = opts;

  await ensureSession();
  let finalUrl = withCrumb(url, _sess.crumb, addCrumb);

  const baseHeaders = {
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
    Cookie: _sess.cookie,
    Referer: HOMEPAGE
  };
  const doFetch = async (u) => {
    const r = await fetch(u, { cache: "no-store", ...init, headers: { ...baseHeaders, ...(init.headers || {}) } });
    return r;
  };

  // First attempt
  let res = await doFetch(finalUrl);

  // If auth-like failure, refresh session and retry once
  if ([401, 403, 999].includes(res.status)) {
    await initSession();
    finalUrl = withCrumb(url, _sess.crumb, addCrumb);
    res = await doFetch(finalUrl);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Yahoo ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 140)}` : ""}`);
  }
  return res.json();
}

/** Force-refresh the Yahoo session (for a "Repair Yahoo" button later). */
export async function resetYahooSession() {
  await initSession();
  return { ok: !!_sess.cookie, crumb: !!_sess.crumb, lastError: _sess.lastError || null };
}

/** Inspect current session status without touching it. */
export function getYahooSessionInfo() {
  return {
    ok: isFresh(),
    hasCookie: !!_sess.cookie,
    hasCrumb: !!_sess.crumb,
    ageMs: _sess.ts ? (Date.now() - _sess.ts) : null,
    lastError: _sess.lastError || null
  };
}
