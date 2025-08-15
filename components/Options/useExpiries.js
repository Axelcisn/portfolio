// components/Options/useExpiries.js
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Normalize to ISO YYYY-MM-DD */
function toISO(v) {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Build a unique, sorted list */
function uniqSorted(list) {
  return Array.from(new Set(list.filter(Boolean))).sort();
}

/**
 * useExpiries(symbol)
 * - Fetches /api/expiries and /api/expiries/volume
 * - Applies the same totalVol > 0.5 filter used in Options
 * - Returns { list, loading, error, refresh }
 */
export default function useExpiries(symbol, { minVol = 0.5 } = {}) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!symbol) {
      setList([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Base expiries
      const r1 = await fetch(`/api/expiries?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
      const j1 = await r1.json();
      const base = (j1?.dates || j1?.data?.dates || j1?.data || []).map(toISO);

      // Volume-backed additions (optional)
      let extra = [];
      try {
        const r2 = await fetch(`/api/expiries/volume?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" });
        const j2 = await r2.json();
        const items = j2?.items || j2?.data || [];
        extra = items
          .filter((it) => Number(it?.totalVol) > minVol)
          .map((it) => toISO(it?.date));
      } catch {
        // ignore volume endpoint errors
      }

      setList(uniqSorted([...base, ...extra]));
    } catch (e) {
      setList([]);
      setError(e?.message || "failed");
    } finally {
      setLoading(false);
    }
  }, [symbol, minVol]);

  useEffect(() => { refresh(); }, [refresh]);

  return useMemo(() => ({ list, loading, error, refresh }), [list, loading, error, refresh]);
}
