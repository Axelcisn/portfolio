"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import { gridPnl, uniqueStrikes } from "./payoffLite";

/* ===========================================================
   Helpers
   =========================================================== */

const POSITIONS = [
  "Long Call",
  "Short Call",
  "Long Put",
  "Short Put",
  "Long Stock",
  "Short Stock",
];

const fmtCur = (v, ccy = "USD", maxfd = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: maxfd,
    }).format(n);
  } catch {
    const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return sym + n.toFixed(maxfd);
  }
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ----------------------- Black–Scholes --------------------- */

function _normPdf(x) {
  const invSqrt2pi = 1 / Math.sqrt(2 * Math.PI);
  return invSqrt2pi * Math.exp(-(x * x) / 2);
}
function _erf(x) {
  // Abramowitz/Stegun 7.1.26
  const sgn = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sgn * y;
}
function _normCdf(x) {
  return 0.5 * (1 + _erf(x / Math.SQRT2));
}

/** BS price (call/put) and greeks */
function bsAll({ S, K, r = 0, sigma = 0.2, T = 30 / 365, type = "call" }) {
  S = Number(S);
  K = Number(K);
  r = Number(r);
  sigma = Math.max(1e-6, Number(sigma));
  T = Math.max(1e-6, Number(T));
  if (!Number.isFinite(S) || !Number.isFinite(K) || S <= 0 || K <= 0) {
    const z = { price: 0, delta: 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
    return z;
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = _normCdf(d1);
  const Nd2 = _normCdf(d2);
  const nd1 = _normPdf(d1);
  const df = Math.exp(-r * T);

  let price, delta, theta, rho;
  const gamma = nd1 / (S * sigma * sqrtT);
  const vega = S * nd1 * sqrtT; // per 1 vol (not %)

  if (type === "call") {
    price = S * Nd1 - K * df * Nd2;
    delta = Nd1;
    theta = -(S * nd1 * sigma) / (2 * sqrtT) - r * K * df * Nd2;
    rho = K * T * df * Nd2;
  } else {
    // put
    const Nmd1 = _normCdf(-d1);
    const Nmd2 = _normCdf(-d2);
    price = K * df * Nmd2 - S * Nmd1;
    delta = Nd1 - 1; // = -N(-d1)
    theta = -(S * nd1 * sigma) / (2 * sqrtT) + r * K * df * Nmd2;
    rho = -K * T * df * Nmd2;
  }
  return { price, delta, gamma, vega, theta, rho };
}

/* --------------------- Breakeven finder -------------------- */
function computeBreakevens(X, Y) {
  const out = [];
  for (let i = 1; i < X.length; i++) {
    const y1 = Y[i - 1],
      y2 = Y[i];
    if ((y1 <= 0 && y2 >= 0) || (y1 >= 0 && y2 <= 0)) {
      const x1 = X[i - 1],
        x2 = X[i];
      if (y2 !== y1) {
        const t = (0 - y1) / (y2 - y1);
        out.push(x1 + t * (x2 - x1));
      } else {
        out.push(x1);
      }
    }
  }
  if (!out.length) return null;
  out.sort((a, b) => a - b);
  return out;
}

/* ===========================================================
   Chart
   =========================================================== */

function ChartCanvas({
  spot,
  rows,
  env,
  contractSize = 1,
  currency = "USD",
  greek = "Vega",
  xDomain,
  onZoomDomain,
  height = 420,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(980);

  // resize
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setWidth(Math.max(320, Math.round(e.contentRect.width)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // domain
  const defaultDomain = useMemo(() => {
    const s = Number(spot);
    const ks = rows.map((r) => Number(r.strike)).filter((v) => Number.isFinite(v));
    if (ks.length) {
      const lo = Math.min(...ks);
      const hi = Math.max(...ks);
      const span = Math.max(1, hi - lo);
      return [lo - span * 0.25, hi + span * 0.25];
    }
    if (Number.isFinite(s) && s > 0) return [s * 0.85, s * 1.15];
    return [100, 200];
  }, [rows, spot]);

  const domain = xDomain || defaultDomain;
  const [minX, maxX] = domain;
  const P = { t: 18, r: 16, b: 54, l: 64 };
  const W = Math.max(10, width - P.l - P.r);
  const H = Math.max(10, height - P.t - P.b);
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;

  /* ---------- P&L grids (current via BS; expiration via payoff) ---------- */
  const Tyears = Math.max(1e-6, Number(env?.T ?? 30) / 365);
  const sigma = Math.max(1e-6, Number(env?.sigma ?? 0.25));
  const r = Number(env?.riskFree ?? 0);

  const { X, Y: Yexp } = useMemo(
    () => gridPnl(rows, minX, maxX, 260, contractSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, minX, maxX, contractSize]
  );

  const Ycur = useMemo(() => {
    // Mark-to-market: BS value (now) minus premium * qty, aggregated across legs
    const out = new Array(X.length).fill(0);
    for (const row of rows) {
      const K = Number(row.strike);
      const q = Number(row.volume ?? 0);
      const prem = Number(row.premium ?? 0);
      const pos = (row.type || row.position || "").toLowerCase();

      const isCall = pos.includes("call");
      const isPut = pos.includes("put");
      const isLong = pos.includes("long");
      const isShort = pos.includes("short");
      const isStock = pos.includes("stock");

      for (let i = 0; i < X.length; i++) {
        const S = X[i];

        let legNow = 0;

        if (isCall || isPut) {
          const g = bsAll({
            S,
            K,
            r,
            sigma,
            T: Tyears,
            type: isCall ? "call" : "put",
          }).price;
          legNow = g - prem;
          if (isShort) legNow = -legNow;
        } else if (isStock) {
          // stock leg: P&L now relative to strike (entry) price
          legNow = (S - K) - prem; // prem can act like fee/credit if used
          if (isShort) legNow = -legNow;
        }

        out[i] += (q || 0) * contractSize * legNow;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, X, contractSize, r, sigma, Tyears]);

  /* ------------------- Greek curve (sum of legs) ------------------- */
  const greekCurve = useMemo(() => {
    const out = new Array(X.length).fill(0);
    for (const row of rows) {
      const K = Number(row.strike);
      const q = Number(row.volume ?? 0);
      const pos = (row.type || row.position || "").toLowerCase();

      const isCall = pos.includes("call");
      const isPut = pos.includes("put");
      const isLong = pos.includes("long");
      const isShort = pos.includes("short");
      const isStock = pos.includes("stock");

      for (let i = 0; i < X.length; i++) {
        const S = X[i];
        let v = 0;

        if (isCall || isPut) {
          const g = bsAll({
            S,
            K,
            r,
            sigma,
            T: Tyears,
            type: isCall ? "call" : "put",
          });
          switch (greek) {
            case "Delta":
              v = g.delta;
              break;
            case "Gamma":
              v = g.gamma;
              break;
            case "Theta":
              v = g.theta;
              break;
            case "Rho":
              v = g.rho;
              break;
            default:
              v = g.vega;
          }
          if (isShort) v = -v;
        } else if (isStock) {
          // stock greeks: Delta=±1, Gamma=0, Vega=0, Theta≈0, Rho≈0
          if (greek === "Delta") v = isLong ? 1 : -1;
          else v = 0;
        }

        out[i] += (q || 0) * v;
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, X, r, sigma, Tyears, greek]);

  /* ------------------ Y domain + breakevens ------------------ */
  const yMin = Math.min(0, ...Yexp, ...Ycur);
  const yMax = Math.max(0, ...Yexp, ...Ycur);
  const pad = Math.max(1, 0.08 * (yMax - yMin || 1));
  const minY = yMin - pad;
  const maxY = yMax + pad;

  const y = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;
  const toPath = (xs, ys) =>
    xs.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${y(ys[i])}`).join(" ");

  const strikes = uniqueStrikes(rows);
  const be = computeBreakevens(X, Yexp);

  /* ----------------------- Zoom / wheel ---------------------- */
  const onWheel = (e) => {
    e.preventDefault();
    const { deltaY } = e;
    const factor = clamp(1 + deltaY * 0.0015, 0.8, 1.25); // gentle
    const mx = clamp(((e.clientX - wrapRef.current.getBoundingClientRect().left) - P.l) / W, 0, 1);
    const pivot = minX + mx * (maxX - minX);
    const left = pivot - (pivot - minX) * factor;
    const right = pivot + (maxX - pivot) * factor;
    const spanMin = 1e-3;
    if (right - left > spanMin) onZoomDomain?.([left, right]);
  };

  const resetZoom = () => onZoomDomain?.(null);

  return (
    <div ref={wrapRef} onWheel={onWheel} onDoubleClick={resetZoom} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Green / Red areas (relative to zero) */}
        <rect x={P.l} y={P.t} width={W} height={Math.max(0, y(0) - P.t)} fill="rgba(16,185,129,.09)" />
        <rect x={P.l} y={y(0)} width={W} height={Math.max(0, height - P.b - y(0))} fill="rgba(244,63,94,.10)" />

        {/* Grid Y */}
        {Array.from({ length: 6 }).map((_, i) => {
          const yy = P.t + (i / 5) * H;
          const val = maxY - (i / 5) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 10} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {fmtCur(val, currency, 0)}
              </text>
            </g>
          );
        })}

        {/* Grid X */}
        {Array.from({ length: 8 }).map((_, i) => {
          const xx = P.l + (i / 7) * W;
          const val = minX + (i / 7) * (maxX - minX);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={P.t} x2={xx} y2={height - P.b} stroke="rgba(255,255,255,.06)" />
              <text x={xx} y={height - 10} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.65)">
                {Math.round(val * 100) / 100}
              </text>
            </g>
          );
        })}

        {/* Underlying marker */}
        {Number.isFinite(Number(spot)) && Number(spot) >= minX && Number(spot) <= maxX && (
          <line
            x1={x(Number(spot))}
            y1={P.t}
            x2={x(Number(spot))}
            y2={height - P.b}
            stroke="rgba(255,255,255,.35)"
            strokeDasharray="4 4"
          />
        )}

        {/* Strike markers */}
        {strikes.map((k, i) => (
          <g key={`k${i}`}>
            <line x1={x(k)} y1={P.t} x2={x(k)} y2={height - P.b} stroke="rgba(255,255,255,.12)" />
            <circle cx={x(k)} cy={y(0)} r="2.5" fill="rgba(255,255,255,.6)" />
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${P.l + 6}, ${P.t + 14})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Current P&L</text>
          <circle cx="92" r="4" fill="#e5e7eb" />
          <text x="100" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Expiration P&L</text>
          <circle cx="206" r="4" fill="#f59e0b" />
          <text x="214" y="3" fontSize="10" fill="rgba(255,255,255,.9)">{greek}</text>
        </g>

        {/* Lines */}
        <path d={toPath(X, Ycur)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={toPath(X, Yexp)} fill="none" stroke="#e5e7eb" strokeWidth="2" strokeDasharray="5 4" />
        <path d={toPath(X, greekCurve)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" />
      </svg>
    </div>
  );
}

/* ===========================================================
   Modal
   =========================================================== */

export default function StrategyModal({ strategy, env, onClose, onApply }) {
  const { spot, currency = "USD" } = env || {};

  // ---------- editable rows (position editor) ----------
  const [rows, setRows] = useState(() =>
    (strategy?.legs || []).map((r) => ({
      position: r.position || r.type,
      type: r.type || r.position,
      strike: r.strike ?? "",
      volume: r.volume ?? 1,
      premium: r.premium ?? 0,
      expiration: r.expiration ?? (env?.T ?? 30),
    }))
  );

  const [greek, setGreek] = useState("Vega");
  const [domain, setDomain] = useState(null); // [minX,maxX] from zoom

  // lock body scroll, ESC to close
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev || "";
    };
  }, [onClose]);

  // metrics from expiration grid
  const pnlGrid = useMemo(() => {
    const ks = rows.map((r) => Number(r.strike)).filter((v) => Number.isFinite(v));
    const s = Number(spot);
    let minX, maxX;
    if (ks.length) {
      const lo = Math.min(...ks),
        hi = Math.max(...ks);
      const span = Math.max(1, hi - lo);
      minX = lo - span * 0.25;
      maxX = hi + span * 0.25;
    } else if (Number.isFinite(s) && s > 0) {
      minX = s * 0.85;
      maxX = s * 1.15;
    } else {
      minX = 100;
      maxX = 200;
    }
    return gridPnl(rows, (domain?.[0] ?? minX), (domain?.[1] ?? maxX), 260, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, domain, spot]);

  const maxProfit = useMemo(() => Math.max(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const maxLoss = useMemo(() => Math.min(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const winRate = useMemo(() => {
    const N = pnlGrid.Y.length || 1;
    const wins = pnlGrid.Y.filter((v) => v > 0).length;
    return (wins / N) * 100;
  }, [pnlGrid.Y]);

  const breaks = useMemo(() => {
    const b = computeBreakevens(pnlGrid.X, pnlGrid.Y);
    if (!b) return "—";
    return b.length === 1
      ? `${Math.round(b[0])} | —`
      : `${Math.round(b[0])} | ${Math.round(b[1])}`;
  }, [pnlGrid.X, pnlGrid.Y]);

  const lotSize = useMemo(
    () => rows.reduce((acc, r) => acc + Math.max(0, Number(r.volume) || 0), 0),
    [rows]
  );

  const edit = (i, key, val) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: val === "" ? "" : Number.isNaN(+val) ? val : Number(val) };
      return next;
    });
  };

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { position: "Long Call", type: "Long Call", strike: "", volume: 1, premium: 0, expiration: env?.T ?? 30 },
    ]);

  const removeRow = (i) =>
    setRows((prev) => prev.filter((_, k) => k !== i));

  const resetRows = () =>
    setRows((strategy?.legs || []).map((r) => ({
      position: r.position || r.type,
      type: r.type || r.position,
      strike: r.strike ?? "",
      volume: r.volume ?? 1,
      premium: r.premium ?? 0,
      expiration: r.expiration ?? (env?.T ?? 30),
    })));

  /* ----------------------------- UI ----------------------------- */

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-sheet">
        {/* Header */}
        <div className="modal-head">
          <div className="mh-left">
            <div className="mh-icon" />
            <div>
              <div id="sg-modal-title" className="mh-name">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>

          <div className="mh-actions">
            <button className="button" type="button">Save</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Legend + Greek selector */}
        <div className="legend-row">
          <div className="legend-dot" style={{ background: "#60a5fa" }} /><div className="legend-text">Current P&amp;L</div>
          <div className="legend-dot" style={{ background: "#e5e7eb" }} /><div className="legend-text">Expiration P&amp;L</div>
          <div className="legend-dot" style={{ background: "#f59e0b" }} /><div className="legend-text">{greek}</div>
          <div className="flex-spacer" />
          <label className="small muted" style={{ marginRight: 8 }}>Greek</label>
          <select className="field" value={greek} onChange={(e) => setGreek(e.target.value)} style={{ width: 120 }}>
            {["Vega", "Delta", "Gamma", "Theta", "Rho"].map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Chart */}
        <ChartCanvas
          spot={spot}
          rows={rows}
          env={env}
          contractSize={1}
          currency={currency}
          greek={greek}
          xDomain={domain || undefined}
          onZoomDomain={(d) => setDomain(d)}
          height={420}
        />

        {/* Metric strip (horizontal scroll if overflow) */}
        <div className="metric-strip" role="list">
          <MetricBox label="Underlying price" value={fmtCur(spot, currency)} />
          <MetricBox label="Max profit" value={fmtCur(maxProfit, currency, 0)} />
          <MetricBox label="Max loss" value={fmtCur(maxLoss, currency, 0)} />
          <MetricBox label="Win rate" value={`${winRate.toFixed(2)}%`} />
          <MetricBox label="Breakeven (Low | High)" value={breaks} />
          <MetricBox label="Lot size" value={String(lotSize || 0)} />

          {/* placeholders for the extended metrics (not computed yet) */}
          <MetricBox label="CI (Low | High)" value="— | —" />
          <MetricBox label="Delta" value="—" />
          <MetricBox label="Gamma" value="—" />
          <MetricBox label="Rho" value="—" />
          <MetricBox label="Theta" value="—" />
          <MetricBox label="Vega" value="—" />
          <MetricBox label="Max" value="—" />
          <MetricBox label="Mean[Price]" value="—" />
          <MetricBox label="Max[Return]" value="—" />
          <MetricBox label="E[Return]" value="—" />
          <MetricBox label="Sharpe Ratio" value="—" />
          <MetricBox label="BS(C)" value="—" />
          <MetricBox label="BS(P)" value="—" />
        </div>

        {/* Configuration table */}
        <div className="card dense" style={{ marginTop: 12 }}>
          <div className="section-title">Configuration</div>

          <div className="cfg-head">
            <div>Strike</div><div>Type</div><div>Expiration</div><div>Volume</div><div>Premium</div><div />
          </div>

          {rows.map((r, i) => (
            <div className="cfg-row" key={i}>
              <input
                className="field"
                type="number"
                step="0.01"
                placeholder="Strike"
                value={r.strike ?? ""}
                onChange={(e) => edit(i, "strike", e.target.value)}
              />
              <select className="field" value={r.type || r.position} onChange={(e) => edit(i, "type", e.target.value)}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                className="field"
                type="number"
                step="1"
                min="0"
                value={r.expiration ?? (env?.T ?? 30)}
                onChange={(e) => edit(i, "expiration", e.target.value)}
              />
              <input
                className="field"
                type="number"
                step="1"
                min="0"
                value={r.volume ?? 0}
                onChange={(e) => edit(i, "volume", e.target.value)}
              />
              <input
                className="field"
                type="number"
                step="0.01"
                value={r.premium ?? 0}
                onChange={(e) => edit(i, "premium", e.target.value)}
              />
              <button className="icon-btn danger" onClick={() => removeRow(i)} aria-label="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 6h18M9 6v12m6-12v12M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14M10 6V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))}

          <div className="cfg-actions">
            <button className="button ghost" type="button" onClick={addRow}>+ New position</button>
            <div className="flex-spacer" />
            <button className="button ghost" type="button" onClick={resetRows}>Reset</button>
          </div>
        </div>

        {/* Summary */}
        <div className="card dense" style={{ marginTop: 12 }}>
          <div className="section-title">Summary</div>
          <div className="sum-head">
            <div>Position</div><div>Strike</div><div>Expiration</div><div>Premium</div>
          </div>
          {rows.map((r, i) => (
            <div className="sum-row" key={`s${i}`}>
              <div>{r.type || r.position}</div>
              <div>{Number.isFinite(Number(r.strike)) ? Number(r.strike) : "—"}</div>
              <div>{Number(r.expiration ?? env?.T ?? 30)}d</div>
              <div>{Number.isFinite(Number(r.premium)) ? fmtCur(r.premium, currency) : "—"}</div>
            </div>
          ))}
          <div className="sum-net">
            <span className="muted">Net Premium:</span>
            <strong>
              {fmtCur(
                rows.reduce((acc, r) => {
                  const pos = (r.type || r.position || "").toLowerCase();
                  const sign = pos.includes("short") ? +1 : -1; // credit positive for shorts
                  return acc + sign * (Number(r.premium || 0) * Number(r.volume || 0));
                }, 0),
                currency
              )}
            </strong>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-root { position: fixed; inset: 0; z-index: 80; }
        .modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(6px); }
        .modal-sheet {
          position: relative; margin: 24px auto; max-width: 1120px;
          background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
          padding: 14px; max-height: calc(100vh - 48px); overflow: auto;
        }
        .modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 6px 10px; }
        .mh-left { display:flex; align-items:center; gap:10px; }
        .mh-icon { width:32px; height:32px; border-radius:10px; background: var(--card); border:1px solid var(--border); }
        .mh-name { font-size:18px; font-weight:700; margin-bottom: 2px; }
        .mh-actions { display:flex; gap:8px; }

        .legend-row { display:flex; align-items:center; gap:8px; padding: 4px 6px 8px; }
        .legend-dot { width:10px; height:10px; border-radius:50%; }
        .legend-text { font-size:12px; opacity:.9; margin-right:10px; }
        .flex-spacer { flex:1; }

        .button { height:36px; padding:0 14px; border-radius:12px; border:1px solid var(--border); background: var(--card); color: var(--text); }
        .button.ghost { background: transparent; }
        .icon-btn { width:32px; height:32px; border-radius:10px; border:1px solid var(--border); background: var(--card); color: var(--text); display:inline-flex; align-items:center; justify-content:center; }
        .icon-btn.danger { color: #ef4444; }

        .field {
          height: 34px; border-radius: 10px; border:1px solid var(--border);
          background: var(--bg); color: var(--text); padding: 0 10px; width: 100%;
        }

        .metric-strip {
          display:flex; gap:10px; overflow:auto; padding:10px 2px 2px 2px; scroll-snap-type: x mandatory;
        }

        .card.dense { border:1px solid var(--border); background: var(--bg); border-radius:14px; padding:12px; }
        .section-title { font-size:12px; opacity:.75; margin-bottom:8px; }

        .cfg-head, .cfg-row, .sum-head, .sum-row {
          display:grid; grid-template-columns: 1fr 1.3fr 1fr 0.8fr 1fr 38px; gap:10px; align-items:center;
        }
        .cfg-head { font-size:12px; opacity:.75; margin: 4px 0 6px; }
        .cfg-row { margin-bottom:8px; }
        .cfg-actions { display:flex; align-items:center; gap:8px; margin-top:8px; }

        .sum-head { grid-template-columns: 1.2fr 1fr 1fr 1fr; margin: 4px 0 6px; }
        .sum-row { grid-template-columns: 1.2fr 1fr 1fr 1fr; margin: 6px 0; }
        .sum-net { display:flex; justify-content:flex-end; gap:8px; padding-top:8px; border-top:1px dashed var(--border); }
        .muted { opacity:.7; font-size:12px; }
        .small { font-size:12px; }
      `}</style>
    </div>
  );
}

/* ---------------------------- UI bits ---------------------------- */
function MetricBox({ label, value }) {
  return (
    <div className="card dense" style={{ padding: "10px 12px", minWidth: 180, scrollSnapAlign: "start" }}>
      <div className="small muted">{label}</div>
      <div style={{ marginTop: 4, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
