// components/Strategy/Chart.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ----------------------- number helpers ----------------------- */
const nz = (v, def = 0) => (Number.isFinite(+v) ? +v : def);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/* ----------------------- BS pricing & greeks ------------------ */
// Abramowitz & Stegun erf approximation
function erf(x) {
  const s = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5*t + a4)*t + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return s * y;
}
const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2)); // normal CDF
const n = (x) => Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI); // pdf

function bsD1(S, K, r, sigma, T) {
  if (sigma <= 0 || T <= 0 || S <= 0 || K <= 0) return 0;
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}
function bsPrice(S, K, r, sigma, T, kind/*"call"|"put"*/) {
  if (!Number.isFinite(S) || !Number.isFinite(K)) return 0;
  if (sigma <= 0 || T <= 0) {
    // intrinsic (no discount for simplicity of seeding)
    const intrinsic = kind === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return intrinsic;
  }
  const d1 = bsD1(S, K, r, sigma, T);
  const d2 = d1 - sigma * Math.sqrt(T);
  if (kind === "call") {
    return S * N(d1) - K * Math.exp(-r * T) * N(d2);
  } else {
    return K * Math.exp(-r * T) * N(-d2) - S * N(-d1);
  }
}
function bsGreek(S, K, r, sigma, T, kind, greek) {
  if (kind === "stock") {
    // stock leg greeks: Δ=±1, Γ=0, Θ=0, ν=0, ρ≈0
    switch (greek) {
      case "Delta": return 1;
      case "Gamma": return 0;
      case "Theta": return 0;
      case "Vega":  return 0;
      case "Rho":   return 0;
      default: return 0;
    }
  }
  if (sigma <= 0 || T <= 0 || S <= 0 || K <= 0) {
    // near-expiry, approximate from intrinsic: only Delta is piecewise
    if (greek === "Delta") {
      if (kind === "call") return S > K ? 1 : 0;
      return S < K ? -1 : 0;
    }
    return 0;
  }
  const d1 = bsD1(S, K, r, sigma, T);
  const d2 = d1 - sigma * Math.sqrt(T);
  switch (greek) {
    case "Delta":
      return kind === "call" ? N(d1) : N(d1) - 1;
    case "Gamma":
      return n(d1) / (S * sigma * Math.sqrt(T));
    case "Vega":
      return S * n(d1) * Math.sqrt(T) / 100; // per 1 vol pt
    case "Theta": {
      const term1 = -(S * n(d1) * sigma) / (2 * Math.sqrt(T));
      if (kind === "call") {
        return (term1 - r * K * Math.exp(-r * T) * N(d2)) / 365;
      }
      return (term1 + r * K * Math.exp(-r * T) * N(-d2)) / 365;
    }
    case "Rho":
      if (kind === "call") return (K * T * Math.exp(-r * T) * N(d2)) / 100;
      return (-K * T * Math.exp(-r * T) * N(-d2)) / 100;
    default:
      return 0;
  }
}

/* ----------------------- normalize UI rows -------------------- */
function parseLeg(row) {
  // Accept either row.type or row.position. Examples: "Long Call", "Short Put", "Long Stock"
  const label = String(row?.type ?? row?.position ?? "").toLowerCase();
  const isLong = label.includes("long") || label.includes("buy");
  const isShort = label.includes("short") || label.includes("sell");
  const isCall = label.includes("call");
  const isPut  = label.includes("put");
  const isStock = label.includes("stock");

  const side = isShort ? -1 : +1; // default long
  const kind = isStock ? "stock" : isCall ? "call" : isPut ? "put" : null;

  const K = nz(row?.strike, NaN);
  const q = nz(row?.volume, 0);
  const prem = nz(row?.premium, 0);
  const days = nz(row?.expiration, nz(row?.T, 30));
  const T = Math.max(0, days) / 365;

  return { side, kind, K, q, prem, T, raw: row };
}

function domainFromRows(rows, spot) {
  const ks = rows.map(r => nz(r.strike, NaN)).filter(Number.isFinite);
  if (!ks.length) {
    if (Number.isFinite(spot)) return { minX: spot * 0.9, maxX: spot * 1.1 };
    return { minX: 90, maxX: 110 };
  }
  const lo = Math.min(...ks), hi = Math.max(...ks);
  const span = Math.max(1, hi - lo);
  return { minX: lo - span * 0.35, maxX: hi + span * 0.35 };
}

