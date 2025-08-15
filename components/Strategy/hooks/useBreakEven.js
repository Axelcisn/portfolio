// components/Strategy/hooks/useBreakEven.js
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * useBreakEven
 * Call /api/strategy/breakeven with current legs and return be/meta.
 *
 * @param {Object}   params
 * @param {Array}    params.legs         Array of legs: { type|'kind': 'call'|'put'|'stock', side:'long'|'short', strike?, premium?, qty?, price? }
 * @param {number?}  params.spot         Optional spot (not used by BE formulas, but allowed)
 * @param {string?}  params.strategy     Strategy key (preferred). Back-compat: accepts strategyKey.
 * @param {number?}  params.contractSize Contract size (default 1)
 * @param {number?}  params.debounceMs   Debounce for rapid edits (default 150ms)
 *
 * @returns {{ be: number[]|null, meta: any, loading: boolean, error: string|null, refresh: Function }}
 */

// ---- very small in-memory cache (per tab) ---------------------------------
const CACHE = new Map();
const MAX_ENTRIES = 50;
function setCache(key, val) {
  if (CACHE.size >= MAX_ENTRIES) {
    const first = CACHE.keys().next().value;
    if (first !== undefined) CACHE.delete(first);
  }
  CACHE.set(key, { val, t: Date.now() });
}
function getCache(key) {
  const rec = CACHE.get(key);
  return rec ? rec.val : null;
}

function stableKey(obj) {
  // deterministic stringify for small payloads
  try {
    return JSON.stringify(obj, (_, v) =>
      v === undefined ? null : typeof v === "number" && !Number.isFinite(v) ? null : v
    );
  } catch {
    return String(Math.random());
  }
}

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function useBreakEven({
  legs = [],
  spot = null,
  strategy: strategyIn = null,   // preferred
  strategyKey = null,            // back-compat
  contractSize = 1,
  debounceMs = 150,
} = {}) {
  const strategy = strategyIn ?? strategyKey ?? null;

  const reqBody = useMemo(() => {
    const sanitizedLegs = Array.isArray(legs)
      ? legs.map((L) => {
          const type = L?.type ?? L?.kind ?? null; // accept either, send 'type'
          return {
            type: type, // API expects 'type'
            side: L?.side,
            strike: toNum(L?.strike),
            premium: toNum(L?.premium),
            qty: toNum(L?.qty) ?? 1,
            price: toNum(L?.price), // for stock legs, if present
          };
        })
      : [];

    return {
      legs: sanitizedLegs,
      spot: toNum(spot),
      strategy: strategy || undefined,   // API expects 'strategy'
      contractSize: toNum(contractSize) ?? 1,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stableKey(legs), spot, strategy, contractSize]);

  const key = useMemo(() => `be:${stableKey(reqBody)}`, [reqBody]);

  const [be, setBe] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const seqRef = useRef(0);

  const doFetch = async () => {
    // cache hit short-circuit
    const hit = getCache(key);
    if (hit) {
      setBe(Array.isArray(hit.be) ? hit.be : hit.be != null ? [hit.be] : null);
      setMeta(hit.meta ?? null);
      setError(null);
      setLoading(false);
      return;
    }

    // abort any in-flight
    try { abortRef.current?.abort(); } catch {}
    const ac = new AbortController();
    abortRef.current = ac;
    const mySeq = ++seqRef.current;

    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/strategy/breakeven", {
        method: "POST",
        cache: "no-store",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reqBody),
      });
      const j = await r.json().catch(() => ({}));
      if (ac.signal.aborted || mySeq !== seqRef.current) return;

      if (!r.ok || j?.ok === false) {
        setBe(null);
        setMeta(j?.meta || null);
        setError(j?.error || `HTTP ${r.status}`);
      } else {
        const beArr = Array.isArray(j?.be) ? j.be : j?.be != null ? [j.be] : null;
        setBe(beArr);
        setMeta(j?.meta || null);
        setError(null);
        setCache(key, { be: beArr, meta: j?.meta ?? null });
      }
    } catch (e) {
      if (!ac.signal.aborted) setError(String(e?.message || e));
    } finally {
      if (!ac.signal.aborted && mySeq === seqRef.current) setLoading(false);
    }
  };

  const refresh = () => doFetch();

  // fire with debounce
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(doFetch, Math.max(0, debounceMs | 0));
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // cleanup
  useEffect(() => {
    return () => {
      try { abortRef.current?.abort(); } catch {}
    };
  }, []);

  return { be, meta, loading, error, refresh };
}

export default useBreakEven;
