// components/Strategy/Chart.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

/* -------------------------------- math --------------------------------- */
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}
const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
const normPdf = (x) => INV_SQRT_2PI * Math.exp(-0.5 * x * x);

function d1(S, K, r, sigma, T) {
  if (!(S > 0) || !(K > 0) || !(sigma > 0) || !(T > 0)) return 0;
  return (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
}
const d2 = (d1v, sigma, T) => d1v - sigma * Math.sqrt(T);

function bsPrice({ S, K, r, sigma, T, type }) {
  if (!(S > 0) || !(K > 0)) return 0;
  if (!(sigma > 0) || !(T > 0)) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return intrinsic;
  }
  const _d1 = d1(S, K, r, sigma, T), _d2 = d2(_d1, sigma, T);
  return type === "call"
    ? S * normCdf(_d1) - K * Math.exp(-r * T) * normCdf(_d2)
    : K * Math.exp(-r * T) * normCdf(-_d2) - S * normCdf(-_d1);
}

function greek({ which, S, K, r, sigma, T, type }) {
  const _d1 = d1(S, K, r, sigma, T), _d2 = d2(_d1, sigma, T), phi = normPdf(_d1);
  switch (which) {
    case "delta": return type === "call" ? normCdf(_d1) : normCdf(_d1) - 1;
    case "gamma": return (phi / (S * sigma * Math.sqrt(T))) || 0;
    case "vega":  return S * phi * Math.sqrt(T);
    case "theta": {
      const t1 = -(S * phi * sigma) / (2 * Math.sqrt(T));
      const t2 = type === "call"
        ? -r * K * Math.exp(-r * T) * normCdf(_d2)
        :  r * K * Math.exp(-r * T) * normCdf(-_d2);
      return t1 + t2;
    }
    case "rho":   return type === "call"
      ? K * T * Math.exp(-r * T) * normCdf(_d2)
      : -K * T * Math.exp(-r * T) * normCdf(-_d2);
    default:      return 0;
  }
}

/* ------------------------------- utilities ------------------------------ */
function lin(domain, range) {
  const [d0, d1] = domain, [r0, r1] = range;
  const m = (r1 - r0) / (d1 - d0), b = r0 - m * d0;
  const f = (x) => m * x + b;
  f.invert = (y) => (y - b) / m;
  return f;
}
function tickStep(min, max, count) {
  const span = Math.max(1e-9, max - min);
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / (count * step);
  return step * (err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1);
}
function ticks(min, max, count = 6) {
  const step = tickStep(min, max, count);
  const start = Math.ceil(min / step) * step;
  const arr = [];
  for (let v = start; v <= max + 1e-9; v += step) arr.push(v);
  return arr;
}
const fmtNum = (x, d = 2) => Number.isFinite(x) ? Number(x).toFixed(d) : "—";
const fmtPct = (x, d = 2) => Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : "—";

/* --------------- rows: option & stock -> payoff + greeks ---------------- */
const TYPE_INFO = {
  lc: { sign: +1, opt: "call" },
  sc: { sign: -1, opt: "call" },
  lp: { sign: +1, opt: "put"  },
  sp: { sign: -1, opt: "put"  },
  ls: { sign: +1, stock: true },
  ss: { sign: -1, stock: true },
};

// Convert legacy legs -> rows (for backward compatibility)
function rowsFromLegs(legs, daysDefault = 30) {
  const out = [];
  if (!legs) return out;
  const push = (key, type) => {
    const l = legs[key];
    if (!l) return;
    if (!Number.isFinite(l?.K) || !Number.isFinite(l?.qty)) return;
    out.push({
      id: key,
      type,
      K: Number(l.K),
      qty: Number(l.qty),
      premium: Number.isFinite(l.premium) ? Number(l.premium) : null,
      days: daysDefault,
      enabled: !!l.enabled && Number.isFinite(l.K),
    });
  };
  push("lc", "lc"); push("sc", "sc"); push("lp", "lp"); push("sp", "sp");
  return out;
}

