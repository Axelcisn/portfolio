/**
 * lib/providers/ibBridge.js
 * Simple, robust client for the local IB Bridge (http://127.0.0.1:5055).
 * - Adds x-ib-bridge-token automatically (from localStorage or NEXT_PUBLIC env).
 * - Timeouts via AbortController.
 * - All requests use CORS mode and no-store cache.
 */

const ORIGIN = 'http://127.0.0.1:5055';
const TOKEN_HEADER = 'x-ib-bridge-token';
const TOKEN_KEY = 'X_IB_BRIDGE_TOKEN';

/** Persist the token in browser storage (one-time setup in your browser console). */
export function setIbBridgeToken(token) {
  try {
    if (typeof window !== 'undefined') localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

/** Resolve the token from localStorage (browser) or NEXT_PUBLIC env (SSR fallback). */
export function getIbBridgeToken() {
  if (typeof window !== 'undefined') {
    try {
      const t = window.localStorage.getItem(TOKEN_KEY);
      if (t) return t;
    } catch {}
  }
  return process.env.NEXT_PUBLIC_IB_BRIDGE_TOKEN || '';
}

/** Build a bridge URL with query params. */
export function makeIBUrl(path, params = {}) {
  const url = new URL(path, ORIGIN);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v).length) url.searchParams.set(k, String(v));
  });
  return url.toString();
}

/** AbortController-based timeout guard. */
function withTimeout(ms = 5000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(new Error(`Timeout ${ms}ms`)), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

/** GET helper: inject token, set CORS, disable caching, enforce timeout. */
export async function ibGet(path, { params = {}, timeoutMs = 5000 } = {}) {
  const token = getIbBridgeToken();
  if (!token) throw new Error('IB bridge token is missing. Call setIbBridgeToken(...) first.');

  const url = makeIBUrl(path, params);
  const { signal, cancel } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      headers: {
        [TOKEN_HEADER]: token,
        'accept': 'application/json',
      },
      signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`IB bridge error ${res.status}: ${text || res.statusText}`);
    }
    return await res.json();
  } finally {
    cancel();
  }
}

/** Convenience probes (used in smoke tests / future features). */
export async function ibHealth()      { return ibGet('/v1/health'); }
export async function ibDiagnostics() { return ibGet('/v1/diagnostics'); }
