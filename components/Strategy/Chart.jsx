// components/Strategy/Chart.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------ Math helpers ------------------------------ */
const SQRT2 = Math.SQRT2;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
function normCdf(x) { return 0.5 * (1 + erf(x / SQRT2)); }
function normPdf(x) { return INV_SQRT_2PI * Math.exp(-0.5 * x * x); }

/* -------------------------- Black–Scholes & Greeks ------------------------ */
function d1(S, K, r, sigma, T) {
  if (!(S > 0) || !(K > 0) || !(sigma > 0) || !(T > 0)) return 0;
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}
function d2(d1, sigma, T) { return d1 - sigma * Math.sqrt(T); }

function bsPrice(S, K, r, sigma, T, type) {
  if (!(S > 0) || !(K > 0)) return 0;
  if (!(sigma > 0) || !(T > 0)) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return intrinsic;
  }
  const _d1 = d1(S, K, r, sigma, T);
  const _d2 = d2(_d1, sigma, T);
  if (type === "call") return S * normCdf(_d1) - K * Math.exp(-r * T) * normCdf(_d2);
  return K * Math.exp(-r * T) * normCdf(-_d2) - S * normCdf(-_d1);
}

function greekValue(greek, S, K, r, sigma, T, type) {
  const _d1 = d1(S, K, r, sigma, T);
  const _d2 = d2(_d1, sigma, T);
  const phi = normPdf(_d1);
  switch ((greek || "vega").toLowerCase()) {
    case "delta": return type === "call" ? normCdf(_d1) : normCdf(_d1) - 1;
    case "gamma": return (phi / (S * sigma * Math.sqrt(T))) || 0;
    case "vega":  return S * phi * Math.sqrt(T);
    case "theta": {
      const term1 = -(S * phi * sigma) / (2 * Math.sqrt(T));
      const term2 = type === "call"
        ? -r * K * Math.exp(-r * T) * normCdf(_d2)
        :  r * K * Math.exp(-r * T) * normCdf(-_d2);
      return term1 + term2;
    }
    case "rho":   return type === "call"
      ? K * T * Math.exp(-r * T) * normCdf(_d2)
      : -K * T * Math.exp(-r * T) * normCdf(-_d2);
    default:      return S * phi * Math.sqrt(T);
  }
}

/* ------------------------------- Formatting ------------------------------- */
function fmtPct(x, d = 2) { return Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—"; }
function fmtNum(x, d = 2) { return Number.isFinite(x) ? Number(x).toFixed(d) : "—"; }
function fmtCur(x, ccy = "USD", d = 2) {
  try { return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, maximumFractionDigits: d }).format(x); }
  catch { return `${x?.toFixed?.(d) ?? x} ${ccy}`; }
}

/* ----------------------------- Scales & ticks ----------------------------- */
function linScale(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  const m = (r1 - r0) / (d1 - d0);
  const b = r0 - m * d0;
  const scale = (x) => m * x + b;
  scale.invert = (y) => (y - b) / m;
  return scale;
}
function tickStep(min, max, count) {
  const span = Math.max(1e-9, max - min);
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / (count * step);
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  return step * mult;
}
function ticks(min, max, count = 6) {
  const step = tickStep(min, max, count);
  const start = Math.ceil(min / step) * step;
  const ts = [];
  for (let v = start; v <= max + 1e-9; v += step) ts.push(v);
  return ts;
}

/* ------------------------------- Leg helpers ------------------------------ */
const LEG_LABEL = { lc: "Long Call", sc: "Short Call", lp: "Long Put", sp: "Short Put" };

function sanitizeLeg(leg) {
  const q = Number(leg?.qty || 0);
  return {
    enabled: !!leg?.enabled && Number.isFinite(leg?.K),
    K: Number.isFinite(leg?.K) ? Number(leg.K) : null,
    qty: Number.isFinite(q) ? q : 0,
    premium: Number.isFinite(leg?.premium) ? Number(leg.premium) : null,
  };
}

