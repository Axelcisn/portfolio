// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DirectionBadge from "./DirectionBadge";
import useMonteCarlo from "./useMonteCarlo";
import {
  buildPayoffSeries,
  findBreakEvens,
  netCredit,
  contractsCount,
  fmtCur,
  isCall,
  isPut,
  expiryPayoff,
} from "./payoffUtils";
import { buildGreekSeries } from "./greeks";

/* ---------- responsive width ---------- */
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

/* ---------- SVG Chart (P&L left axis, optional Greek on right) ---------- */
function ChartCanvas({
  spot,
  pnlXs = [],
  pnlYs = [],
  breakevens = [],
  strikeCenter,
  greekXs = [],
  greekYs = [],
  greekLabel = "Vega",
  showGreek = true,
  height = 460,
}) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);

  const hasPL = pnlXs.length && pnlYs.length;
  const minX = hasPL ? Math.min(...pnlXs) : (spot || 0) * 0.8 || 180;
  const maxX = hasPL ? Math.max(...pnlXs) : (spot || 0) * 1.2 || 275;

  // left axis
  let minY = -1, maxY = 1;
  if (hasPL) {
    minY = Math.min(...pnlYs);
    maxY = Math.max(...pnlYs);
    if (minY === maxY) { minY -= 1; maxY += 1; }
    const pad = (maxY - minY) * 0.12;
    minY -= pad; maxY += pad;
  }

  // right axis for greek
  const hasG = showGreek && greekXs.length && greekYs.length;
  let gMin = 0, gMax = 1;
  if (hasG) {
    gMin = Math.min(...greekYs);
    gMax = Math.max(...greekYs);
    if (gMin === gMax) { gMin -= 1; gMax += 1; }
    const gPad = (gMax - gMin) * 0.12;
    gMin -= gPad; gMax += gPad;
  }

  const P = { t: 18, r: 48, b: 56, l: 72 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;

  const sx = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const sy = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;
  const gy = (v) => P.t + (1 - (v - gMin) / (gMax - gMin)) * H;

  const yTicks = 6, xTicks = 10, gTicks = 5;

  const plPath = hasPL
    ? pnlXs.map((x, i) => `${i ? "L" : "M"}${sx(x)},${sy(pnlYs[i])}`).join(" ")
    : "";

  const gPath = hasG
    ? greekXs.map((x, i) => `${i ? "L" : "M"}${sx(x)},${gy(greekYs[i])}`).join(" ")
    : "";

  // win/loss shading bands based on sign of P&L
  const bands = (() => {
    if (!hasPL) return [];
    const xs = [minX, ...breakevens.filter((v) => v > minX && v < maxX), maxX];
    const out = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i], b = xs[i + 1];
      const mid = (a + b) / 2;
      let j = Math.floor(((mid - minX) / (maxX - minX)) * (pnlXs.length - 1));
      j = Math.max(0, Math.min(j, pnlXs.length - 1));
      out.push({ a, b, win: pnlYs[j] >= 0 });
    }
    return out;
  })();

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="Strategy chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Win/Loss background */}
        {bands.map((b, idx) => (
          <rect
            key={idx}
            x={sx(b.a)}
            y={P.t}
            width={sx(b.b) - sx(b.a)}
            height={H}
            fill={b.win ? "#16a34a" : "#ef4444"}
            opacity="0.08"
          />
        ))}

        {/* grid left (P&L) */}
        {Array.from({ length: yTicks + 1 }).map((_, i) => {
          const yy = P.t + (i / yTicks) * H;
          const val = maxY - (i / yTicks) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 10} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.6)">
                {val.toFixed(2)}
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

        {/* right axis for Greek */}
        {hasG && (
          <>
            <line x1={width - P.r + 0.5} y1={P.t} x2={width - P.r + 0.5} y2={height - P.b} stroke="rgba(255,255,255,.12)" />
            {Array.from({ length: gTicks + 1 }).map((_, i) => {
              const yy = P.t + (i / gTicks) * H;
              const val = gMax - (i / gTicks) * (gMax - gMin);
              return (
                <text key={`rg${i}`} x={width - P.r + 6} y={yy + 4} fontSize="10" fill="rgba(255,255,255,.7)">
                  {val.toFixed(2)}
                </text>
              );
            })}
          </>
        )}

        {/* vertical reference at strike center */}
        {Number.isFinite(strikeCenter) && strikeCenter >= minX && strikeCenter <= maxX && (
          <line
            x1={sx(strikeCenter)}
            y1={P.t}
            x2={sx(strikeCenter)}
            y2={height - P.b}
            stroke="rgba(255,255,255,.35)"
            strokeDasharray="4 4"
          />
        )}

        {/* legend */}
        <g transform={`translate(${P.l + 6}, ${P.t + 10})`}>
          <circle r="4" fill="#60a5fa" />
          <text x="8" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Current P&L</text>
          <circle cx="118" r="4" fill="#f472b6" />
          <text x="126" y="3" fontSize="10" fill="rgba(255,255,255,.85)">Expiration P&L</text>
          {hasG && (
            <>
              <circle cx="268" r="4" fill="#f59e0b" />
              <text x="276" y="3" fontSize="10" fill="rgba(255,255,255,.85)">{greekLabel}</text>
            </>
          )}
        </g>

        {/* series */}
        {hasPL && (
          <>
            <path d={plPath} fill="none" stroke="#60a5fa" strokeWidth="2" />
            <path d={plPath} fill="none" stroke="#f472b6" strokeWidth="2" strokeDasharray="4 3" />
          </>
        )}
        {hasG && <path d={gPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" />}
      </svg>
    </div>
  );
}

/* ---------- Modal ---------- */
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
  const [commission, setCommission] = useState(0);

  // ESC + body lock
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

  /* ===== Monte‑Carlo (for domain + pdf) ===== */
  const { xs: bellXs, ys: bellYs, pdf, band, progress, run } = useMonteCarlo();
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

  /* ===== P&L series (for chart) ===== */
  const domainLo = Number.isFinite(band.q01) ? band.q01 : loFallback;
  const domainHi = Number.isFinite(band.q99) ? band.q99 : hiFallback;

  const credit = useMemo(() => netCredit(rows, contractSize), [rows, contractSize]);
  const contracts = useMemo(() => contractsCount(rows), [rows]);
  const commissionTotal = useMemo(() => (Number(commission) || 0) * contracts, [commission, contracts]);
  const offset = credit - commissionTotal;

  const payoffSeries = useMemo(
    () => buildPayoffSeries({
      lo: domainLo,
      hi: domainHi,
      rows,
      contractSize,
      n: 400,
      offset,
    }),
    [domainLo, domainHi, rows, contractSize, offset]
  );

  const breakevens = useMemo(
    () => findBreakEvens(payoffSeries.xs, payoffSeries.ys),
    [payoffSeries]
  );

  const strikeCenter = useMemo(() => {
    if (!strikes.length) return Number(spot) || null;
    const srt = [...strikes].sort((a, b) => a - b);
    return srt[Math.floor(srt.length / 2)];
  }, [strikes, spot]);

  const maxProfit = useMemo(() => Math.max(...payoffSeries.ys, 0), [payoffSeries.ys]);
  const maxLoss   = useMemo(() => Math.min(...payoffSeries.ys, 0), [payoffSeries.ys]);

  /* ===== Win Rate & Expected Profit (EV) using MC pdf ===== */
  const { winRate, evAbs } = useMemo(() => {
    if (!bellXs.length || !pdf.length) return { winRate: null, evAbs: null };
    let pWin = 0;
    let ev = 0;
    for (let i = 0; i < bellXs.length; i++) {
      const ST = bellXs[i];
      const prob = pdf[i] || 0;
      const pnl = expiryPayoff(ST, rows, contractSize) + offset;
      if (pnl > 0) pWin += prob;
      ev += prob * pnl;
    }
    return { winRate: pWin, evAbs: ev };
  }, [bellXs, pdf, rows, contractSize, offset]);

  /* ===== Greeks (right axis) ===== */
  const greekYs = useMemo(() => {
    if (greek === "Not selected") return [];
    const r = Number.isFinite(riskFree) ? riskFree / 100 : 0;
    const T = Number.isFinite(TEnv) ? TEnv : 30 / 365;
    const sig = Number.isFinite(sigmaEnv) ? sigmaEnv : 0.25;
    return buildGreekSeries({
      xs: payoffSeries.xs,
      rows,
      contractSize,
      sigma: sig,
      T,
      r,
      greek,
    });
  }, [greek, payoffSeries.xs, rows, contractSize, sigmaEnv, TEnv, riskFree]);

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
            <button className="button" type="button" onClick={() => onApply?.({}, offset)}>Apply</button>
            <button className="button ghost" type="button" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Controls */}
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
            Commission (per contract)
            <input
              className="field"
              type="number"
              min={0}
              step="0.01"
              value={commission}
              onChange={(e) => setCommission(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 160 }}
              placeholder="0.00"
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
          <ChartCanvas
            spot={spot}
            pnlXs={payoffSeries.xs}
            pnlYs={payoffSeries.ys}
            breakevens={breakevens}
            strikeCenter={strikeCenter}
            greekXs={payoffSeries.xs}
            greekYs={greekYs}
            greekLabel={greek}
            showGreek={greek !== "Not selected"}
            height={460}
          />
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
          <MetricBox label="Win Rate" value={winRate == null ? "—" : `${Math.round(winRate * 100)}%`} />
          <MetricBox
            label="Breakeven"
            value={
              breakevens.length === 2
                ? `${fmtCur(breakevens[0], currency || "USD")} | ${fmtCur(breakevens[1], currency || "USD")}`
                : breakevens.length === 1
                ? fmtCur(breakevens[0], currency || "USD")
                : "—"
            }
          />
        </div>

        {/* Architecture */}
        <div className="card dense" style={{ marginBottom: GAP }}>
          <div className="section-title">Architecture</div>
          <div className="grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: GAP }}>
            <Spec title="Composition">
              {rows.length ? rows.map((r) => `${r.position}×${r.volume ?? 0}`).join(" · ") : "—"}
            </Spec>
            <Spec title="Breakeven(s)">
              {breakevens.length === 0 ? "—" : breakevens.map((v) => fmtCur(v, currency || "USD")).join(" | ")}
            </Spec>
            <Spec title="Max Profit">{fmtCur(maxProfit, currency || "USD")}</Spec>
            <Spec title="Max Loss">{fmtCur(maxLoss, currency || "USD")}</Spec>
            <Spec title="Risk Profile">{strategy?.direction || "Neutral"}</Spec>
            <Spec title="Expected Profit (EV)">{evAbs == null ? "—" : fmtCur(evAbs, currency || "USD")}</Spec>
            <Spec title="Net Credit (after commission)">{fmtCur(offset, currency || "USD")}</Spec>
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

/* ---------- small UI bits ---------- */
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
