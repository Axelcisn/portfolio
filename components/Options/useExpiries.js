// components/Options/useExpiries.js
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ---------------- helpers ---------------- */

function pad2(n) { return String(n).padStart(2, "0"); }
function fromMsToISO(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (!Number.isFinite(d?.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Normalize to ISO YYYY-MM-DD from many possible inputs */
function toISO(v) {
  // number: treat as unix seconds/millis
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    return fromMsToISO(ms);
  }
  // Date
  if (v instanceof Date) return fromMsToISO(v.getTime());
  // object with common fields
  if (v && typeof v === "object") {
    return (
      toISO(v.date) ||
      toISO(v.expiry) ||
      toISO(v.expiration) ||
      toISO(v.expirationDate) ||
      toISO(v.iso)
    );
  }
  // string
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Dedup + sort */
function uniqSorted(list) {
  return Array.from(new Set(list.filter(Boolean))).sort();
}

/** Extract an array of date-ish values from many API shapes */
function extractDateArray(j) {
  const cands = [
    j?.expiries, j?.dates, j?.results, j?.list,
    j?.data?.expiries, j?.data?.dates, j?.data?.results, j?.data,
  ].filter(Array.isArray);
  if (cands.length) return cands[0];

  // Sometimes an object map like { "2025-01-17": {...}, ... }
  const map = j?.volumes || j?.data?.volumes || j?.byDate;
  if (map && typeof map === "object") return Object.keys(map);

  return [];
}

/**
 * useExpiries(symbol)
 * - Fetches /api/expiries and /api/expiries/volume (if available)
 * - Merges & filters by volume threshold (totalVol > minVol) when possible
 * - Race-safe; returns stable handlers
 */
export default function useExpiries(symbol, { minVol = 0.5 } = {}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const seqRef = useRef(0);           // guards latest refresh
  const abortRef = useRef(null);      // abort inflight

  const refresh = useCallback(async () => {
    const sym = String(symbol || "").trim();
    // cancel any inflight
    try { abortRef.current?.abort(); } catch {}
    const ac = new AbortController();
    abortRef.current = ac;

    const mySeq = ++seqRef.current;
    if (!sym) {
      setList([]); setError(null); return;
    }

    setLoading(true);
    setError(null);

    try {
      /* ---- base expiries ---- */
      const r1 = await fetch(`/api/expiries?symbol=${encodeURIComponent(sym)}`, { cache: "no-store", signal: ac.signal });
      const j1 = await r1.json().catch(() => ({}));
      const baseRaw = extractDateArray(j1);
      const base = baseRaw.map(toISO);

      /* ---- volume-backed additions (best-effort) ---- */
      let extra = [];
      try {
        const r2 = await fetch(`/api/expiries/volume?symbol=${encodeURIComponent(sym)}`, { cache: "no-store", signal: ac.signal });
        const j2 = await r2.json().catch(() => ({}));

        // Accept multiple shapes:
        // 1) { expiries: ["YYYY-MM-DD", ...] }
        const volExpList = Array.isArray(j2?.expiries) ? j2.expiries.map(toISO) : [];

        // 2) { items: [{ date, totalVol }] with threshold
        const items = Array.isArray(j2?.items) ? j2.items : Array.isArray(j2?.data) ? j2.data : [];
        const itemDates = items
          .filter((it) => Number(it?.totalVol) > minVol || it?.allow === true)
          .map((it) => toISO(it?.date ?? it?.iso ?? it?.expiry ?? it?.expirationDate));

        // 3) { volumes: { "YYYY-MM-DD": number } }
        const volsMap = j2?.volumes || j2?.data?.volumes || null;
        const mapDates = volsMap && typeof volsMap === "object"
          ? Object.entries(volsMap)
              .filter(([, v]) => Number(v) > minVol)
              .map(([k]) => toISO(k))
          : [];

        extra = uniqSorted([...(volExpList || []), ...(itemDates || []), ...(mapDates || [])]);
      } catch {
        // ignore volume endpoint errors
      }

      const merged = uniqSorted([...(base || []), ...(extra || [])]);

      // Guard stale responses
      if (seqRef.current !== mySeq) return;
      setList(merged);
    } catch (e) {
      if (seqRef.current !== mySeq) return;
      setList([]);
      setError(e?.message || "failed");
    } finally {
      if (seqRef.current === mySeq) setLoading(false);
    }
  }, [symbol, minVol]);

  // initial + on symbol change
  useEffect(() => { refresh(); }, [refresh]);

  // cleanup on unmount
  useEffect(() => () => { try { abortRef.current?.abort(); } catch {} }, []);

  return useMemo(() => ({ list, loading, error, refresh }), [list, loading, error, refresh]);
}
