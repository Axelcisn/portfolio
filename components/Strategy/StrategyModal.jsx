// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Chart from "./Chart";
import DirectionBadge from "./DirectionBadge";
import StrategySpecs from "./StrategySpecs";
import StrategyConfigTable from "./StrategyConfigTable";
import { fmtCur, fmtPct } from "../../utils/format";

/* ------------------------
   Helpers
-------------------------*/

// build legs object used by Chart/Config from a strategy template
const initLegsFromRows = (rows = [], spot = 0, direction = "Neutral") => {
  const base = { enabled: false, K: null, qty: 0, premium: null };
  const legs = { lc: { ...base }, sc: { ...base }, lp: { ...base }, sp: { ...base } };

  const guess = (pos) => {
    if (!spot) return spot;
    if (pos.includes("Call")) return direction === "Bullish" ? spot * 1.05 : spot * 1.03;
    if (pos.includes("Put")) return direction === "Bearish" ? spot * 0.95 : spot * 0.97;
    return spot;
  };

  rows.forEach((r) => {
    const strike = Number(r.strike);
    const qty = Number(r.volume ?? 1);
    const prem = Number(r.premium ?? 0);
    const K = Number.isFinite(strike) ? strike : Math.round(guess(r.position) * 100) / 100;

    switch (r.position) {
      case "Long Call":
        legs.lc = { enabled: qty > 0, K, qty, premium: prem };
        break;
      case "Short Call":
        legs.sc = { enabled: qty > 0, K, qty, premium: prem };
        break;
      case "Long Put":
        legs.lp = { enabled: qty > 0, K, qty, premium: prem };
        break;
      case "Short Put":
        legs.sp = { enabled: qty > 0, K, qty, premium: prem };
        break;
      default:
        break;
    }
  });

  return legs;
};

const netPremiumFromLegs = (legs) => {
  const sgn = { lc: +1, lp: +1, sc: -1, sp: -1 };
  return ["lc", "lp", "sc", "sp"].reduce((acc, k) => {
    const l = legs?.[k];
    const qty = Number(l?.qty ?? 0);
    const prem = Number(l?.premium ?? 0);
    if (!qty || !Number.isFinite(prem)) return acc;
    return acc + sgn[k] * qty * prem;
  }, 0);
};

const pickChartLeg = (l) =>
  !l
    ? { enabled: false, K: NaN, qty: 0 }
    : { enabled: !!l.enabled && Number.isFinite(l.K) && Number(l.qty) !== 0, K: Number(l.K), qty: Number(l.qty ?? 0) };

/* ------------------------
   Modal
-------------------------*/

