// lib/server/mcache.js
// Minimal in-memory micro-cache (per server instance). Good for 10–120s TTLs.

const STORE = new Map();

/** Get cached value or null if missing/expired. */
export function mget(key) {
  const rec = STORE.get(key);
  if (!rec) return null;
  if (Date.now() > rec.exp) {
    STORE.delete(key);
    return null;
  }
  return rec.val;
}

/** Set cache value with TTL (ms). */
export function mset(key, val, ttlMs = 30000) {
  STORE.set(key, { val, exp: Date.now() + Math.max(1, ttlMs) });
}

/** Delete a cache key. */
export function mdel(key) {
  STORE.delete(key);
}

/** Simple helper for namespaced keys. */
export function mkey(...parts) {
  return parts.filter(Boolean).join(":");
}
