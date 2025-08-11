"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import { gridPnl, uniqueStrikes } from "./payoffLite";

/* =========================
   Helpers / Formatters
   ========================= */
const POS_LIST = [
  "Long Call",
  "Short Call",
  "Long Put",
  "Short Put",
  "Long Stock",
  "Short Stock",
];

const POS_SIGN = {
  "Long Call": +1,
  "Short Call": -1,
  "Long Put": +1,
  "Short Put": -1,
  "Long Stock": +1,
  "Short Stock": -1,
};

const POS_KIND = {
  "Long Call": "call",
  "Short Call": "call",
  "Long Put": "put",
  "Short Put": "put",
  "Long Stock": "stock",
  "Short Stock": "stock",
};

const fmtCur = (v, ccy = "USD", maxfd = 2) => {
  if (!Number.isFinite(Number(v))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: maxfd,
    }).format(Number(v));
  } catch {
    const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return sym + Number(v).toFixed(maxfd);
  }
};

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

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

/* =========================
   Black-Scholes Greeks (per leg)
   ========================= */
const SQRT2PI = Math.sqrt(2 * Math.PI);
const normPdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;
const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

// Abramowitz & Stegun 7.1.26
function erf(x) {
  const sign = x < 0 ? -1 : 1;
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
  return sign * y;
}

function bsD1D2(S, K, r, sigma, T) {
  const v = sigma * Math.sqrt(T);
  if (!(S > 0 && K > 0 && v > 0 && T > 0)) return { d1: 0, d2: 0, bad: true };
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / v;
  const d2 = d1 - v;
  return { d1, d2, bad: false };
}

