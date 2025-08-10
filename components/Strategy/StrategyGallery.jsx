// components/Strategy/StrategyGallery.jsx
"use client";

import { useMemo, useState } from "react";
import StrategyFilters from "./StrategyFilters";
import StrategyTile from "./StrategyTile";
import StrategyModal from "./StrategyModal";
import { ALL_STRATEGIES } from "./icons";

/**
 * Props:
 *  - spot, currency, sigma, T, riskFree, mcStats
 *  - onApply(legsObj, netPremium) -> writes into app state (replaces old Legs)
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
      <div className="row sg-header">
        <h3 className="sg-title">Strategy</h3>
      </div>

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
