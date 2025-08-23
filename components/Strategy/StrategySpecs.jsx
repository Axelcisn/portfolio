// components/Strategy/StrategySpecs.jsx
"use client";

import { memo, useMemo } from "react";
import { fmtCur } from "../../lib/format";

function Spec({ k, v }) {
  return (
    <div className="spec">
      <div className="k">{k}</div>
      <div className="v">{v ?? "—"}</div>
      <style jsx>{`
        .spec{ display:flex; flex-direction:column; gap:6px; padding:10px; border:1px solid var(--border);
               border-radius:12px; background:var(--card); }
        .k{ font-size:12px; opacity:.75; }
        .v{ font-weight:600; }
      `}</style>
    </div>
  );
}

function StrategySpecs({ strategy, legs, currency = "USD", breakevens = [], maxProfit = null, maxLoss = null }) {
  const composition = useMemo(() => {
    const parts = [];
    const add = (key, label) => {
      const l = legs?.[key];
      if (!l?.enabled) return;
      parts.push(`${label}×${l.qty} @ ${Number.isFinite(l.K) ? l.K : "—"}`);
    };
    add("lc", "Long Call");
    add("sc", "Short Call");
    add("lp", "Long Put");
    add("sp", "Short Put");
    return parts.join(" · ");
  }, [legs]);

  return (
    <section className="card dense">
      <div className="section-title">Architecture</div>
      <div className="grid">
        <Spec k="Composition" v={composition || "—"} />
        <Spec k="Breakeven(s)" v={breakevens.length ? breakevens.join(" · ") : "—"} />
        <Spec k="Max Profit" v={maxProfit == null ? "—" : fmtCur(maxProfit, currency)} />
        <Spec k="Max Loss" v={maxLoss == null ? "—" : fmtCur(maxLoss, currency)} />
        <Spec k="Risk Profile" v={strategy?.direction || "—"} />
        <Spec k="Greeks Exposure" v="Δ/Γ/Θ/ν —" />
        <Spec k="Margin Requirement" v="—" />
      </div>
      <style jsx>{`
        .grid{ display:grid; gap:12px; grid-template-columns:repeat(3,minmax(0,1fr)); }
        @media (max-width: 900px){ .grid{ grid-template-columns:1fr; } }
      `}</style>
    </section>
  );
}

export default memo(StrategySpecs);
