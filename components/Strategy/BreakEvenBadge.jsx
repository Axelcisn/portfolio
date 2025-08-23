// components/Strategy/BreakEvenBadge.jsx
"use client";

import { useMemo } from "react";
import useBreakEven from "./hooks/useBreakEven";
import { rowsToApiLegs } from "./utils";
import { fmtCur } from "../../lib/format";

export default function BreakEvenBadge({
  rows,
  strategy = null,     // explicit key when known; API can also infer if null
  currency = "USD",
  contractSize = 1,    // reserved; hook currently ignores but kept for future
}) {
  // Normalize builder rows -> API legs
  const legs = useMemo(() => rowsToApiLegs(rows || []), [rows]);

  // Centralized BE fetch (debounced + cached)
  const { be, loading, error } = useBreakEven({
    legs,
    strategyKey: strategy,  // pass as strategyKey to match the hook signature
    debounceMs: 150,
  });

  if (loading) return <span className="muted">—</span>;
  if (!Array.isArray(be) || be.length === 0 || error) {
    return <span className="err">Break-even unavailable for current legs.</span>;
  }

  const a = be[0], b = be[1];

  return (
    <span className="be-badge">
      {Number.isFinite(a) && !Number.isFinite(b) && fmtCur(a, currency)}
      {Number.isFinite(a) && Number.isFinite(b) &&
        `${fmtCur(a, currency)} | ${fmtCur(b, currency)}`}
      <style jsx>{`
        .be-badge { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
        .muted { color: var(--muted); }
        .err { color: #ef4444; font-weight: 600; white-space: nowrap; }
      `}</style>
    </span>
  );
}