function collectStrikes(legs) {
  const ks = [];
  const L = legs || {};
  for (const k of ["lc","sc","lp","sp"]) {
    const leg = sanitizeLeg(L[k]);
    if (leg.enabled && Number.isFinite(leg.K)) ks.push(leg.K);
  }
  return ks.sort((a, b) => a - b);
}
function lotSizeFromLegs(legs) {
  const abs = (x) => Math.abs(Number(x || 0));
  const L = legs || {};
  return abs(L?.lc?.qty) + abs(L?.sc?.qty) + abs(L?.lp?.qty) + abs(L?.sp?.qty);
}
function netPremiumFromLegs(legs) {
  const n = (v) => Number(v || 0);
  const L = legs || {};
  const lc = n(L?.lc?.premium) * n(L?.lc?.qty);
  const lp = n(L?.lp?.premium) * n(L?.lp?.qty);
  const sc = n(L?.sc?.premium) * n(L?.sc?.qty);
  const sp = n(L?.sp?.premium) * n(L?.sp?.qty);
  // long = debit (+), short = credit (−)
  return (lc + lp) - (sc + sp);
}

/* ---------------------------- P&L line generators ------------------------- */
function pnlExpiration(S, legs, netPrem, contractSize = 1) {
  const n = (v) => Number(v || 0);
  let y = 0;
  const L = legs || {};
  if (L?.lc?.enabled && Number.isFinite(L?.lc?.K)) y += Math.max(S - n(L.lc.K), 0) * n(L.lc.qty);
  if (L?.sc?.enabled && Number.isFinite(L?.sc?.K)) y -= Math.max(S - n(L.sc.K), 0) * n(L.sc.qty);
  if (L?.lp?.enabled && Number.isFinite(L?.lp?.K)) y += Math.max(n(L.lp.K) - S, 0) * n(L.lp.qty);
  if (L?.sp?.enabled && Number.isFinite(L?.sp?.K)) y -= Math.max(n(L.sp.K) - S, 0) * n(L.sp.qty);
  return (y - netPrem) * contractSize;
}
function pnlCurrent(S, legs, netPrem, r, sigma, T, contractSize = 1) {
  const n = (v) => Number(v || 0);
  let val = 0;
  const L = legs || {};
  if (L?.lc?.enabled && Number.isFinite(L?.lc?.K)) val += bsPrice(S, n(L.lc.K), r, sigma, T, "call") * n(L.lc.qty);
  if (L?.sc?.enabled && Number.isFinite(L?.sc?.K)) val -= bsPrice(S, n(L.sc.K), r, sigma, T, "call") * n(L.sc.qty);
  if (L?.lp?.enabled && Number.isFinite(L?.lp?.K)) val += bsPrice(S, n(L.lp.K), r, sigma, T, "put")  * n(L.lp.qty);
  if (L?.sp?.enabled && Number.isFinite(L?.sp?.K)) val -= bsPrice(S, n(L.sp.K), r, sigma, T, "put")  * n(L.sp.qty);
  return (val - netPrem) * contractSize;
}

/* ------------------------------- Greeks sum ------------------------------- */
function greekSum(greek, S, legs, r, sigma, T, contractSize = 1) {
  const n = (v) => Number(v || 0);
  let g = 0;
  const L = legs || {};
  if (L?.lc?.enabled && Number.isFinite(L?.lc?.K)) g += greekValue(greek, S, n(L.lc.K), r, sigma, T, "call") * n(L.lc.qty);
  if (L?.sc?.enabled && Number.isFinite(L?.sc?.K)) g -= greekValue(greek, S, n(L.sc.K), r, sigma, T, "call") * n(L.sc.qty);
  if (L?.lp?.enabled && Number.isFinite(L?.lp?.K)) g += greekValue(greek, S, n(L.lp.K), r, sigma, T, "put")  * n(L.lp.qty);
  if (L?.sp?.enabled && Number.isFinite(L?.sp?.K)) g -= greekValue(greek, S, n(L.sp.K), r, sigma, T, "put")  * n(L.sp.qty);
  return g * contractSize;
}

