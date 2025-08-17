// components/Strategy/StrategyMetricsBar.jsx
"use client";

import React from "react";

const isNum = (x) => Number.isFinite(x);

const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

function fmt(v, d = 2) { return isNum(v) ? Number(v).toFixed(d) : "—"; }
function fmtPct(p, d = 2) { return isNum(p) ? `${(p * 100).toFixed(d)}%` : "—"; }
function fmtMoney(v, ccy = "USD", d = 2) { return isNum(v) ? `${moneySign(ccy)}${Number(v).toFixed(d)}` : "—"; }

export default function StrategyMetricsBar({
  totals,
  env,
  currency = "USD",
  showRNNote = false,
  rnSanity = null,
}) {
  const S0 = env?.S0 ?? null;
  const mu = env?.mu ?? 0;
  const sigma = env?.sigma ?? null;
  const T = env?.T ?? null;

  // MC(S) and 95% CI for S_T under lognormal
  let meanMC = null, ciL = null, ciU = null;
  if (isNum(S0) && isNum(mu) && isNum(sigma) && isNum(T) && sigma > 0 && T > 0) {
    meanMC = S0 * Math.exp(mu * T);
    const mLN = Math.log(S0) + (mu - 0.5 * sigma * sigma) * T;
    const z = 1.959963984540054;
    const v = sigma * Math.sqrt(T);
    ciL = Math.exp(mLN - v * z);
    ciU = Math.exp(mLN + v * z);
  }

  // RN sanity note (optional)
  let rnNote = null;
  if (showRNNote && rnSanity && isNum(rnSanity.diff) && totals) {
    const off = Math.abs(rnSanity.diff);
    const scale = Math.max(1, Math.abs(totals.totalExpP) + Math.abs(rnSanity.carry));
    const offPct = (off / scale) * 100;
    rnNote = offPct < 5 ? null : `⚠︎ RN sanity off by ${offPct.toFixed(1)}%`;
  }

  return (
    <div className="strat-metrics" role="region" aria-label="Strategy metrics">
      <Pill label="E[Profit]" value={fmtMoney(totals?.totalExpP, currency)} tone={toneNum(totals?.totalExpP)} />
      <Pill label="E[Loss]" value={fmtMoney(totals?.totalEL, currency)} tone="neg" />
      <Pill label="P(Profit)" value={fmtPct(totals?.pop)} tone={toneNum((totals?.pop ?? 0) - 0.5)} />
      <Pill label="E[Return]" value={fmtPct(totals?.expR)} tone={toneNum(totals?.expR)} />
      <Pill label="Sharpe" value={fmt(totals?.sharpe, 2)} tone={toneNum(totals?.sharpe)} />
      <Pill label="MC(S)" value={fmtMoney(meanMC, currency)} />
      <Pill label="95% CI" value={`${fmtMoney(ciL, currency)} — ${fmtMoney(ciU, currency)}`} compact />
      <Pill label="Spot Price" value={fmtMoney(S0, currency)} />
      {rnNote && <div className="rn-note">{rnNote}</div>}

      <style jsx>{`
        .strat-metrics {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 6px 2px;
          overflow-x: auto;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
        }
        .rn-note {
          margin-left: auto;
          font-size: 12px;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}

function toneNum(n) {
  if (!Number.isFinite(n)) return "neu";
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "neu";
}

function Pill({ label, value, tone = "neu", compact = false }) {
  return (
    <div className={`pill ${compact ? "compact" : ""} ${tone}`}>
      <span className="label">{label}</span>
      <span className="val">{value ?? "—"}</span>
      <style jsx>{`
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          white-space: nowrap;
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--chip-bg);
          border: 1px solid var(--chip-border);
          font-weight: 700;
          font-size: 14px;
          line-height: 1;
          color: var(--text);
          backdrop-filter: blur(4px);
        }
        .pill.compact { font-size: 13px; padding: 6px 10px; }
        .label { opacity: .9; }
        .val { font-variant-numeric: tabular-nums; }
        .pill.pos {
          color: var(--positive);
          background: color-mix(in srgb, var(--positive) 12%, var(--chip-bg));
          border-color: color-mix(in srgb, var(--positive) 32%, var(--chip-border));
        }
        .pill.neg {
          color: var(--negative);
          background: color-mix(in srgb, var(--negative) 12%, var(--chip-bg));
          border-color: color-mix(in srgb, var(--negative) 28%, var(--chip-border));
        }
        .pill.neu {
          color: color-mix(in srgb, var(--text) 90%, transparent);
        }
      `}</style>
    </div>
  );
}
