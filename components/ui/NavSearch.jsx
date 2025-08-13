// components/ui/NavSearch.jsx
"use client";

import { useState, useCallback } from "react";
import TickerSearch from "../Strategy/TickerSearch";

/**
 * Compact search for the NavBar.
 * - Reuses TickerSearch (same debounce, API, a11y).
 * - Emits window event "app:ticker-picked" with { symbol, name, exchange }.
 * - Keep styles minimal + theme-aware (Apple-like pill).
 */
export default function NavSearch({
  placeholder = "Search by ticker or company…",
  onPick, // optional callback(it)
  width = 360, // desktop width; keep compact
}) {
  const [q, setQ] = useState("");

  const handlePick = useCallback(
    (it) => {
      try {
        window.dispatchEvent(
          new CustomEvent("app:ticker-picked", { detail: it })
        );
      } catch { /* no-op */ }
      onPick?.(it);
      setQ(it?.symbol || "");
    },
    [onPick]
  );

  return (
    <div className="navsearch" style={{ width }}>
      {/* We reuse the same search to keep behavior identical */}
      <TickerSearch
        value={q}
        onPick={handlePick}
        onEnter={(val) => {
          if (!val?.trim()) return;
          const it = { symbol: val.trim().toUpperCase() };
          handlePick(it);
        }}
        placeholder={placeholder}
      />

      <style jsx>{`
        .navsearch {
          position: relative;
          display: inline-block;
          /* Match your Apple-style pills */
          --bcol: var(--border, #e6e9ef);
          --bg: var(--card, #fff);
        }
        /* TickerSearch already renders the input; we keep the container quiet.
           No extra chrome here to avoid fighting its internal styles. */
      `}</style>
    </div>
  );
}
