// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";
import StrategyConfigTable from "./StrategyConfigTable";
import { instantiateStrategy, calculateNetPremium } from "./assignStrategy";

const LABEL = { lc: "Long Call", sc: "Short Call", lp: "Long Put", sp: "Short Put" };

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

  // instantiate legs (roles & qty fixed; K/premium null)
  const [state, setState] = useState(() =>
    strategy ? instantiateStrategy(strategy.id) : null
  );
  useEffect(() => {
    if (strategy) setState(instantiateStrategy(strategy.id));
  }, [strategy?.id]);

  const [greek, setGreek] = useState("vega");
  const [canEditVolume, setCanEditVolume] = useState(false);

  const legs = state?.legsKeyed || {};
  const netPrem = useMemo(() => calculateNetPremium(legs), [legs]);

  function handleLegsChange(updated) {
    setState((s) => ({ ...(s || {}), legsKeyed: updated }));
  }

  function handleApply() {
    if (!state) return;
    onApply?.(state.legsKeyed, calculateNetPremium(state.legsKeyed), state.meta);
  }

  // ESC to close + lock page scroll while modal open
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

  // Build non-editable summary from the live legsKeyed object
  const summaryRows = useMemo(() => {
    const keys = ["lc", "sc", "lp", "sp"];
    const isActive = (l) => !!l?.enabled && Number.isFinite(l?.K);
    return keys
      .filter((k) => legs[k] && (isActive(legs[k]) || Number(legs[k].qty || 0) !== 0))
      .map((k) => ({
        key: k,
        label: LABEL[k],
        K: Number.isFinite(legs[k].K) ? legs[k].K : null,
        qty: Number(legs[k].qty || 0),
        premium: Number.isFinite(legs[k].premium) ? legs[k].premium : null,
        enabled: !!legs[k].enabled,
      }));
  }, [legs]);

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

        {/* Chart — frameless, blends with page; no internal editor */}
        <div className="chart-seam">
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
            showControls={false}
            frameless
          />
        </div>

        {/* Configuration */}
        <div className="config card">
          <div className="config-head">
            <div className="section-title">Configuration</div>

            {/* iOS-style switch (no text) to unlock volume editing */}
            <button
              className={`switch ${canEditVolume ? "on" : ""}`}
              aria-label="Unlock structure"
              role="switch"
              aria-checked={canEditVolume}
              onClick={() => setCanEditVolume((v) => !v)}
              title={canEditVolume ? "Lock volume" : "Unlock volume"}
            />
          </div>

          {/* Editable table (Position & Volume read-only by default; Strike & Premium editable) */}
          <StrategyConfigTable
            legs={legs}
            currency={currency}
            onChange={handleLegsChange}
            canEditVolume={canEditVolume}
          />
        </div>

        {/* Summary (read-only) */}
        <div className="summary card">
          <div className="section-title">Summary</div>
          {summaryRows.length === 0 ? (
            <div className="muted small">No legs selected yet. Add strikes/premiums and toggle legs On above.</div>
          ) : (
            <div className="sum-table">
              <div className="sum-row head">
                <div>Position</div><div>Strike</div><div>Volume</div><div>Premium</div>
              </div>
              {summaryRows.map((r) => (
                <div className="sum-row" key={r.key}>
                  <div className="pos">{r.label}</div>
                  <div>{Number.isFinite(r.K) ? r.K : "—"}</div>
                  <div>{r.qty}</div>
                  <div>{Number.isFinite(r.premium)
                    ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(r.premium)
                    : "—"}</div>
                </div>
              ))}
              <div className="sum-footer">
                <div className="spacer" />
                <div className="net">
                  <span className="k">Net Premium:</span>
                  <span className="v">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(netPrem || 0)}
                  </span>
                </div>
              </div>
            </div>
          )}
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

        .chart-seam{ padding:6px; } /* no card here — blends with page */

        .card{ padding:10px; border:1px solid var(--border); border-radius:12px; background:var(--card); }
        .config{ display:grid; gap:10px; }
        .config-head{ display:flex; align-items:center; justify-content:space-between; }
        .section-title{ font-weight:800; }

        /* Switch (no text) */
        .switch{
          position:relative; width:44px; height:26px; border-radius:999px;
          background:var(--bg); border:1px solid var(--border);
          display:inline-flex; align-items:center; transition:background .18s ease;
        }
        .switch::after{
          content:""; width:18px; height:18px; border-radius:50%;
          background:#d1d5db; position:absolute; left:4px; transition:left .18s ease;
        }
        .switch.on{ background:#3b82f6; border-color:#1e40af; }
        .switch.on::after{ left:22px; background:#fff; }

        .summary{ display:grid; gap:8px; }
        .sum-table{ display:grid; gap:8px; }
        .sum-row{ display:grid; grid-template-columns: 1.4fr 1.1fr 0.9fr 1.1fr; gap:10px; align-items:center; }
        .sum-row.head{ font-size:12px; opacity:.75; }
        .sum-footer{ display:flex; justify-content:flex-end; gap:8px; align-items:center; margin-top:4px; }
        .k{ font-size:12px; opacity:.7; }
        .v{ font-weight:800; }
        .spacer{ flex:1; }
      `}</style>
    </div>
  );
}
