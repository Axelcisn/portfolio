// components/Strategy/Chart.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gridPnl, uniqueStrikes } from "./payoffLite";
import { computeBreakevens, formatBE } from "./math/breakevens";

/* ------------------------- helpers ------------------------- */
const OPTION_TYPES = new Set(["lc", "sc", "lp", "sp"]);

const fmtCur = (v, ccy = "USD", fd = 2) => {
  if (!Number.isFinite(Number(v))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: fd,
    }).format(Number(v));
  } catch {
    const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return sym + Number(v).toFixed(fd);
  }
};

function useSize(ref, fallbackW = 960) {
  const [w, setW] = useState(fallbackW);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

const Pill = ({ label, value }) => (
  <div className="pill">
    <div className="p-label">{label}</div>
    <div className="p-value">{value}</div>
    <style jsx>{`
      .pill {
        min-width: 160px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--bg);
        display: grid;
        gap: 4px;
      }
      .p-label { font-size: 12px; opacity: .7; }
      .p-value { font-weight: 700; }
    `}</style>
  </div>
);

/* ------------------------- main ------------------------- */
export default function Chart({
  frameless = false,
  spot = null,
  currency = "USD",
  rows = [],
  riskFree = 0,
  sigma = 0.2,
  T = 30 / 365,             // years
  greek = "vega",
  onGreekChange,
  contractSize = 1,
}) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);
  const height = 420;

  // ------- domain from strikes/spot -------
  const strikes = rows.map((r) => Number(r.K ?? r.strike)).filter(Number.isFinite);
  const s = Number(spot);
  let minX, maxX;
  if (strikes.length) {
    const lo = Math.min(...strikes);
    const hi = Math.max(...strikes);
    const span = Math.max(1, hi - lo);
    minX = lo - span * 0.25;
    maxX = hi + span * 0.25;
  } else if (Number.isFinite(s)) {
    minX = s * 0.8;
    maxX = s * 1.2;
  } else {
    minX = 100; maxX = 200;
  }

  // ------- payoff grid (expiration) -------
  const { X, Y } = useMemo(
    () => gridPnl(rows, minX, maxX, 260, contractSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(rows), minX, maxX, contractSize]
  );
  const Ycur = Y; // placeholder until live pricing is connected

  // ------- y-range -------
  const yMin = Math.min(0, ...Y, ...Ycur);
  const yMax = Math.max(0, ...Y, ...Ycur);
  const pad = Math.max(1, (yMax - yMin) * 0.1);
  const minY = yMin - pad;
  const maxY = yMax + pad;

  // ------- coordinates -------
  const P = { t: 18, r: 16, b: 44, l: 68 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const y = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;
  const toPath = (arrX, arrY) =>
    arrX.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${y(arrY[i])}`).join(" ");

  // ------- breakevens on expiration curve -------
  const be = useMemo(() => computeBreakevens(X, Y), [X, Y]);
  const beText = useMemo(() => {
    const fmt = (v) => Number.isFinite(v) ? Math.round(v) : "—";
    const yLeft = Y?.[0], yRight = Y?.[Y.length - 1];
    return formatBE(be.lo, be.hi, yLeft, yRight, fmt);
  }, [be, Y]);

  // ------- summary metrics -------
  const maxProfit = useMemo(() => Math.max(0, ...Y), [Y]);
  const maxLoss = useMemo(() => Math.min(0, ...Y), [Y]);
  const winRate = useMemo(() => {
    const n = Y.length || 1;
    const wins = Y.filter((v) => v > 0).length;
    return (wins / n) * 100;
  }, [Y]);

  const lotSize = useMemo(
    () => rows.filter((r) => OPTION_TYPES.has(r.type || r.position) && Number(r.qty ?? r.volume ?? 0) !== 0).length || 0,
    [rows]
  );

  // ------- greek choices (placeholder for now) -------
  const greekChoices = ["vega", "delta", "gamma", "theta", "rho"];
  const greekCurve = useMemo(() => Array(X.length).fill(0), [X.length]); // placeholder zero line

  // ------- ui -------
  const kMarks = uniqueStrikes(rows);

  return (
    <div className={frameless ? "" : "card"} ref={wrapRef}>
      {/* Legend & controls */}
      <div className="legend">
        <div className="l-left">
          <span className="dot" style={{ background: "#60a5fa" }} />
          <span>Current P&amp;L</span>
          <span className="sep" />
          <span className="dot" style={{ background: "#f5f5f5" }} />
          <span>Expiration P&amp;L</span>
          <span className="sep" />
          <span className="dot" style={{ background: "#f59e0b" }} />
          <span>Vega</span>
        </div>
        <div className="l-right">
          <label className="small muted" style={{ marginRight: 8 }}>Greek</label>
          <select
            className="picker"
            value={greek}
            onChange={(e) => onGreekChange?.(e.target.value)}
          >
            {greekChoices.map((g) => <option key={g} value={g}>{g[0].toUpperCase()+g.slice(1)}</option>)}
          </select>
        </div>
      </div>

      {/* Chart */}
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Win/Loss shading relative to zero */}
        <rect x={P.l} y={P.t} width={W} height={y(0) - P.t} fill="rgba(16,185,129,.07)" />
        <rect x={P.l} y={y(0)} width={W} height={height - P.b - y(0)} fill="rgba(244,63,94,.08)" />

        {/* Y grid */}
        {Array.from({ length: 6 + 1 }).map((_, i) => {
          const yy = P.t + (i / 6) * H;
          const val = maxY - (i / 6) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 12} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {fmtCur(val, currency, 0)}
              </text>
            </g>
          );
        })}

        {/* X grid */}
        {Array.from({ length: 8 + 1 }).map((_, i) => {
          const xx = P.l + (i / 8) * W;
          const val = minX + (i / 8) * (maxX - minX);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={P.t} x2={xx} y2={height - P.b} stroke="rgba(255,255,255,.05)" />
              <text x={xx} y={height - 12} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.65)">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Underlying price marker */}
        {Number.isFinite(s) && s >= minX && s <= maxX && (
          <line x1={x(s)} y1={P.t} x2={x(s)} y2={height - P.b} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        {/* Strike markers */}
        {kMarks.map((k, i) => (
          <g key={`k${i}`}>
            <line x1={x(k)} y1={P.t} x2={x(k)} y2={height - P.b} stroke="rgba(255,255,255,.12)" />
            <circle cx={x(k)} cy={y(0)} r="2.5" fill="rgba(255,255,255,.55)" />
          </g>
        ))}

        {/* Curves */}
        <path d={toPath(X, Ycur)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={toPath(X, Y)} fill="none" stroke="#f5f5f5" strokeWidth="2" strokeDasharray="5 4" />
        {/* Greek (placeholder) */}
        <path d={toPath(X, greekCurve)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" />
      </svg>

      {/* Metrics: horizontally scrollable */}
      <div className="metrics-scroll" role="region" aria-label="Strategy metrics">
        <Pill label="Underlying price" value={fmtCur(spot, currency)} />
        <Pill label="Max profit" value={fmtCur(maxProfit, currency, 0)} />
        <Pill label="Max loss" value={fmtCur(maxLoss, currency, 0)} />
        <Pill label="Win rate" value={`${winRate.toFixed(2)}%`} />
        <Pill label="Breakeven (Low | High)" value={beText} />
        <Pill label="Lot size" value={lotSize} />

        {/* extra placeholders (not computed yet) */}
        <Pill label="CI (Low | High)" value="—" />
        <Pill label="Delta" value="—" />
        <Pill label="Gamma" value="—" />
        <Pill label="Rho" value="—" />
        <Pill label="Theta" value="—" />
        <Pill label="Vega" value="—" />
        <Pill label="Max" value="—" />
        <Pill label="Mean[Price]" value="—" />
        <Pill label="Max[Return]" value="—" />
        <Pill label="E[Return]" value="—" />
        <Pill label="Sharpe Ratio" value="—" />
        <Pill label="BS(C)" value="—" />
        <Pill label="BS(P)" value="—" />
      </div>

      <style jsx>{`
        .legend{
          display:flex; align-items:center; justify-content:space-between;
          padding: 6px 2px 10px; gap:10px;
        }
        .l-left{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }
        .sep{ width:10px; }
        .picker{
          height:28px; min-width:120px; padding:0 10px; border-radius:8px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
        }
        .metrics-scroll{
          margin-top:12px;
          display:flex; gap:10px; overflow-x:auto; padding-bottom:2px;
          scrollbar-width: thin;
        }
        :global(.metrics-scroll::-webkit-scrollbar){ height:8px; }
        :global(.metrics-scroll::-webkit-scrollbar-thumb){ background:var(--border); border-radius:10px; }
      `}</style>
    </div>
  );
}