function payoffAtExpiration(S, rows, contractSize) {
  let y = 0;
  for (const r of rows) {
    if (!r?.enabled) continue;
    const info = TYPE_INFO[r.type]; if (!info) continue;
    const q = Number(r.qty || 0) * contractSize;
    if (info.stock) {
      // stock: entry price in K
      y += info.sign * (S - Number(r.K || 0)) * q;
      continue;
      // (no premium concept for stock here)
    }
    const K = Number(r.K || 0);
    const intrinsic = info.opt === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const premium = Number.isFinite(r.premium) ? Number(r.premium) : 0;
    // long pays premium; short receives premium
    y += info.sign * intrinsic * q + (-info.sign) * premium * q;
  }
  return y;
}

function payoffCurrent(S, rows, { r, sigma }, contractSize) {
  let y = 0;
  for (const r0 of rows) {
    if (!r0?.enabled) continue;
    const info = TYPE_INFO[r0.type]; if (!info) continue;
    const q = Number(r0.qty || 0) * contractSize;
    if (info.stock) { // mark-to-market
      y += info.sign * (S - Number(r0.K || 0)) * q;
      continue;
    }
    const K = Number(r0.K || 0);
    const T = Math.max(1, Number(r0.days || 0)) / 365;
    const prem = Number.isFinite(r0.premium) ? Number(r0.premium) : 0;
    const px = bsPrice({ S, K, r, sigma, T, type: info.opt });
    y += info.sign * px * q + (-info.sign) * prem * q;
  }
  return y;
}

function greekTotal(which, S, rows, { r, sigma }, contractSize) {
  let g = 0;
  for (const r0 of rows) {
    if (!r0?.enabled) continue;
    const info = TYPE_INFO[r0.type]; if (!info) continue;
    const q = Number(r0.qty || 0) * contractSize;
    if (info.stock) {
      if (which === "delta") g += info.sign * q;
      // stock has no gamma/vega/theta/rho in this simplified view
      continue;
    }
    const K = Number(r0.K || 0);
    const T = Math.max(1, Number(r0.days || 0)) / 365;
    const g1 = greek({ which, S, K, r, sigma, T, type: info.opt });
    // short = negative exposure
    g += (info.sign > 0 ? +1 : -1) * g1 * q;
  }
  return g;
}

/* ----------------------------- React component --------------------------- */
const GREEK_LABEL = { vega: "Vega", delta: "Delta", gamma: "Gamma", theta: "Theta", rho: "Rho" };

