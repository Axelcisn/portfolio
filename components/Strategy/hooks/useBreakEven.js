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
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function clampQty(q) {
  const n = toNum(q);
  return Math.max(0, n == null ? 1 : n);
}

/* ------------ strategy alias handling (light) ------------ */
const STRAT_ALIASES = Object.freeze({
  // single legs
  longcall: "long_call",
  long_call: "long_call",
  shortcall: "short_call",
  short_call: "short_call",
  longput: "long_put",
  long_put: "long_put",
  shortput: "short_put",
  short_put: "short_put",

  // simple spreads
  bullcallspread: "bull_call_spread",
  bull_call_spread: "bull_call_spread",
  bearcallspread: "bear_call_spread",
  bear_call_spread: "bear_call_spread",
  bullputspread: "bull_put_spread",
  bull_put_spread: "bull_put_spread",
  bearputspread: "bear_put_spread",
  bear_put_spread: "bear_put_spread",

  // multi-leg
  longstraddle: "long_straddle",
  long_straddle: "long_straddle",
  shortstraddle: "short_straddle",
  short_straddle: "short_straddle",
  longstrangle: "long_strangle",
  long_strangle: "long_strangle",
  shortstrangle: "short_strangle",
  short_strangle: "short_strangle",
  ironcondor: "iron_condor",
  iron_condor: "iron_condor",
  ironbutterfly: "iron_butterfly",
  iron_butterfly: "iron_butterfly",
  callratio: "call_ratio",
  call_ratio: "call_ratio",
  putratio: "put_ratio",
  put_ratio: "put_ratio",
  collar: "collar",
  callcalendar: "call_calendar",
  call_calendar: "call_calendar",
  putcalendar: "put_calendar",
  put_calendar: "put_calendar",
  longbox: "long_box",
  long_box: "long_box",
  shortbox: "short_box",
  short_box: "short_box",
  leaps: "long_call",
});

function normalizeStrategyKey(x) {
  if (!x) return null;
  const s = String(x).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  return STRAT_ALIASES[s] ?? null;
}

/** Normalize a single leg to API shape. Returns null if unrecognized. */
function normalizeLeg(raw) {
  const typeIn = (raw?.type ?? raw?.kind ?? "").toLowerCase();
  const side   = String(raw?.side ?? "").toLowerCase();

  if (typeIn !== "call" && typeIn !== "put" && typeIn !== "stock") return null;

  const qty = clampQty(raw?.qty);

  if (typeIn === "stock") {
    const price = toNum(raw?.price ?? raw?.premium); // tolerate builder variance
    const leg = { type: "stock", side, qty };
    if (price != null) leg.price = price;
    return leg;
  }

  // options
  const strike = toNum(raw?.strike);
  const premium = toNum(raw?.premium);

  const leg = {
    type: typeIn,
    side,
    qty,
    strike: strike == null ? null : strike,
  };
  if (premium != null) leg.premium = premium;

  return leg;
}

/** Build the POST body sent to /api/strategy/breakeven (exported for tests). */
function buildPayload({ legs = [], spot = null, strategy, strategyKey, contractSize = 1 } = {}) {
  const sanitizedLegs = Array.isArray(legs)
    ? legs.map(normalizeLeg).filter(Boolean)
    : [];

  const normalizedStrategy = normalizeStrategyKey(strategy ?? strategyKey ?? null) || undefined;

  const body = {
    legs: sanitizedLegs,
    spot: toNum(spot),
    contractSize: toNum(contractSize) ?? 1,
  };
  if (normalizedStrategy) body.strategy = normalizedStrategy;

  return body;
}

export function useBreakEven({
  legs = [],
  spot = null,
  strategy: strategyIn = null,   // preferred
  strategyKey = null,            // back-compat
  contractSize = 1,
  debounceMs = 150,
} = {}) {
  const reqBody = useMemo(
    () => buildPayload({ legs, spot, strategy: strategyIn, strategyKey, contractSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stableKey(legs), spot, strategyIn, strategyKey, contractSize]
  );

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

// Test-only named export (safe to import in Jest)
export const __testOnly_buildPayload = buildPayload;
