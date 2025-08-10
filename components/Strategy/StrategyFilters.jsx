// components/Strategy/StrategyFilters.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ---------- helpers ---------- */
function toggleSet(set, value) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
function useOutsideClose(ref, onClose) {
  useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [ref, onClose]);
}

/* ---------- main ---------- */
export default function StrategyFilters({
  // (search lives in the Strategy header popover)
  query,
  setQuery,
  sortBy,
  setSortBy,
  dirFilter,
  setDirFilter,
  kindFilter,
  setKindFilter,
}) {
  const [open, setOpen] = useState(null); // "dir" | "kind" | "sort" | null

  const sortLabels = {
    sharpe: "Sharpe",
    er: "E[Ret]",
    ep: "E[Prof]",
    pwin: "P[Win]",
    az: "A–Z",
  };

  const dirSummary = useMemo(() => {
    if (!dirFilter || dirFilter.size === 0) return "Direction";
    const a = [...dirFilter];
    return a.length <= 2 ? `Direction: ${a.join(", ")}` : `Direction: ${a.length} selected`;
  }, [dirFilter]);

  const kindSummary = useMemo(() => {
    if (!kindFilter || kindFilter.size === 0) return "Legs";
    const a = [...kindFilter].map((k) => (k === "Multi" ? "Multi‑leg" : "Single‑leg"));
    return a.length === 2 ? "Legs: Both" : `Legs: ${a[0]}`;
  }, [kindFilter]);

  const sortSummary = useMemo(() => `Sort: ${sortLabels[sortBy] || "A–Z"}`, [sortBy]);

  const clearAll = () => {
    setDirFilter(new Set());
    setKindFilter(new Set());
  };

  return (
    <section className="sg3-bar" role="region" aria-label="Strategy filters">
      {/* Category buttons — equal columns */}
      <FilterCategory
        id="dir"
        label={dirSummary}
        open={open === "dir"}
        onOpen={() => setOpen("dir")}
        onClose={() => setOpen(null)}
      >
        <MultiOptions
          options={["Bullish", "Neutral", "Bearish"]}
          selected={dirFilter}
          onToggle={(val) => setDirFilter(toggleSet(dirFilter, val))}
          showAll
          onAll={clearAll}
        />
      </FilterCategory>

      <FilterCategory
        id="kind"
        label={kindSummary}
        open={open === "kind"}
        onOpen={() => setOpen("kind")}
        onClose={() => setOpen(null)}
      >
        <MultiOptions
          options={["Single", "Multi"]}
          renderLabel={(v) => (v === "Multi" ? "Multi‑leg" : "Single‑leg")}
          selected={kindFilter}
          onToggle={(val) => setKindFilter(toggleSet(kindFilter, val))}
        />
      </FilterCategory>

      <FilterCategory
        id="sort"
        label={sortSummary}
        open={open === "sort"}
        onOpen={() => setOpen("sort")}
        onClose={() => setOpen(null)}
      >
        <SingleOptions
          value={sortBy}
          options={[
            { id: "sharpe", label: "Sharpe" },
            { id: "er", label: "E[Ret]" },
            { id: "ep", label: "E[Prof]" },
            { id: "pwin", label: "P[Win]" },
            { id: "az", label: "A–Z" },
          ]}
          onChange={(id) => setSortBy(id)}
          defaultId="az"
        />
      </FilterCategory>
    </section>
  );
}

/* ---------- Category shell (button + popover) ---------- */
function FilterCategory({ id, label, open, onOpen, onClose, children }) {
  const ref = useRef(null);
  useOutsideClose(ref, onClose);

  // gentle hover intent
  const hoverTimer = useRef(null);
  const onEnter = () => {
    clearTimeout(hoverTimer.current);
    onOpen();
  };
  const onLeave = () => {
    hoverTimer.current = setTimeout(onClose, 140);
  };

  return (
    <div
      className={`fcat ${open ? "open" : ""}`}
      ref={ref}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        type="button"
        className={`fbtn ${open ? "on" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={`pop-${id}`}
        onClick={() => (open ? onClose() : onOpen())}
      >
        <span className="fbtn-label">{label}</span>
        <svg className="fbtn-caret" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      </button>

      <div id={`pop-${id}`} className="fpop" role="menu" aria-label={`${label} options`}>
        {children}
      </div>
    </div>
  );
}

/* ---------- Multi-select options (Direction, Legs) ---------- */
function MultiOptions({ options, renderLabel, selected, onToggle, showAll = false, onAll }) {
  const lbl = (v) => (renderLabel ? renderLabel(v) : v);
  const isAll = selected?.size === 0;

  return (
    <div className="fpanel">
      <div className="fopts" role="group">
        {showAll && (
          <button
            type="button"
            role="menuitem"
            className={`fopt all ${isAll ? "on" : ""}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onAll?.()}
          >
            <span className="fopt-label">All</span>
          </button>
        )}

        {options.map((opt) => {
          const on = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              className={`fopt ${on ? "on" : ""}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onToggle(opt)}
            >
              <span className="fopt-check" aria-hidden="true" />
              <span className="fopt-label">{lbl(opt)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Single-select options (Sort) ---------- */
function SingleOptions({ value, options, onChange, defaultId }) {
  const current = value || defaultId;
  return (
    <div className="fpanel">
      <div className="fopts" role="group">
        {options.map((o) => {
          const on = current === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              className={`fopt ${on ? "on" : ""}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onChange(o.id)}
            >
              <span className="fopt-check" aria-hidden="true" />
              <span className="fopt-label">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
