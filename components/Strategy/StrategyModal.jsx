// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import assignStrategy from "./assignStrategy";

/* =========================
   Utilities & math
   ========================= */
const clamp = (x, a, b) => Math.min(Math.max(Number(x) || 0, a), b);
const sum = (a) => a.reduce((t, v) => t + v, 0);
const fmtCCY = (n, ccy = "USD") => {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: Math.abs(n) < 1 ? 2 : 0,
    }).format(n);
  } catch {
    const s = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return s + (Math.abs(n) < 1 ? n.toFixed(2) : n.toFixed(0));
  }
};

const POS = {
  "Long Call": { type: "call", side: "long" },
  "Short Call": { type: "call", side: "short" },
  "Long Put": { type: "put", side: "long" },
  "Short Put": { type: "put", side: "short" },
};

/* Normal helpers */
const SQRT1_2 = Math.SQRT1_2;
function erf(x) {
  // Abramowitz-Stegun approximation
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592,
    a2 = -0.284496736,
    a3 = 1.421413741,
    a4 = -1.453152027,
    a5 = 1.061405429,
    p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}
const N = (z) => 0.5 * (1 + erf(z * SQRT1_2));
const nPdf = (z) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/* Black–Scholes */
function d1(S, K, r, s, T) {
  return (Math.log(S / K) + (r + 0.5 * s * s) * T) / (s * Math.sqrt(T));
}
function callPrice(S, K, r, s, T) {
  if (!(S > 0) || !(K > 0) || !(s > 0) || !(T > 0)) return Math.max(S - K, 0);
  const _d1 = d1(S, K, r, s, T);
  const _d2 = _d1 - s * Math.sqrt(T);
  return S * N(_d1) - K * Math.exp(-r * T) * N(_d2);
}
function putPrice(S, K, r, s, T) {
  if (!(S > 0) || !(K > 0) || !(s > 0) || !(T > 0)) return Math.max(K - S, 0);
  const _d1 = d1(S, K, r, s, T);
  const _d2 = _d1 - s * Math.sqrt(T);
  return K * Math.exp(-r * T) * N(-_d2) - S * N(-_d1);
}

/* Greeks (per option, not scaled by contract size or qty) */
function greeks(S, K, r, s, T, type) {
  const _d1 = d1(S, K, r, s, T);
  const _d2 = _d1 - s * Math.sqrt(T);
  const pdf = nPdf(_d1);
  const gamma = pdf / (S * s * Math.sqrt(T));
  const vega = S * pdf * Math.sqrt(T); // per 1.0 vol
  const thetaCall =
    (-S * pdf * s) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * N(_d2);
  const thetaPut =
    (-S * pdf * s) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * N(-_d2);
  const rhoCall = K * T * Math.exp(-r * T) * N(_d2);
  const rhoPut = -K * T * Math.exp(-r * T) * N(-_d2);
  return type === "call"
    ? {
        delta: N(_d1),
        gamma,
        vega,
        theta: thetaCall,
        rho: rhoCall,
      }
    : {
        delta: N(_d1) - 1,
        gamma,
        vega,
        theta: thetaPut,
        rho: rhoPut,
      };
}

/* =========================
   Minimal SVG chart (shows legs + payoff)
   ========================= */
