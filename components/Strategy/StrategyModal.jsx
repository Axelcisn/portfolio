// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import { gridPnl, uniqueStrikes } from "./payoffLite";

/* =========================
   Local helpers / formatters
   ========================= */
const POS_MAP = {
  "Long Call": { key: "lc", sign: +1 },
  "Short Call": { key: "sc", sign: -1 },
  "Long Put": { key: "lp", sign: +1 },
  "Short Put": { key: "sp", sign: -1 },
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
   Chart (seamless — no card/border)
   ========================= */
function ChartCanvas({ spot, rows, contractSize = 100, height = 420, currency = "USD" }) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  // Domain from strikes / spot with padding
  const strikes = rows.map((r) => Number(r.strike)).filter(Number.isFinite);
  const s = Number(spot);
  let minX, maxX;
  if (strikes.length) {
    const lo = Math.min(...strikes);
    const hi = Math.max(...strikes);
    const span = Math.max(1, hi - lo);
    minX = lo - span * 0.25;
    maxX = hi + span * 0.25;
  } else if (Number.isFinite(s)) {
    minX = s * 0.8;
    maxX = s * 1.2;
  } else {
    minX = 180;
    maxX = 275;
  }

  // P&L on a grid
  const { X, Y } = gridPnl(rows, minX, maxX, 240, contractSize);
  const Ycur = Y; // placeholder for current P&L until pricing model lands

  // Y domain
  const yMin = Math.min(0, ...Y, ...Ycur);
  const yMax = Math.max(0, ...Y, ...Ycur);
  const pad = Math.max(1, (yMax - yMin) * 0.1);
  const minY = yMin - pad;
  const maxY = yMax + pad;

  const P = { t: 18, r: 16, b: 44, l: 68 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const y = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;

  const toPath = (arrX, arrY) =>
    arrX.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${y(arrY[i])}`).join(" ");

  const yTicks = 6;
  const xTicks = 8;
  const kMarks = uniqueStrikes(rows);

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Win/Loss shading relative to zero */}
        <rect x={P.l} y={P.t} width={W} height={y(0) - P.t} fill="rgba(16,185,129,.07)" />
        <rect x={P.l} y={y(0)} width={W} height={height - P.b - y(0)} fill="rgba(244,63,94,.08)" />

        {/* Y grid */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const yy = P.t + (i / yTicks) * H;
          const val = maxY - (i / yTicks) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text
                x={P.l - 12}
                y={yy + 4}
                textAnchor="end"
                fontSize="10"
                fill="rgba(255,255,255,.65)"
              >
                {fmtCur(val, currency, 0)}
              </text>
            </g>
          );
        })}

        {/* X grid */}
        {Array.from({ length: xTicks + 1 }).map((_, i) => {
          const xx = P.l + (i / xTicks) * W;
          const val = minX + (i / xTicks) * (maxX - minX);
          return (
            <g key={`gx${i}`}>
              <line x1={xx} y1={P.t} x2={xx} y2={height - P.b} stroke="rgba(255,255,255,.05)" />
              <text
                x={xx}
                y={height - 12}
                textAnchor="middle"
                fontSize="10"
                fill="rgba(255,255,255,.65)"
              >
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Underlying price marker */}
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
          <circle cx="98" r="4" fill="#f472b6" />
          <text x="106" y="3" fontSize="10" fill="rgba(255,255,255,.9)">Expiration P&L</text>
        </g>

        {/* Lines */}
        <path d={toPath(X, Ycur)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={toPath(X, Y)} fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="5 4" />
      </svg>
    </div>
  );
}

/* =========================
   Modal
   ========================= */
export default function StrategyModal({ strategy, env, onApply, onClose }) {
  const { spot, currency = "USD", high52, low52 } = env || {};
  const contractSize = 100; // default; can be parameterised later

  // initialise editable rows (auto seeds around spot if missing)
  const [rows, setRows] = useState(() => {
    const s = Number(spot) || 0;
    return (strategy?.legs || []).map((r) => {
      if (!Number.isFinite(r.strike) && s > 0) {
        const dir = strategy?.direction;
        const pos = r.position;
        let k = s;
        if (pos.includes("Call")) k = dir === "Bullish" ? s * 1.05 : s * 1.03;
        if (pos.includes("Put")) k = dir === "Bearish" ? s * 0.95 : s * 0.97;
        return { ...r, strike: Math.round(k * 100) / 100, volume: r.volume ?? 1, premium: r.premium ?? 1 };
      }
      return { ...r, volume: r.volume ?? 1, premium: r.premium ?? 1 };
    });
  });

  // derived: chart‑ready legs object (compat with existing Apply handler) + net premium
  const chartLegs = useMemo(() => toChartLegs(rows), [rows]);
  const totalPrem = useMemo(() => netPremium(rows), [rows]);

  // Chart metrics
  const domainFromRows = useMemo(() => {
    const ks = rows.map((r) => Number(r.strike)).filter(Number.isFinite);
    if (!ks.length && Number.isFinite(Number(spot))) {
      const s = Number(spot);
      return { minX: s * 0.8, maxX: s * 1.2 };
    }
    if (!ks.length) return { minX: 180, maxX: 275 };
    const lo = Math.min(...ks);
    const hi = Math.max(...ks);
    const span = Math.max(1, hi - lo);
    return { minX: lo - span * 0.25, maxX: hi + span * 0.25 };
  }, [rows, spot]);

  const pnlGrid = useMemo(
    () => gridPnl(rows, domainFromRows.minX, domainFromRows.maxX, 240, contractSize),
    [rows, domainFromRows.minX, domainFromRows.maxX]
  );

  const maxProfit = useMemo(() => Math.max(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const maxLoss = useMemo(() => Math.min(0, ...pnlGrid.Y), [pnlGrid.Y]);
  const winRate = useMemo(() => {
    const n = pnlGrid.Y.length || 1;
    const wins = pnlGrid.Y.filter((v) => v > 0).length;
    return (wins / n) * 100;
  }, [pnlGrid.Y]);

  // Close on ESC + lock background scroll
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
            <button
              className="button"
              type="button"
              onClick={() => onApply?.(chartLegs, totalPrem)}
            >
              Apply
            </button>
            <button className="button ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {/* Chart — full width, seamless */}
        <div style={{ marginBottom: GAP }}>
          <ChartCanvas
            spot={spot}
            rows={rows}
            contractSize={contractSize}
            height={420}
            currency={currency}
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
          <MetricBox label="Underlying" value={fmtCur(spot, currency)} />
          <MetricBox label="Max Profit" value={fmtCur(maxProfit, currency, 0)} />
          <MetricBox label="Max Loss" value={fmtCur(maxLoss, currency, 0)} />
          <MetricBox label="Win Rate" value={`${winRate.toFixed(0)}%`} />
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
            <Spec title="Breakeven(s)">—{/* stays empty until formula is added */}</Spec>
            <Spec title="Max Profit">{fmtCur(maxProfit, currency, 0)}</Spec>

            <Spec title="Max Loss">{fmtCur(maxLoss, currency, 0)}</Spec>
            <Spec title="Risk Profile">{strategy?.direction || "Neutral"}</Spec>
            <Spec title="Greeks Exposure">Δ/Γ/Θ/ν —</Spec>

            <SpecHL title="52W High / Low" high={high52} low={low52} currency={currency} />
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
            <strong>{fmtCur(totalPrem, currency)}</strong>
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
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

// 52W High / Low — vertical split
function SpecHL({ title, high, low, currency }) {
  const has = Number.isFinite(Number(high)) || Number.isFinite(Number(low));
  return (
    <div className="card dense" style={{ padding: 12 }}>
      <div className="small muted">{title}</div>
      <div
        style={{
          marginTop: 8,
          display: "grid",
          gridTemplateRows: "1fr 1px 1fr",
          gap: 8,
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="muted">High</div>
          <div>{has ? fmtCur(high, currency) : "—"}</div>
        </div>
        <div style={{ height: 1, background: "var(--border)" }} />
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div className="muted">Low</div>
          <div>{has ? fmtCur(low, currency) : "—"}</div>
        </div>
      </div>
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
