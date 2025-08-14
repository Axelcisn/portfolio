// components/Strategy/BreakEvenKpiCell.jsx
"use client";

import { useMemo } from "react";
import { computeBreakEvens } from "../../lib/strategy/breakeven.js";

const isNum = (x) => Number.isFinite(x);

/* Convert Builder rows -> normalized legs for the BE engine */
function rowsToLegs(rows) {
  const out = [];
  for (const r of rows || []) {
    if (!r?.enabled) continue;

    const K = Number(r.K);
    const qty = Math.abs(Number(r.qty || 0));
    const prem = Number.isFinite(Number(r.premium)) ? Number(r.premium) : 0;

    if (!qty) continue;

    if (r.type === "lc" || r.type === "sc" || r.type === "lp" || r.type === "sp") {
      if (!isNum(K)) continue;
      const kind = r.type[1] === "c" ? "call" : "put";
      const side = r.type[0] === "l" ? "long" : "short";
      out.push({ kind, side, strike: K, qty, premium: prem });
    } else if (r.type === "ls" || r.type === "ss") {
      // Stock: we store the **basis** in `premium` for the BE library.
      if (!isNum(K)) continue;
      const side = r.type === "ls" ? "long" : "short";
      out.push({ kind: "stock", side, qty, premium: K });
    }
  }
  return out;
}

/* Also accept the legacy legs-object shape (lc/sc/lp/sp keys) if passed */
function legsObjectToLegs(obj) {
  if (!obj || Array.isArray(obj)) return Array.isArray(obj) ? obj : [];
  const out = [];
  const map = {
    lc: { kind: "call", side: "long" },
    sc: { kind: "call", side: "short" },
    lp: { kind: "put",  side: "long" },
    sp: { kind: "put",  side: "short" },
    ls: { kind: "stock", side: "long" },
    ss: { kind: "stock", side: "short" },
  };
  for (const [k, v] of Object.entries(obj)) {
    if (!v) continue;
    const m = map[k]; if (!m) continue;
    const K = Number(v.K);
    const qty = Math.abs(Number(v.qty || 0));
    const prem = Number.isFinite(Number(v.premium)) ? Number(v.premium) : 0;
    if (!qty) continue;
    if (m.kind === "stock") {
      if (!isNum(K)) continue;
      out.push({ kind: "stock", side: m.side, qty, premium: K });
    } else {
      if (!isNum(K)) continue;
      out.push({ kind: m.kind, side: m.side, strike: K, qty, premium: prem });
    }
  }
  return out;
}

export default function BreakEvenKpiCell({ rows, legs, currency = "USD", inline = false }) {
  const legsNorm = useMemo(() => {
    if (Array.isArray(rows)) return rowsToLegs(rows);
    if (legs && !Array.isArray(legs)) return legsObjectToLegs(legs);
    return Array.isArray(legs) ? legs : [];
  }, [rows, legs]);

  const result = useMemo(() => {
    try { return computeBreakEvens({ legs: legsNorm }); }
    catch { return { be: [] }; }
  }, [legsNorm]);

  const be = result?.be || [];

  // Inline KPI for the Chart’s “Breakeven” cell
  if (inline) {
    return (
      <span
        className="be-inline"
        title={be.length ? "" : "Break-even unavailable for current legs"}
      >
        {be.length === 0
          ? "—"
          : be.length === 1
          ? be[0].toFixed(2)
          : `${be[0].toFixed(2)} | ${be[1].toFixed(2)}`}
      </span>
    );
  }

  // Optional mini-panel (not used by Chart, available for reuse)
  return (
    <div className="be-panel">
      <div className="be-title">Break-even</div>
      {be.length ? (
        <div className="be-values">
          {be.map((v, i) => (
            <span key={i} className="chip">{v.toFixed(2)}</span>
          ))}
        </div>
      ) : (
        <div className="be-error">Break-even unavailable for current legs.</div>
      )}

      <style jsx>{`
        .be-panel{ border:1px solid var(--border); border-radius:12px; padding:10px; background:var(--card); }
        .be-title{ font-weight:700; margin-bottom:6px; }
        .be-values{ display:flex; gap:8px; }
        .chip{ border:1px solid var(--border); border-radius:9999px; padding:2px 8px; font-weight:600; }
        .be-error{ color:#ef4444; }
      `}</style>
    </div>
  );
}