function useWidth(ref, fallback = 900) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setW(Math.max(360, e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

function PayoffChart({
  rows,
  spot,
  r,
  sigma,
  T,
  contractSize,
  greek = "vega",
  height = 420,
}) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);

  const Ks = rows
    .map((r) => Number(r.strike))
    .filter((x) => Number.isFinite(x) && x > 0);
  const Kmin = Ks.length ? Math.min(...Ks) : spot * 0.8;
  const Kmax = Ks.length ? Math.max(...Ks) : spot * 1.2;

  const minX = Math.min(Kmin * 0.9, spot * 0.8);
  const maxX = Math.max(Kmax * 1.1, spot * 1.2);

  // grid
  const P = { t: 30, r: 56, b: 44, l: 60 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;

  // build series
  const NPTS = 260;
  const xs = Array.from({ length: NPTS }, (_, i) => minX + ((maxX - minX) * i) / (NPTS - 1));

  function legPremiumSign(side) {
    // short receives premium (+), long pays (-)
    return side === "short" ? +1 : -1;
  }
  function legTheo(S, leg) {
    const { type, side } = POS[leg.position] || {};
    if (!type) return 0;
    const val =
      type === "call"
        ? callPrice(S, leg.strike, r, sigma, T)
        : putPrice(S, leg.strike, r, sigma, T);
    const prem = Number(leg.premium || 0);
    const qty = Number(leg.volume || 0);
    const signPrem = legPremiumSign(side);
    // position value today minus premium paid/received
    const pnlPer = side === "long" ? val - prem : prem - val;
    return pnlPer * qty * contractSize;
  }
  function legExpiry(S, leg) {
    const { type, side } = POS[leg.position] || {};
    if (!type) return 0;
    const payoff =
      type === "call" ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0);
    const prem = Number(leg.premium || 0);
    const qty = Number(leg.volume || 0);
    const pnlPer = side === "long" ? payoff - prem : prem - payoff;
    return pnlPer * qty * contractSize;
  }
  function legGreek(S, leg, kind) {
    const { type, side } = POS[leg.position] || {};
    if (!type) return 0;
    const g = greeks(S, leg.strike, r, sigma, T, type);
    const qty = Number(leg.volume || 0) * (side === "long" ? +1 : -1);
    return (g[kind] || 0) * qty * contractSize;
  }

  const cur = [];
  const exp = [];
  const greekVals = [];

  xs.forEach((S) => {
    cur.push(sum(rows.map((leg) => legTheo(S, leg))));
    exp.push(sum(rows.map((leg) => legExpiry(S, leg))));
    if (greek && greek !== "none") {
      greekVals.push(sum(rows.map((leg) => legGreek(S, leg, greek))));
    } else {
      greekVals.push(0);
    }
  });

  // y domain from data
  let ymin = Math.min(...cur, ...exp, 0);
  let ymax = Math.max(...cur, ...exp, 1);
  if (ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }
  const y = (v) => P.t + (1 - (v - ymin) / (ymax - ymin)) * H;

  // greek scale (right axis)
  const gMin = Math.min(...greekVals);
  const gMax = Math.max(...greekVals);
  const gY = (v) => {
    if (gMax === gMin) return y(0);
    const t = (v - gMin) / (gMax - gMin);
    return P.t + (1 - t) * H;
  };

  // paths
  const path = (arr, mapY) =>
    arr.map((v, i) => `${i ? "L" : "M"} ${x(xs[i])} ${mapY(v)}`).join(" ");

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy chart">
        {/* zero guideline */}
        <rect x={P.l} y={y(0)} width={W} height={H - (y(0) - P.t)} fill="rgba(240,68,56,.08)" />
        <rect x={P.l} y={P.t} width={W} height={y(0) - P.t} fill="rgba(16,185,129,.06)" />
        <line x1={P.l} y1={y(0)} x2={width - P.r} y2={y(0)} stroke="rgba(255,255,255,.25)" />

        {/* grid Y */}
        {Array.from({ length: 6 }).map((_, i) => {
          const v = ymin + ((ymax - ymin) * i) / 5;
          const yy = y(v);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.6)">
                {fmtCCY(v)}
              </text>
            </g>
          );
        })}

        {/* grid X */}
        {Array.from({ length: 8 }).map((_, i) => {
          const val = minX + ((maxX - minX) * i) / 7;
          const xx = x(val);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={P.t} x2={xx} y2={height - P.b} stroke="rgba(255,255,255,.06)" />
              <text x={xx} y={height - 14} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.7)">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* strikes as vertical hairlines */}
        {rows
          .map((r) => Number(r.strike))
          .filter((K) => Number.isFinite(K))
          .map((K, i) => (
            <line
              key={`k${i}`}
              x1={x(K)}
              y1={P.t}
              x2={x(K)}
              y2={height - P.b}
              stroke="rgba(255,255,255,.35)"
              strokeDasharray="4 3"
            />
          ))}

        {/* payoff paths */}
        <path d={path(cur, y)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={path(exp, y)} fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="5 4" />

        {/* greek dashed */}
        {greek !== "none" && (
          <>
            <path
              d={path(greekVals, gY)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="7 5"
            />
            {/* right axis label */}
            <text
              x={width - P.r + 4}
              y={P.t + 12}
              fontSize="10"
              fill="rgba(255,255,255,.7)"
            >
              {greek[0].toUpperCase() + greek.slice(1)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/* =========================
   Modal
   ========================= */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot = 0, sigma = 0.25, T = 30 / 365, riskFree = 0.0, currency = "USD" } =
    env || {};

  // Default contract size + greek view
  const [contractSize, setContractSize] = useState(100);
  const [greek, setGreek] = useState("vega"); // 'none' | 'delta' | 'gamma' | 'rho' | 'theta' | 'vega'

  // Build editable rows: if legs missing, derive from assignStrategy();
  const initialRows = useMemo(() => {
    let base = strategy?.legs && strategy.legs.length ? strategy.legs : assignStrategy(strategy?.name || strategy?.id || "Manual", spot);
    const strikeDefault = Math.round((spot + 1) * 100) / 100;

    return base.map((r, i) => ({
      position: r.position,
      volume: Number.isFinite(r.volume) ? r.volume : 1,
      strike: Number.isFinite(r.strike) && r.strike > 0 ? r.strike : strikeDefault,
      premium: Number.isFinite(r.premium) ? r.premium : Math.min(i + 1, 10),
    }));
  }, [strategy, spot]);

  const [rows, setRows] = useState(initialRows);

  // Composition string
  const composition = useMemo(
    () => rows.map((r) => `${r.position}×${r.volume}`).join(" · "),
    [rows]
  );

  // Expiration PnL helpers (for metrics & breakevens)
  const pnlAt = (S) =>
    rows.reduce((acc, r) => {
      const { type, side } = POS[r.position] || {};
      if (!type) return acc;
      const qty = Number(r.volume || 0) * contractSize;
      const prem = Number(r.premium || 0);
      const payoff =
        type === "call" ? Math.max(S - r.strike, 0) : Math.max(r.strike - S, 0);
      const pl = side === "long" ? payoff - prem : prem - payoff;
      return acc + pl * qty;
    }, 0);

  // Scan range for metrics
  const Ks = rows.map((r) => Number(r.strike)).filter((k) => Number.isFinite(k) && k > 0);
  const Rmin = Math.min(...Ks, spot) * 0.6;
  const Rmax = Math.max(...Ks, spot) * 1.6;

  const scan = useMemo(() => {
    const NPTS = 400;
    const xs = Array.from({ length: NPTS }, (_, i) => Rmin + ((Rmax - Rmin) * i) / (NPTS - 1));
    const ys = xs.map((S) => pnlAt(S));
    return { xs, ys };
  }, [rows, contractSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxProfit = useMemo(() => Math.max(...scan.ys, 0), [scan]);
  const maxLoss = useMemo(() => Math.min(...scan.ys, 0), [scan]);

  // Breakevens (where expiry P&L crosses 0)
  const breakevens = useMemo(() => {
    const out = [];
    for (let i = 1; i < scan.xs.length; i++) {
      const y1 = scan.ys[i - 1], y2 = scan.ys[i];
      if ((y1 <= 0 && y2 >= 0) || (y1 >= 0 && y2 <= 0)) {
        const x1 = scan.xs[i - 1], x2 = scan.xs[i];
        // linear interpolation
        const t = y2 === y1 ? 0 : -y1 / (y2 - y1);
        out.push(x1 + t * (x2 - x1));
      }
    }
    // unique-ish & sorted
    return [...new Set(out.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  }, [scan]);

  // Win rate placeholder (0% until MC step is wired)
  const winRatePct = useMemo(() => {
    const pos = scan.ys.filter((y) => y > 0).length / scan.ys.length;
    return Math.round(pos * 0); // keep 0% for now as requested earlier
  }, [scan]);

  // Apply -> bubble chart legs + net premium to parent
  function toChartLegs() {
    const empty = { enabled: false, K: NaN, qty: 0 };
    const obj = { lc: { ...empty }, sc: { ...empty }, lp: { ...empty }, sp: { ...empty } };
    rows.forEach((r) => {
      const m = POS[r.position];
      if (!m) return;
      const key = m.type === "call" ? (m.side === "long" ? "lc" : "sc") : m.side === "long" ? "lp" : "sp";
      obj[key] = { enabled: Number(r.volume) > 0, K: Number(r.strike), qty: Number(r.volume) };
    });
    return obj;
  }
  const netPremium = useMemo(() => {
    return rows.reduce((acc, r) => {
      const side = POS[r.position]?.side;
      const sign = side === "short" ? +1 : -1;
      return acc + sign * Number(r.premium || 0) * Number(r.volume || 0) * contractSize;
    }, 0);
  }, [rows, contractSize]);

  const handleApply = () => onApply?.(toChartLegs(), netPremium);

  // Close on ESC & lock scroll
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

  // Editing
  const edit = (i, field, v) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v === "" ? "" : Number(v) };
      return next;
    });

  /* ========== RENDER ========== */
  const GAP = 14;

  return (
    <div className="modal-root" role="dialog" aria-modal="true" aria-labelledby="sg-modal-title">
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className="modal-sheet"
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
            <div className="mh-icon">
              {strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}
            </div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions" style={{ gap: 8 }}>
            {/* contract + greek controls */}
            <label className="small muted" style={{ marginRight: 6 }}>Contract size</label>
            <input
              className="field"
              value={contractSize}
              onChange={(e) => setContractSize(clamp(e.target.value, 1, 1_000_000))}
              style={{ width: 110 }}
              type="number"
              min={1}
            />
            <label className="small muted" style={{ marginLeft: 10, marginRight: 6 }}>Greek</label>
            <select className="field" value={greek} onChange={(e) => setGreek(e.target.value)} style={{ width: 130 }}>
              <option value="none">Not selected</option>
              <option value="delta">Delta</option>
              <option value="gamma">Gamma</option>
              <option value="rho">Rho</option>
              <option value="theta">Theta</option>
              <option value="vega">Vega</option>
            </select>

            <button className="button ghost" type="button" onClick={() => {}}>Save</button>
            <button className="button" type="button" onClick={handleApply}>Apply</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: GAP }}>
          <PayoffChart
            rows={rows}
            spot={spot}
            r={riskFree}
            sigma={sigma}
            T={T}
            contractSize={contractSize}
            greek={greek}
            height={440}
          />
        </div>

        {/* Metrics under chart */}
        <div
          className="metric-strip"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, minmax(0,1fr))",
            gap: GAP,
            marginBottom: GAP,
          }}
        >
          <MetricBox label="Underlying" value={fmtCCY(spot, currency)} />
          <MetricBox label="Max Profit" value={fmtCCY(maxProfit, currency)} />
          <MetricBox label="Max Loss" value={fmtCCY(maxLoss, currency)} />
          <MetricBox label="Win Rate" value={`${winRatePct}%`} />
          <MetricBox
            label="Breakeven"
            value={
              breakevens.length === 0
                ? "—"
                : breakevens.length === 1
                ? fmtCCY(breakevens[0], currency)
                : `${fmtCCY(breakevens[0], currency)} | ${fmtCCY(breakevens[1], currency)}`
            }
          />
        </div>

        {/* Architecture */}
        <div className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-title">Architecture</div>
          <div
            className="grid-3"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GAP }}
          >
            <Spec title="Composition">{composition || "—"}</Spec>
            <Spec title="Breakeven(s)">
              {breakevens.length
                ? breakevens.map((v, i) => (i ? " · " : "") + fmtCCY(v, currency))
                : "—"}
            </Spec>
            <Spec title="Max Profit">{fmtCCY(maxProfit, currency)}</Spec>
            <Spec title="Max Loss">{fmtCCY(maxLoss, currency)}</Spec>
            <Spec title="Risk Profile">{strategy?.direction || "Neutral"}</Spec>
            <Spec title="Greeks Exposure">Δ/Γ/Θ/ν —</Spec>
            <Spec title="Margin Requirement">—</Spec>
          </div>
        </div>

        {/* Configuration */}
        <div className="card dense" style={{ marginBottom: 8 }}>
          <div className="section-title">Configuration</div>
          <div className="sg-table">
            <div className="sg-th">Position</div>
            <div className="sg-th">Strike</div>
            <div className="sg-th">Volume</div>
            <div className="sg-th">Premium</div>

            {rows.map((r, i) => (
              <RowEditor
                key={i}
                row={r}
                onStrike={(v) => edit(i, "strike", v)}
                onVol={(v) => edit(i, "volume", v)}
                onPremium={(v) => edit(i, "premium", v)}
                currency={currency}
              />
            ))}
          </div>

          <div className="row-right small" style={{ marginTop: 10 }}>
            <span className="muted">Net Premium:</span>&nbsp;
            <strong>{fmtCCY(netPremium, currency)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== small presentational bits ========== */
function MetricBox({ label, value }) {
  return (
    <div className="card dense" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="small muted">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
function Spec({ title, children }) {
  return (
    <div className="card dense" style={{ padding: 12 }}>
      <div className="small muted">{title}</div>
      <div style={{ marginTop: 6, wordBreak: "break-word" }}>{children}</div>
    </div>
  );
}
function RowEditor({ row, onStrike, onVol, onPremium, currency }) {
  return (
    <>
      <div className="sg-td strong">{row.position}</div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="0.01"
          value={row.strike ?? ""}
          onChange={(e) => onStrike(e.target.value)}
          placeholder="Strike"
        />
      </div>
      <div className="sg-td">
        <input
          className="field"
          type="number"
          step="1"
          value={row.volume ?? ""}
          onChange={(e) => onVol(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="sg-td">
        <div style={{ display: "grid", gridTemplateColumns: "12px 1fr", alignItems: "center" }}>
          <span className="small muted" aria-hidden>$</span>
          <input
            className="field"
            type="number"
            step="0.01"
            value={row.premium ?? ""}
            onChange={(e) => onPremium(e.target.value)}
            placeholder={currency}
          />
        </div>
      </div>
    </>
  );
}
