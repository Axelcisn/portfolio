// components/Strategy/Chart.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { bsAll } from "./math/bsGreeks";       // import the BS helper you already have
import { gridPnl, uniqueStrikes } from "./payoffLite";
import { computeBreakevens, formatBE } from "./math/breakevens";

/* normalise rows into { key, strike, qty, prem } */
const LONG_SIGN = { lc: +1, lp: +1, sc: -1, sp: -1 };
const TYPE_TO_POSITION = {
  lc: "Long Call",
  sc: "Short Call",
  lp: "Long Put",
  sp: "Short Put",
};

function normalise(rows) {
  return (rows || []).map(r => {
    const key = r.type || r.position;
    const strike = Number(r.K ?? r.strike);
    const qty = Number(r.qty ?? r.volume ?? 0);
    const prem = Number(r.premium ?? 0);
    return { key, strike, qty, prem };
  });
}

export default function Chart({
  spot,
  currency = "USD",
  rows = [],
  riskFree = 0.02,
  sigma = 0.2,
  T = 30 / 365,
  greek = "vega",
  onGreekChange,
  contractSize = 1,
}) {
  const ref = useRef(null);
  const [width, setWidth] = useState(1000);
  const [zoom, setZoom] = useState(1);         // Zoom scalar
  const normRows = useMemo(() => normalise(rows), [rows]);

  // Base domain (never pans)
  const baseDomain = useMemo(() => {
    const strikes = normRows.map(r => r.strike).filter(Number.isFinite);
    if (strikes.length) {
      const lo = Math.min(...strikes);
      const hi = Math.max(...strikes);
      return [lo - (hi - lo) * 0.25, hi + (hi - lo) * 0.25];
    }
    const s = Number(spot) || 100;
    return [s * 0.85, s * 1.15];
  }, [normRows, spot]);

  // Current zoomed domain, centred on base centre
  const minX = useMemo(() => {
    const [lo, hi] = baseDomain;
    const c = (lo + hi) / 2;
    const hspan = ((hi - lo) / 2) / zoom;
    return c - hspan;
  }, [baseDomain, zoom]);
  const maxX = useMemo(() => {
    const [lo, hi] = baseDomain;
    const c = (lo + hi) / 2;
    const hspan = ((hi - lo) / 2) / zoom;
    return c + hspan;
  }, [baseDomain, zoom]);

  /* resize handler */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setWidth(Math.max(300, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* P&L and Greeks */
  const { X, Y_now, Y_exp, G } = useMemo(() => {
    const nPts = 260;
    const xs = new Array(nPts);
    const yNow = new Array(nPts).fill(0);
    const yExp = new Array(nPts).fill(0);
    const greeks = { delta: new Array(nPts).fill(0), gamma: new Array(nPts).fill(0),
                     theta: new Array(nPts).fill(0), vega: new Array(nPts).fill(0),
                     rho: new Array(nPts).fill(0) };

    for (let i = 0; i < nPts; i++) {
      xs[i] = minX + ((maxX - minX) * i) / (nPts - 1);
    }
    for (const row of normRows) {
      const { key, strike, qty, prem } = row;
      const sign = LONG_SIGN[key];
      for (let i = 0; i < nPts; i++) {
        const S = xs[i];
        if (key === "ls" || key === "ss") {
          // stock P&L = sign*(S - entry)
          const entry = strike;
          yNow[i] += qty * (sign * (S - entry) - prem);
          yExp[i] += qty * (sign * (S - entry) - prem);
          // stock delta = ±1, others 0
          if (greek === "delta") greeks.delta[i] += qty * sign;
          continue;
        }
        // Option P&L now: BS - premium
        const opt = key[1] === "c" ? "call" : "put";
        const { price, delta, gamma, vega, theta, rho } =
          bsAll({ S, K: strike, r: riskFree, sigma, T, type: opt });
        const intrinsic = opt === "call"
          ? Math.max(S - strike, 0)
          : Math.max(strike - S, 0);
        yNow[i] += qty * (sign * price - prem);
        yExp[i] += qty * (sign * intrinsic - prem);
        greeks.delta[i] += qty * sign * delta;
        greeks.gamma[i] += qty * sign * gamma;
        greeks.vega[i]  += qty * sign * vega / 100;      // per 1 vol point
        greeks.rho[i]   += qty * sign * rho / 100;       // per 1% rate
        greeks.theta[i] += qty * sign * theta / 365;     // per day
      }
    }
    return { X: xs, Y_now: yNow, Y_exp: yExp, G: greeks };
  }, [normRows, minX, maxX, riskFree, sigma, T]);

  /* Greek curve for selected Greek */
  const gCurve = G[greek] || [];
  /* Metrics */
  const maxProfit = useMemo(() => Math.max(0, ...Y_exp), [Y_exp]);
  const maxLoss = useMemo(() => Math.min(0, ...Y_exp), [Y_exp]);
  const winRate = useMemo(() => {
    const N = Y_exp.length;
    const wins = Y_exp.filter((v) => v > 0).length;
    return N ? (wins / N) * 100 : 0;
  }, [Y_exp]);
  const beRange = useMemo(() => {
    const b = computeBreakevens(X, Y_exp);
    if (!b) return "—";
    return b.length === 1 ? `${Math.round(b[0])} | —` : `${Math.round(b[0])} | ${Math.round(b[1])}`;
  }, [X, Y_exp]);

  /* Wheel zoom: adjust zoom scalar without panning */
  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.05 : 0.95; // smaller increments
    const newZoom = clamp(zoom * factor, 0.5, 4);  // clamp between 0.5× and 4×
    setZoom(newZoom);
  };
  /* Double-click resets zoom */
  const resetZoom = () => setZoom(1);

  /* Render logic */
  const heightPx = 420;
  const P = { t: 20, l: 50, r: 50, b: 50 };
  const W = width - P.l - P.r;
  const H = heightPx - P.t - P.b;
  const yScale = (v) => P.t + (1 - (v - maxLoss) / (maxProfit - maxLoss || 1)) * H;
  const gMax = Math.max(...gCurve), gMin = Math.min(...gCurve);
  const ygScale = (v) => P.t + (1 - (v - gMin) / (gMax - gMin || 1)) * H;
  const xScale = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const linePath = (xs, ys, yfn) =>
    xs.map((vx, i) => `${i ? "L" : "M"}${xScale(vx)},${yfn(ys[i])}`).join("");

  return (
    <section onWheel={onWheel} onDoubleClick={resetZoom}>
      <svg ref={ref} width={width} height={heightPx}>
        <rect x="0" y="0" width={width} height={heightPx} fill="transparent" />
        {/* Y grid */}
        {Array.from({ length: 4 }).map((_, i) => {
          const yv = maxProfit + (i / 3) * (maxLoss - maxProfit);
          return (
            <g key={i}>
              <line x1={P.l} y1={yScale(yv)} x2={width - P.r} y2={yScale(yv)} stroke="#444" />
              <text x={P.l - 8} y={yScale(yv) + 3} textAnchor="end" fontSize="10" fill="#777">
                {fmtCur(yv, currency, 0)}
              </text>
            </g>
          );
        })}
        {/* X grid */}
        {Array.from({ length: 4 }).map((_, i) => {
          const xv = minX + (i / 3) * (maxX - minX);
          return (
            <g key={`x${i}`}>
              <line y1={P.t} y2={heightPx - P.b} x1={xScale(xv)} x2={xScale(xv)} stroke="#444" />
              <text y={heightPx - P.b + 16} x={xScale(xv)} textAnchor="middle" fontSize="10" fill="#777">
                {Math.round(xv * 10) / 10}
              </text>
            </g>
          );
        })}
        {/* Curves */}
        <path d={linePath(X, Y_now, yScale)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={linePath(X, Y_exp, yScale)} fill="none" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="5 3" />
        <path d={linePath(X, gCurve, ygScale)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" />
        {/* Strike markers */}
        {uniqueStrikes(rows).map((s, i) => (
          <line key={i} x1={xScale(s)} x2={xScale(s)} y1={P.t} y2={heightPx - P.b} stroke="#777" strokeDasharray="2 4" />
        ))}
      </svg>
      {/* Metric pills */}
      <div style={{ display: "flex", overflowX: "auto", gap: 8, marginTop: 10 }}>
        <Metric label="Underlying price" value={fmtCur(spot, currency)} />
        <Metric label="Max profit" value={fmtCur(maxProfit, currency, 0)} />
        <Metric label="Max loss" value={fmtCur(maxLoss, currency, 0)} />
        <Metric label="Win rate" value={`${winRate.toFixed(2)}%`} />
        <Metric label="Breakeven (Low | High)" value={beRange} />
        <Metric label="Lot size" value={rows.length} />
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{
      minWidth: 160, padding: "10px 12px", border: "1px solid var(--border)",
      borderRadius: 10, background: "var(--bg)", display: "flex", flexDirection: "column"
    }}>
      <span style={{ fontSize: 12, opacity: 0.7 }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}
