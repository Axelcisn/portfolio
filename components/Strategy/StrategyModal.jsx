// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import useMonteCarlo from "./useMonteCarlo";

/* =========================
   Helpers
   ========================= */
const isShort = (pos) => /Short/.test(pos);
const isCall = (pos) => /Call/.test(pos);
const isPut  = (pos) => /Put/.test(pos);

const fmtCur = (v, ccy = "USD") => {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$") + n.toFixed(2);
  }
};

function uniqueSorted(arr) {
  return Array.from(new Set(arr.filter(Number.isFinite))).sort((a, b) => a - b);
}

// premium credit (short +, long −), per contract, scaled by contractSize
function netCredit(rows, contractSize) {
  let sum = 0;
  for (const r of rows) {
    const vol = Number(r.volume || 0);
    const prem = Number(r.premium || 0);
    if (!Number.isFinite(vol) || !Number.isFinite(prem)) continue;
    sum += (isShort(r.position) ? +1 : -1) * vol * prem;
  }
  return sum * (Number(contractSize) || 1);
}

// payoff at expiry for a single leg, per contract
function legPayoff(ST, r) {
  const K = Number(r.strike);
  const q = Number(r.volume || 0);
  if (!Number.isFinite(K) || !Number.isFinite(q)) return 0;
  let p = 0;
  if (isCall(r.position)) p = Math.max(ST - K, 0);
  if (isPut(r.position))  p = Math.max(K - ST, 0);
  const sign = isShort(r.position) ? -1 : +1; // short loses payoff
  return sign * q * p;
}

// total expiry payoff (sum of legs) scaled by contractSize
function payoffAt(ST, rows, contractSize) {
  const perContract = rows.reduce((acc, r) => acc + legPayoff(ST, r), 0);
  return perContract * (Number(contractSize) || 1);
}

/* =========================
   Lightweight SVG chart (no card/border)
   ========================= */
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

