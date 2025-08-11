// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import Chart from "./Chart";
import PositionBuilder from "./PositionBuilder";
import SummaryTable from "./SummaryTable";

/* ---------- helpers ---------- */
const TYPE_KEY = { "Long Call": "lc", "Short Call": "sc", "Long Put": "lp", "Short Put": "sp" };
const KEY_TO_LABEL = { lc: "Long Call", sc: "Short Call", lp: "Long Put", sp: "Short Put", ls: "Long Stock", ss: "Short Stock" };

function seedRowsFromStrategy(strategy, spot, defaultDays = 30) {
  // Strategy.legs may already be normalized; if not, create sensible blanks.
  const base = Array.isArray(strategy?.legs) ? strategy.legs : [];
  if (base.length) {
    return base.map((r, i) => ({
      id: r.id ?? `${i}-${Math.random().toString(36).slice(2, 7)}`,
      type: r.type ?? TYPE_KEY[r.position] ?? r.key ?? "lc",
      K: Number.isFinite(r.strike) ? r.strike : null,
      premium: Number.isFinite(r.premium) ? r.premium : null,
      qty: Number.isFinite(r.volume) ? r.volume : 1,
      days: Number.isFinite(r.days) ? r.days : defaultDays,
      enabled: r.enabled ?? true,
    }));
  }
  // Fallback to one empty row of the strategy type, else none.
  const guess = TYPE_KEY[strategy?.name] || null;
  return guess
    ? [
        {
          id: "seed-0",
          type: guess,
          K: spot ? Number(spot) : null,
          premium: null,
          qty: 1,
          days: defaultDays,
          enabled: true,
        },
      ]
    : [];
}

function rowsToLegsObject(rows) {
  // Legacy shape expected by parent chart: lc/sc/lp/sp only
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
  const { spot, currency = "USD", high52, low52, riskFree = 0.02, sigma = 0.2, T = 30 / 365 } = env || {};
  const defaultDays = Math.max(1, Math.round((T || 30 / 365) * 365));

  // rows = the single source of truth for config + summary + chart
  const [rows, setRows] = useState(() => seedRowsFromStrategy(strategy, spot, defaultDays));
  const [greek, setGreek] = useState("vega");

  useEffect(() => {
    // Lock scroll + close on ESC
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev || "";
    };
  }, [onClose]);

  const legsObj = useMemo(() => rowsToLegsObject(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);

  const save = () => {
    // backwards compatible with previous Apply usage
    onApply?.(legsObj, totalPrem);
    onClose?.();
  };

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
            <div className="mh-icon">{strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}</div>
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
            rows={rows}
            riskFree={riskFree}
            sigma={sigma}
            T={T}
            greek={greek}
            onGreekChange={setGreek}
            contractSize={1}
          />
        </div>

        {/* Metrics under chart (kept minimal; chart already shows the strip) */}

        {/* Configuration */}
        <section className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-title">Configuration</div>
          <PositionBuilder rows={rows} onChange={setRows} currency={currency} defaultDays={defaultDays} />
        </section>

        {/* Summary */}
        <SummaryTable rows={rows} currency={currency} title="Summary" />
      </div>

      <style jsx>{`
        .modal-root {
          position: fixed; inset: 0; z-index: 70;
        }
        .modal-backdrop {
          position: absolute; inset: 0;
          background: rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(6px); /* soft blur as requested */
        }
        .modal-sheet {
          position: relative; margin: 36px auto;
          border-radius: 16px; background: var(--bg);
          border: 1px solid var(--border);
          box-shadow: 0 30px 80px rgba(0,0,0,0.35);
        }
        .modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .mh-left { display:flex; gap:12px; align-items:center; }
        .mh-icon { width:34px; height:34px; border-radius:10px; background:var(--card); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; }
        .mh-name { font-weight:800; }
        .mh-actions { display:flex; gap:8px; }
        .section-title { font-weight:700; margin-bottom:10px; }
        .card.dense { padding:12px; border:1px solid var(--border); border-radius:12px; background:var(--bg); }
      `}</style>
    </div>
  );
}