function bsGreeks({ S, K, r = 0, sigma = 0.2, T = 30 / 365, type = "call" }) {
  if (T <= 0 || sigma <= 0 || !(S > 0 && K > 0)) {
    // Close-to-expiry fallback (intrinsic sensitivities)
    const itm =
      type === "call" ? (S > K ? 1 : 0) : type === "put" ? (S < K ? -1 : 0) : 0;
    return {
      delta: itm,
      gamma: 0,
      vega: 0,
      theta: 0,
      rho: 0,
    };
  }
  const { d1, d2 } = bsD1D2(S, K, r, sigma, T);
  const phi = normPdf(d1);
  const Nd1 = normCdf(d1);
  const Nd2 = normCdf(d2);
  const Nmd1 = normCdf(-d1);
  const Nmd2 = normCdf(-d2);

  const delta = type === "call" ? Nd1 : Nd1 - 1; // put: Nd1 - 1
  const gamma = phi / (S * sigma * Math.sqrt(T));
  // vega per $1 move in vol (not %)
  const vega = S * phi * Math.sqrt(T);
  // theta per 1 year, we show per day -> divide by 365 later in chart if needed
  const theta =
    type === "call"
      ? (-S * phi * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2
      : (-S * phi * sigma) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * Nmd2;
  const rho =
    type === "call"
      ? K * T * Math.exp(-r * T) * Nd2
      : -K * T * Math.exp(-r * T) * Nmd2;

  return { delta, gamma, vega, theta, rho };
}

function aggregateGreekAtPrice(S, rows, env, greekKey) {
  const r = Number(env?.riskFree ?? 0);
  const sigma = Number(env?.sigma ?? 0.2);
  const T = Math.max(0, Number(env?.T ?? 30)); // days
  const Ty = Math.max(1e-8, T / 365); // years

  let total = 0;
  for (const r0 of rows) {
    const type = r0.type || r0.position;
    const kind = POS_KIND[type];
    const sign = POS_SIGN[type] || 0;
    const vol = Number(r0.volume ?? 0);
    const K = Number(r0.strike);
    if (!vol || !Number.isFinite(K)) continue;

    if (kind === "stock") {
      // Greeks for stock
      if (greekKey === "delta") total += sign * vol;
      // others are near 0 for stock
      continue;
    }

    const g = bsGreeks({ S, K, r, sigma, T: Ty, type: kind });
    let v = 0;
    switch (greekKey) {
      case "delta":
        v = g.delta;
        break;
      case "gamma":
        v = g.gamma;
        break;
      case "theta":
        v = g.theta / 365; // show per day
        break;
      case "vega":
        v = g.vega / 100; // per 1% vol move
        break;
      case "rho":
        v = g.rho / 100; // per 1% rate move
        break;
      default:
        v = 0;
    }
    total += sign * vol * v;
  }
  return total;
}

/* =========================
   Breakevens from payoff grid
   ========================= */
function breakevensFromGrid(X, Y) {
  const xs = [];
  for (let i = 1; i < X.length; i++) {
    const y1 = Y[i - 1];
    const y2 = Y[i];
    if ((y1 <= 0 && y2 >= 0) || (y1 >= 0 && y2 <= 0)) {
      if (y1 === y2) continue;
      const t = -y1 / (y2 - y1);
      const x = X[i - 1] + t * (X[i] - X[i - 1]);
      xs.push(x);
    }
  }
  if (!xs.length) return { lo: null, hi: null };
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return { lo, hi };
}

/* =========================
   Chart
   ========================= */
function ChartCanvas({
  spot,
  rows,
  env,
  contractSize = 1,
  height = 420,
  currency = "USD",
  greek = "Vega",
  xDomain,
  onZoomDomain,
}) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  // Domain (keep sensible even with one strike)
  const strikesFin = rows
    .map((r) => Number(r.strike))
    .filter((k) => Number.isFinite(k) && k > 0);
  const s = Number(spot);
  let minX, maxX;
  if (xDomain && Array.isArray(xDomain)) {
    [minX, maxX] = xDomain;
  } else if (strikesFin.length) {
    const lo = Math.min(...strikesFin, Number.isFinite(s) ? s : Infinity);
    const hi = Math.max(...strikesFin, Number.isFinite(s) ? s : -Infinity);
    let span = Math.max(hi - lo, (Number.isFinite(s) ? s : hi) * 0.15, 20);
    const mid = (hi + lo) / 2;
    minX = mid - span * 0.8;
    maxX = mid + span * 0.8;
  } else if (Number.isFinite(s)) {
    const span = Math.max(20, s * 0.3);
    minX = s - span;
    maxX = s + span;
  } else {
    minX = 100;
    maxX = 200;
  }

  // P&L at expiration (and "current" placeholder)
  const GRID = 320;
  const { X, Y } = useMemo(
    () => gridPnl(rows, minX, maxX, GRID, contractSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, minX, maxX, contractSize]
  );
  const Ycur = Y; // real-time pricing can replace later

  // Greeks curve (sum of legs)
  const greekKey = greek.toLowerCase();
  const G = useMemo(() => {
    const arr = new Array(X.length);
    for (let i = 0; i < X.length; i++) {
      arr[i] = aggregateGreekAtPrice(X[i], rows, env, greekKey);
    }
    return arr;
  }, [X, rows, env, greekKey]);

  // Y domain (P&L axis)
  const ymin = Math.min(0, ...Y, ...Ycur);
  const ymax = Math.max(0, ...Y, ...Ycur);
  const pad = Math.max(1, (ymax - ymin) * 0.1);
  const minY = ymin - pad;
  const maxY = ymax + pad;

  // Right axis for Greeks (scaled)
  const gMin = Math.min(...G, 0);
  const gMax = Math.max(...G, 0);
  const gPad = (gMax - gMin) * 0.2 || 1;
  const minG = gMin - gPad;
  const maxG = gMax + gPad;

  // Layout + scales
  const P = { t: 18, r: 40, b: 44, l: 68 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const y = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;
  const yG = (v) => P.t + (1 - (v - minG) / (maxG - minG)) * H;

  // Build path helpers
  const toPath = (arrX, arrY, mapY = y) =>
    arrX.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${mapY(arrY[i])}`).join(" ");

  // Positive/negative fill polygons for P&L
  function areaPath(sign = +1) {
    const path = [];
    let open = false;
    const push = (cmd) => path.push(cmd);
    const baseY = y(0);

    for (let i = 0; i < X.length; i++) {
      const v = Y[i];
      const isPos = v > 0;
      if ((sign > 0 && isPos) || (sign < 0 && !isPos)) {
        const px = x(X[i]);
        const py = y(v);
        if (!open) {
          open = true;
          push(`M${px},${baseY} L${px},${py}`);
        } else {
          push(`L${px},${py}`);
        }
      } else if (open) {
        // close at intersection with 0
        const i0 = i - 1;
        if (i0 >= 0) {
          const y1 = Y[i0];
          const y2 = Y[i];
          const t = (0 - y1) / (y2 - y1 || 1);
          const cx = x(X[i0] + t * (X[i] - X[i0]));
          push(`L${cx},${baseY} Z`);
        }
        open = false;
      }
    }
    // close if still open at the end
    if (open) {
      push(`L${x(X[X.length - 1])},${baseY} Z`);
    }
    return path.join(" ");
  }

  // Breakevens for parent (not used inside the chart)
  const breakevens = useMemo(() => breakevensFromGrid(X, Y), [X, Y]);

  // Zoom (wheel to zoom, not too sensitive)
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !onZoomDomain) return;
    const handler = (e) => {
      if (!W || W <= 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = clamp(e.clientX - rect.left - P.l, 0, W);
      const xAtMouse = minX + (mx / W) * (maxX - minX);

      const factor = e.deltaY > 0 ? 1.12 : 0.88; // gentle zoom
      const newLo = xAtMouse - (xAtMouse - minX) * factor;
      const newHi = xAtMouse + (maxX - xAtMouse) * factor;

      // keep minimum span
      const minSpan = Math.max(10, (spot || 100) * 0.05);
      if (newHi - newLo < minSpan) return;

      onZoomDomain([newLo, newHi]);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [wrapRef, onZoomDomain, minX, maxX, W, P.l, spot]);

  const kMarks = uniqueStrikes(rows);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Shading relative to zero using the actual P&L sign */}
        <path d={areaPath(+1)} fill="rgba(34,197,94,.12)" />
        <path d={areaPath(-1)} fill="rgba(239,68,68,.12)" />

        {/* Grid + axes */}
        {/* horizontal grid */}
        {Array.from({ length: 6 }).map((_, i) => {
          const yy = P.t + (i / 6) * H;
          const val = maxY - (i / 6) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.07)" />
              <text x={P.l - 12} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {fmtCur(val, currency, 0)}
              </text>
            </g>
          );
        })}
        {/* vertical grid */}
        {Array.from({ length: 8 }).map((_, i) => {
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

        {/* Underlying marker */}
        {Number.isFinite(s) && s >= minX && s <= maxX && (
          <line
            x1={x(s)}
            y1={P.t}
            x2={x(s)}
            y2={height - P.b}
            stroke="rgba(255,255,255,.35)"
            strokeDasharray="4 4"
          />
        )}

        {/* Strike markers */}
        {kMarks.map((k, i) => (
          <g key={`k${i}`}>
            <line x1={x(k)} y1={P.t} x2={x(k)} y2={height - P.b} stroke="rgba(255,255,255,.12)" />
            <circle cx={x(k)} cy={y(0)} r="2.5" fill="rgba(255,255,255,.55)" />
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${P.l + 6}, ${P.t + 12})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Current P&L</text>
          <circle cx="98" r="4" fill="#e5e7eb" />
          <text x="106" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Expiration P&L</text>
          <circle cx="212" r="4" fill="#f59e0b" />
          <text x="220" y="3" fontSize="10" fill="rgba(255,255,255,.9)">{greek}</text>
        </g>

        {/* Lines */}
        <path d={toPath(X, Ycur)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={toPath(X, Y)} fill="none" stroke="#e5e7eb" strokeWidth="1.75" strokeDasharray="5 4" />
        <path d={toPath(X, G, yG)} fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeDasharray="6 5" />

        {/* Right y-axis ticks for greek */}
        {Array.from({ length: 5 }).map((_, i) => {
          const yy = P.t + (i / 4) * H;
          const val = maxG - (i / 4) * (maxG - minG);
          return (
            <g key={`rg${i}`}>
              <text x={width - P.r + 6} y={yy + 4} fontSize="10" fill="rgba(255,255,255,.65)">
                {val.toFixed(2)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* =========================
   Subcomponents
   ========================= */
function TrashBtn({ onClick, title = "Delete" }) {
  return (
    <button className="icon-btn" type="button" aria-label={title} onClick={onClick} title={title}>
      {/* refined delete icon */}
      <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M9 3h6m-9 3h12M9 9v8m6-8v8M5 6l1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function MetricBox({ label, value }) {
  return (
    <div className="card dense metric">
      <div className="small muted">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function SummaryRow({ r, currency }) {
  return (
    <div className="sum-row">
      <div>{r.position || r.type}</div>
      <div>{Number.isFinite(Number(r.strike)) ? Number(r.strike) : "—"}</div>
      <div>{Number.isFinite(Number(r.expiration)) ? `${r.expiration}d` : "—"}</div>
      <div>{Number.isFinite(Number(r.premium)) ? fmtCur(r.premium, currency) : "—"}</div>
    </div>
  );
}

/* =========================
   Modal
   ========================= */
export default function StrategyModal({ strategy, env, onClose, onApply }) {
  const { spot, currency = "USD" } = env || {};

  // -------- editable rows (position editor) --------
  const [rows, setRows] = useState(() =>
    (strategy?.legs || []).map((r) => ({
      // keep both names for backward compatibility
      position: r.position || r.type,
      type: r.type || r.position,
      strike: r.strike ?? "",
      volume: r.volume ?? 1,
      premium: r.premium ?? 0,
      // default expiration from the company card time (days)
      expiration: r.expiration ?? (env?.T ?? 30),
    }))
  );

  // selected greek + optional zoom domain
  const [greek, setGreek] = useState("Vega");
  const [domain, setDomain] = useState(null); // [minX, maxX] from zoom

  // chart-ready rows for payoff utils
  const payoffRows = useMemo(
    () =>
      rows
        .filter((r) => (Number(r.volume) || 0) >= 0) // allow 0 volume (keeps line off)
        .map((r) => ({
          position: r.position || r.type, // gridPnl expects these labels
          strike: Number(r.strike),
          volume: Number(r.volume || 0),
          premium: Number(r.premium || 0),
        })),
    [rows]
  );

  // payoff grid for metrics
  const pnlGrid = useMemo(() => {
    // derive domain from rows/spot when no zoom is active
    // pick a safe range so the axis never collapses
    let minX, maxX;
    if (domain) {
      [minX, maxX] = domain;
    } else {
      const strikes = rows
        .map((r) => Number(r.strike))
        .filter((k) => Number.isFinite(k) && k > 0);
      const s = Number(spot);
      if (strikes.length) {
        const lo = Math.min(...strikes, Number.isFinite(s) ? s : Infinity);
        const hi = Math.max(...strikes, Number.isFinite(s) ? s : -Infinity);
        const span = Math.max(hi - lo, (Number.isFinite(s) ? s : hi) * 0.15, 20);
        const mid = (hi + lo) / 2;
        minX = mid - span * 0.8;
        maxX = mid + span * 0.8;
      } else if (Number.isFinite(s)) {
        const span = Math.max(20, s * 0.3);
        minX = s - span;
        maxX = s + span;
      } else {
        minX = 100;
        maxX = 200;
      }
    }
    return gridPnl(payoffRows, minX, maxX, 320, 1);
  }, [payoffRows, rows, spot, domain]);

  const maxProfit = useMemo(() => Math.max(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const maxLoss = useMemo(() => Math.min(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const winRate = useMemo(() => {
    const n = pnlGrid.Y.length || 1;
    const wins = pnlGrid.Y.filter((v) => v > 0).length;
    return (wins / n) * 100;
  }, [pnlGrid.Y]);

  const breakeven = useMemo(() => breakevensFromGrid(pnlGrid.X, pnlGrid.Y), [pnlGrid.X, pnlGrid.Y]);

  const lotSize = useMemo(
    () =>
      rows
        .filter((r) => POS_KIND[r.position || r.type] !== "stock")
        .reduce((acc, r) => acc + Math.max(0, Number(r.volume || 0)), 0),
    [rows]
  );

  const netPremium = useMemo(() => {
    let sum = 0;
    for (const r of rows) {
      const type = r.position || r.type;
      const sign = POS_SIGN[type] || 0;
      const vol = Number(r.volume || 0);
      const prem = Number(r.premium || 0);
      if (Number.isFinite(vol) && Number.isFinite(prem)) sum += sign * vol * prem;
    }
    return sum;
  }, [rows]);

  const onReset = () => {
    setRows(
      (strategy?.legs || []).map((r) => ({
        position: r.position || r.type,
        type: r.type || r.position,
        strike: r.strike ?? "",
        volume: r.volume ?? 1,
        premium: r.premium ?? 0,
        expiration: r.expiration ?? (env?.T ?? 30),
      }))
    );
    setDomain(null);
  };

  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        position: "Long Call",
        type: "Long Call",
        strike: "",
        volume: 1,
        premium: 0,
        expiration: env?.T ?? 30,
      },
    ]);

  const removeRow = (i) =>
    setRows((prev) => {
      const next = [...prev];
      next.splice(i, 1);
      return next;
    });

  // Close on ESC + blur background scroll
  const dialogRef = useRef(null);
  useEffect(() => {
    const onEsc = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onEsc);
    const prev = document.body.style.overflow;
    const prevF = document.body.style.filter;
    document.body.style.overflow = "hidden";
    document.body.style.filter = "blur(1.2px)";
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = prev || "";
      document.body.style.filter = prevF || "";
    };
  }, [onClose]);

  const GAP = 14;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-sheet"
        ref={dialogRef}
        style={{
          maxWidth: 1120,
          maxHeight: "calc(100vh - 96px)",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          padding: 16,
        }}
      >
        {/* Header */}
        <div className="modal-head" style={{ marginBottom: GAP }}>
          <div className="mh-left">
            <div className="mh-icon">{strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}</div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button" type="button" onClick={() => { /* future: persist */ }}>
              Save
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Legend line + Greek selector */}
        <div className="legend-row">
          <div className="legend">
            <span className="dot c1" /> Current P&L
            <span className="dot c2" /> Expiration P&L
            <span className="dot c3" /> {greek}
          </div>
          <div className="legend-tools">
            <label className="small muted" style={{ marginRight: 8 }}>
              Greek
            </label>
            <select value={greek} onChange={(e) => setGreek(e.target.value)} className="field">
              {["Vega", "Delta", "Gamma", "Theta", "Rho"].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Chart — seamless */}
        <div style={{ marginBottom: GAP }}>
          <ChartCanvas
            spot={spot}
            rows={rows.map((r) => ({ ...r, type: r.type || r.position }))}
            env={env}
            contractSize={1}
            height={420}
            currency={currency}
            greek={greek}
            xDomain={domain || undefined}
            onZoomDomain={(d) => setDomain(d)}
          />
        </div>

        {/* Metrics (horizontally scrollable rail) */}
        <div className="metric-rail" style={{ marginBottom: GAP }}>
          <MetricBox label="Underlying price" value={fmtCur(spot, currency)} />
          <MetricBox label="Max profit" value={fmtCur(maxProfit, currency, 0)} />
          <MetricBox label="Max loss" value={fmtCur(maxLoss, currency, 0)} />
          <MetricBox label="Win rate" value={`${winRate.toFixed(2)}%`} />
          <MetricBox
            label="Breakeven (Low | High)"
            value={
              breakeven.lo || breakeven.hi
                ? `${breakeven.lo ? Math.round(breakeven.lo) : "—"} | ${breakeven.hi ? Math.round(breakeven.hi) : "—"}`
                : "—"
            }
          />
          <MetricBox label="Lot size" value={String(lotSize)} />
          {/* extra placeholders (not yet computed) */}
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

        {/* Configuration */}
        <div className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-title">Configuration</div>

          <div className="config-grid">
            <div className="cg-head">Strike</div>
            <div className="cg-head">Type</div>
            <div className="cg-head">Expiration</div>
            <div className="cg-head">Volume</div>
            <div className="cg-head">Premium</div>
            <div className="cg-head small right">Reset</div>

            {rows.map((r, i) => (
              <FragmentRow
                key={i}
                row={r}
                onChange={(next) =>
                  setRows((prev) => {
                    const copy = [...prev];
                    copy[i] = next;
                    return copy;
                  })
                }
                onDelete={() => removeRow(i)}
                currency={currency}
                i={i}
              />
            ))}
          </div>

          <div className="btn-row">
            <button className="button ghost" onClick={addRow} type="button">
              + New position
            </button>
            <div style={{ flex: 1 }} />
            <button className="button ghost" onClick={onReset} type="button">
              Reset
            </button>
          </div>
        </div>

        {/* Summary (non-editable) */}
        <div className="card dense" style={{ marginBottom: 8 }}>
          <div className="section-title">Summary</div>
          <div className="sum-head">
            <div>Position</div>
            <div>Strike</div>
            <div>Expiration</div>
            <div>Premium</div>
          </div>
          {rows.map((r, i) => (
            <SummaryRow key={`s${i}`} r={r} currency={currency} />
          ))}
          <div className="sum-foot">
            <span className="muted">Net Premium:</span>&nbsp;
            <strong>{fmtCur(netPremium, currency)}</strong>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-root { position: fixed; inset: 0; z-index: 70; }
        .modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.45); backdrop-filter: blur(4px); }
        .modal-sheet {
          position: absolute; left: 50%; top: 4%;
          transform: translateX(-50%);
          background: var(--bg); border: 1px solid var(--border); border-radius: 16px;
          box-shadow: 0 18px 50px rgba(0,0,0,.35);
        }
        .modal-head { display:flex; align-items:center; justify-content:space-between; }
        .mh-left { display:flex; align-items:center; gap:10px; }
        .mh-icon .badge{ width:28px; height:28px; border-radius:8px; background:var(--card); border:1px solid var(--border); }
        .mh-name{ font-size:18px; font-weight:700; }
        .mh-actions{ display:flex; gap:8px; }

        .legend-row{ display:flex; align-items:center; justify-content:space-between; margin:6px 2px 10px; }
        .legend{ display:flex; align-items:center; gap:14px; color:var(--muted); }
        .dot{ display:inline-block; width:10px; height:10px; border-radius:50%; margin-right:6px; }
        .c1{ background:#60a5fa; } .c2{ background:#e5e7eb; } .c3{ background:#f59e0b; }
        .legend-tools{ display:flex; align-items:center; gap:8px; }

        .metric-rail{ display:flex; gap:12px; overflow-x:auto; padding-bottom:2px; }
        .metric{ min-width:180px; padding:10px 12px; display:flex; flex-direction:column; gap:4px; }

        .card{ border:1px solid var(--border); border-radius:14px; background:var(--card); }
        .dense{ padding:12px; }
        .section-title{ font-weight:700; margin-bottom:8px; }

        .config-grid{
          display:grid;
          grid-template-columns: 1.2fr 1.2fr .8fr .8fr 1.2fr .4fr;
          gap:8px; align-items:center;
        }
        .cg-head{ font-size:12px; color:var(--muted); }
        .right{ text-align:right; }
        .field{ height:36px; padding:0 10px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text); width:100%; }

        .icon-btn{ width:32px; height:32px; border-radius:10px; border:1px solid var(--border); background:var(--bg); color:var(--text); display:flex; align-items:center; justify-content:center; }

        .btn-row{ display:flex; align-items:center; gap:8px; margin-top:10px; }

        .sum-head, .sum-row{
          display:grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap:8px; align-items:center;
        }
        .sum-head{ font-size:12px; color:var(--muted); margin-bottom:6px; }
        .sum-row{ padding:6px 4px; border-top:1px dashed var(--border); }
        .sum-foot{ display:flex; justify-content:flex-end; gap:6px; padding-top:10px; }
        .small{ font-size:12px; }
        .muted{ opacity:.7; }
        .value{ font-weight:700; }
        .button{
          height:36px; padding:0 14px; border-radius:12px; border:1px solid var(--border);
          background:var(--accent, #0ea5e9); color:#fff; font-weight:700;
        }
        .button.ghost{ background:transparent; color:var(--text); }
      `}</style>
    </div>
  );
}

