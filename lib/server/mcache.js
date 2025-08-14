// lib/server/mcache.js
// Lightweight, Vercel-safe micro-cache with TTL.
// Backward compatible with the original API: mget, mset, mdel, mkey.
//
// Notes:
// • In-memory per server instance. Suitable for short TTLs (10–120s).
// • Values are stored as-is; caller owns immutability.
// • Added helpers: mclear, mstats, stableStringify, keyFromUrl, createCache.

const TTL_DEFAULT_MS = 30_000; // default TTL for mset when none provided
const STORE = new Map();

function now() {
  return Date.now();
}

/** Get cached value or null if missing/expired. */
export function mget(key) {
  const rec = STORE.get(key);
  if (!rec) return null;
  if (now() > rec.exp) {
    STORE.delete(key);
    return null;
  }
  return rec.val;
}

/** Set cache value with TTL (ms). Returns the stored value. */
export function mset(key, val, ttlMs = TTL_DEFAULT_MS) {
  const ttl = Math.max(1, Number(ttlMs) || TTL_DEFAULT_MS);
  STORE.set(key, { val, exp: now() + ttl, t: now() });
  return val;
}

/** Delete a cache key. */
export function mdel(key) {
  STORE.delete(key);
}

/** Clear all cache entries. */
export function mclear() {
  STORE.clear();
}

/** Simple helper for namespaced keys. */
export function mkey(...parts) {
  return parts.filter(Boolean).join(':');
}

/** Basic stats for observability/debugging. */
export function mstats() {
  let earliest = null;
  for (const [, rec] of STORE) {
    if (earliest === null || rec.exp < earliest) earliest = rec.exp;
  }
  return {
    size: STORE.size,
    earliestExpiry: earliest ? new Date(earliest).toISOString() : null,
    defaultTtlMs: TTL_DEFAULT_MS,
  };
}

/** Deterministic stringify for building stable cache keys from objects. */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return String(value);

  const seen = new WeakSet();
  const helper = (v) => {
    if (v === null) return 'null';
    const t = typeof v;
    if (t === 'number' || t === 'boolean') return JSON.stringify(v);
    if (t === 'string') return JSON.stringify(v);
    if (t === 'bigint') return `"${v.toString()}"`;
    if (t === 'function' || t === 'symbol' || t === 'undefined') return 'null';

    if (seen.has(v)) return '"[Circular]"';
    seen.add(v);

    if (Array.isArray(v)) return `[${v.map(helper).join(',')}]`;

    const keys = Object.keys(v).sort();
    const body = keys.map((k) => `${JSON.stringify(k)}:${helper(v[k])}`).join(',');
    return `{${body}}`;
  };
  return helper(value);
}

/** Build a stable cache key from a Request URL (path + sorted query). */
export function keyFromUrl(url) {
  try {
    const u = new URL(url, 'http://local'); // base for relative paths
    const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b));
    const q = entries.map(([k, v]) => `${k}=${v}`).join('&');
    return `${u.pathname}?${q}`;
  } catch {
    return String(url || '');
  }
}

/** Create an isolated TTL cache instance (for route-local caches). */
export function createCache({ ttlMs = 60_000, maxSize = 500 } = {}) {
  const store = new Map();

  function purgeExpired() {
    const t = now();
    for (const [k, rec] of store) if (rec.exp <= t) store.delete(k);
  }

  function evictIfNeeded() {
    while (store.size > maxSize) {
      const firstKey = store.keys().next().value;
      if (firstKey === undefined) break;
      store.delete(firstKey);
    }
  }

  return {
    get(key) {
      purgeExpired();
      const rec = store.get(key);
      if (!rec || rec.exp <= now()) {
        store.delete(key);
        return undefined;
      }
      return rec.val;
    },
    set(key, val, customTtlMs) {
      const ttl = Number.isFinite(customTtlMs) ? Math.max(1, customTtlMs) : ttlMs;
      store.set(key, { val, exp: now() + ttl, t: now() });
      evictIfNeeded();
      return val;
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    stats() {
      purgeExpired();
      let earliest = null;
      for (const [, rec] of store) {
        if (earliest === null || rec.exp < earliest) earliest = rec.exp;
      }
      return {
        size: store.size,
        earliestExpiry: earliest ? new Date(earliest).toISOString() : null,
        ttlMs,
        maxSize,
      };
    },
  };
}
