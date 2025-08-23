// lib/useStrategyMemory.js
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEFAULTS = {
  tab: "overview",
  horizon: 30,
  ivSource: "live",
  ivValue: null,
  legsUi: null,
  netPremium: 0,
  expiry: null,
};

export default function useStrategyMemory(symbol) {
  const key = useMemo(() => (symbol ? `strategy:${symbol}` : null), [symbol]);
  const [data, setData] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const loadingRef = useRef(false);

  // load when symbol changes
  useEffect(() => {
    setLoaded(false);
    if (!key) { setData(DEFAULTS); return; }
    loadingRef.current = true;
    try {
      const raw = localStorage.getItem(key);
      const obj = raw ? JSON.parse(raw) : {};
      setData({ ...DEFAULTS, ...obj });
    } catch { setData(DEFAULTS); }
    loadingRef.current = false;
    setLoaded(true);
  }, [key]);

  // save patch
  const save = useCallback((patch) => {
    if (!key) return;
    setData(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  const clear = useCallback(() => {
    if (!key) return;
    try { localStorage.removeItem(key); } catch {}
    setData(DEFAULTS);
  }, [key]);

  return { data, loaded, save, clear, isLoading: loadingRef.current };
}