/* ----------------------- SVG helpers ------------------------- */
function pathFromXY(X, Y, x, y) {
  return X.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${y(Y[i])}`).join(" ");
}

/* ----------------------- Component --------------------------- */
export default function Chart({
  rows = [],
  spot = NaN,
  sigma = 0.25,
  riskFree = 0.0,
  height = 420,
  greek = "Vega",
  contractSize = 1,     // keep as 1; outer metrics already show lot size
  ci = null,            // {low, high, mean} (optional overlays)
}) {
  /* size */
  const hostRef = useRef(null);
  const [w, setW] = useState(960);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(es => {
      for (const e of es) setW(Math.max(360, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* normalize legs */
  const legs = useMemo(() => {
    const L = rows.map(parseLeg)
      .filter(l => l.q > 0 && (l.kind === "stock" || Number.isFinite(l.K)));
    return L;
  }, [rows]);

  /* domain */
  const { minX, maxX } = useMemo(() => domainFromRows(rows, spot), [rows, spot]);

  /* build X grid */
  const X = useMemo(() => {
    const N = 240;
    const out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = minX + (i / (N - 1)) * (maxX - minX);
    return out;
  }, [minX, maxX]);

  /* compute payoff arrays */
  const { Yexp, Ycur, G } = useMemo(() => {
    const yE = new Array(X.length).fill(0);
    const yC = new Array(X.length).fill(0);
    const g  = new Array(X.length).fill(0);

    for (let i = 0; i < X.length; i++) {
      const S = X[i];
      let eSum = 0, cSum = 0, gSum = 0;

      for (const l of legs) {
        const mult = l.side * l.q * contractSize;
        if (l.kind === "stock") {
          // Treat premium as entry cost per share (optional); P&L = (S - prem)
          eSum += mult * (S - l.prem);
          cSum += mult * (S - l.prem);
          // Greeks for stock
          gSum += mult * bsGreek(S, 1, riskFree, sigma, l.T, "stock", greek);
          continue;
        }
        // expiration intrinsic minus premium
        const intrinsic = l.kind === "call" ? Math.max(S - l.K, 0) : Math.max(l.K - S, 0);
        eSum += mult * (intrinsic - l.prem);

        // current price via BS minus premium
        const px = bsPrice(S, l.K, riskFree, sigma, l.T, l.kind);
        cSum += mult * (px - l.prem);

        // greek (per option, aggregate)
        gSum += mult * bsGreek(S, l.K, riskFree, sigma, l.T, l.kind, greek);
      }
      yE[i] = eSum;
      yC[i] = cSum;
      g[i]  = gSum;
    }
    return { Yexp: yE, Ycur: yC, G: g };
  }, [X, legs, greek, contractSize, riskFree, sigma]);

  /* scales */
  const pad = { t: 18, r: 16, b: 46, l: 60 };
  const W = Math.max(100, w - pad.l - pad.r);
  const H = Math.max(120, height - pad.t - pad.b);
  const x = (v) => pad.l + ((v - minX) / (maxX - minX)) * W;

  const yMin = Math.min(0, ...Yexp, ...Ycur);
  const yMax = Math.max(0, ...Yexp, ...Ycur);
  const yPad = Math.max(1, (yMax - yMin) * 0.12);
  const minY = yMin - yPad;
  const maxY = yMax + yPad;
  const y = (v) => pad.t + (1 - (v - minY) / (maxY - minY)) * H;

  /* axes ticks */
  const xticks = 8, yticks = 6;

  /* mean / CI overlays (optional) */
  const ciLines = useMemo(() => {
    if (!ci) return null;
    const arr = [];
    if (Number.isFinite(ci.low))  arr.push({ x: x(ci.low),  cls: "ci" });
    if (Number.isFinite(ci.high)) arr.push({ x: x(ci.high), cls: "ci" });
    if (Number.isFinite(ci.mean)) arr.push({ x: x(ci.mean), cls: "mean" });
    return arr;
  }, [ci, x]);

  return (
    <div ref={hostRef} style={{ width: "100%" }}>
      <svg width={w} height={height} role="img" aria-label="Options payoff chart">
        <defs>
          <clipPath id="areaPos"><rect x={pad.l} y={pad.t} width={W} height={Math.max(0,y(0)-pad.t)} /></clipPath>
          <clipPath id="areaNeg"><rect x={pad.l} y={y(0)} width={W} height={Math.max(0, height-pad.b - y(0))} /></clipPath>
        </defs>

        {/* background */}
        <rect x="0" y="0" width={w} height={height} fill="transparent" />

        {/* grid Y */}
        {Array.from({ length: yticks + 1 }).map((_, i) => {
          const yy = pad.t + (i / yticks) * H;
          const val = maxY - (i / yticks) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={pad.l} y1={yy} x2={w - pad.r} y2={yy} stroke="rgba(255,255,255,.06)" />
              <text x={pad.l - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {val.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* grid X */}
        {Array.from({ length: xticks + 1 }).map((_, i) => {
          const xx = pad.l + (i / xticks) * W;
          const val = minX + (i / xticks) * (maxX - minX);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={pad.t} x2={xx} y2={height - pad.b} stroke="rgba(255,255,255,.05)" />
              <text x={xx} y={height - 10} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.65)">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* spot marker */}
        {Number.isFinite(spot) && spot >= minX && spot <= maxX && (
          <line x1={x(spot)} y1={pad.t} x2={x(spot)} y2={height - pad.b}
                stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        {/* CI / Mean overlays */}
        {ciLines?.map((l, i) => (
          <line key={`ci${i}`} x1={l.x} x2={l.x} y1={pad.t} y2={height - pad.b}
                stroke={l.cls === "ci" ? "rgba(168,85,247,.55)" : "rgba(16,185,129,.7)"}
                strokeDasharray={l.cls === "ci" ? "6 6" : "4 2"} />
        ))}

        {/* shaded regions relative to zero */}
        <rect x={pad.l} y={pad.t} width={W} height={Math.max(0, y(0) - pad.t)} fill="rgba(16,185,129,.08)" clipPath="url(#areaPos)" />
        <rect x={pad.l} y={y(0)} width={W} height={Math.max(0, height - pad.b - y(0))} fill="rgba(244,63,94,.09)" clipPath="url(#areaNeg)" />

        {/* curves */}
        <path d={pathFromXY(X, Ycur, x, y)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={pathFromXY(X, Yexp, x, y)} fill="none" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="5 4" />
        <path d={pathFromXY(X, G,    x, y)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" />

      </svg>

      <style jsx>{`
        :global(.legend-dot){ width:8px; height:8px; border-radius:50%; display:inline-block; }
      `}</style>
    </div>
  );
}
