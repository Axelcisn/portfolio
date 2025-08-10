// components/Strategy/StrategyGallery.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StrategyFilters from "./StrategyFilters";
import StrategyTile from "./StrategyTile";
import StrategyModal from "./StrategyModal";
import { ALL_STRATEGIES } from "./icons";

/**
 * Props:
 *  - spot, currency, sigma, T, riskFree, mcStats
 *  - onApply(legsObj, netPremium)
 */
export default function StrategyGallery({
  spot = null,
  currency = "EUR",
  sigma = null,
  T = null,
  riskFree = 0,
  mcStats = null,
  onApply,
}) {
  // filters
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("az"); // sharpe|er|ep|pwin|az
  const [dirFilter, setDirFilter] = useState(new Set());   // Bullish/Bearish/Neutral
  const [kindFilter, setKindFilter] = useState(new Set()); // Single/Multi
  const [active, setActive] = useState(null);              // selected Strategy (opens modal)

  // header search popover
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && setSearchOpen(false);
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 0);
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = ALL_STRATEGIES.filter((s) => {
      const passQ = !q || s.name.toLowerCase().includes(q) || s.id.includes(q);
      const passDir = dirFilter.size === 0 || dirFilter.has(s.direction);
      const passKind =
        kindFilter.size === 0 ||
        (kindFilter.has("Single") && !s.isMulti) ||
        (kindFilter.has("Multi") && s.isMulti);
      return passQ && passDir && passKind && !s.disabled;
    });

    const safe = (x) => (Number.isFinite(x) ? x : -Infinity);
    switch (sortBy) {
      case "sharpe":
        rows.sort((a, b) => safe(b.metrics?.sharpe) - safe(a.metrics?.sharpe));
        break;
      case "er":
        rows.sort(
          (a, b) =>
            safe(b.metrics?.expectedReturn) - safe(a.metrics?.expectedReturn)
        );
        break;
      case "ep":
        rows.sort(
          (a, b) =>
            safe(b.metrics?.expectedProfit) - safe(a.metrics?.expectedProfit)
        );
        break;
      case "pwin":
        rows.sort((a, b) => safe(b.metrics?.pWin) - safe(a.metrics?.pWin));
        break;
      default:
        rows.sort((a, b) => a.name.localeCompare(b.name));
    }
    return rows;
  }, [query, sortBy, dirFilter, kindFilter]);

  return (
    <section className="card sg-card">
      {/* Header: title left, search icon right (aligned to card edges) */}
      <div className="sg-header">
        <h3 className="sg-title">Strategy</h3>
        <button
          type="button"
          className="icon-btn sg-search-btn"
          aria-label="Search strategies"
          onClick={() => setSearchOpen((v) => !v)}
        >
          <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Lightweight popover search (shares the same query state) */}
        {searchOpen && (
          <div className="sg-search-pop" role="dialog" aria-label="Search strategies">
            <input
              ref={searchRef}
              className="field search-input"
              placeholder="Search strategies…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Filters row (now begins with an 'All' button) */}
      <StrategyFilters
        query={query}
        setQuery={setQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        dirFilter={dirFilter}
        setDirFilter={setDirFilter}
        kindFilter={kindFilter}
        setKindFilter={setKindFilter}
      />

      {/* Grid of strategies */}
      <div className="sg-grid">
        {filtered.map((s) => (
          <StrategyTile key={s.id} item={s} onOpen={() => setActive(s)} />
        ))}
      </div>

      {active && (
        <StrategyModal
          strategy={active}
          onClose={() => setActive(null)}
          onApply={(legsObj, netPrem) => {
            onApply?.(legsObj, netPrem);
            setActive(null);
          }}
          env={{ spot, currency, sigma, T, riskFree, mcStats }}
        />
      )}
    </section>
  );
}
