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

/** map Strategy.rows[] -> legs object used by Chart/Specs/ConfigTable */
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

/** net premium given legs (buys +, sells −) */
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

/** simple expiry payoff grid for summary metrics (fast + deterministic) */
const payoffSummary = (legs, spot) => {
  const list = [];
  const add = (k, label) => {
    const l = legs?.[k];
    if (!l?.enabled) return;
    list.push({
      type: /Call/.test(label) ? "call" : "put",
      side: /Long/.test(label) ? +1 : -1,
      K: Number(l.K),
      qty: Number(l.qty),
    });
  };
  add("lc", "Long Call");
  add("sc", "Short Call");
  add("lp", "Long Put");
  add("sp", "Short Put");

  if (!list.length || !(spot > 0)) {
    return { maxP: null, minP: null, breakevens: [] };
  }

  const Ks = list.map((l) => l.K).filter((x) => Number.isFinite(x));
  const lo = Math.max(0.01, Math.min(...Ks, spot) * 0.65);
  const hi = Math.max(spot, ...Ks) * 1.45;
  const N = 220;
  const xs = Array.from({ length: N }, (_, i) => lo + (hi - lo) * (i / (N - 1)));

  const ys = xs.map((S) =>
    list.reduce((v, l) => {
      const intrinsic =
        l.type === "call" ? Math.max(S - l.K, 0) : Math.max(l.K - S, 0);
      return v + l.side * intrinsic * l.qty;
    }, 0)
  );

  const maxP = Math.max(...ys);
  const minP = Math.min(...ys);

  const breakevens = [];
  for (let i = 1; i < N; i++) {
    const y0 = ys[i - 1],
      y1 = ys[i];
    if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
      const t = y1 === y0 ? 0 : (0 - y0) / (y1 - y0);
      breakevens.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
  }
  return { maxP, minP, breakevens };
};

/* ------------------------
   Modal
-------------------------*/

export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, sigma, T, riskFree, mcStats, currency } = env || {};

  // legs state used across chart/specs/config
  const [legs, setLegs] = useState(() =>
    initLegsFromRows(strategy.legs, spot, strategy.direction)
  );

  // live totals
  const netPrem = useMemo(() => netPremiumFromLegs(legs), [legs]);

  // summary for metric strip
  const summary = useMemo(() => {
    const s = payoffSummary(legs, Number(spot) || 0);
    return {
      maxP: s.maxP,
      minP: s.minP,
      breakeven: (s.breakevens || []).map((b) =>
        Number.isFinite(b) ? Math.round(b) : null
      ),
    };
  }, [legs, spot]);

  // keyboard + body lock
  const sheetRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev || "";
    };
  }, [onClose]);

  const apply = () => onApply?.(
    // chart legs require only enabled/K/qty
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
            <button className="button ghost" type="button" onClick={() => { /* future: save preset */ }}>Save</button>
            <button className="button" type="button" onClick={apply}>Apply</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Body — full‑width chart, then specs, then config */}
        <div className="modal-body vertical">
          {/* Chart */}
          <section className="card padless canvas white-surface">
            <div className="chart-wrap">
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
                sigma={Number.isFinite(sigma) ? sigma : 0}
                T={Number.isFinite(T) ? T : 0}
                mcStats={mcStats}
                netPremium={netPrem}
              />
            </div>

            {/* Metric strip under the chart */}
            <div className="metric-strip">
              <Metric k="Underlying" v={fmtCur(spot ?? 0, currency)} />
              <Metric k="Max Profit" v={fmtCur(summary.maxP, currency)} />
              <Metric k="Max Loss" v={fmtCur(summary.minP, currency)} />
              <Metric k="Win Rate" v={fmtPct(mcStats?.pWin ?? null)} />
              <Metric
                k="Breakeven"
                v={
                  summary.breakeven?.length
                    ? summary.breakeven.map((b, i) => (i ? " · " : "") + (Number.isFinite(b) ? b : "—")).join("")
                    : "—"
                }
              />
            </div>
          </section>

          {/* Architecture / Specs */}
          <StrategySpecs
            strategy={{ ...strategy, legs }}
            spot={Number(spot) || 0}
            sigma={Number.isFinite(sigma) ? sigma : 0}
            T={Number.isFinite(T) ? T : 0}
            riskFree={riskFree ?? 0}
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
        .modal-root{
          position:fixed; inset:0; z-index:1000;
          display:flex; align-items:center; justify-content:center;
        }
        .modal-backdrop{
          position:absolute; inset:0; background:rgba(0,0,0,.45);
        }
        .modal-sheet{
          position:relative; width:min(1000px, 96vw); max-height:90vh;
          display:flex; flex-direction:column; gap:14px;
          background:var(--bg); border:1px solid var(--border);
          border-radius:18px; box-shadow:0 30px 120px rgba(0,0,0,.35);
          padding:16px;
        }
        .modal-head{
          display:flex; align-items:center; justify-content:space-between; gap:12px;
          padding:4px 2px 10px 2px; border-bottom:1px solid var(--border);
        }
        .mh-left{ display:flex; align-items:center; gap:12px; }
        .mh-icon{
          width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center;
          background:var(--card); border:1px solid var(--border);
        }
        .mh-name{ font-weight:700; font-size:18px; line-height:1.2; }
        .mh-meta{ display:flex; flex-direction:column; gap:6px; }
        .mh-actions{ display:flex; gap:8px; }

        .modal-body.vertical{
          overflow:auto; padding-top:8px; display:flex; flex-direction:column; gap:16px;
        }

        .chart-wrap{ height:360px; }
        @media (max-width: 640px){ .chart-wrap{ height:300px; } }

        .metric-strip{
          display:grid; grid-template-columns: repeat(5, minmax(0,1fr));
          gap:10px; padding:12px; border-top:1px dashed var(--border);
          background:transparent;
        }
        @media (max-width: 900px){
          .metric-strip{ grid-template-columns: 1fr 1fr; }
        }
        .metric{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .metric .k{ font-size:12px; opacity:.75; }
        .metric .v{
          font-weight:600; padding:6px 10px; border-radius:9999px;
          border:1px solid var(--border); background:var(--card);
          white-space:nowrap;
        }
        .white-surface{ background:var(--card); }
      `}</style>
    </div>
  );
}

/* small elements */
function Metric({ k, v }) {
  return (
    <div className="metric">
      <span className="k">{k}</span>
      <span className="v">{v ?? "—"}</span>
    </div>
  );
}

function pickChartLeg(l) {
  if (!l) return { enabled: false, K: NaN, qty: 0 };
  return {
    enabled: !!l.enabled && Number.isFinite(l.K) && Number(l.qty) !== 0,
    K: Number(l.K),
    qty: Number(l.qty ?? 0),
  };
}
