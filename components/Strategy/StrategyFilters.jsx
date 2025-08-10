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

  const isAll = dirFilter.size === 0 && kindFilter.size === 0;

  return (
    <section className="sg2-filters" role="region" aria-label="Strategy filters">
      {/* Row 1: All button + direction + leg kind */}
      <div className="sg2-row">
        <button
          type="button"
          className={`chip all ${isAll ? "on" : ""}`}
          aria-pressed={isAll}
          onClick={() => {
            setDirFilter(new Set());
            setKindFilter(new Set());
          }}
        >
          All
        </button>

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