export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, sigma, T, riskFree, mcStats, currency } = env || {};

  // legs state used across chart/specs/config
  const [legs, setLegs] = useState(() =>
    initLegsFromRows(strategy.legs, Number(spot) || 0, strategy.direction)
  );

  const netPrem = useMemo(() => netPremiumFromLegs(legs), [legs]);

  // keyboard + body lock
  const sheetRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev || "";
    };
  }, [onClose]);

  const canPlot =
    Number(spot) > 0 &&
    (legs.lc?.enabled || legs.lp?.enabled || legs.sc?.enabled || legs.sp?.enabled) &&
    [legs.lc, legs.lp, legs.sc, legs.sp].some((l) => l?.enabled && Number.isFinite(l?.K));

  const apply = () =>
    onApply?.(
      {
        lc: pickChartLeg(legs.lc),
        lp: pickChartLeg(legs.lp),
        sc: pickChartLeg(legs.sc),
        sp: pickChartLeg(legs.sp),
      },
      netPrem
    );

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sgm-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-head">
          <div className="mh-left">
            <div className="mh-icon">{strategy.icon && <strategy.icon aria-hidden="true" />}</div>
            <div className="mh-meta">
              <div id="sgm-title" className="mh-name">{strategy.name}</div>
              <DirectionBadge value={strategy.direction} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button ghost" type="button" onClick={() => { /* future: save preset */ }}>
              Save
            </button>
            <button className="button" type="button" onClick={apply}>
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Body — full‑width chart, then specs, then config */}
        <div className="modal-body vertical">
          {/* Chart */}
          <section className="card padless canvas white-surface">
            <div className="chart-wrap">
              {canPlot ? (
                <Chart
                  spot={Number(spot) || 0}
                  legs={{
                    lc: pickChartLeg(legs.lc),
                    lp: pickChartLeg(legs.lp),
                    sc: pickChartLeg(legs.sc),
                    sp: pickChartLeg(legs.sp),
                  }}
                  riskFree={riskFree ?? 0}
                  carryPremium={false}
                  mu={null}
                  // guard values so the chart always renders
                  sigma={Number.isFinite(sigma) && sigma > 0 ? sigma : 0.20}
                  T={Number.isFinite(T) && T > 0 ? T : 30 / 365}
                  mcStats={mcStats}
                  netPremium={netPrem}
                />
              ) : (
                <div className="chart-empty">
                  Add at least one leg with a strike to preview the payoff.
                </div>
              )}
            </div>

            {/* Metric strip under the chart (keep Breakeven empty for now) */}
            <div className="metric-strip">
              <Metric k="Underlying" v={fmtCur(spot ?? 0, currency)} />
              <Metric k="Max Profit" v="—" />
              <Metric k="Max Loss" v="—" />
              <Metric k="Win Rate" v={fmtPct(mcStats?.pWin ?? null)} />
              <Metric k="Breakeven" v="—" />
            </div>
          </section>

          {/* Architecture / Specs (breakevens intentionally empty) */}
          <StrategySpecs
            strategy={strategy}
            legs={legs}
            currency={currency || "USD"}
            breakevens={[]}             // <— show nothing until we add the formula
            maxProfit={null}
            maxLoss={null}
          />

          {/* Configuration (editable, updates chart live) */}
          <StrategyConfigTable
            legs={legs}
            currency={currency || "USD"}
            onChange={(next) => setLegs(next)}
          />
        </div>
      </div>

      <style jsx>{`
        .modal-root{ position:fixed; inset:0; z-index:1000; display:flex; align-items:center; justify-content:center; }
        .modal-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.45); }
        .modal-sheet{
          position:relative; width:min(1000px, 96vw); max-height:90vh;
          display:flex; flex-direction:column; gap:14px;
          background:var(--bg); border:1px solid var(--border);
          border-radius:18px; box-shadow:0 30px 120px rgba(0,0,0,.35); padding:16px;
        }
        .modal-head{ display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding:4px 2px 10px 2px; border-bottom:1px solid var(--border); }
        .mh-left{ display:flex; align-items:center; gap:12px; }
        .mh-icon{ width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center;
          background:var(--card); border:1px solid var(--border); }
        .mh-name{ font-weight:700; font-size:18px; line-height:1.2; }
        .mh-meta{ display:flex; flex-direction:column; gap:6px; }
        .mh-actions{ display:flex; gap:8px; }

        .modal-body.vertical{ overflow:auto; padding-top:8px; display:flex; flex-direction:column; gap:16px; }

        .chart-wrap{ height:360px; min-height:360px; width:100%; }
        @media (max-width: 640px){ .chart-wrap{ height:300px; min-height:300px; } }
        .chart-empty{ height:100%; display:flex; align-items:center; justify-content:center; font-size:14px; opacity:.8; }

        .metric-strip{
          display:grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap:10px;
          padding:12px; border-top:1px dashed var(--border); background:transparent;
        }
        @media (max-width: 900px){ .metric-strip{ grid-template-columns: 1fr 1fr; } }
        .metric{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .metric .k{ font-size:12px; opacity:.75; }
        .metric .v{ font-weight:600; padding:6px 10px; border-radius:9999px; border:1px solid var(--border); background:var(--card); white-space:nowrap; }
        .white-surface{ background:var(--card); }
      `}</style>
    </div>
  );
}

/* small metric element */
function Metric({ k, v }) {
  return (
    <div className="metric">
      <span className="k">{k}</span>
      <span className="v">{v ?? "—"}</span>
    </div>
  );
}
