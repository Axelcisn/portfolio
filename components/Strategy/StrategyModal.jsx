// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart"; // <-- fixed path (was '../Chart')
import StrategyConfigTable from "./StrategyConfigTable";
import { instantiateStrategy, calculateNetPremium } from "./assignStrategy";

export default function StrategyModal({
  strategy,
  onClose,
  onApply,
  env = {}, // { spot, currency, sigma, T, riskFree, mcStats }
}) {
  const {
    spot = null,
    currency = "EUR",
    sigma = 0.2,
    T = 30 / 365,
    riskFree = 0.02,
    mcStats = null,
  } = env;

  // Instantiate legs: roles & qty fixed; K/premium null (you enter them)
  const [state, setState] = useState(() =>
    strategy ? instantiateStrategy(strategy.id) : null
  );
  useEffect(() => {
    if (strategy) setState(instantiateStrategy(strategy.id));
  }, [strategy?.id]);

  const [greek, setGreek] = useState("vega");
  const [canEditVolume, setCanEditVolume] = useState(false);

  const legs = state?.legsKeyed || null;
  const netPrem = useMemo(() => calculateNetPremium(legs), [legs]);

  function handleLegsChange(updated) {
    setState((s) => ({ ...(s || {}), legsKeyed: updated }));
  }

  function handleApply() {
    if (!state) return;
    onApply?.(state.legsKeyed, calculateNetPremium(state.legsKeyed), state.meta);
  }

  // Close on ESC + lock scroll
  const dialogRef = useRef(null);
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev || "";
    };
  }, [onClose]);

  if (!strategy) return null;

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label="Strategy">
      <div className="modal">
        {/* Header */}
        <div className="head">
          <div className="title">
            <div className="name">{strategy.name}</div>
            <span className={`badge ${String(strategy.direction || "Neutral").toLowerCase()}`}>
              {strategy.direction || "Neutral"}
            </span>
          </div>
          <div className="actions">
            <button className="button ghost" onClick={() => { /* optional save hook */ }}>Save</button>
            <button className="button" onClick={handleApply}>Apply</button>
            <button className="button ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Chart */}
        <div className="chart-card card">
          <Chart
            spot={spot}
            currency={currency}
            legs={legs}
            riskFree={riskFree}
            sigma={sigma}
            T={T}
            greek={greek}
            onGreekChange={setGreek}
            onLegsChange={handleLegsChange}
          />
        </div>

        {/* Configuration */}
        <div className="config card">
          <div className="config-head">
            <div className="section-title">Configuration</div>
            <label className="small">
              <input
                type="checkbox"
                checked={canEditVolume}
                onChange={(e) => setCanEditVolume(e.target.checked)}
              />
              <span style={{ marginLeft: 6 }}>Unlock structure (edit volume)</span>
            </label>
          </div>

          <StrategyConfigTable
            legs={legs || {}}
            currency={currency}
            onChange={handleLegsChange}
            canEditVolume={canEditVolume}
          />

          <div className="net-line">
            <div className="spacer" />
            <div className="net">
              <span className="k">Net Premium:</span>
              <span className="v">
                {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(netPrem || 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-wrap{
          position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,.4); z-index:1000; padding:16px;
        }
        .modal{
          width:min(1200px, 96vw); max-height:92vh; overflow:auto;
          background:var(--bg); border:1px solid var(--border); border-radius:16px;
          box-shadow:0 20px 50px rgba(0,0,0,.35); display:grid; gap:12px; padding:12px;
        }
        .head{ display:flex; align-items:center; justify-content:space-between; padding:6px 4px 2px; }
        .title{ display:flex; align-items:center; gap:10px; }
        .name{ font-weight:800; font-size:16px; }
        .badge{ padding:2px 8px; border-radius:999px; font-size:11px; border:1px solid var(--border); opacity:.85; }
        .badge.bullish{ color:#06b6d4; }
        .badge.bearish{ color:#f59e0b; }
        .badge.neutral{ color:#8b5cf6; }
        .actions{ display:flex; gap:8px; }
        .button{ height:34px; padding:0 12px; border-radius:10px; border:1px solid var(--border); background:var(--card); color:var(--text); }
        .button.ghost{ background:transparent; }
        .chart-card{ padding:6px; }

        .config{ padding:10px; display:grid; gap:10px; }
        .config-head{ display:flex; align-items:center; justify-content:space-between; }
        .section-title{ font-weight:800; }
        .net-line{ display:flex; align-items:center; }
        .spacer{ flex:1; }
        .net{ display:flex; gap:8px; align-items:center; }
        .k{ font-size:12px; opacity:.7; }
        .v{ font-weight:800; }
      `}</style>
    </div>
  );
}
