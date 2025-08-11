// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";

/* =========================
   Small helpers
   ========================= */
const isStockPos = (p) => p === "Long Stock" || p === "Short Stock";
const r2 = (n) => Math.round(n * 100) / 100;

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

/* =========================
   Lightweight SVG chart (visual only)
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

function ChartCanvas({ spot, rows, height = 460, centerStrike }) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  const strikes = rows
    .map((r) => Number(r.strike))
    .filter((x) => Number.isFinite(x));
  const s = Number(spot);
  const minX = strikes.length ? Math.min(...strikes) : Number.isFinite(s) ? s * 0.8 : 180;
  const maxX = strikes.length ? Math.max(...strikes) : Number.isFinite(s) ? s * 1.2 : 275;

  const minY = -0.08, maxY = 0.08;
  const P = { t: 18, r: 48, b: 56, l: 72 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const y = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;

  // a simple bell for context
  const center = Number.isFinite(s) ? s : (minX + maxX) / 2;
  const bell = [];
  for (let i = 0; i <= 80; i++) {
    const p = minX + (i / 80) * (maxX - minX);
    const u = (p - center) / ((maxX - minX) / 6);
    const val = -0.08 + Math.exp(-0.5 * u * u) * 0.06;
    bell.push([x(p), y(val)]);
  }

  const yTicks = 6, xTicks = 10;

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff (placeholder)">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* grid Y */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const yy = P.t + (i / yTicks) * H;
          const val = maxY - (i / yTicks) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 10} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.6)">
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

        {/* center line at strike */}
        {Number.isFinite(centerStrike) && (
          <line x1={x(centerStrike)} y1={P.t} x2={x(centerStrike)} y2={height - P.b} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        {/* legends */}
        <g transform={`translate(${P.l + 6}, ${P.t + 10})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Current P&L</text>
          <circle cx="118" r="4" fill="#f472b6" />
          <text x="126" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Expiration P&L</text>
          <circle cx="268" r="4" fill="#f59e0b" />
          <text x="276" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Bell (placeholder)</text>
        </g>

        {/* placeholder curves */}
        <polyline fill="none" stroke="#60a5fa" strokeWidth="2" points={`${P.l},${y(-0.015)} ${width - P.r},${y(-0.015)}`} />
        <polyline fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="4 3" points={`${P.l},${y(-0.015)} ${width - P.r},${y(-0.015)}`} />
        <polyline fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" points={bell.map(([px, py]) => `${px},${py}`).join(" ")} />
      </svg>
    </div>
  );
}

/* =========================
   Modal
   ========================= */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, currency } = env || {};
  const S = Number(spot) || 0;

  // Seed legs: strike := spot + 1, premium := 1..10; keep fixed volumes; stock has no strike/premium
  const [rows, setRows] = useState(() => {
    let p = 1;
    return (strategy?.legs || []).map((r) => {
      const base = { ...r, volume: r.volume ?? 1 };
      if (isStockPos(r.position)) {
        base.strike = null;
        base.premium = 0;
      } else {
        base.strike = r2(S + 1);
        base.premium = p;
        p = p === 10 ? 1 : p + 1;
      }
      return base;
    });
  });

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

  // strike center for the vertical guide
  const strikeCenter = useMemo(() => {
    const ks = rows.map((r) => Number(r.strike)).filter((n) => Number.isFinite(n));
    if (!ks.length) return null;
    const srt = [...ks].sort((a, b) => a - b);
    return srt[Math.floor(srt.length / 2)];
  }, [rows]);

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
              <div id="sg-modal-title" className="mh-name">{strategy?.name || "Strategy"}</div>
              <DirectionBadge value={strategy?.direction || "Neutral"} />
            </div>
          </div>
          <div className="mh-actions">
            <button className="button ghost" type="button" onClick={() => {}}>Save</button>
            <button className="button" type="button" onClick={() => onApply?.({}, 0)}>Apply</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Chart */}
        <div style={{ marginBottom: GAP - 8 }}>
          <ChartCanvas spot={spot} rows={rows} height={460} centerStrike={strikeCenter} />
        </div>

        {/* Metrics (placeholders for now) */}
        <div
          className="metric-strip"
          style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: GAP, marginBottom: GAP }}
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
          <div
            className="grid-3"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GAP }}
          >
            <Spec title="Composition">
              {rows.length ? rows.map((r) => `${r.position}×${r.volume ?? 0}`).join(" · ") : "—"}
            </Spec>
            <Spec title="Breakeven(s)">—</Spec>
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
  const stock = isStockPos(row.position);
  return (
    <>
      <div className="sg-td strong">{row.position}</div>

      {/* Strike */}
      <div className="sg-td">
        {stock ? (
          <div className="small muted">—</div>
        ) : (
          <input
            className="field"
            type="number"
            step="0.01"
            value={row.strike ?? ""}
            onChange={(e) => onStrike(e.target.value)}
            placeholder="Strike"
          />
        )}
      </div>

      {/* Volume */}
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

      {/* Premium */}
      <div className="sg-td">
        {stock ? (
          <div className="small muted">—</div>
        ) : (
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
        )}
      </div>
    </>
  );
}
