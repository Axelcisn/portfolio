// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import assignStrategy from "./assignStrategy";

/* ---------------------------
   Small helpers
--------------------------- */
const clamp = (x, a, b) => Math.min(Math.max(Number(x) || 0, a), b);
const sum = (arr) => arr.reduce((t, v) => t + v, 0);
const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const fmtCCY = (n, ccy = "USD") => {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy || "USD",
      maximumFractionDigits: Math.abs(n) < 1 ? 2 : 0,
    }).format(n);
  } catch {
    const s = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return s + (Math.abs(n) < 1 ? n.toFixed(2) : n.toFixed(0));
  }
};

/* canonical positions -> side/type */
const POS = {
  "Long Call": { side: "long", type: "call" },
  "Short Call": { side: "short", type: "call" },
  "Long Put": { side: "long", type: "put" },
  "Short Put": { side: "short", type: "put" },
};

/* ---------------------------
   Normal / Black–Scholes bits
--------------------------- */
const SQRT1_2 = Math.SQRT1_2;
function erf(x) {
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
function d1(S, K, r, s, T) {
  return (Math.log(S / K) + (r + 0.5 * s * s) * T) / (s * Math.sqrt(T));
}
function callBS(S, K, r, s, T) {
  if (!(S > 0) || !(K > 0) || !(s > 0) || !(T > 0)) return Math.max(S - K, 0);
  const _d1 = d1(S, K, r, s, T);
  const _d2 = _d1 - s * Math.sqrt(T);
  return S * N(_d1) - K * Math.exp(-r * T) * N(_d2);
}
function putBS(S, K, r, s, T) {
  if (!(S > 0) || !(K > 0) || !(s > 0) || !(T > 0)) return Math.max(K - S, 0);
  const _d1 = d1(S, K, r, s, T);
  const _d2 = _d1 - s * Math.sqrt(T);
  return K * Math.exp(-r * T) * N(-_d2) - S * N(-_d1);
}
function greeks(S, K, r, s, T, type) {
  const _d1 = d1(S, K, r, s, T);
  const _d2 = _d1 - s * Math.sqrt(T);
  const pdf = nPdf(_d1);
  const gamma = pdf / (S * s * Math.sqrt(T));
  const vega = S * pdf * Math.sqrt(T);
  const thetaC =
    (-S * pdf * s) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * N(_d2);
  const thetaP =
    (-S * pdf * s) / (2 * Math.sqrt(T)) + r * K * Math.exp(-r * T) * N(-_d2);
  const rhoC = K * T * Math.exp(-r * T) * N(_d2);
  const rhoP = -K * T * Math.exp(-r * T) * N(-_d2);
  return type === "call"
    ? { delta: N(_d1), gamma, vega, theta: thetaC, rho: rhoC }
    : { delta: N(_d1) - 1, gamma, vega, theta: thetaP, rho: rhoP };
}

/* ---------------------------
   Responsive SVG width
--------------------------- */
function useWidth(ref, fallback = 960) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver((es) => {
        for (const e of es) setW(Math.max(360, e.contentRect.width));
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
    // fallback
    const onR = () => setW(Math.max(360, el.clientWidth));
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return w;
}

/* ---------------------------
   Chart (payoff + legs + greek)
--------------------------- */
function PayoffChart({
  rows,
  spot,
  r,
  sigma,
  T,
  contractSize,
  greek = "vega",
  height = 440,
}) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);

  const Ks = rows
    .map((r) => safeNum(r.strike))
    .filter((k) => Number.isFinite(k) && k > 0);
  const kmin = Ks.length ? Math.min(...Ks) : spot * 0.8;
  const kmax = Ks.length ? Math.max(...Ks) : spot * 1.2;
  const minX = Math.min(kmin * 0.9, spot * 0.8);
  const maxX = Math.max(kmax * 1.1, spot * 1.2);

  const P = { t: 30, r: 56, b: 44, l: 60 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;

  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;

  const NPTS = 260;
  const xs = Array.from(
    { length: NPTS },
    (_, i) => minX + ((maxX - minX) * i) / (NPTS - 1)
  );

  const cur = [];
  const exp = [];
  const gVals = [];

  function theo(S, leg) {
    const { side, type } = POS[leg.position] || {};
    if (!type) return 0;
    const val =
      type === "call" ? callBS(S, leg.strike, r, sigma, T) : putBS(S, leg.strike, r, sigma, T);
    const prem = safeNum(leg.premium);
    const qty = safeNum(leg.volume) * contractSize;
    return (side === "long" ? val - prem : prem - val) * qty;
  }
  function expiry(S, leg) {
    const { side, type } = POS[leg.position] || {};
    if (!type) return 0;
    const payoff =
      type === "call" ? Math.max(S - leg.strike, 0) : Math.max(leg.strike - S, 0);
    const prem = safeNum(leg.premium);
    const qty = safeNum(leg.volume) * contractSize;
    return (side === "long" ? payoff - prem : prem - payoff) * qty;
  }
  function greekVal(S, leg, kind) {
    const { side, type } = POS[leg.position] || {};
    if (!type) return 0;
    const g = greeks(S, leg.strike, r, sigma, T, type);
    const qty = safeNum(leg.volume) * (side === "long" ? +1 : -1) * contractSize;
    return (g[kind] || 0) * qty;
  }

  xs.forEach((S) => {
    cur.push(sum(rows.map((lg) => theo(S, lg))));
    exp.push(sum(rows.map((lg) => expiry(S, lg))));
    gVals.push(greek === "none" ? 0 : sum(rows.map((lg) => greekVal(S, lg, greek))));
  });

  let ymin = Math.min(...cur, ...exp, 0);
  let ymax = Math.max(...cur, ...exp, 1);
  if (ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }
  const y = (v) => P.t + (1 - (v - ymin) / (ymax - ymin)) * H;

  const gMin = Math.min(...gVals);
  const gMax = Math.max(...gVals);
  const gY = (v) => {
    if (gMax === gMin) return y(0);
    const t = (v - gMin) / (gMax - gMin);
    return P.t + (1 - t) * H;
  };

  const path = (arr, mapY) =>
    arr.map((v, i) => `${i ? "L" : "M"} ${x(xs[i])} ${mapY(v)}`).join(" ");

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff">
        {/* win/lose shading + zero */}
        <rect x={P.l} y={P.t} width={W} height={y(0) - P.t} fill="rgba(16,185,129,.07)" />
        <rect x={P.l} y={y(0)} width={W} height={H - (y(0) - P.t)} fill="rgba(240,68,56,.08)" />
        <line x1={P.l} y1={y(0)} x2={width - P.r} y2={y(0)} stroke="rgba(255,255,255,.25)" />

        {/* Y grid */}
        {Array.from({ length: 6 }).map((_, i) => {
          const val = ymin + ((ymax - ymin) * i) / 5;
          const yy = y(val);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {fmtCCY(val)}
              </text>
            </g>
          );
        })}

        {/* X grid */}
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

        {/* leg strikes */}
        {rows
          .map((r) => safeNum(r.strike))
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

        {/* payoff lines */}
        <path d={path(cur, y)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={path(exp, y)} fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="5 4" />

        {/* greek dashed + right label */}
        {greek !== "none" && (
          <>
            <path
              d={path(gVals, gY)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeDasharray="7 5"
            />
            <text x={width - P.r + 4} y={P.t + 12} fontSize="10" fill="rgba(255,255,255,.75)">
              {greek[0].toUpperCase() + greek.slice(1)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

/* ---------------------------
   Modal
--------------------------- */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const {
    spot = 0,
    sigma = 0.25,
    T = 30 / 365,
    riskFree = 0,
    currency = "USD",
  } = env || {};

  const [contractSize, setContractSize] = useState(100);
  const [greek, setGreek] = useState("vega"); // 'none' | 'delta' | 'gamma' | 'rho' | 'theta' | 'vega'

  // legs source (from strategy preset or assignStrategy fallback)
  const seedRows = useMemo(() => {
    const base =
      (strategy?.legs && strategy.legs.length
        ? strategy.legs
        : assignStrategy(strategy?.name || strategy?.id || "Manual", spot)) || [];
    const strikeDefault = Math.round((spot + 1) * 100) / 100;
    return base.map((r, i) => ({
      position: r.position,
      volume: safeNum(r.volume, 1),
      strike: safeNum(r.strike, strikeDefault),
      premium: safeNum(r.premium, Math.min(i + 1, 10)),
    }));
  }, [strategy, spot]);

  const [rows, setRows] = useState(seedRows);

  // composition line
  const composition = useMemo(
    () => (rows.length ? rows.map((r) => `${r.position}×${r.volume}`).join(" · ") : "—"),
    [rows]
  );

  // expiry P&L across range (metrics)
  const Ks = rows.map((r) => safeNum(r.strike)).filter((k) => Number.isFinite(k) && k > 0);
  const Rmin = Math.min(...Ks, spot) * 0.6;
  const Rmax = Math.max(...Ks, spot) * 1.6;

  const expiryPnL = (S) =>
    rows.reduce((acc, r) => {
      const { side, type } = POS[r.position] || {};
      if (!type) return acc;
      const qty = safeNum(r.volume) * contractSize;
      const prem = safeNum(r.premium);
      const payoff =
        type === "call" ? Math.max(S - r.strike, 0) : Math.max(r.strike - S, 0);
      const pl = side === "long" ? payoff - prem : prem - payoff;
      return acc + pl * qty;
    }, 0);

  const scan = useMemo(() => {
    const NPTS = 400;
    const xs = Array.from({ length: NPTS }, (_, i) => Rmin + ((Rmax - Rmin) * i) / (NPTS - 1));
    const ys = xs.map((S) => expiryPnL(S));
    return { xs, ys };
  }, [rows, contractSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxProfit = useMemo(() => Math.max(...scan.ys, 0), [scan]);
  const maxLoss = useMemo(() => Math.min(...scan.ys, 0), [scan]);

  const breakevens = useMemo(() => {
    const out = [];
    for (let i = 1; i < scan.xs.length; i++) {
      const y1 = scan.ys[i - 1],
        y2 = scan.ys[i];
      if ((y1 <= 0 && y2 >= 0) || (y1 >= 0 && y2 <= 0)) {
        const x1 = scan.xs[i - 1],
          x2 = scan.xs[i];
        const t = y2 === y1 ? 0 : -y1 / (y2 - y1);
        out.push(Math.round((x1 + t * (x2 - x1)) * 100) / 100);
      }
    }
    return [...new Set(out)].sort((a, b) => a - b);
  }, [scan]);

  const netPremium = useMemo(
    () =>
      rows.reduce((acc, r) => {
        const side = POS[r.position]?.side;
        const sign = side === "short" ? +1 : -1; // short receives
        return acc + sign * safeNum(r.premium) * safeNum(r.volume) * contractSize;
      }, 0),
    [rows, contractSize]
  );

  const toChartLegs = () => {
    const empty = { enabled: false, K: NaN, qty: 0 };
    const obj = { lc: { ...empty }, sc: { ...empty }, lp: { ...empty }, sp: { ...empty } };
    rows.forEach((r) => {
      const m = POS[r.position];
      if (!m) return;
      const key =
        m.type === "call" ? (m.side === "long" ? "lc" : "sc") : m.side === "long" ? "lp" : "sp";
      obj[key] = { enabled: safeNum(r.volume) > 0, K: safeNum(r.strike), qty: safeNum(r.volume) };
    });
    return obj;
  };

  const handleApply = () => onApply?.(toChartLegs(), netPremium);

  // ESC close + lock background scroll
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

  const edit = (i, field, v) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v === "" ? "" : Number(v) };
      return next;
    });

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
            <div className="mh-icon" />
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">
                {strategy?.name || "Strategy"}
              </div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions" style={{ gap: 8 }}>
            <label className="small muted" style={{ marginRight: 6 }}>
              Contract size
            </label>
            <input
              className="field"
              value={contractSize}
              onChange={(e) => setContractSize(clamp(e.target.value, 1, 1_000_000))}
              style={{ width: 110 }}
              type="number"
              min={1}
            />
            <label className="small muted" style={{ margin: "0 6px 0 10px" }}>
              Greek
            </label>
            <select
              className="field"
              value={greek}
              onChange={(e) => setGreek(e.target.value)}
              style={{ width: 140 }}
            >
              <option value="none">Not selected</option>
              <option value="delta">Delta</option>
              <option value="gamma">Gamma</option>
              <option value="rho">Rho</option>
              <option value="theta">Theta</option>
              <option value="vega">Vega</option>
            </select>

            <button className="button ghost" type="button" onClick={() => {}}>
              Save
            </button>
            <button className="button" type="button" onClick={handleApply}>
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
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

        {/* Metrics */}
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
          <MetricBox label="Win Rate" value={`0%`} />
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
            <Spec title="Composition">{composition}</Spec>
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
            <span className="muted">Net Premium:&nbsp;</span>
            <strong>{fmtCCY(netPremium, currency)}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------
   tiny presentational pieces
--------------------------- */
function MetricBox({ label, value }) {
  return (
    <div
      className="card dense"
      style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}
    >
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
          <span className="small muted" aria-hidden>
            $
          </span>
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
