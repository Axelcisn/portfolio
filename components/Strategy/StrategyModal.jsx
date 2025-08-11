// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";
import PositionBuilder from "./PositionBuilder";
import { instantiateStrategy, calculateNetPremium } from "./assignStrategy";

/* Type labels used by the builder & summary */
const TYPE_LABEL = {
  lc: "Long Call",
  sc: "Short Call",
  lp: "Long Put",
  sp: "Short Put",
  ls: "Long Stock",
  ss: "Short Stock",
};

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

  /* ---------- Instantiate from catalog (fixed roles & qty; K/premium null) ---------- */
  const [seed, setSeed] = useState(() =>
    strategy ? instantiateStrategy(strategy.id) : null
  );
  useEffect(() => {
    if (strategy) setSeed(instantiateStrategy(strategy.id));
  }, [strategy?.id]);

  /* ---------- Builder rows (shown in Configuration) ---------- */
  const defaultDays = Math.max(1, Math.round((T || 30 / 365) * 365));
  const [rows, setRows] = useState(() => {
    const legs = seed?.legsKeyed || {};
    const out = [];
    if (legs.lc && (legs.lc.qty ?? 0) !== 0) out.push({ id: "lc", type: "lc", K: null, premium: null, qty: legs.lc.qty, days: defaultDays, enabled: true });
    if (legs.sc && (legs.sc.qty ?? 0) !== 0) out.push({ id: "sc", type: "sc", K: null, premium: null, qty: legs.sc.qty, days: defaultDays, enabled: true });
    if (legs.lp && (legs.lp.qty ?? 0) !== 0) out.push({ id: "lp", type: "lp", K: null, premium: null, qty: legs.lp.qty, days: defaultDays, enabled: true });
    if (legs.sp && (legs.sp.qty ?? 0) !== 0) out.push({ id: "sp", type: "sp", K: null, premium: null, qty: legs.sp.qty, days: defaultDays, enabled: true });
    return out;
  });
  useEffect(() => {
    const legs = seed?.legsKeyed || {};
    const base = [];
    if (legs.lc && (legs.lc.qty ?? 0) !== 0) base.push({ id: "lc", type: "lc", K: null, premium: null, qty: legs.lc.qty, days: defaultDays, enabled: true });
    if (legs.sc && (legs.sc.qty ?? 0) !== 0) base.push({ id: "sc", type: "sc", K: null, premium: null, qty: legs.sc.qty, days: defaultDays, enabled: true });
    if (legs.lp && (legs.lp.qty ?? 0) !== 0) base.push({ id: "lp", type: "lp", K: null, premium: null, qty: legs.lp.qty, days: defaultDays, enabled: true });
    if (legs.sp && (legs.sp.qty ?? 0) !== 0) base.push({ id: "sp", type: "sp", K: null, premium: null, qty: legs.sp.qty, days: defaultDays, enabled: true });
    setRows(base);
  }, [seed, defaultDays]);

  /* ---------- Convert builder rows -> legsKeyed for current chart (1 per type) ---------- */
  const legsKeyed = useMemo(() => {
    const take = (t) => rows.find((r) => r.type === t) || null;
    const mk = (r) =>
      !r
        ? { enabled: false, K: null, qty: 0, premium: null }
        : {
            enabled: Number.isFinite(r.K),
            K: Number.isFinite(r.K) ? Number(r.K) : null,
            qty: Number(r.qty || 0),
            premium: Number.isFinite(r.premium) ? Number(r.premium) : null,
          };
    return {
      lc: mk(take("lc")),
      sc: mk(take("sc")),
      lp: mk(take("lp")),
      sp: mk(take("sp")),
      // Note: ls/ss (stock) will be added to the curve in the next path (3/3).
    };
  }, [rows]);

  /* ---------- Net premium based on current legs (options only for now) ---------- */
  const netPrem = useMemo(() => calculateNetPremium(legsKeyed), [legsKeyed]);

  /* ---------- Wire into the existing Chart ---------- */
  const [greek, setGreek] = useState("vega");
  function handleApply() {
    onApply?.(legsKeyed, netPrem, seed?.meta);
  }

  /* ---------- Modal lifecycle (ESC + blur backdrop) ---------- */
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

  /* ---------- Summary rows (read-only) ---------- */
  const summary = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        type: TYPE_LABEL[r.type] || r.type,
        K: Number.isFinite(r.K) ? r.K : null,
        days: (r.type === "ls" || r.type === "ss") ? null : (Number.isFinite(r.days) ? r.days : defaultDays),
        premium: Number.isFinite(r.premium) ? r.premium : null,
      })),
    [rows, defaultDays]
  );

  if (!strategy) return null;

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-label="Strategy">
      <div className="modal" ref={dialogRef}>
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

        {/* Chart — frameless, no internal editor */}
        <div className="chart-seam">
          <Chart
            spot={spot}
            currency={currency}
            legs={legsKeyed}
            riskFree={riskFree}
            sigma={sigma}
            T={T}
            greek={greek}
            onGreekChange={setGreek}
            showControls={false}
            frameless
          />
        </div>

        {/* Configuration (Position Builder) */}
        <div className="card">
          <div className="section-title">Configuration</div>
          <PositionBuilder
            rows={rows}
            onChange={setRows}
            currency={currency}
            defaultDays={defaultDays}
          />
        </div>

        {/* Summary (read-only) */}
        <div className="card">
          <div className="section-title">Summary</div>
          {summary.length === 0 ? (
            <div className="muted small">No positions yet. Use “+ New position”.</div>
          ) : (
            <>
              <div className="sum head">
                <div>Position</div><div>Strike</div><div>Expiration</div><div>Premium</div>
              </div>
              {summary.map((r) => (
                <div className="sum row" key={r.id}>
                  <div className="pos">{r.type}</div>
                  <div>{Number.isFinite(r.K) ? r.K : "—"}</div>
                  <div>{r.days == null ? "—" : `${r.days}d`}</div>
                  <div>{Number.isFinite(r.premium)
                    ? new Intl.NumberFormat("en-US", { style: "currency", currency }).format(r.premium)
                    : "—"}</div>
                </div>
              ))}
              <div className="sum foot">
                <div className="spacer" />
                <div className="net">
                  <span className="k">Net Premium:</span>
                  <span className="v">
                    {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(netPrem || 0)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .modal-wrap{
          position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
          background:rgba(0,0,0,.36);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          z-index:1000; padding:16px;
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

        .chart-seam{ padding:6px; } /* frameless chart */

        .card{ padding:10px; border:1px solid var(--border); border-radius:12px; background:var(--card); display:grid; gap:10px; }
        .section-title{ font-weight:800; }

        .sum{ display:grid; grid-template-columns: 1.4fr 1.1fr 0.9fr 1.1fr; gap:10px; align-items:center; }
        .sum.head{ font-size:12px; opacity:.75; }
        .sum.foot{ display:flex; justify-content:flex-end; gap:8px; align-items:center; margin-top:6px; border-top:1px solid var(--border); padding-top:8px; }
        .k{ font-size:12px; opacity:.7; }
        .v{ font-weight:800; }
        .spacer{ flex:1; }
      `}</style>
    </div>
  );
}
