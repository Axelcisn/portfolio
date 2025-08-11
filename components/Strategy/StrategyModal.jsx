// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";
import { gridPnl } from "./payoffLite";
import { useMC } from "./useMC";

/* ===== UI helpers (same as before) ===== */
const fmt = (v, ccy = "USD", fd = 2) => {
  if (!Number.isFinite(Number(v))) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: ccy, maximumFractionDigits: fd }).format(Number(v));
  } catch { return (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$") + Number(v).toFixed(fd); }
};

const TYPES = ["Long Call","Short Call","Long Put","Short Put","Long Stock","Short Stock"];
const isOpt = (t) => /Call|Put/.test(t);

/* ===== Modal ===== */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, currency = "USD", sigma = 0.2, riskFree = 0, timeDays } = env || {};
  const [rows, setRows] = useState(() => (strategy?.legs?.length ? strategy.legs : [
    { type: "Long Call", strike: "", expiration: timeDays ?? 30, volume: 1, premium: "" },
  ]));

  // ----- Monte-Carlo (95% CI + Mean) -----
  const { result: mc, loading: mcLoading, run: runMC } = useMC();

  // Effective T (years): max(expiration of legs) or fallback to company card time
  const Tyears = useMemo(() => {
    const ds = rows.map(r => Number(r.expiration ?? timeDays)).filter(Number.isFinite);
    const d = ds.length ? Math.max(...ds) : Number(timeDays ?? 30);
    return Math.max(1e-8, d) / 365;
  }, [rows, timeDays]);

  // Trigger MC whenever inputs that affect the underlying distribution change
  useEffect(() => {
    if (!Number.isFinite(Number(spot))) return;
    runMC({ spot: Number(spot), sigma: Number(sigma), r: Number(riskFree || 0), T: Tyears })
      .catch(() => {}); // errors already handled in the hook
  }, [spot, sigma, riskFree, Tyears, runMC]);

  // ----- P&L grid for chart/metrics (expiration P&L) -----
  const pnlGrid = useMemo(() => gridPnl(rows, undefined, undefined, 260, 1), [rows]);
  const maxProfit = useMemo(() => Math.max(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const maxLoss = useMemo(() => Math.min(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const winRate = useMemo(() => {
    const n = pnlGrid.Y.length || 1;
    const w = pnlGrid.Y.filter(v => v > 0).length;
    return (w / n) * 100;
  }, [pnlGrid.Y]);

  // Simple breakeven finder from grid
  const breakeven = useMemo(() => {
    const xs = [];
    for (let i = 1; i < pnlGrid.X.length; i++) {
      const y0 = pnlGrid.Y[i - 1], y1 = pnlGrid.Y[i];
      if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
        const x0 = pnlGrid.X[i - 1], x1 = pnlGrid.X[i];
        const t = y1 === y0 ? 0 : (0 - y0) / (y1 - y0);
        xs.push(x0 + t * (x1 - x0));
      }
    }
    if (!xs.length) return null;
    if (xs.length === 1) return { low: xs[0], high: null };
    xs.sort((a,b)=>a-b);
    return { low: xs[0], high: xs[xs.length-1] };
  }, [pnlGrid]);

  // ----- UI plumbing -----
  const edit = (idx, key, val) => {
    setRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val === "" ? "" : (key === "type" ? val : Number(val)) };
      return next;
    });
  };

  const addRow = () => setRows(r => [...r, { type: "Long Call", strike: "", expiration: timeDays ?? 30, volume: 1, premium: "" }]);
  const removeRow = (i) => setRows(r => r.filter((_, k) => k !== i));
  const reset = () => setRows(strategy?.legs?.length ? strategy.legs : [{ type: "Long Call", strike: "", expiration: timeDays ?? 30, volume: 1, premium: "" }]);

  // Net premium (debit + / credit -)
  const netPrem = useMemo(() => rows.reduce((s, r) => {
    const sign = r.type?.startsWith("Short") ? -1 : 1;
    const q = Number(r.volume || 0);
    const p = Number(r.premium || 0);
    return s + sign * q * p;
  }, 0), [rows]);

  return (
    <div className="modal-root" role="dialog" aria-modal="true">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="sheet">
        {/* Header */}
        <div className="head">
          <div className="left">
            <div className="avatar" />
            <div>
              <div className="title">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="right">
            <button className="button" onClick={() => { /* reserved for future */ }}>Save</button>
            <button className="button ghost" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Chart */}
        <Chart
          spot={Number(spot)}
          currency={currency}
          rows={rows}
          greek="Vega"
          ci={mc ? { low: mc.low, high: mc.high, mean: mc.mean } : null}
          ciLoading={mcLoading}
        />

        {/* Metrics strip */}
        <div className="metrics metrics-scroll">
          <div className="card"><div className="k">Underlying price</div><div className="v">{fmt(spot, currency, 2)}</div></div>
          <div className="card"><div className="k">Max profit</div><div className="v">{fmt(maxProfit, currency, 0)}</div></div>
          <div className="card"><div className="k">Max loss</div><div className="v">{fmt(maxLoss, currency, 0)}</div></div>
          <div className="card"><div className="k">Win rate</div><div className="v">{winRate.toFixed(2)}%</div></div>
          <div className="card"><div className="k">Breakeven (Low | High)</div>
            <div className="v">{breakeven ? (breakeven.high ? `${Math.round(breakeven.low)} | ${Math.round(breakeven.high)}` : `${Math.round(breakeven.low)}`) : "—"}</div>
          </div>
          <div className="card"><div className="k">Lot size</div><div className="v">{rows.length}</div></div>
        </div>

        {/* Configuration */}
        <div className="card block">
          <div className="sec-title">Configuration</div>
          <div className="cfg-grid">
            <div className="th">Strike</div>
            <div className="th">Type</div>
            <div className="th">Expiration</div>
            <div className="th">Volume</div>
            <div className="th">Premium</div>
            <div className="th"></div>
            {rows.map((r, i) => (
              <FragmentRow
                key={i}
                row={r}
                onStrike={(v) => edit(i, "strike", v)}
                onType={(v) => edit(i, "type", v)}
                onExp={(v) => edit(i, "expiration", v)}
                onVol={(v) => edit(i, "volume", v)}
                onPrem={(v) => edit(i, "premium", v)}
                onRemove={() => removeRow(i)}
              />
            ))}
          </div>
          <div className="cfg-actions">
            <button className="button ghost" onClick={addRow}>+ New position</button>
            <div style={{ flex: 1 }} />
            <button className="button ghost" onClick={reset}>Reset</button>
          </div>
        </div>

        {/* Summary */}
        <div className="card block">
          <div className="sec-title">Summary</div>
          <div className="summary-row">
            <div className="muted">Net Premium</div>
            <div className="strong">{fmt(netPrem, currency, 2)}</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.35);backdrop-filter:blur(6px)}
        .sheet{position:fixed;inset:24px;overflow:auto;border-radius:18px;background:var(--bg);border:1px solid var(--border);padding:16px}
        .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
        .left{display:flex;gap:10px;align-items:center}
        .avatar{width:28px;height:28px;border-radius:50%;background:var(--card);border:1px solid var(--border)}
        .title{font-weight:700}
        .right{display:flex;gap:8px}
        .button{height:36px;padding:0 14px;border-radius:10px;border:1px solid var(--border);background:var(--card);color:var(--text)}
        .button.ghost{background:transparent}
        .metrics{display:flex;gap:12px;margin:12px 0;overflow:auto;padding-bottom:6px}
        .card{min-width:180px;border:1px solid var(--border);background:var(--card);border-radius:12px;padding:10px}
        .k{font-size:12px;opacity:.7}
        .v{margin-top:4px;font-weight:700}
        .block{margin-top:12px}
        .sec-title{font-weight:700;margin-bottom:8px}
        .cfg-grid{display:grid;grid-template-columns:repeat(6, minmax(0, 1fr));gap:8px}
        .th{font-size:12px;opacity:.7}
        .field{width:100%;height:36px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);padding:0 10px}
        .cfg-actions{display:flex;align-items:center;gap:8px;margin-top:8px}
        .summary-row{display:flex;justify-content:space-between;align-items:center}
      `}</style>
    </div>
  );
}

/* ---- row editor ---- */
function FragmentRow({ row, onStrike, onType, onExp, onVol, onPrem, onRemove }) {
  return (
    <>
      <div><input className="field" type="number" step="0.01" value={row.strike ?? ""} onChange={e=>onStrike(e.target.value)} placeholder="Strike" /></div>
      <div>
        <select className="field" value={row.type} onChange={e=>onType(e.target.value)}>
          {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div><input className="field" type="number" step="1" value={row.expiration ?? ""} onChange={e=>onExp(e.target.value)} placeholder="30 (days)" /></div>
      <div><input className="field" type="number" step="1" value={row.volume ?? ""} onChange={e=>onVol(e.target.value)} placeholder="1" /></div>
      <div><input className="field" type="number" step="0.01" value={row.premium ?? ""} onChange={e=>onPrem(e.target.value)} placeholder="Price" /></div>
      <div style={{display:"flex",justifyContent:"flex-end"}}>
        <button className="button" onClick={onRemove} aria-label="Delete row">🗑️</button>
      </div>
    </>
  );
}
