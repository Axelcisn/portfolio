// components/Strategy/BreakevenKpiCell.jsx
"use client";

import { useMemo } from "react";

// Try to consume whatever the lib exposes without hard-coupling a single name.
import * as be from "../../lib/strategy/breakeven.js";

// --- helpers ---------------------------------------------------------------
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

const isNum = (x) => Number.isFinite(Number(x));
const fmt = (v, ccy) =>
  isNum(v) ? `${moneySign(ccy)}${Number(v).toFixed(2)}` : "—";

// Some lib variants accept rows directly; others want simplified legs.
// Keep a light adapter in case the lib expects {lc,sc,lp,sp}.
function rowsToLegsObject(rows) {
  const out = {
    lc: { enabled: false, K: null, qty: 0, premium: null },
    sc: { enabled: false, K: null, qty: 0, premium: null },
    lp: { enabled: false, K: null, qty: 0, premium: null },
    sp: { enabled: false, K: null, qty: 0, premium: null },
  };
  for (const r of rows || []) {
    if (!r?.type || !(r.type in out)) continue;
    const K = Number(r.K);
    const qty = Number(r.qty || 0);
    const prem = Number.isFinite(Number(r.premium)) ? Number(r.premium) : null;
    out[r.type] = {
      enabled: qty !== 0 && Number.isFinite(K),
      K: Number.isFinite(K) ? K : null,
      qty,
      premium: prem,
    };
  }
  return out;
}

// Pick whichever function the lib exports
function pickLibFn() {
  return (
    be.computeBreakEvenFromRows ||
    be.computeBreakEven ||
    be.calcBreakEven ||
    be.breakEvenFromRows ||
    be.breakEven ||
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
  const result = useMemo(() => {
    const fn = pickLibFn();
    if (!rows || !rows.length) {
      return { kind: "empty" }; // show "—"
    }
    if (!fn) {
      return { kind: "unavailable", reason: "No break-even calculator found in lib." };
    }

    try {
      // Most implementations return either:
      //  - { be: [number, ...], meta?, error? }
      //  - [number, ...]
      //  - { value: [...], ... }
      const maybe = fn(rows, { allowApprox: true, tolerateMissing: true }) 
        ?? fn(rowsToLegsObject(rows), { allowApprox: true, tolerateMissing: true });

      const beArr =
        Array.isArray(maybe)
          ? maybe
          : Array.isArray(maybe?.be)
          ? maybe.be
          : Array.isArray(maybe?.value)
          ? maybe.value
          : null;

      if (maybe?.error) {
        return { kind: "error", reason: String(maybe.error) };
      }
      if (!beArr || beArr.length === 0 || !beArr.some(isNum)) {
        return { kind: "unavailable", reason: "Insufficient or incompatible legs." };
      }
      const clean = beArr.filter(isNum).slice(0, 2); // we only show up to two BEs in KPI
      return { kind: "ok", be: clean };
    } catch (e) {
      return { kind: "error", reason: String(e?.message || e) };
    }
  }, [rows]);

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
      </div>
    );
  }

  if (result.kind === "unavailable" || result.kind === "error") {
    // Explicit red message when unavailable
    return (
      <div className={`be-kpi ${className}`}>
        <span className="be-err">Break-even unavailable for current legs.</span>
      </div>
    );
  }

  // Empty → show "—" with a tooltip for clarity
  return (
    <div className={`be-kpi ${className}`}>
      <span className="muted" title="Add valid legs to compute break-even.">—</span>

      <style jsx>{`
        .be-kpi { min-width: 0; }
        .v {
          font-variant-numeric: tabular-nums;
          font-weight: 600;
          white-space: nowrap;
        }
        .sep { opacity: .55; padding: 0 4px; }
        .be-err {
          color: #ef4444;
          font-weight: 600;
          font-size: 0.95rem;
          white-space: nowrap;
        }
        .muted { color: var(--muted); }
      `}</style>
    </div>
  );
}
