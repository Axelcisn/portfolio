// components/Strategy/BreakevenKpiCell.jsx
"use client";

import { useMemo } from "react";
import rowsToApiLegs from "./hooks/rowsToApiLegs.js";
import * as be from "../../lib/strategy/breakeven.js";

// --- helpers ---------------------------------------------------------------
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

const isNum = (x) => Number.isFinite(Number(x));
const fmt = (v, ccy) => (isNum(v) ? `${moneySign(ccy)}${Number(v).toFixed(2)}` : "—");

// Pick whichever function the lib exposes (robust to naming/export variants)
function pickLibFn() {
  return (
    be.computeBreakEvens ||
    be.default?.computeBreakEvens ||
    be.computeBreakEven ||
    be.default?.computeBreakEven ||
    be.calcBreakEven ||
    be.default?.calcBreakEven ||
    null
  );
}

/**
 * Props:
 *  - rows: PositionBuilder rows
 *  - currency: "USD" | "EUR" | ...
 *  - className: optional to blend with your KPI grid
 */
export default function BreakevenKpiCell({ rows, currency = "USD", className = "" }) {
  const legs = useMemo(() => rowsToApiLegs(rows), [rows]);

  const result = useMemo(() => {
    const fn = pickLibFn();
    if (!rows || !rows.length) return { kind: "empty" };
    if (!fn) return { kind: "unavailable", reason: "No break-even calculator found in lib." };

    try {
      // The lib accepts either legs[] or { legs }. We pass legs[].
      const out = fn(legs) ?? fn({ legs });

      // Normalize to an array of numbers
      const beArr = Array.isArray(out)
        ? out
        : Array.isArray(out?.be)
        ? out.be
        : Array.isArray(out?.value)
        ? out.value
        : null;

      if (!beArr || !beArr.some(isNum)) {
        return { kind: "unavailable", reason: "Insufficient or incompatible legs." };
      }

      const clean = beArr.filter(isNum).slice(0, 2);
      return { kind: "ok", be: clean };
    } catch (e) {
      return { kind: "error", reason: String(e?.message || e) };
    }
  }, [legs, rows]);

  if (result.kind === "ok") {
    const [a, b] = result.be;
    return (
      <div className={`be-kpi ${className}`}>
        {isNum(a) && !isNum(b) && <span className="v">{fmt(a, currency)}</span>}
        {isNum(a) && isNum(b) && (
          <span className="v">
            {fmt(a, currency)} <span className="sep">|</span> {fmt(b, currency)}
          </span>
        )}
        <style jsx>{`
          .be-kpi { min-width: 0; }
          .v { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
          .sep { opacity: .55; padding: 0 4px; }
        `}</style>
      </div>
    );
  }

  if (result.kind === "unavailable" || result.kind === "error") {
    return (
      <div className={`be-kpi ${className}`}>
        <span className="be-err">Break-even unavailable for current legs.</span>
        <style jsx>{`
          .be-err { color: #ef4444; font-weight: 600; font-size: 0.95rem; white-space: nowrap; }
        `}</style>
      </div>
    );
  }

  // Empty → show "—"
  return (
    <div className={`be-kpi ${className}`}>
      <span className="muted" title="Add valid legs to compute break-even.">—</span>
      <style jsx>{`.muted { color: var(--muted); }`}</style>
    </div>
  );
}