export default function Chart({
  spot = null,
  currency = "USD",
  /* NEW */ rows = null,            // [{id,type, K, premium, qty, days, enabled}]
  /* legacy */ legs = null,         // {lc,sc,lp,sp}
  riskFree = 0.02,
  sigma = 0.2,
  T = 30 / 365, // legacy default if no per-row days are given
  greek: greekProp,
  onGreekChange,
  onLegsChange,                     // still used by legacy editor
  contractSize = 1,
  showControls = true,
  frameless = false,
}) {
  // Source of truth for plotting
  const rowsEff = useMemo(() => {
    if (rows && Array.isArray(rows)) return rows;
    // fallback -> derive from legs
    const days = Math.max(1, Math.round((T || 30 / 365) * 365));
    return rowsFromLegs(legs, days);
  }, [rows, legs, T]);

  // x domain based on strikes/entry prices or spot
  const ks = useMemo(() => {
    const out = [];
    for (const r of rowsEff) if (Number.isFinite(r?.K)) out.push(Number(r.K));
    return out.sort((a, b) => a - b);
  }, [rowsEff]);

  const xDomain = useMemo(() => {
    const s = Number(spot) || (ks[0] ?? 100);
    const lo = Math.max(0.01, Math.min(ks[0] ?? s, s) * 0.9);
    const hi = Math.max(lo * 1.1, Math.max(ks[ks.length - 1] ?? s, s) * 1.1);
    return [lo, hi];
  }, [spot, ks]);

  const N = 401;
  const xs = useMemo(() => {
    const [lo, hi] = xDomain;
    const arr = new Array(N); const step = (hi - lo) / (N - 1);
    for (let i = 0; i < N; i++) arr[i] = lo + i * step;
    return arr;
  }, [xDomain]);

  // series
  const env = useMemo(() => ({ r: riskFree, sigma }), [riskFree, sigma]);

  const yExp = useMemo(() => xs.map((S) => payoffAtExpiration(S, rowsEff, contractSize)), [xs, rowsEff, contractSize]);
  const yNow = useMemo(() => xs.map((S) => payoffCurrent(S, rowsEff, env, contractSize)), [xs, rowsEff, env, contractSize]);

  const greekWhich = (greekProp || "vega").toLowerCase();
  const gVals = useMemo(() => xs.map((S) => greekTotal(greekWhich, S, rowsEff, env, contractSize)), [xs, rowsEff, env, contractSize, greekWhich]);

  // be & regions
  function breakEvens(xs, ys) {
    const out = [];
    for (let i = 1; i < xs.length; i++) {
      const y0 = ys[i - 1], y1 = ys[i];
      if ((y0 > 0 && y1 < 0) || (y0 < 0 && y1 > 0)) {
        const t = (-y0) / (y1 - y0);
        out.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
      }
    }
    return Array.from(new Set(out.map((v) => Number(v.toFixed(6))))).sort((a, b) => a - b);
  }
  const be = useMemo(() => breakEvens(xs, yExp), [xs, yExp]);

  // scales
  const ref = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const ro = new ResizeObserver((es) => {
      const cr = es[0]?.contentRect;
      if (cr?.width) setW(Math.max(640, cr.width));
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 56, r: 56, t: 30, b: 40 };
  const innerW = Math.max(10, w - pad.l - pad.r);
  const h = 420, innerH = h - pad.t - pad.b;

  const yRange = useMemo(() => {
    const lo = Math.min(0, ...yExp, ...yNow);
    const hi = Math.max(0, ...yExp, ...yNow);
    return [lo, hi === lo ? lo + 1 : hi];
  }, [yExp, yNow]);

  const xScale = useMemo(() => lin(xDomain, [pad.l, pad.l + innerW]), [xDomain, innerW]);
  const yScale = useMemo(() => lin([yRange[0], yRange[1]], [pad.t + innerH, pad.t]), [yRange, innerH]);

  const gMin = Math.min(...gVals), gMax = Math.max(...gVals);
  const gPad = (gMax - gMin) * 0.1 || 1;
  const gScale = useMemo(() => lin([gMin - gPad, gMax + gPad], [pad.t + innerH, pad.t]), [gMin, gMax, gPad, innerH]);

  const xTicks = ticks(xDomain[0], xDomain[1], 7);
  const yTicks = ticks(yRange[0], yRange[1], 6);
  const gTicks = ticks(gMin - gPad, gMax + gPad, 6);

  const centerStrike = ks.length ? (ks[0] + ks[ks.length - 1]) / 2 : (Number(spot) || xDomain[0]);

  const path = (as, bs, xs, ys) => {
    let d = "";
    for (let i = 0; i < as.length; i++) d += (i ? "L" : "M") + xs(as[i]) + "," + ys(bs[i]);
    return d;
  };

  // profit/loss shading segments
  const shadingRects = useMemo(() => {
    const maxAbs = yExp.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    if (maxAbs < 1e-8) return [];
    const boundsX = [xDomain[0], ...be, xDomain[1]];
    const rects = [];
    for (let i = 0; i < boundsX.length - 1; i++) {
      const a = boundsX[i], b = boundsX[i + 1];
      const mid = 0.5 * (a + b);
      const sign = payoffAtExpiration(mid, rowsEff, contractSize) >= 0 ? 1 : -1;
      rects.push({ x0: a, x1: b, sign });
    }
    return rects;
  }, [xDomain, be, rowsEff, yExp, contractSize]);

  // light proxy for win rate: proportion of positive area under lognormal density
  const avgDays = useMemo(() => {
    const opt = rowsEff.filter((r) => !TYPE_INFO[r.type]?.stock && Number.isFinite(r.days));
    if (!opt.length) return Math.round(T * 365) || 30;
    return Math.round(opt.reduce((s, r) => s + Number(r.days || 0), 0) / opt.length);
  }, [rowsEff, T]);
  const mu = riskFree, sVol = sigma, m = Math.log(Math.max(1e-9, Number(spot || 1))) + (mu - 0.5 * sVol * sVol) * (avgDays / 365);
  const sLn = sVol * Math.sqrt(avgDays / 365);
  const lognormPdf = (x) => (x > 0) ? (1 / (x * sLn * Math.sqrt(2 * Math.PI))) * Math.exp(-Math.pow(Math.log(x) - m, 2) / (2 * sLn * sLn)) : 0;
  const winMass = useMemo(() => {
    let mass = 0, total = 0;
    for (let i = 1; i < xs.length; i++) {
      const xm = 0.5 * (xs[i] + xs[i - 1]);
      const p = lognormPdf(xm);
      const y = 0.5 * (yExp[i] + yExp[i - 1]);
      const dx = xs[i] - xs[i - 1];
      total += p * dx;
      if (y > 0) mass += p * dx;
    }
    return total > 0 ? Math.max(0, Math.min(1, mass / total)) : NaN;
  }, [xs, yExp]);

  const lotSize = useMemo(() => rowsEff.reduce((s, r) => s + Math.abs(Number(r.qty || 0)), 0) || 1, [rowsEff]);

  // local UI state for legacy editor
  const [lockStructure, setLockStructure] = useState(true);
  const [editLegs, setEditLegs] = useState(legs || {});
  useEffect(() => { setEditLegs(legs || {}); }, [legs]);

  const Wrapper = frameless ? "div" : "section";
  const wrapClass = frameless ? "chart-wrap" : "card chart-wrap";

  return (
    <Wrapper className={wrapClass} ref={ref}>
      {/* header */}
      <div className="chart-header">
        <div className="legend">
          <div className="leg"><span className="sw" style={{ borderColor: "var(--accent)" }} />Current P&L</div>
          <div className="leg"><span className="sw" style={{ borderColor: "var(--text-muted,#8a8a8a)" }} />Expiration P&L</div>
          <div className="leg"><span className="sw dash" style={{ borderColor: "#f59e0b" }} />{GREEK_LABEL[greekWhich] || "Greek"}</div>
        </div>
        <div className="header-tools">
          <div className="greek-ctl">
            <label className="small muted" htmlFor="greek">Greek</label>
            <select id="greek" value={greekWhich} onChange={(e)=>onGreekChange?.(e.target.value)}>
              <option value="vega">Vega</option>
              <option value="delta">Delta</option>
              <option value="gamma">Gamma</option>
              <option value="theta">Theta</option>
              <option value="rho">Rho</option>
            </select>
          </div>
          {showControls && !rows && (
            <button
              className={`switch ${lockStructure ? "" : "on"}`}
              aria-label="Unlock structure"
              role="switch"
              aria-checked={!lockStructure}
              onClick={() => setLockStructure((v) => !v)}
            />
          )}
        </div>
      </div>

      {/* hint when empty */}
      {rowsEff.length === 0 && (
        <div className="empty-hint">Set positions in <b>Configuration</b> to see the curves.</div>
      )}

      {/* chart */}
      <svg width="100%" height={h} role="img" aria-label="Strategy payoff chart">
        {/* profit/loss shading */}
        {shadingRects.map((r, i) => (
          <rect key={i}
            x={xScale(r.x0)} y={pad.t}
            width={xScale(r.x1) - xScale(r.x0)} height={innerH}
            fill={r.sign > 0 ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.10)"} />
        ))}

        {/* grid */}
        {ticks(xDomain[0], xDomain[1], 7).map((t, i) => (
          <line key={`xg-${i}`} x1={xScale(t)} x2={xScale(t)} y1={pad.t} y2={pad.t + innerH} stroke="var(--border)" strokeOpacity="0.6" />
        ))}
        {ticks(yRange[0], yRange[1], 6).map((t, i) => (
          <line key={`yg-${i}`} x1={pad.l} x2={pad.l + innerW} y1={yScale(t)} y2={yScale(t)} stroke="var(--border)" strokeOpacity="0.6" />
        ))}

        {/* axes & labels */}
        <line x1={pad.l} x2={pad.l + innerW} y1={yScale(0)} y2={yScale(0)} stroke="var(--text)" strokeOpacity="0.8" />
        {yTicks.map((t, i) => (
          <g key={`yl-${i}`}>
            <line x1={pad.l - 4} x2={pad.l} y1={yScale(t)} y2={yScale(t)} stroke="var(--text)" />
            <text x={pad.l - 8} y={yScale(t)} dy="0.32em" textAnchor="end" className="tick">{fmtNum(t)}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={`xl-${i}`}>
            <line x1={xScale(t)} x2={xScale(t)} y1={pad.t + innerH} y2={pad.t + innerH + 4} stroke="var(--text)" />
            <text x={xScale(t)} y={pad.t + innerH + 16} textAnchor="middle" className="tick">{fmtNum(t,0)}</text>
          </g>
        ))}

        {/* guides */}
        {Number.isFinite(spot) && (
          <line x1={xScale(spot)} x2={xScale(spot)} y1={pad.t} y2={pad.t + innerH} stroke="var(--text)" strokeDasharray="4 6" strokeOpacity="0.6" />
        )}
        {Number.isFinite(centerStrike) && (
          <line x1={xScale(centerStrike)} x2={xScale(centerStrike)} y1={pad.t} y2={pad.t + innerH} stroke="var(--text)" strokeDasharray="2 6" strokeOpacity="0.6" />
        )}

        {/* series */}
        <path d={path(xs, yNow, xScale, yScale)} fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        <path d={path(xs, yExp, xScale, yScale)} fill="none" stroke="var(--text-muted,#8a8a8a)" strokeWidth="2" />
        <path d={path(xs, gVals, xScale, gScale)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 6" />

        {/* break-evens */}
        {be.map((b, i) => (
          <g key={`be-${i}`}>
            <line x1={xScale(b)} x2={xScale(b)} y1={pad.t} y2={pad.t + innerH} stroke="var(--text)" strokeOpacity="0.25" />
            <circle cx={xScale(b)} cy={yScale(0)} r="3.5" fill="var(--bg,#111)" stroke="var(--text)" />
          </g>
        ))}

        {/* axis titles */}
        <text x={pad.l + innerW / 2} y={pad.t + innerH + 32} textAnchor="middle" className="axis">Underlying price</text>
        <text transform={`translate(14 ${pad.t + innerH / 2}) rotate(-90)`} textAnchor="middle" className="axis">P/L</text>
        <text transform={`translate(${w - 14} ${pad.t + innerH / 2}) rotate(90)`} textAnchor="middle" className="axis">
          {GREEK_LABEL[greekWhich] || "Greek"}
        </text>
      </svg>

      {/* metrics */}
      <div className="metrics">
        <div className="m"><div className="k">Underlying price</div><div className="v">{Number.isFinite(spot) ? Number(spot).toFixed(2) : "—"}</div></div>
        <div className="m"><div className="k">Max profit</div><div className="v">{fmtNum(Math.max(...yExp), 2)}</div></div>
        <div className="m"><div className="k">Max loss</div><div className="v">{fmtNum(Math.min(...yExp), 2)}</div></div>
        <div className="m"><div className="k">Win rate</div><div className="v">{fmtPct(winMass, 2)}</div></div>
        <div className="m">
          <div className="k">Breakeven</div>
          <div className="v">
            {be.length === 0 ? "—" : be.length === 1 ? fmtNum(be[0], 2) : `${fmtNum(be[0], 0)} | ${fmtNum(be[1], 0)}`}
          </div>
        </div>
        <div className="m"><div className="k">Lot size</div><div className="v">{lotSize}</div></div>
      </div>

      {/* legacy editor only when no rows are provided */}
      {showControls && !rows && (
        <div className="ctrl">
          <div className="ctrl-head"><div className="title">Legs</div></div>
          <div className="table">
            <div className="row header"><div>On</div><div>Leg</div><div>Strike (K)</div><div>Volume</div><div>Premium</div></div>
            {["lc","sc","lp","sp"].map((k) => {
              const src = editLegs?.[k] || {}, label = ({lc:"Long Call",sc:"Short Call",lp:"Long Put",sp:"Short Put"})[k];
              return (
                <div className="row" key={k}>
                  <div><input type="checkbox" checked={!!src.enabled} onChange={(e)=>{ const v={...editLegs,[k]:{...(src||{}),enabled:e.target.checked}}; setEditLegs(v); onLegsChange?.(v); }} /></div>
                  <div className="leglbl">{label}</div>
                  <div><input className="field small" value={src.K ?? ""} onChange={(e)=>{ const v={...editLegs,[k]:{...(src||{}),K:e.target.value===""?null:Number(e.target.value)}}; setEditLegs(v); onLegsChange?.(v); }} placeholder="e.g. 100" inputMode="decimal"/></div>
                  <div><input className="field small" value={src.qty ?? 0} onChange={(e)=>{ const v={...editLegs,[k]:{...(src||{}),qty:Number(e.target.value)||0}}; setEditLegs(v); onLegsChange?.(v);} } inputMode="numeric" disabled={lockStructure}/></div>
                  <div><input className="field small" value={src.premium ?? ""} onChange={(e)=>{ const v={...editLegs,[k]:{...(src||{}),premium:e.target.value===""?null:Number(e.target.value)}}; setEditLegs(v); onLegsChange?.(v);} } placeholder="e.g. 1.25" inputMode="decimal"/></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <style jsx>{`
        .chart-wrap{ display:block; }
        .chart-header{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 6px 2px; }
        .legend{ display:flex; gap:14px; flex-wrap:wrap; }
        .leg{ display:inline-flex; align-items:center; gap:8px; font-size:12.5px; opacity:.9; }
        .sw{ width:18px; height:0; border-top:2px solid; border-radius:2px; }
        .sw.dash{ border-style:dashed; }
        .header-tools{ display:flex; align-items:center; gap:10px; }
        .greek-ctl{ display:flex; align-items:center; gap:8px; }
        .greek-ctl select{ height:28px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); padding:0 8px; }

        .switch{ position:relative; width:44px; height:26px; border-radius:999px; background:var(--card); border:1px solid var(--border); display:inline-flex; align-items:center; }
        .switch::after{ content:""; width:18px; height:18px; border-radius:50%; background:#d1d5db; position:absolute; left:4px; transition:left .18s ease; }
        .switch.on{ background:#3b82f6; border-color:#1e40af; }
        .switch.on::after{ left:22px; background:#fff; }

        .empty-hint{ margin:10px 6px; padding:10px; border:1px dashed var(--border); border-radius:10px; opacity:.8; }

        .tick{ font-size:11px; fill:var(--text); opacity:.75; }
        .axis{ font-size:12px; fill:var(--text); opacity:.7; }

        .metrics{ display:grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap:10px; padding:10px 6px 12px; border-top:1px solid var(--border); }
        .m .k{ font-size:12px; opacity:.7; } .m .v{ font-weight:700; }
        @media (max-width:920px){ .metrics{ grid-template-columns: repeat(3, minmax(0,1fr)); } }

        .ctrl{ margin-top:10px; border-top:1px solid var(--border); padding:10px 6px 4px; }
        .ctrl-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .title{ font-weight:700; }
        .table{ display:grid; gap:6px; }
        .row{ display:grid; grid-template-columns: 60px 1.2fr 1.2fr 1fr 1.2fr; gap:8px; align-items:center; }
        .row.header{ font-size:12px; opacity:.7; }
        .leglbl{ font-weight:600; }
        .field.small{ height:30px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); padding:0 8px; width:100%; }
      `}</style>
    </Wrapper>
  );
}
