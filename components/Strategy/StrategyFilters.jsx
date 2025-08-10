// components/Strategy/StrategyFilters.jsx
"use client";

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
  const toggle = (set, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="sg-filters">
      <input
        className="field sg-search"
        placeholder="Search strategies (e.g., Iron Condor, Straddle)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search strategies"
      />

      <select
        className="field sg-sort"
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value)}
        aria-label="Sort strategies"
      >
        <option value="sharpe">Sharpe</option>
        <option value="er">E[Return]</option>
        <option value="ep">E[Profit]</option>
        <option value="pwin">P[Win]</option>
        <option value="az">A–Z</option>
      </select>

      <div className="sg-chips" role="group" aria-label="Direction filters">
        {["Bullish", "Bearish", "Neutral"].map((d) => (
          <button
            key={d}
            type="button"
            className={`chip ${dirFilter.has(d) ? "on" : ""}`}
            onClick={() => setDirFilter(toggle(dirFilter, d))}
          >
            {d}
          </button>
        ))}
      </div>

      <div className="sg-chips" role="group" aria-label="Leg count filters">
        {["Single", "Multi"].map((d) => (
          <button
            key={d}
            type="button"
            className={`chip ${kindFilter.has(d) ? "on" : ""}`}
            onClick={() => setKindFilter(toggle(kindFilter, d))}
          >
            {d === "Multi" ? "Multi‑leg" : "Single‑leg"}
          </button>
        ))}
      </div>
    </div>
  );
}
