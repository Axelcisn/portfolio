// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";
import PositionBuilder from "./PositionBuilder";
import SummaryTable from "./SummaryTable";
import materializeSeeded from "./defs/materializeSeeded";

// --- centralized strategy aggregator (hub) ---
// Allow two common export names to avoid churn while migrating.
import {
  strategyMetrics as qStrategyMetrics,
  computeStrategyMetrics as qComputeStrategyMetrics,
} from "lib/quant";

/* ---------- helpers ---------- */
function rowsToLegsObject(rows) {
  // Legacy shape expected upstream (options only)
  const out = {
    lc: { enabled: false, K: null, qty: 0, premium: null },
    sc: { enabled: false, K: null, qty: 0, premium: null },
    lp: { enabled: false, K: null, qty: 0, premium: null },
    sp: { enabled: false, K: null, qty: 0, premium: null },
  };
  for (const r of rows) {
    if (!r?.type || !(r.type in out)) continue; // ignore stock rows here
    const K = Number(r.K);
    const qty = Number(r.qty || 0);
    const prem = Number.isFinite(Number(r.premium)) ? Number(r.premium) : null;
    if (Number.isFinite(K) && Number.isFinite(qty)) {
      out[r.type] = { enabled: qty !== 0, K, qty, premium: prem };
    } else {
      out[r.type] = { enabled: qty !== 0, K: Number.isFinite(K) ? K : null, qty, premium: prem };
    }
  }
  return out;
}

function netPremium(rows) {
  // Long options pay premium (debit), short receive (credit). Stocks: none.
  let sum = 0;
  for (const r of rows) {
    if (r.type === "ls" || r.type === "ss") continue;
    const q = Number(r.qty || 0);
    const p = Number(r.premium || 0);
    if (!Number.isFinite(q) || !Number.isFinite(p)) continue;
    const isLong = r.type === "lc" || r.type === "lp";
    sum += (isLong ? -1 : +1) * p * q;
  }
  return sum;
}

/* ---------- component ---------- */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const {
    spot = null,
    currency = "USD",
    high52,
    low52,
    riskFree = 0.02,
    sigma = 0.2,
    T = 30 / 365, // years from company card
    dividendYield = 0,
    contractSize = 100, // used for aggregator scaling; Chart keeps its own prop
  } = env || {};

  // derive an explicit strategy key for the BE API (id > key > name)
  const strategyKey = useMemo(
    () => strategy?.id ?? strategy?.key ?? strategy?.name ?? null,
    [strategy]
  );

  // Default days derived from company card's T
  const defaultDays = Math.max(1, Math.round((T || 30 / 365) * 365));

  // Seed rows from the strategy template + deterministic seeding (K & premium)
  const [rows, setRows] = useState(() =>
    materializeSeeded(strategy?.id, {
      spot,
      sigma,
      T,
      defaultDays,
      riskFree,
      dividendYield,
    })
  );

  // Re-materialize when opening a different strategy
  useEffect(() => {
    setRows(
      materializeSeeded(strategy?.id, {
        spot,
        sigma,
        T,
        defaultDays,
        riskFree,
        dividendYield,
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy?.id]);

  const [greek, setGreek] = useState("vega");

  // Lock page scroll + close on ESC
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

  // Save = previous Apply (compat)
  const legsObj = useMemo(() => rowsToLegsObject(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);
  const save = () => {
    onApply?.(legsObj, totalPrem);
    onClose?.();
  };

  // Reset to template using **current** company card time (seeded)
  const resetToDefaults = () => {
    const fresh = materializeSeeded(strategy?.id, {
      spot,
      sigma,
      T,
      defaultDays,
      riskFree,
      dividendYield,
    });
    setRows(fresh);
  };

  // ---- NEW: centralized strategy metrics (scaled by qty × contractSize) ----
  const summary = useMemo(() => {
    const agg =
      (typeof qStrategyMetrics === "function" && qStrategyMetrics) ||
      (typeof qComputeStrategyMetrics === "function" && qComputeStrategyMetrics) ||
      null;

    if (!agg) return null; // hub not present yet → render safely

    try {
      return agg({
        rows,              // builder rows (lc/sc/lp/sp and optional stock)
        S0: spot,
        sigma,
        T,
        drift: riskFree - dividendYield, // risk-neutral by default (r − q)
        r: riskFree,
        q: dividendYield,
        contractSize,      // scaling
        strategy: strategyKey,
      });
    } catch {
      return null;
    }
  }, [rows, spot, sigma, T, riskFree, dividendYield, contractSize, strategyKey]);

  const GAP = 14;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-sheet"
        style={{
          maxWidth: 1120,
          maxHeight: "calc(100vh - 96px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: 16,
        }}
      >
        {/* Header */}
        <div className="modal-head" style={{ marginBottom: GAP }}>
          <div className="mh-left">
            <div className="mh-icon">
              {strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}
            </div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">
                {strategy?.name || "Strategy"}
              </div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button" type="button" onClick={save}>
              Save
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Chart (frameless) */}
        <div style={{ marginBottom: GAP }}>
          <Chart
            frameless
            spot={spot}
            currency={currency}
            rows={rows}                 // chart reflects all builder rows
            riskFree={riskFree}
            sigma={sigma}
            T={T}
            greek={greek}
            onGreekChange={setGreek}
            contractSize={1}            // (kept as-is to preserve existing visuals)
            strategy={strategyKey}      // explicit key for BE alignment
          />
        </div>

        {/* Configuration */}
        <section className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-head">
            <div className="section-title">Configuration</div>
            <button
              type="button"
              className="link-btn"
              onClick={resetToDefaults}
              aria-label="Reset"
              title="Reset"
            >
              Reset
            </button>
          </div>
          <PositionBuilder rows={rows} onChange={setRows} currency={currency} defaultDays={defaultDays} />
        </section>

        {/* Summary (now accepts centralized metrics if present) */}
        <SummaryTable rows={rows} currency={currency} title="Summary" summary={summary} />
      </div>

      <style jsx>{`
        .modal-root {
          position: fixed; inset: 0; z-index: 250;
          /* Ensure backdrop clicks work even if children overlap */
          pointer-events: none;
        }
        .modal-backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          pointer-events: auto;
        }
        .modal-sheet {
          position: relative; margin: 36px auto;
          border-radius: 16px; background: var(--bg);
          border: 1px solid var(--border);
          box-shadow: 0 30px 80px rgba(0,0,0,0.35);
          pointer-events: auto; /* Accept interaction */
        }
        .modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .mh-left { display:flex; gap:12px; align-items:center; }
        .mh-icon { width:34px; height:34px; border-radius:10px; background:var(--card); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; }
        .mh-name { font-weight:800; }
        .mh-actions { display:flex; gap:8px; }
        .section-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
        .section-title { font-weight:700; }
        .card.dense { padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--bg); }
        .link-btn {
          height: 28px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text);
          font-size: 12.5px;
        }
        .link-btn:hover { background: var(--card); }
      `}</style>
    </div>
  );
}
