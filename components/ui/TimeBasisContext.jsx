// components/ui/TimeBasisContext.jsx
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const KEY = "timeBasis.v1"; // 365 | 252

const Ctx = createContext({
  basis: 365,
  setBasis: (_b) => {},
  isCalendar: true,
  isTrading: false,
});

/** Provider to share time basis across the app (desktop-first). */
export function TimeBasisProvider({ children }) {
  const [basis, setBasisState] = useState(365); // default calendar

  // Load once on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const n = Number(raw);
      if (n === 252 || n === 365) setBasisState(n);
    } catch { /* ignore */ }
  }, []);

  // Persist + broadcast on change
  useEffect(() => {
    try {
      localStorage.setItem(KEY, String(basis));
    } catch { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent("app:time-basis", { detail: { basis } }));
    } catch { /* ignore */ }
  }, [basis]);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) {
        const n = Number(e.newValue);
        if ((n === 252 || n === 365) && n !== basis) setBasisState(n);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [basis]);

  const api = useMemo(
    () => ({
      basis,
      setBasis: (b) => {
        const n = Number(b);
        if (n === 252 || n === 365) setBasisState(n);
      },
      isCalendar: basis === 365,
      isTrading: basis === 252,
    }),
    [basis]
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/** Hook to read/update the global time basis (365 | 252). */
export function useTimeBasis() {
  return useContext(Ctx);
}