/* ---------------- Row editor (inline) ---------------- */
function FragmentRow({ row, onChange, onDelete, currency, i }) {
  const set = (k, v) => onChange({ ...row, [k]: v });
  return (
    <>
      <input
        className="field"
        type="number"
        step="0.01"
        placeholder="Strike"
        value={row.strike ?? ""}
        onChange={(e) => set("strike", e.target.value === "" ? "" : Number(e.target.value))}
      />
      <select
        className="field"
        value={row.type || row.position}
        onChange={(e) => set("type", e.target.value) || set("position", e.target.value)}
      >
        {POS_LIST.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <input
        className="field"
        type="number"
        step="1"
        placeholder="Days"
        value={row.expiration ?? ""}
        onChange={(e) => set("expiration", e.target.value === "" ? "" : Number(e.target.value))}
      />
      <input
        className="field"
        type="number"
        step="1"
        min="0"
        placeholder="Qty"
        value={row.volume ?? ""}
        onChange={(e) => set("volume", e.target.value === "" ? "" : Number(e.target.value))}
      />
      <div style={{ display: "grid", gridTemplateColumns: "12px 1fr", alignItems: "center" }}>
        <span className="small muted" aria-hidden>
          $
        </span>
        <input
          className="field"
          type="number"
          step="0.01"
          placeholder={currency}
          value={row.premium ?? ""}
          onChange={(e) => set("premium", e.target.value === "" ? "" : Number(e.target.value))}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <TrashBtn onClick={onDelete} />
      </div>
    </>
  );
}