function ChartCanvas({
  spot,
  rows,
  bellXs = [],
  bellYs = [],
  greekLabel = "Vega",
  height = 420,
}) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  const strikes = rows.map((r) => Number(r.strike)).filter((n) => Number.isFinite(n));
  const s = Number(spot);
  const minX = strikes.length ? Math.min(...strikes, s || Infinity) : Number.isFinite(s) ? s * 0.8 : 180;
  const maxX = strikes.length ? Math.max(...strikes, s || -Infinity) : Number.isFinite(s) ? s * 1.2 : 275;

  const minY = -0.08;
  const maxY =  0.08;

  const P = { t: 18, r: 18, b: 46, l: 64 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;

  const sx = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const sy = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;

  const yTicks = 6, xTicks = 8;

  const bellPts =
    bellXs.length && bellYs.length
      ? bellXs.map((vx, i) => `${sx(vx)},${sy(-0.08 + bellYs[i] * 0.06)}`)
      : [];

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const yy = P.t + (i / yTicks) * H;
          const val = maxY - (i / yTicks) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 8} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.6)">
                {val >= 0 ? `$ ${val.toFixed(2)}` : `-$ ${Math.abs(val).toFixed(2)}`}
              </text>
            </g>
          );
        })}

        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const xx = P.l + (i / xTicks) * W;
          const val = minX + (i / xTicks) * (maxX - minX);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={P.t} x2={xx} y2={height - P.b} stroke="rgba(255,255,255,.05)" />
              <text x={xx} y={height - 12} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.6)">
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {Number.isFinite(s) && s >= minX && s <= maxX && (
          <line x1={sx(s)} y1={P.t} x2={sx(s)} y2={height - P.b} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        <g transform={`translate(${P.l + 4}, ${P.t + 10})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Current P&L</text>
          <circle cx="100" r="4" fill="#f472b6" />
          <text x="108" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Expiration P&L</text>
          <circle cx="230" r="4" fill="#f59e0b" />
          <text x="238" y="3" fontSize="10" fill="rgba(255,255,255,.85)">{greekLabel}</text>
        </g>

        <polyline fill="none" stroke="#60a5fa" strokeWidth="2" points={`${P.l},${sy(-0.015)} ${width - P.r},${sy(-0.015)}`} />
        <polyline fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="4 3" points={`${P.l},${sy(-0.015)} ${width - P.r},${sy(-0.015)}`} />

        {bellPts.length > 1 && (
          <polyline fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" points={bellPts.join(" ")} />
        )}
      </svg>
    </div>
  );
}

/* =========================
   Modal
   ========================= */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, currency, sigma: sigmaEnv, T: TEnv, riskFree } = env || {};

  const [rows, setRows] = useState(() => {
    const s = Number(spot) || 0;
    return (strategy?.legs || []).map((r) => {
      if (!Number.isFinite(r.strike) && s > 0) {
        const dir = strategy?.direction;
        const pos = r.position;
        let k = s;
        if (isCall(pos)) k = dir === "Bullish" ? s * 1.05 : s * 1.03;
        if (isPut(pos))  k = dir === "Bearish" ? s * 0.95 : s * 0.97;
        return { ...r, strike: Math.round(k * 100) / 100, volume: r.volume ?? 1 };
      }
      return { ...r, volume: r.volume ?? 1 };
    });
  });

  const [greek, setGreek] = useState("Vega");
  const [contractSize, setContractSize] = useState(100);

  const dialogRef = useRef(null);
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

  const edit = (i, field, v) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: v === "" ? "" : Number(v) };
      return next;
    });
  };

  // ===== Monte‑Carlo distribution & realistic band =====
  const { xs, ys, band, progress, run } = useMonteCarlo();
  const strikes = rows.map((r) => Number(r.strike)).filter((n) => Number.isFinite(n));
  const loFallback = strikes.length ? Math.min(...strikes) : (spot || 0) * 0.6;
  const hiFallback = strikes.length ? Math.max(...strikes) : (spot || 0) * 1.4;

  useEffect(() => {
    const n = (typeof navigator !== "undefined" && navigator.hardwareConcurrency >= 8) ? 1_000_000 : 500_000;
    run({
      S0: Number(spot) || 0,
      sigma: Number.isFinite(sigmaEnv) ? sigmaEnv : 0.25,
      mu: Number.isFinite(riskFree) ? riskFree / 100 : 0,
      T: Number.isFinite(TEnv) ? TEnv : 30 / 365,
      n,
      bins: 140,
      minX: loFallback,
      maxX: hiFallback,
    });
  }, [spot, sigmaEnv, TEnv, riskFree, loFallback, hiFallback, run]);

  // ===== Max Profit / Max Loss (realistic over MC 1%..99% band) =====
  const { maxProfit, maxLoss } = useMemo(() => {
    const domainLo = Number.isFinite(band.q01) ? band.q01 : loFallback;
    const domainHi = Number.isFinite(band.q99) ? band.q99 : hiFallback;
    const pts = uniqueSorted([domainLo, ...strikes, domainHi]);
    let mx = -Infinity, mn = Infinity;
    const credit = netCredit(rows, contractSize);

    for (const ST of pts) {
      const p = payoffAt(ST, rows, contractSize) + credit;
      if (p > mx) mx = p;
      if (p < mn) mn = p;
    }
    // guard if nothing valid
    if (!Number.isFinite(mx)) mx = 0;
    if (!Number.isFinite(mn)) mn = 0;
    return { maxProfit: mx, maxLoss: mn };
  }, [rows, strikes, band, contractSize, loFallback, hiFallback]);

  // unified spacing
  const GAP = 14;

  // net credit for display
  const netCred = useMemo(() => netCredit(rows, contractSize), [rows, contractSize]);

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
            <div className="mh-icon">
              {strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}
            </div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button ghost" type="button" onClick={() => {}}>Save</button>
            <button className="button" type="button" onClick={() => onApply?.({}, netCred)}>Apply</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Controls above chart */}
        <div style={{ display: "flex", gap: GAP, alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
          <label className="small muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Contract size
            <input
              className="field"
              type="number"
              min={1}
              step={1}
              value={contractSize}
              onChange={(e) => setContractSize(Math.max(1, Number(e.target.value) || 1))}
              style={{ width: 120 }}
            />
          </label>
          <label className="small muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Greek
            <select
              className="field"
              value={greek}
              onChange={(e) => setGreek(e.target.value)}
              style={{ width: 150, height: 40, lineHeight: "20px", paddingTop: 10, paddingBottom: 10 }}
            >
              <option>Not selected</option>
              <option>Delta</option>
              <option>Gamma</option>
              <option>Rho</option>
              <option>Theta</option>
              <option>Vega</option>
            </select>
          </label>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: 6 }}>
          <ChartCanvas spot={spot} rows={rows} bellXs={xs} bellYs={ys} greekLabel={greek === "Not selected" ? "Distribution" : greek} height={420} />
        </div>

        {/* Progress */}
        <div className="small muted" style={{ marginBottom: GAP }}>
          Paths: {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
        </div>

        {/* Metrics */}
        <div className="metric-strip" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: GAP, marginBottom: GAP }}>
          <MetricBox label="Underlying" value={fmtCur(spot, currency || "USD")} />
          <MetricBox label="Max Profit" value={fmtCur(maxProfit, currency || "USD")} />
          <MetricBox label="Max Loss" value={fmtCur(maxLoss,   currency || "USD")} />
          <MetricBox label="Win Rate" value="—" />
          <MetricBox label="Breakeven" value="—" />
        </div>

        {/* Architecture */}
        <div className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-title">Architecture</div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GAP }}>
            <Spec title="Composition">
              {rows.length ? rows.map((r) => `${r.position}×${r.volume ?? 0}`).join(" · ") : "—"}
            </Spec>
            <Spec title="Breakeven(s)">—</Spec>
            <Spec title="Max Profit">{fmtCur(maxProfit, currency || "USD")}</Spec>
            <Spec title="Max Loss">{fmtCur(maxLoss, currency || "USD")}</Spec>
            <Spec title="Risk Profile">{strategy?.direction || "Neutral"}</Spec>
            <Spec title="Greeks Exposure">Δ/Γ/Θ/ν —</Spec>
            <Spec title="Net Credit">{fmtCur(netCred, currency || "USD")}</Spec>
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
                currency={currency || "USD"}
              />
            ))}
          </div>

          <div className="row-right small" style={{ marginTop: 10 }}>
            <span className="muted">Net Credit:</span>&nbsp;<strong>{fmtCur(netCred, currency || "USD")}</strong>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Subcomponents
   ========================= */
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
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function RowEditor({ row, onStrike, onVol, onPremium, currency }) {
  return (
    <>
      <div className="sg-td strong">{row.position}</div>
      <div className="sg-td">
        <input className="field" type="number" step="0.01" value={row.strike ?? ""} onChange={(e) => onStrike(e.target.value)} placeholder="Strike" />
      </div>
      <div className="sg-td">
        <input className="field" type="number" step="1" value={row.volume ?? ""} onChange={(e) => onVol(e.target.value)} placeholder="0" />
      </div>
      <div className="sg-td">
        <div style={{ display: "grid", gridTemplateColumns: "12px 1fr", alignItems: "center" }}>
          <span className="small muted" aria-hidden>$</span>
          <input className="field" type="number" step="0.01" value={row.premium ?? ""} onChange={(e) => onPremium(e.target.value)} placeholder={currency} />
        </div>
      </div>
    </>
  );
}
