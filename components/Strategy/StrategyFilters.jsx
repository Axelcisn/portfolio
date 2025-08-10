// components/Strategy/StrategyFilters.jsx
"use client";

function toggleSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

export default function StrategyFilters({
  query,
  setQuery,
  sortBy,
  setSortBy,
  dirFilter,
  setDirFilter,
  kindFilter,
  setKindFilter,
}) {
  const sortTabs = [
    { id: "sharpe", label: "Sharpe" },
    { id: "er", label: "E[Ret]" },
    { id: "ep", label: "E[Prof]" },
    { id: "pwin", label: "P[Win]" },
    { id: "az", label: "A–Z" },
  ];

  return (
    <section className="sg2-filters sg-filters" role="region" aria-label="Strategy filters">
      {/* Row 1: search + quick toggles */}
      <div className="sg2-row">
        <div className="searchbar">
          <svg className="search-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          <input
            className="field search-input"
            placeholder="Search strategies (e.g., Iron Condor, Straddle)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search strategies"
          />
        </div>

        <div className="seg seg-dir" role="group" aria-label="Direction">
          {["Bullish", "Neutral", "Bearish"].map((d) => (
            <button
              key={d}
              type="button"
              className={`seg-item ${dirFilter.has(d) ? "on" : ""}`}
              aria-pressed={dirFilter.has(d)}
              onClick={() => setDirFilter(toggleSet(dirFilter, d))}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="seg seg-kind" role="group" aria-label="Leg count">
          {["Single", "Multi"].map((k) => (
            <button
              key={k}
              type="button"
              className={`seg-item ${kindFilter.has(k) ? "on" : ""}`}
              aria-pressed={kindFilter.has(k)}
              onClick={() => setKindFilter(toggleSet(kindFilter, k))}
              title={k === "Multi" ? "Multi‑leg" : "Single‑leg"}
            >
              {k === "Multi" ? "Multi‑leg" : "Single‑leg"}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2: Sort segmented control */}
      <div className="sg2-row">
        <div className="seg seg-sort" role="tablist" aria-label="Sort by">
          {sortTabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={sortBy === t.id}
              className={`seg-item ${sortBy === t.id ? "on" : ""}`}
              onClick={() => setSortBy(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
