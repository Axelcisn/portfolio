// components/Strategy/StrategyTile.jsx
"use client";

import { StrategyGlyph } from "./icons";

function MetricPill({ label, value }) {
  if (value === null || value === undefined || value === "—") return null;
  return (
    <div className="s-metric" aria-label={label}>
      <span className="s-metric-k">{label}</span>
      <span className="s-metric-v">{value}</span>
    </div>
  );
}

function DirectionBadge({ dir }) {
  const k =
    dir === "Bullish" ? "bullish" : dir === "Bearish" ? "bearish" : "neutral";
  return <span className={`s-badge ${k}`} aria-label={`Direction: ${dir}`}>{dir}</span>;
}

export default function StrategyTile({ item, onOpen }) {
  const { id, name, direction, metrics = {}, isManual = false, isMulti } = item;

  const handleKey = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen?.();
    }
  };

  return (
    <button
      type="button"
      className={`s-tile ${isManual ? "manual" : ""}`}
      onClick={() => onOpen?.()}
      onKeyDown={handleKey}
      aria-label={`${name} strategy`}
    >
      {/* header: icon + direction badge */}
      <div className="s-head">
        <div className="s-ico">
          <StrategyGlyph id={id} manual={isManual} />
        </div>
        <DirectionBadge dir={direction || "Neutral"} />
      </div>

      {/* title */}
      <div className="s-name" title={name}>{name}</div>

      {/* metrics strip */}
      <div className="s-strip" aria-hidden={false}>
        <MetricPill label="Sharpe" value={fmt(metrics.sharpe)} />
        <MetricPill label="E[Ret]" value={fmtPct(metrics.expectedReturn)} />
        <MetricPill label="E[Prof]" value={fmtMoney(metrics.expectedProfit)} />
        <MetricPill label="P[Win]" value={fmtPct(metrics.pWin)} />
      </div>

      {/* tag (single/multi) */}
      <div className="s-foot">
        <span className="s-tag">{isMulti ? "Multi‑leg" : "Single‑leg"}</span>
      </div>
    </button>
  );
}

/* ---------- small formatters ---------- */
function fmt(n) {
  if (!Number.isFinite(n)) return "—";
  const s = Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
  return s.replace(/\.00$/, "");
}
function fmtPct(n) {
  if (!Number.isFinite(n)) return "—";
  return `${(n).toFixed(0)}%`;
}
function fmtMoney(n) {
  if (!Number.isFinite(n)) return "—";
  const v = Math.abs(n) >= 1000 ? n.toFixed(0) : n.toFixed(0);
  return v;
}