/* --------------------------- Breakevens & regions ------------------------- */
function breakEvens(xs, ys) {
  const out = [];
  for (let i = 1; i < xs.length; i++) {
    const y0 = ys[i - 1], y1 = ys[i];
    if ((y0 === 0) || (y1 === 0)) continue;
    if ((y0 > 0 && y1 < 0) || (y0 < 0 && y1 > 0)) {
      const t = Math.abs(y1 - y0) < 1e-12 ? 0 : (-y0) / (y1 - y0);
      out.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
    }
  }
  return Array.from(new Set(out.map((v) => Number(v.toFixed(6))))).sort((a, b) => a - b);
}

const GREEK_LABEL = { vega: "Vega", delta: "Delta", gamma: "Gamma", theta: "Theta", rho: "Rho" };

/* ---------------------------------- View ---------------------------------- */
export default function Chart({
  spot = null,
  currency = "USD",
  legs = null,                 // { lc, sc, lp, sp } with {enabled, K, qty, premium?}
  riskFree = 0.02,
  sigma = 0.2,
  T = 30 / 365,
  greek: greekProp,            // optional controlled greek name
  onGreekChange,               // optional callback(name)
  onLegsChange,                // optional callback(updatedLegs)
  contractSize = 1,
}) {
  /* ------------ internal editable legs (so you can type immediately) ------ */
  const [editable, setEditable] = useState(() => legs || {});
  useEffect(() => { setEditable(legs || {}); }, [legs]);

  const [lockStructure, setLockStructure] = useState(true);

  const safeLegs = useMemo(() => {
    const L = { lc: {}, sc: {}, lp: {}, sp: {}, ...(editable || {}) };
    // sanitize + auto-disable legs without a valid strike
    const mk = (leg) => {
      const q = Number(leg?.qty || 0);
      const K = Number(leg?.K);
      const enabled = !!leg?.enabled && Number.isFinite(K);
      return { enabled, K: Number.isFinite(K) ? K : null, qty: Number.isFinite(q) ? q : 0, premium: Number.isFinite(leg?.premium) ? Number(leg.premium) : null };
    };
    return { lc: mk(L.lc), sc: mk(L.sc), lp: mk(L.lp), sp: mk(L.sp) };
  }, [editable]);

  /* ---------------------------- Greek selector ---------------------------- */
  const [greekInner, setGreekInner] = useState("vega");
  const greek = (greekProp || greekInner || "vega").toLowerCase();
  useEffect(() => { if (greekProp) setGreekInner(greekProp); }, [greekProp]);

  /* ------------------------------- Domains -------------------------------- */
  const ks = collectStrikes(safeLegs);
  const centerStrike = ks.length === 1 ? ks[0] : (ks[0] + ks[ks.length - 1]) / 2 || spot || 0;

  const xDomain = useMemo(() => {
    if (!spot && ks.length === 0) return [0.5, 1.5];
    const minK = ks.length ? ks[0] : spot;
    const maxK = ks.length ? ks[ks.length - 1] : spot;
    const lo = Math.max(0.01, Math.min(minK, spot || minK) * 0.9);
    const hi = Math.max(minK * 1.1, Math.max(maxK, spot || maxK) * 1.1);
    return [lo, hi];
  }, [spot, ks]);

  const N = 401;
  const xs = useMemo(() => {
    const [lo, hi] = xDomain;
    const arr = new Array(N);
    const step = (hi - lo) / (N - 1);
    for (let i = 0; i < N; i++) arr[i] = lo + i * step;
    return arr;
  }, [xDomain]);

  const netPrem = useMemo(() => netPremiumFromLegs(safeLegs), [safeLegs]);

  const series = useMemo(() => {
    const yExp = xs.map((S) => pnlExpiration(S, safeLegs, netPrem, contractSize));
    const yNow = xs.map((S) => pnlCurrent(S, safeLegs, netPrem, riskFree, sigma, T, contractSize));
    const gVals = xs.map((S) => greekSum(greek, S, safeLegs, riskFree, sigma, T, contractSize));
    return { yExp, yNow, gVals };
  }, [xs, safeLegs, netPrem, contractSize, riskFree, sigma, T, greek]);

  const be = useMemo(() => breakEvens(xs, series.yExp), [xs, series.yExp]);

  const yExpMin = Math.min(...series.yExp);
  const yExpMax = Math.max(...series.yExp);
  const slopeRight = series.yExp[N - 1] - series.yExp[N - 2];
  const slopeLeft = series.yExp[1] - series.yExp[0];
  const maxProfit = (slopeRight > 1e-6) ? Infinity : yExpMax;
  const maxLoss   = (slopeLeft  < -1e-6) ? -Infinity : yExpMin;

  // Quick win-rate using lognormal PDF
  const mu = riskFree;
  const m = Math.log(Math.max(1e-9, spot || 1)) + (mu - 0.5 * sigma * sigma) * T;
  const s = sigma * Math.sqrt(T);
  const lognormPdf = (x) => (x > 0) ? (1 / (x * s * Math.sqrt(2 * Math.PI))) * Math.exp(-Math.pow(Math.log(x) - m, 2) / (2 * s * s)) : 0;

  const winMass = useMemo(() => {
    let mass = 0, total = 0;
    for (let i = 1; i < xs.length; i++) {
      const mid = 0.5 * (xs[i] + xs[i - 1]);
      const p = lognormPdf(mid);
      const y = (series.yExp[i] + series.yExp[i - 1]) / 2;
      const dx = xs[i] - xs[i - 1];
      total += p * dx;
      if (y > 0) mass += p * dx;
    }
    return total > 0 ? clamp(mass / total, 0, 1) : NaN;
  }, [xs, series.yExp]);

  const lotSize = useMemo(() => lotSizeFromLegs(safeLegs) || 1, [safeLegs]);

  /* ------------------------------ SVG geometry ----------------------------- */
  const ref = useRef(null);
  const [w, setW] = useState(900);
  const [h, setH] = useState(420);
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const el = entries[0]?.contentRect;
      if (el?.width) setW(Math.max(640, el.width));
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const pad = { l: 56, r: 56, t: 30, b: 40 };
  const innerW = Math.max(10, w - pad.l - pad.r);
  const innerH = Math.max(10, h - pad.t - pad.b);
  const xScale = useMemo(() => linScale(xDomain, [pad.l, pad.l + innerW]), [xDomain, innerW]);

  const yRange = useMemo(() => {
    const yLo = Math.min(0, Math.min(...series.yExp, ...series.yNow));
    const yHi = Math.max(0, Math.max(...series.yExp, ...series.yNow));
    return [yLo, yHi === yLo ? yLo + 1 : yHi];
  }, [series.yExp, series.yNow]);
  const yScale = useMemo(() => linScale([yRange[0], yRange[1]], [pad.t + innerH, pad.t]), [yRange, innerH]);

  const gMin = Math.min(...series.gVals), gMax = Math.max(...series.gVals);
  const gPad = (gMax - gMin) * 0.1 || 1;
  const gScale = useMemo(() => linScale([gMin - gPad, gMax + gPad], [pad.t + innerH, pad.t]), [gMin, gMax, gPad, innerH]);

  const zeroY = yScale(0);
  const xTicks = ticks(xDomain[0], xDomain[1], 7);
  const yTicks = ticks(yRange[0], yRange[1], 6);
  const gTicks = ticks(gMin - gPad, gMax + gPad, 6);

  function linePath(xs, ys, xS, yS) {
    let d = "";
    for (let i = 0; i < xs.length; i++) {
      const X = xS(xs[i]);
      const Y = yS(ys[i]);
      d += (i === 0 ? `M${X},${Y}` : `L${X},${Y}`);
    }
    return d;
  }

  // Profit/loss region shading split by break-evens
  const shadingRects = useMemo(() => {
    const boundsX = [xDomain[0], ...be, xDomain[1]];
    const rects = [];
    for (let i = 0; i < boundsX.length - 1; i++) {
      const a = boundsX[i], b = boundsX[i + 1];
      const mid = 0.5 * (a + b);
      const yMid = pnlExpiration(mid, safeLegs, netPrem, contractSize);
      rects.push({ x0: a, x1: b, sign: yMid >= 0 ? 1 : -1 });
    }
    return rects;
  }, [xDomain, be, safeLegs, netPrem, contractSize]);

  const legend = [
    { key: "now", label: "Current P&L", stroke: "var(--accent)" },
    { key: "exp", label: "Expiration P&L", stroke: "var(--text-muted, #999)" },
    { key: "greek", label: GREEK_LABEL[greek] || "Greek", stroke: "var(--warn, #f59e0b)", dash: [6, 6] },
  ];

  /* ----------------------------- Handlers (edit) --------------------------- */
  function updateLeg(key, field, value) {
    setEditable((prev) => {
      const next = { ...prev, [key]: { ...(prev?.[key] || {}) } };
      if (field === "enabled") {
        next[key].enabled = !!value;
      } else if (field === "qty") {
        const v = Number(value);
        next[key].qty = Number.isFinite(v) ? v : 0;
      } else if (field === "K") {
        const v = value === "" ? null : Number(value);
        next[key].K = Number.isFinite(v) ? v : null;
        // If strike cleared, auto-disable to avoid phantom legs
        if (!Number.isFinite(v)) next[key].enabled = false;
      } else if (field === "premium") {
        const v = value === "" ? null : Number(value);
        next[key].premium = Number.isFinite(v) ? v : null;
      }
      // notify parent if requested
      onLegsChange?.(next);
      return next;
    });
  }

  /* --------------------------------- Render -------------------------------- */
  return (
    <section className="card" ref={ref}>
      {/* Header with Greek selector */}
      <div className="chart-header">
        <div className="legend">
          {legend.map((l) => (
            <div className="leg" key={l.key}>
              <span className="sw" style={{ borderColor: l.stroke, borderStyle: l.dash ? "dashed" : "solid" }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="greek-ctl">
          <label className="small muted" htmlFor="greek">Greek</label>
          <select
            id="greek"
            value={greek}
            onChange={(e) => {
              setGreekInner(e.target.value);
              onGreekChange?.(e.target.value);
            }}
          >
            <option value="vega">Vega</option>
            <option value="delta">Delta</option>
            <option value="gamma">Gamma</option>
            <option value="theta">Theta</option>
            <option value="rho">Rho</option>
          </select>
        </div>
      </div>

      {/* Empty state nudge */}
      {collectStrikes(safeLegs).length === 0 && (
        <div className="empty-hint">
          Set <b>Strike</b> and (optionally) <b>Premium</b>, then toggle <b>On</b> to plot the legs.
        </div>
      )}

      <svg width="100%" height={h} role="img" aria-label="Strategy payoff chart">
        {/* Shading rectangles */}
        {shadingRects.map((r, i) => (
          <rect
            key={`shade-${i}`}
            x={xScale(r.x0)}
            y={pad.t}
            width={xScale(r.x1) - xScale(r.x0)}
            height={innerH}
            fill={r.sign > 0 ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)"}
          />
        ))}

        {/* Grid lines */}
        {xTicks.map((t, i) => (
          <line key={`xg-${i}`} x1={xScale(t)} x2={xScale(t)} y1={pad.t} y2={pad.t + innerH}
            stroke="var(--border)" strokeOpacity="0.6" />
        ))}
        {yTicks.map((t, i) => (
          <line key={`yg-${i}`} x1={pad.l} x2={pad.l + innerW} y1={yScale(t)} y2={yScale(t)}
            stroke="var(--border)" strokeOpacity="0.6" />
        ))}

        {/* Axes */}
        <line x1={pad.l} x2={pad.l + innerW} y1={yScale(0)} y2={yScale(0)} stroke="var(--text)" strokeOpacity="0.8" />

        {/* Left axis ticks/labels */}
        {yTicks.map((t, i) => (
          <g key={`yl-${i}`}>
            <line x1={pad.l - 4} x2={pad.l} y1={yScale(t)} y2={yScale(t)} stroke="var(--text)" />
            <text x={pad.l - 8} y={yScale(t)} dy="0.32em" textAnchor="end" className="tick">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {/* Bottom axis ticks/labels */}
        {xTicks.map((t, i) => (
          <g key={`xl-${i}`}>
            <line x1={xScale(t)} x2={xScale(t)} y1={pad.t + innerH} y2={pad.t + innerH + 4} stroke="var(--text)" />
            <text x={xScale(t)} y={pad.t + innerH + 16} textAnchor="middle" className="tick">
              {fmtNum(t, 0)}
            </text>
          </g>
        ))}

        {/* Right axis (Greek) */}
        <line x1={pad.l + innerW} x2={pad.l + innerW} y1={pad.t} y2={pad.t + innerH} stroke="var(--border)" />
        {gTicks.map((t, i) => (
          <g key={`gr-${i}`}>
            <line x1={pad.l + innerW} x2={pad.l + innerW + 4} y1={gScale(t)} y2={gScale(t)} stroke="var(--text)" />
            <text x={pad.l + innerW + 6} y={gScale(t)} dy="0.32em" className="tick">
              {fmtNum(t, 2)}
            </text>
          </g>
        ))}

        {/* Spot marker */}
        {Number.isFinite(spot) && (
          <line x1={xScale(spot)} x2={xScale(spot)} y1={pad.t} y2={pad.t + innerH}
            stroke="var(--text)" strokeDasharray="4 6" strokeOpacity="0.6" />
        )}

        {/* Center strike marker */}
        {Number.isFinite(centerStrike) && (
          <line x1={xScale(centerStrike)} x2={xScale(centerStrike)} y1={pad.t} y2={pad.t + innerH}
            stroke="var(--text)" strokeDasharray="2 6" strokeOpacity="0.6" />
        )}

        {/* Lines */}
        <path d={linePath(xs, series.yNow, xScale, yScale)} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        <path d={linePath(xs, series.yExp, xScale, yScale)} fill="none" stroke="var(--text-muted, #8a8a8a)" strokeWidth="2" />
        <path d={linePath(xs, series.gVals, xScale, gScale)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 6" />

        {/* Break-even points */}
        {be.map((b, i) => (
          <g key={`be-${i}`}>
            <line x1={xScale(b)} x2={xScale(b)} y1={pad.t} y2={pad.t + innerH} stroke="var(--text)" strokeOpacity="0.25" />
            <circle cx={xScale(b)} cy={yScale(0)} r="3.5" fill="var(--bg, #fff)" stroke="var(--text)" />
          </g>
        ))}

        {/* Axis titles */}
        <text x={pad.l + innerW / 2} y={pad.t + innerH + 32} textAnchor="middle" className="axis">Underlying price</text>
        <text transform={`translate(14 ${pad.t + innerH / 2}) rotate(-90)`} textAnchor="middle" className="axis">P/L</text>
        <text transform={`translate(${w - 14} ${pad.t + innerH / 2}) rotate(90)`} textAnchor="middle" className="axis">
          {GREEK_LABEL[greek] || "Greek"}
        </text>
      </svg>

      {/* Metrics bar */}
      <div className="metrics">
        <div className="m"><div className="k">Underlying price</div><div className="v">{Number.isFinite(spot) ? fmtCur(spot, currency, 2) : "—"}</div></div>
        <div className="m"><div className="k">Max profit</div><div className="v">{maxProfit === Infinity ? "∞" : fmtNum(maxProfit, 2)}</div></div>
        <div className="m"><div className="k">Max loss</div><div className="v">{maxLoss === -Infinity ? "∞" : fmtNum(maxLoss, 2)}</div></div>
        <div className="m"><div className="k">Win rate</div><div className="v">{fmtPct(winMass, 2)}</div></div>
        <div className="m">
          <div className="k">Breakeven</div>
          <div className="v">
            {be.length === 0 ? "—" :
             be.length === 1 ? fmtNum(be[0], 2) :
             `${fmtNum(be[0], 0)} | ${fmtNum(be[1], 0)}`}
          </div>
        </div>
        <div className="m"><div className="k">Lot size</div><div className="v">{lotSize}</div></div>
      </div>

      {/* ---------------------------- Control Panel --------------------------- */}
      <div className="ctrl">
        <div className="ctrl-head">
          <div className="title">Legs</div>
          <label className="small">
            <input type="checkbox" checked={!lockStructure} onChange={(e)=>setLockStructure(!e.target.checked)} />
            <span style={{ marginLeft: 6 }}>Unlock structure</span>
          </label>
        </div>

        <div className="table">
          <div className="row header">
            <div>On</div><div>Leg</div><div>Strike (K)</div><div>Volume</div><div>Premium</div>
          </div>

          {["lc","sc","lp","sp"].map((k) => {
            const leg = safeLegs[k]; // sanitized
            const src = editable?.[k] || {};
            return (
              <div className="row" key={k}>
                <div>
                  <input
                    type="checkbox"
                    checked={!!src.enabled}
                    onChange={(e)=>updateLeg(k, "enabled", e.target.checked)}
                    aria-label={`Enable ${LEG_LABEL[k]}`}
                  />
                </div>
                <div className="leglbl">{LEG_LABEL[k]}</div>
                <div>
                  <input
                    className="field small"
                    placeholder="e.g. 100"
                    value={src.K ?? ""}
                    onChange={(e)=>updateLeg(k, "K", e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div>
                  <input
                    className="field small"
                    value={src.qty ?? 0}
                    onChange={(e)=>updateLeg(k, "qty", e.target.value)}
                    inputMode="numeric"
                    disabled={lockStructure}
                  />
                </div>
                <div>
                  <input
                    className="field small"
                    placeholder="e.g. 1.25"
                    value={src.premium ?? ""}
                    onChange={(e)=>updateLeg(k, "premium", e.target.value)}
                    inputMode="decimal"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style jsx>{`
        .chart-header{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 10px 2px; }
        .legend{ display:flex; gap:14px; flex-wrap:wrap; }
        .leg{ display:inline-flex; align-items:center; gap:8px; font-size:12.5px; opacity:.9; }
        .sw{ width:18px; height:0; border-top:2px solid; border-radius:2px; }
        .greek-ctl{ display:flex; align-items:center; gap:8px; }
        .greek-ctl select{ height:28px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); padding:0 8px; }

        .empty-hint{ margin:10px 12px; padding:10px; border:1px dashed var(--border); border-radius:10px; opacity:.8; }

        .tick{ font-size:11px; fill:var(--text); opacity:.75; }
        .axis{ font-size:12px; fill:var(--text); opacity:.7; }

        .metrics{
          display:grid; grid-template-columns: repeat(6, minmax(0,1fr));
          gap:10px; padding:10px 12px 12px; border-top:1px solid var(--border);
        }
        .m .k{ font-size:12px; opacity:.7; }
        .m .v{ font-weight:700; }
        @media (max-width: 920px){
          .metrics{ grid-template-columns: repeat(3, minmax(0,1fr)); }
        }

        .ctrl{ margin-top:10px; border-top:1px solid var(--border); padding:10px 10px 4px; }
        .ctrl-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .ctrl .title{ font-weight:700; }
        .table{ display:grid; gap:6px; }
        .row{ display:grid; grid-template-columns: 60px 1.2fr 1.2fr 1fr 1.2fr; gap:8px; align-items:center; }
        .row.header{ font-size:12px; opacity:.7; }
        .leglbl{ font-weight:600; }
        .field.small{ height:30px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); padding:0 8px; width:100%; }
      `}</style>
    </section>
  );
}
