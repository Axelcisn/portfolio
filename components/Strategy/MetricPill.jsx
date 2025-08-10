// components/Strategy/MetricPill.jsx
"use client";

import { fmtCur, fmtPct, fmtNum } from "../../utils/format";

export default function MetricPill({ label, value, fmt = "num2", currency = "EUR" }) {
  const render = () => {
    if (!Number.isFinite(value)) return "—";
    switch (fmt) {
      case "pct0": return fmtPct(value);
      case "cur0": return fmtCur(value, currency);
      case "num1": return fmtNum(value, 1);
      default: return fmtNum(value, 2);
    }
  };
  return (
    <span className="pill">
      <span className="k">{label}</span>
      <span className="v">{render()}</span>
    </span>
  );
}
