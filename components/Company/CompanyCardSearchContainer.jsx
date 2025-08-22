// components/Company/CompanyCardSearchContainer.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CompanySearchBox from "./CompanySearchBox";
// ⬇️ If your file name/path differs, adjust this import and tell me.
// Assumption: your Company Card accepts `symbol` (and handles its own fetch/paint).
import CompanyCard from "./CompanyCard";

export default function CompanyCardSearchContainer({
  initialSymbol = "",   // optional seed (e.g., from route)
  className = "",
}) {
  // Restore last symbol (desktop flow)
  const last = useMemo(() => {
    if (typeof window === "undefined") return "";
    try { return localStorage.getItem("company.lastSymbol") || ""; }
    catch { return ""; }
  }, []);

  const [symbol, setSymbol] = useState(initialSymbol || last);
  const [searchQuery, setSearchQuery] = useState(initialSymbol || last);
  const [prefetching, setPrefetching] = useState(false);

  // Persist on change
  useEffect(() => {
    if (!symbol) return;
    try { localStorage.setItem("company.lastSymbol", symbol); } catch {}
  }, [symbol]);

  // When a company is picked from the search sheet
  const handlePick = useCallback((res) => {
    const next = String(res?.symbol || "").trim().toUpperCase();
    if (!next) return;
    setSymbol(next);
    setSearchQuery(next); // Keep search box in sync
  }, []);

  // --- Prefetch company → expiries → closest options (silent, best-effort) ---
  useEffect(() => {
    let ac = new AbortController();
    const doPrefetch = async () => {
      if (!symbol) return;
      setPrefetching(true);
      try {
        // 1) Warm company endpoint
        await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store", signal: ac.signal }).catch(() => {});

        // 2) Warm expiries
        const expRes = await fetch(`/api/expiries?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store", signal: ac.signal }).catch(() => null);
        const expJson = await (expRes?.json?.() ?? Promise.resolve(null)).catch(() => null);
        const dates = Array.isArray(expJson?.expiries) ? expJson.expiries : [];

        // 3) Warm the nearest (ATM-ish) options date if available
        if (dates.length) {
          // choose the earliest upcoming date (simple heuristic for speed)
          const today = new Date().toISOString().slice(0,10);
          const sorted = dates.slice().sort((a,b) => (a < b ? -1 : a > b ? 1 : 0));
          const pick = sorted.find(d => d >= today) || sorted[0];
          await fetch(
            `/api/options?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(pick)}`,
            { cache: "no-store", signal: ac.signal }
          ).catch(() => {});
        }
      } finally {
        if (!ac.signal.aborted) setPrefetching(false);
      }
    };
    doPrefetch();
    return () => { ac.abort(); };
  }, [symbol]);

  return (
    <section className={`cc-wrap ${className}`}>
      {/* Search bar (desktop) */}
      <div className="cc-bar">
        <CompanySearchBox
          placeholder="Search company or ticker"
          defaultQuery={searchQuery}
          onPick={handlePick}
        />
        {/* Subtle activity dot while background prefetching, non-blocking */}
        <span className={`pref ${prefetching ? "is-on" : ""}`} aria-hidden="true" />
      </div>

      {/* Your existing company card — unchanged */}
      <div className="cc-card">
        <CompanyCard symbol={symbol} />
      </div>

      <style jsx>{`
        .cc-wrap{ width:100%; }
        .cc-bar{
          display:flex; align-items:center; gap:10px;
          margin: 6px 0 10px;
        }
        .pref{
          width:8px; height:8px; border-radius:999px; flex:0 0 auto;
          background: color-mix(in srgb, var(--text) 25%, var(--card));
          opacity: 0; transition: opacity .18s ease, background .18s ease;
        }
        .pref.is-on{
          opacity: .9;
          background: color-mix(in srgb, var(--accent, #3b82f6) 70%, var(--card));
        }
        .cc-card{
          /* Keep your current Card layout untouched; wrapper only provides spacing. */
        }
      `}</style>
    </section>
  );
}
