"use client";

import React, { useMemo, useState, useCallback } from "react";
import StrategyTile from "./StrategyTile";
import StrategyModal from "./StrategyModal";

// Pull strategy catalog + new instantiator from the canonical module
import {
  getAllStrategies,
  getStrategyById,
  instantiateStrategy,
} from "./assignStrategy";

// Lightweight filter chips (All / Bullish / Neutral / Bearish)
const DIRS = ["All", "Bullish", "Neutral", "Bearish"];

export default function StrategyGallery({
  env,           // { spot, currency, sigma, T, riskFree, mcStats }
  onApply,       // (legsKeyed, netPremium, meta, extra?) => void
  query = "",    // optional initial query text
}) {
  const [dir, setDir] = useState("All");
  const [activeId, setActiveId] = useState(null);
  const [q, setQ] = useState(query ?? "");

  // Catalog (single source of truth)
  const strategies = useMemo(() => getAllStrategies() || [], []);

  // Filtered list
  const items = useMemo(() => {
    const text = (q || "").trim().toLowerCase();
    return strategies.filter((s) => {
      const passDir = dir === "All" ? true : (s.direction || "").toLowerCase() === dir.toLowerCase();
      const passText =
        !text ||
        (s.name || "").toLowerCase().includes(text) ||
        (s.id || "").toLowerCase().includes(text) ||
        (s.description || "").toLowerCase().includes(text);
      return passDir && passText && !s.disabled;
    });
  }, [strategies, dir, q]);

  // Quick-apply: instantiate + push to parent immediately
  const handleQuickApply = useCallback(
    (id) => {
      try {
        const inst = instantiateStrategy(id, {
          spot: env?.spot,
          sigma: env?.sigma,
          T: env?.T,
          riskFree: env?.riskFree,
          widthSteps: 1, // default width; can be exposed later
        });
        // Parent expects keyed legs and net premium; meta is useful for UI
        onApply?.(inst.legsKeyed, inst.netPremium, inst.meta, {
          id: inst.id,
          name: inst.name,
          rows: inst.rows,
        });
      } catch (err) {
        // Fail silent: keep UI responsive; editor path still available
        console.error("instantiateStrategy failed:", err);
      }
    },
    [env?.spot, env?.sigma, env?.T, env?.riskFree, onApply]
  );

  // Open editor (also instantiates first so chart updates instantly)
  const openEditor = useCallback(
    (id) => {
      handleQuickApply(id);      // instant chart update
      setActiveId(id);           // then open modal for fine tuning
    },
    [handleQuickApply]
  );

  const active = activeId ? getStrategyById(activeId) : null;

  return (
    <div className="sg-wrap">
      {/* Header: filters + search */}
      <div className="row between center" style={{ marginBottom: 12 }}>
        <div className="segmented">
          {DIRS.map((d) => (
            <button
              key={d}
              className={`chip ${dir === d ? "active" : ""}`}
              onClick={() => setDir(d)}
              aria-pressed={dir === d}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          className="field"
          placeholder="Search strategies…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 260 }}
          aria-label="Search strategies"
        />
      </div>

      {/* List */}
      <div className="strategy-list" role="list">
        {items.map((s) => (
          <div
            key={s.id}
            role="listitem"
            className="tile-row"
            // Single click → instant instantiate + chart update
            onClick={() => handleQuickApply(s.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleQuickApply(s.id);
              }
            }}
            tabIndex={0}
            aria-label={`${s.name} ${s.direction || ""}`.trim()}
          >
            <StrategyTile
              item={s}
              // Button inside tile → open editor (we also instantiate first)
              onOpen={() => openEditor(s.id)}
            />
          </div>
        ))}
      </div>

      {/* Modal editor (optional) */}
      {active && (
        <StrategyModal
          strategy={active}
          env={env}
          onApply={(legsObj, netPrem) => {
            onApply?.(legsObj, netPrem, { from: "modal" });
            setActiveId(null);
          }}
          onClose={() => setActiveId(null)}
        />
      )}

      <style jsx>{`
        .sg-wrap :global(.segmented .chip) { margin-right: 6px; }
        .strategy-list { max-height: 70vh; overflow: auto; padding-right: 6px; }
        .tile-row { outline: none; border-radius: 10px; }
        .tile-row:focus-visible { box-shadow: 0 0 0 2px var(--accent); }
      `}</style>
    </div>
  );
}
