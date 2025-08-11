// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";

/* -----------------------------------------------------------
   Helpers
----------------------------------------------------------- */

const POS = {
  "Long Call":  { opt: "call",  sign: +1 },
  "Short Call": { opt: "call",  sign: -1 },
  "Long Put":   { opt: "put",   sign: +1 },
  "Short Put":  { opt: "put",   sign: -1 },
  "Long Stock": { stock: true,  sign: +1 },
  "Short Stock":{ stock: true,  sign: -1 },
};

const fmtCur = (v, ccy = "USD", maxfd = 2) => {
  if (!Number.isFinite(Number(v))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency", currency: ccy, maximumFractionDigits: maxfd,
    }).format(Number(v));
  } catch {
    const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return sym + Number(v).toFixed(maxfd);
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

// normal pdf / cdf
const invSqrt2Pi = 1 / Math.sqrt(2 * Math.PI);
const pdf = (x) => invSqrt2Pi * Math.exp(-0.5 * x * x);
function cdf(x) {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
        a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// Black–Scholes price & greeks (Theta/day, Vega per 1 vol pt, Rho per 1%)
function bs(S, K, r, sigma, T, type /* 'call' | 'put' */) {
  S = Number(S); K = Number(K); r = Number(r); sigma = Math.max(0, Number(sigma)); T = Math.max(0, Number(T));
  if (!(S > 0) || !(K > 0) || sigma === 0 || T === 0) {
    // intrinsic only, greeks ~ 0
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    return { price: intrinsic, delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  let price, delta, rho;
  if (type === "call") {
    price = S * cdf(d1) - K * Math.exp(-r * T) * cdf(d2);
    delta = cdf(d1);
    rho =  K * T * Math.exp(-r * T) * cdf(d2); // per 1.0 rate
  } else { // put
    price = K * Math.exp(-r * T) * cdf(-d2) - S * cdf(-d1);
    delta = cdf(d1) - 1;
    rho = -K * T * Math.exp(-r * T) * cdf(-d2); // per 1.0 rate
  }
  const g = pdf(d1);
  const gamma = g / (S * sigma * sqrtT);
  const vegaRaw = S * g * sqrtT; // per 1.0 vol (100%)
  const thetaYear = -(S * g * sigma) / (2 * sqrtT) + (type === "call"
                    ? -r * K * Math.exp(-r * T) * cdf(d2)
                    :  r * K * Math.exp(-r * T) * cdf(-d2));

  // Convert units
  const thetaDay = thetaYear / 365;   // per day
  const vegaPt  = vegaRaw / 100;      // per 1 vol point (1%)
  const rhoPct  = rho / 100;          // per 1% rate

  return { price, delta, gamma, theta: thetaDay, vega: vegaPt, rho: rhoPct };
}

function intrinsicAtExpiry(S, K, type) {
  return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
}

function uniqueStrikes(rows) {
  const s = new Set();
  for (const r of rows) {
    const k = Number(r.strike);
    if (Number.isFinite(k)) s.add(k);
  }
  return Array.from(s.values()).sort((a, b) => a - b);
}

function breakEvens(X, Y) {
  const out = [];
  for (let i = 1; i < X.length; i++) {
    const y0 = Y[i - 1], y1 = Y[i];
    if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
      const x0 = X[i - 1], x1 = X[i];
      const t = y1 === y0 ? 0 : -y0 / (y1 - y0);
      out.push(x0 + t * (x1 - x0));
    }
  }
  return out;
}

/* -----------------------------------------------------------
   Curves calculator (one pass for P&L and all greeks)
----------------------------------------------------------- */
function computeCurves(rows, minX, maxX, nPoints, env, contractSize = 1) {
  const { spot, sigma = 0.2, T: Tdays = 30, riskFree = 0 } = env || {};
  const T = Number(Tdays) / 365;

  const X = new Array(nPoints);
  const Y_now = new Array(nPoints).fill(0);
  const Y_exp = new Array(nPoints).fill(0);
  const G = {
    Delta: new Array(nPoints).fill(0),
    Gamma: new Array(nPoints).fill(0),
    Theta: new Array(nPoints).fill(0),
    Vega:  new Array(nPoints).fill(0),
    Rho:   new Array(nPoints).fill(0),
  };

  const legs = (rows || []).filter(r => POS[r.type || r.position]);
  for (let i = 0; i < nPoints; i++) {
    const S = minX + (i / (nPoints - 1)) * (maxX - minX);
    X[i] = S;

    let cur = 0, exp = 0;
    let d = 0, g = 0, th = 0, v = 0, r = 0;

    for (const rRow of legs) {
      const def = POS[rRow.type || rRow.position];
      const qty   = Number(rRow.volume ?? 0);
      const prem  = Number(rRow.premium ?? 0);
      const K     = Number(rRow.strike);
      const sign  = def.sign;
      const mult  = qty * sign * contractSize;

      if (def.stock) {
        const priceNow = S; // treat premium as entry price for stock as well
        cur += mult * (priceNow - prem);
        exp += mult * (S - prem);
        d   += mult * (def.sign); // +1 long stock, -1 short stock
        // other greeks ~ 0
      } else {
        const { price, delta, gamma, theta, vega, rho } = bs(S, K, riskFree, sigma, T, def.opt);
        cur += mult * (price - prem);
        exp += mult * (intrinsicAtExpiry(S, K, def.opt) - prem);
        d   += mult * delta;
        g   += mult * gamma;
        th  += mult * theta;
        v   += mult * vega;
        r   += mult * rho;
      }
    }

    Y_now[i] = cur;
    Y_exp[i] = exp;
    G.Delta[i] = d; G.Gamma[i] = g; G.Theta[i] = th; G.Vega[i] = v; G.Rho[i] = r;
  }

  return { X, Y_now, Y_exp, G };
}

/* -----------------------------------------------------------
   Chart
----------------------------------------------------------- */
function ChartCanvas({
  spot, rows, env, contractSize = 1, height = 420, currency = "USD",
  greek = "Vega", xDomain, onZoomDomain,
}) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  // domain
  const ks = rows.map(r => Number(r.strike)).filter(Number.isFinite);
  const sVal = Number(spot);
  let [minX, maxX] = xDomain || [NaN, NaN];

  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    if (ks.length) {
      const lo = Math.min(...ks), hi = Math.max(...ks), span = Math.max(1, hi - lo);
      minX = lo - span * 0.25; maxX = hi + span * 0.25;
    } else if (Number.isFinite(sVal)) {
      minX = sVal * 0.9; maxX = sVal * 1.1;
    } else {
      minX = 90; maxX = 110;
    }
  }

  // curves
  const curves = useMemo(() => computeCurves(rows, minX, maxX, 300, env, contractSize),
    [rows, minX, maxX, env?.sigma, env?.T, env?.riskFree, contractSize]);

  const { X, Y_now, Y_exp, G } = curves;

  // P&L axis
  const yMin = Math.min(0, ...Y_now, ...Y_exp);
  const yMax = Math.max(0, ...Y_now, ...Y_exp);
  const pad  = Math.max(1, (yMax - yMin) * 0.1);
  const minY = yMin - pad, maxY = yMax + pad;

  // Greek axis (right)
  const gArr = G[greek] || [];
  let gMin = Math.min(...gArr), gMax = Math.max(...gArr);
  if (!Number.isFinite(gMin) || !Number.isFinite(gMax) || gMin === gMax) {
    gMin = -1; gMax = 1;
  } else {
    const gp = (gMax - gMin) * 0.15;
    gMin -= gp; gMax += gp;
  }

  const P = { t: 18, r: 42, b: 44, l: 68 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;

  const x  = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const y  = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;
  const yg = (v) => P.t + (1 - (v - gMin) / (gMax - gMin)) * H;

  const toPath = (arrX, arrY, yy = y) =>
    arrX.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${yy(arrY[i])}`).join(" ");

  // wheel zoom (mild)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // pinch/trackpad zoom only
      e.preventDefault();
      const zoom = e.deltaY > 0 ? 1.06 : 0.94; // gentle
      const mx = minX + ((e.offsetX - P.l) / Math.max(1, W)) * (maxX - minX);
      const newMin = mx - (mx - minX) * zoom;
      const newMax = mx + (maxX - mx) * zoom;
      onZoomDomain?.([newMin, newMax]);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minX, maxX, W, P.l, onZoomDomain]);

  // Right axis label
  const greekUnit =
    greek === "Theta" ? "/day" :
    greek === "Vega"  ? "per 1 vol pt" :
    greek === "Rho"   ? "per 1% rate" : "";

  const strikeMarks = uniqueStrikes(rows);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Grid + labels (left y = $ P&L) */}
        {Array.from({ length: 6 + 1 }).map((_, i) => {
          const yy = P.t + (i / 6) * H;
          const val = maxY - (i / 6) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.07)" />
              <text x={P.l - 10} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
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
                {Math.round(val * 100) / 100}
              </text>
            </g>
          );
        })}

        {/* Underlying price marker */}
        {Number.isFinite(spot) && spot >= minX && spot <= maxX && (
          <line x1={x(spot)} y1={P.t} x2={x(spot)} y2={height - P.b}
            stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        {/* Strike markers */}
        {strikeMarks.map((k, i) => (
          <g key={`k${i}`}>
            <line x1={x(k)} y1={P.t} x2={x(k)} y2={height - P.b} stroke="rgba(255,255,255,.12)" />
            <circle cx={x(k)} cy={y(0)} r="2.5" fill="rgba(255,255,255,.55)" />
          </g>
        ))}

        {/* Win/Loss shading by P&L=0 */}
        <rect x={P.l} y={P.t} width={W} height={Math.max(0, y(0) - P.t)} fill="rgba(16,185,129,.07)" />
        <rect x={P.l} y={Math.max(P.t, y(0))} width={W} height={height - P.b - Math.max(P.t, y(0))} fill="rgba(244,63,94,.08)" />

        {/* Curves */}
        {/* Current P&L */}
        <path d={toPath(X, Y_now, y)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        {/* Expiration P&L */}
        <path d={toPath(X, Y_exp, y)} fill="none" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="6 4" opacity="0.85" />
        {/* Selected Greek (right axis) */}
        <path d={toPath(X, gArr, yg)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 4" />

        {/* Right Y axis (Greeks) */}
        {Array.from({ length: 5 + 1 }).map((_, i) => {
          const yy = P.t + (i / 5) * H;
          const val = gMax - (i / 5) * (gMax - gMin);
          return (
            <g key={`gry${i}`}>
              <text x={width - P.r + 34} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {Math.round(val * 100) / 100}
              </text>
            </g>
          );
        })}

        {/* Right axis label */}
        <text x={width - 8} y={P.t + 10} textAnchor="end" fontSize="11" fill="rgba(255,255,255,.8)">
          {greek}{greekUnit ? ` (${greekUnit})` : ""}
        </text>

        {/* Legend */}
        <g transform={`translate(${P.l + 6}, ${P.t + 12})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Current P&amp;L</text>
          <circle cx="98" r="4" fill="#e5e7eb" />
          <text x="106" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Expiration P&amp;L</text>
          <circle cx="212" r="4" fill="#f59e0b" />
          <text x="220" y="3" fontSize="10" fill="rgba(255,255,255,.9)">{greek}</text>
        </g>
      </svg>
    </div>
  );
}

/* -----------------------------------------------------------
   Modal
----------------------------------------------------------- */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, currency = "USD" } = env || {};
  const contractSize = 1;

  // editable rows (position editor)
  const [rows, setRows] = useState(() => (strategy?.legs || []).map(r => ({
    position: r.position || r.type, type: r.type || r.position, strike: r.strike ?? "", volume: r.volume ?? 1, premium: r.premium ?? 0, expiration: r.expiration ?? (env?.T ?? 30),
  }))));

  const [greek, setGreek] = useState("Vega");
  const [domain, setDomain] = useState(null); // [minX,maxX] from zoom

  // metrics from curves (computed with same engine as chart)
  const ks = rows.map(r => Number(r.strike)).filter(Number.isFinite);
  const baseDomain = useMemo(() => {
    if (domain) return { minX: domain[0], maxX: domain[1] };
    if (ks.length) {
      const lo = Math.min(...ks), hi = Math.max(...ks), span = Math.max(1, hi - lo);
      return { minX: lo - span * 0.25, maxX: hi + span * 0.25 };
    }
    if (Number.isFinite(Number(spot))) {
      const s = Number(spot); return { minX: s * 0.9, maxX: s * 1.1 };
    }
    return { minX: 90, maxX: 110 };
  }, [ks.join(","), spot, domain]);

  const curves = useMemo(
    () => computeCurves(rows, baseDomain.minX, baseDomain.maxX, 300, env, contractSize),
    [rows, baseDomain.minX, baseDomain.maxX, env?.sigma, env?.T, env?.riskFree]
  );

  const maxProfit = useMemo(() => Math.max(0, ...curves.Y_now), [curves.Y_now]);
  const maxLoss   = useMemo(() => Math.min(0, ...curves.Y_now), [curves.Y_now]);
  const winRate   = useMemo(() => (curves.Y_now.filter(v => v > 0).length / (curves.Y_now.length || 1)) * 100, [curves.Y_now]);
  const BE        = useMemo(() => breakEvens(curves.X, curves.Y_exp), [curves.X, curves.Y_exp]);

  // Close on ESC + lock background scroll
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onEsc); document.body.style.overflow = prev || ""; };
  }, [onClose]);

  const GAP = 14;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-sheet" style={{ maxWidth: 1120, maxHeight: "calc(100vh - 96px)", overflowY: "auto", padding: 16 }}>
        {/* Header */}
        <div className="modal-head" style={{ marginBottom: GAP }}>
          <div className="mh-left">
            <div className="mh-icon"><div className="badge" /></div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button" type="button" onClick={() => {/* future: persist preset */}}>Save</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Legend / Greek selector row */}
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:8 }}>
          <label className="small muted" style={{ marginRight: 8 }}>Greek</label>
          <select value={greek} onChange={(e)=>setGreek(e.target.value)} className="sort" aria-label="Greek">
            {["Vega","Delta","Gamma","Theta","Rho"].map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: GAP }}>
          <ChartCanvas
            spot={spot}
            rows={rows.map(r=>({ ...r, type: r.type || r.position }))}
            env={env}
            contractSize={contractSize}
            currency={currency}
            greek={greek}
            xDomain={domain || undefined}
            onZoomDomain={(d)=>setDomain(d)}
            height={420}
          />
        </div>

        {/* Metrics strip */}
        <div className="metric-strip" style={{ display:"grid", gridTemplateColumns:"repeat(6, minmax(0,1fr))", gap:GAP, marginBottom:GAP, overflowX:"auto" }}>
          <MetricBox label="Underlying price" value={fmtCur(spot, currency)} />
          <MetricBox label="Max profit" value={fmtCur(maxProfit, currency, 0)} />
          <MetricBox label="Max loss" value={fmtCur(maxLoss, currency, 0)} />
          <MetricBox label="Win rate" value={`${winRate.toFixed(2)}%`} />
          <MetricBox label="Breakeven (Low | High)" value={
            BE.length ? (BE.length === 1 ? `${Math.round(BE[0])} | —` : `${Math.round(BE[0])} | ${Math.round(BE[1])}`) : "—"
          } />
          <MetricBox label="Lot size" value={`${1}`} />
        </div>

        {/* Config editor and summary (unchanged UI from your current build) */}
        {/* ... keep your existing editor implementation ... */}
      </div>

      <style jsx>{`
        .modal-root { position:fixed; inset:0; z-index:80; }
        .modal-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); backdrop-filter: blur(6px); }
        .modal-sheet { position:relative; margin:48px auto; background:var(--bg); border:1px solid var(--border);
          border-radius:16px; box-shadow:0 24px 60px rgba(0,0,0,.35); }
        .mh-left { display:flex; gap:12px; align-items:center; }
        .mh-name { font-size:18px; font-weight:700; }
        .mh-actions { display:flex; gap:8px; }
        .badge { width:24px; height:24px; border-radius:50%; background:var(--card); border:1px solid var(--border); }
        .sort{ height:32px; min-width:150px; padding:0 10px; border-radius:10px;
          border:1px solid var(--border); background:var(--bg); color:var(--text); }
      `}</style>
    </div>
  );
}

/* ------------------------ Subcomponents ------------------------ */
function MetricBox({ label, value }) {
  return (
    <div className="card dense" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
      <div className="small muted">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
