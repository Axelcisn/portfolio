// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import useMonteCarlo from "./useMonteCarlo";

/* =========================
   Helpers
   ========================= */
const POS_MAP = {
  "Long Call": { key: "lc", sign: +1 },
  "Short Call": { key: "sc", sign: -1 },
  "Long Put": { key: "lp", sign: +1 },
  "Short Put": { key: "sp", sign: -1 },
};

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

function toChartLegs(rows) {
  const empty = { enabled: false, K: NaN, qty: 0 };
  const obj = { lc: { ...empty }, sc: { ...empty }, lp: { ...empty }, sp: { ...empty } };

  rows.forEach((r) => {
    const map = POS_MAP[r.position];
    if (!map) return;
    const qty = Number(r.volume || 0);
    const k = Number(r.strike);
    if (!Number.isFinite(qty) || !Number.isFinite(k)) return;
    obj[map.key] = { enabled: qty > 0, K: k, qty };
  });
  return obj;
}

function netPremium(rows) {
  let sum = 0;
  rows.forEach((r) => {
    const map = POS_MAP[r.position];
    if (!map) return;
    const vol = Number(r.volume || 0);
    const prem = Number(r.premium || 0);
    if (Number.isFinite(vol) && Number.isFinite(prem)) {
      sum += map.sign * vol * prem;
    }
  });
  return sum;
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

  // X-domain from strikes (fallback ±20% around spot)
  const strikes = rows.map((r) => Number(r.strike)).filter((n) => Number.isFinite(n));
  const s = Number(spot);
  const minX = strikes.length ? Math.min(...strikes, s || Infinity) : Number.isFinite(s) ? s * 0.8 : 180;
  const maxX = strikes.length ? Math.max(...strikes, s || -Infinity) : Number.isFinite(s) ? s * 1.2 : 275;

  // Y-domain for P&L placeholder (until payoff wiring)
  const minY = -0.08;
  const maxY = 0.08;

  const P = { t: 18, r: 18, b: 46, l: 64 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;

  const sx = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const sy = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;

  const yTicks = 6;
  const xTicks = 8;

  // MC bell -> scaled to chart band
  const bellPts =
    bellXs.length && bellYs.length
      ? bellXs.map((vx, i) => {
          const n = bellYs[i]; // 0..1
          const mapped = -0.08 + n * 0.06; // vertical placement inside band
          return `${sx(vx)},${sy(mapped)}`;
        })
      : [];

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* grid Y */}
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

        {/* grid X */}
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

        {/* underlying vertical */}
        {Number.isFinite(s) && s >= minX && s <= maxX && (
          <line x1={sx(s)} y1={P.t} x2={sx(s)} y2={height - P.b} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        {/* legends */}
        <g transform={`translate(${P.l + 4}, ${P.t + 10})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Current P&L</text>
          <circle cx="100" r="4" fill="#f472b6" />
          <text x="108" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Expiration P&L</text>
          <circle cx="230" r="4" fill="#f59e0b" />
          <text x="238" y="3" fontSize="10" fill="rgba(255,255,255,.85)">{greekLabel}</text>
        </g>

        {/* placeholder P&L lines (until payoff wiring) */}
        <polyline fill="none" stroke="#60a5fa" strokeWidth="2" points={`${P.l},${sy(-0.015)} ${width - P.r},${sy(-0.015)}`} />
        <polyline fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="4 3" points={`${P.l},${sy(-0.015)} ${width - P.r},${sy(-0.015)}`} />

        {/* Monte‑Carlo bell / Greek curve */}
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

  // editable rows
  const [rows, setRows] = useState(() => {
    const s = Number(spot) || 0;
    return (strategy?.legs || []).map((r) => {
      if (!Number.isFinite(r.strike) && s > 0) {
        const dir = strategy?.direction;
        const pos = r.position;
        let k = s;
        if (pos.includes("Call")) k = dir === "Bullish" ? s * 1.05 : s * 1.03;
        if (pos.includes("Put")) k = dir === "Bearish" ? s * 0.95 : s * 0.97;
        return { ...r, strike: Math.round(k * 100) / 100, volume: r.volume ?? 1 };
      }
      return { ...r, volume: r.volume ?? 1 };
    });
  });

  const chartLegs = useMemo(() => toChartLegs(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);

  // UI bits
  const [greek, setGreek] = useState("Vega");        // label only for now
  const [contractSize, setContractSize] = useState(100);

  // Close on ESC + lock background
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

  // ===== Monte‑Carlo distribution =====
  const { xs, ys, progress, run } = useMonteCarlo();
  const strikes = rows.map((r) => Number(r.strike)).filter((n) => Number.isFinite(n));
  const lo = strikes.length ? Math.min(...strikes) : (spot || 0) * 0.6;
  const hi = strikes.length ? Math.max(...strikes) : (spot || 0) * 1.4;

  useEffect(() => {
    // Prefer 1,000,000 if possible; otherwise 500,000
    const n = (typeof navigator !== "undefined" && navigator.hardwareConcurrency >= 8) ? 1_000_000 : 500_000;
    run({
      S0: Number(spot) || 0,
      sigma: Number.isFinite(sigmaEnv) ? sigmaEnv : 0.25,
      mu: Number.isFinite(riskFree) ? riskFree / 100 : 0, // assume % if provided as 2.00
      T: Number.isFinite(TEnv) ? TEnv : 30 / 365,
      n,
      bins: 140,
      minX: lo,
      maxX: hi,
    });
  }, [spot, sigmaEnv, TEnv, riskFree, lo, hi, run]);

  // unified spacing
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
            <div className="mh-icon">
              {strategy?.icon ? <strategy.icon aria-hidden="true" /> : <div className="badge" />}
            </div>
            <div className="mh-meta">
              <div id="sg-modal-title" className="mh-name">
                {strategy?.name || "Strategy"}
              </div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button ghost" type="button" onClick={() => {}}>
              Save
            </button>
            <button className="button" type="button" onClick={() => onApply?.(chartLegs, totalPrem)}>
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Chart controls (top-right), with compact select to fix clipped text */}
        <div
          style={{
            display: "flex",
            gap: GAP,
            alignItems: "center",
            justifyContent: "flex-end",
            marginBottom: 6,
          }}
        >
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
              // Fix for text clipping (as seen with "Vega")
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

        {/* CHART — no card/border, full bleed to the modal padding */}
        <div style={{ marginBottom: 6 }}>
          <ChartCanvas
            spot={spot}
            rows={rows}
            bellXs={xs}
            bellYs={ys}
            greekLabel={greek === "Not selected" ? "Distribution" : greek}
            height={420} // slightly taller for readability
          />
        </div>

        {/* Progress under chart */}
        <div className="small muted" style={{ marginBottom: GAP }}>
          Paths: {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
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
          <MetricBox label="Underlying" value={fmtCur(spot, currency || "USD")} />
          <MetricBox label="Max Profit" value="—" />
          <MetricBox label="Max Loss" value="—" />
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
            <Spec title="Breakeven(s)">—{/* will fill when BE rules are added */}</Spec>
            <Spec title="Max Profit">—</Spec>
            <Spec title="Max Loss">—</Spec>
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
                currency={currency || "USD"}
              />
            ))}
          </div>

          <div className="row-right small" style={{ marginTop: 10 }}>
            <span className="muted">Net Premium:</span>&nbsp;
            <strong>{fmtCur(totalPrem, currency || "USD")}</strong>
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
