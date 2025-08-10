// components/Strategy/StrategyTile.jsx
"use client";

import DirectionBadge from "./DirectionBadge";
import MetricPill from "./MetricPill";

export default function StrategyTile({ item, onOpen }) {
  const { icon: Icon } = item;

  return (
    <button
      type="button"
      className="sg-tile"
      onClick={onOpen}
      aria-label={item.name}
    >
      <div className="sg-icon">{Icon && <Icon aria-hidden="true" />}</div>
      <div className="sg-name" title={item.name}>{item.name}</div>

      <div className="sg-strip" aria-hidden="true">
        <MetricPill label="Sharpe" value={item.metrics?.sharpe} fmt="num2" />
        <MetricPill label="E[Ret]" value={item.metrics?.expectedReturn} fmt="pct0" />
        <MetricPill label="E[Prof]" value={item.metrics?.expectedProfit} fmt="cur0" />
        <MetricPill label="P[Win]" value={item.metrics?.pWin} fmt="pct0" />
      </div>

      <div className="sg-dir">
        <DirectionBadge value={item.direction} />
      </div>
    </button>
  );
}
