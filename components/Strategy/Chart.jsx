"use client";
import { useEffect, useMemo, useState } from "react";

/**
 * Payoff + Monte Carlo overlays SVG
 *
 * Props:
 *  - spot: number (S0, > 0)
 *  - legs: { lc, sc, lp, sp } where each: { enabled, K, premium, qty }
 *  - riskFree?: number (decimal), carryPremium?: boolean
 *  - mu?: number (drift, decimal/yr), sigma?: number (vol, decimal/yr), T?: number (years)
 *  - STs?: number[] and profitsPct?: number[]  (optional external grid)
 *  - mcStats?: { meanST, q05ST, q25ST, q50ST, q75ST, q95ST, qLoST, qHiST }  (S quantiles)
 *  - theme?: "dark" | "light"
 */
export default function Chart({
  spot,
  legs = {},
  riskFree = 0,
  carryPremium = false,
  mu,
  sigma,
  T,
  STs,
  profitsPct,
  mcStats,
  theme,
}) {
  const W = 880, H = 440;
  const PADL = 68, PADR = 24, PADT = 20, PADB = 76;

  const isDark =
    theme ? theme === "dark" : typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : true;

  const C = isDark
    ? {
        bg: "#0b0b0f",
        axis: "#2c2c2e",
        tick: "#c7c7cc",
        zero: "#3a3a3c",
        payoff: "#ffffff",
        profit: "#30d158",
        loss: "#f97066",
        s: "#0a84ff",
        ci: "#bf5af2",
        ciFill: "#bf5af2" + "22", // ~13% alpha
        profitAlpha: 0.22,
        lossAlpha: 0.30,
      }
    : {
        bg: "#ffffff",
        axis: "#d1d5db",
        tick: "#6b7280",
        zero: "#e5e7eb",
        payoff: "#111827",
        profit: "#22c55e",
        loss: "#ef5d5d",
        s: "#2563eb",
        ci: "#7c3aed",
        ciFill: "#7c3aed" + "22",
        profitAlpha: 0.35,
        lossAlpha: 0.40,
      };

  // ---------- Helpers ----------
  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const toLeg = (leg) => ({
    enabled: !!leg?.enabled,
    K: num(leg?.strike ?? leg?.K),
    premium: num(leg?.premium),
    qty: Math.max(0, num(leg?.qty ?? 0)),
  });

  const legsNorm = useMemo(() => {
    const lc = toLeg(legs.lc || {});
    const sc = toLeg(legs.sc || {});
    const lp = toLeg(legs.lp || {});
    const sp = toLeg(legs.sp || {});
    return { lc, sc, lp, sp };
  }, [legs]);

  const netPremium = useMemo(() => {
    // buys +, sells -
    const { lc, lp, sc, sp } = legsNorm;
    const val = (p, q) => num(p) * num(q);
    return val(lc.premium, lc.qty) + val(lp.premium, lp.qty) - val(sc.premium, sc.qty) - val(sp.premium, sp.qty);
  }, [legsNorm]);

  const payoffAt = (ST) => {
    const { lc, sc, lp, sp } = legsNorm;
    const call = (K, q, sgn) => Math.max(ST - K, 0) * q * sgn;
    const put  = (K, q, sgn) => Math.max(K - ST, 0) * q * sgn;
    let p = 0;
    if (lc.enabled) p += call(lc.K, lc.qty, +1);
    if (sc.enabled) p += call(sc.K, sc.qty, -1);
    if (lp.enabled) p += put(lp.K, lp.qty, +1);
    if (sp.enabled) p += put(sp.K, sp.qty, -1);
    return p;
  };

  // carry factor for premium to expiry if requested
  const carry = carryPremium ? Math.exp((riskFree || 0) * (T || 0)) : 1;

  // ---------- Grid (Option A or B or fallback) ----------
  const grid = useMemo(() => {
    if (!spot || !(spot > 0)) {
      return { returns: [], STs: [], profitsPct: [] };
    }

    // If consumer passed aligned arrays → trust them
    if (Array.isArray(STs) && STs.length && Array.isArray(profitsPct) && profitsPct.length === STs.length) {
      const returns = STs.map((ST) => ST / spot - 1);
      return { returns, STs, profitsPct };
    }

    // Build local grid
    const N = 601;

    // If sigma & T provided → log-space grid (Option B)
    if (sigma > 0 && T > 0) {
      const m = Math.log(spot) + ((mu ?? 0) - 0.5 * sigma * sigma) * T;
      const s = sigma * Math.sqrt(T);
      const zMax = 6;
      const ys = new Array(N);
      const STg = new Array(N);
      for (let i = 0; i < N; i++) {
        const y = m - zMax * s + (2 * zMax * s) * (i / (N - 1));
        ys[i] = y;
        STg[i] = Math.exp(y);
      }
      const ret = STg.map((ST) => ST / spot - 1);
      const prof = STg.map((ST) => {
        const abs = payoffAt(ST) - carry * netPremium;
        const denom = Math.abs(netPremium) > 1e-9 ? Math.abs(netPremium) : spot;
        return (abs / denom) * 100; // percent
      });
      return { returns: ret, STs: STg, profitsPct: prof };
    }

    // Fallback: symmetric return grid around 0 (-50%..+50%)
    const ret = new Array(N);
    const STg = new Array(N);
    for (let i = 0; i < N; i++) {
      const r = -0.5 + (i / (N - 1)) * 1.0;
      ret[i] = r;
      STg[i] = spot * (1 + r);
    }
    const prof = STg.map((ST) => {
      const abs = payoffAt(ST) - carry * netPremium;
      const denom = Math.abs(netPremium) > 1e-9 ? Math.abs(netPremium) : spot;
      return (abs / denom) * 100;
    });
    return { returns: ret, STs: STg, profitsPct: prof };
  }, [spot, STs, profitsPct, sigma, T, mu, carry, netPremium]); // eslint-disable-line

  // ---------- Extents & scales ----------
  const { minX, maxX, minY, maxY } = useMemo(() => {
    if (!grid.returns.length) return { minX: -0.5, maxX: 0.5, minY: -100, maxY: 100 };
    let minX = Math.min(0, ...grid.returns);
    let maxX = Math.max(0, ...grid.returns);
    if (Math.abs(maxX - minX) < 1e-9) { minX -= 0.01; maxX += 0.01; }

    let minY = Math.min(0, ...grid.profitsPct);
    let maxY = Math.max(0, ...grid.profitsPct);
    if (Math.abs(maxY - minY) < 1e-6) { minY -= 1; maxY += 1; }

    // pad a little
    const yPad = (maxY - minY) * 0.08;
    minY -= yPad; maxY += yPad;

    return { minX, maxX, minY, maxY };
  }, [grid]);

  const x = (r) =>
    PADL + ((r - minX) / ((maxX - minX) || 1)) * (W - PADL - PADR);
  const y = (val) =>
    H - PADB - ((val - minY) / ((maxY - minY) || 1)) * (H - PADT - PADB);

  // ---------- Axes ticks ----------
  const niceTicksY = useMemo(() => {
    const target = 6;
    const raw = (maxY - minY) / target;
    const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
    const steps = [1, 2, 5, 10];
    let step = steps[0] * pow10;
    for (const s of steps) {
      const cand = s * pow10;
      if (raw <= cand) { step = cand; break; }
    }
    step = Math.max(1, Math.round(step)); // integer ticks only
    const start = Math.ceil(minY / step) * step;
    const end = Math.floor(maxY / step) * step;
    const ticks = [];
    for (let v = start; v <= end + 1e-9; v += step) ticks.push(Math.round(v));
    if (!ticks.includes(0)) ticks.push(0);
    return [...new Set(ticks)].sort((a,b)=>a-b);
  }, [minY, maxY]);

  const niceTicksX = useMemo(() => {
    const target = 7;
    const raw = (maxX - minX) / target;
    // pick from [0.001,0.002,0.005,0.01,0.02,0.05,0.1,0.2,0.5,1.0]
    const bases = [1,2,5];
    const scales = [-3,-2,-1,0];
    let step = 0.1;
    for (const k of scales) {
      for (const b of bases) {
        const cand = b * Math.pow(10, k);
        if (raw <= cand) { step = cand; break; }
      }
      if (raw <= step) break;
    }
    const start = Math.ceil(minX / step) * step;
    const end = Math.floor(maxX / step) * step;
    const ticks = [];
    const n = Math.round((end - start) / step);
    for (let i = 0; i <= n; i++) {
      const v = +(start + i * step).toFixed(6);
      ticks.push(v);
    }
    if (!ticks.includes(0)) ticks.push(0);
    return [...new Set(ticks)].sort((a,b)=>a-b);
  }, [minX, maxX]);

  const fmtPctInt = (v) => `${Math.round(v)}%`;
  const fmtXR = (r) => {
    const p = r * 100;
    const abs = Math.abs(p);
    return abs >= 10 ? `${Math.round(p)}%` : `${p.toFixed(1)}%`;
  };

  // ---------- Path for payoff ----------
  const payoffPath = useMemo(() => {
    const n = grid.returns.length;
    if (!n) return "";
    let d = `M ${x(grid.returns[0]).toFixed(2)} ${y(grid.profitsPct[0]).toFixed(2)}`;
    for (let i = 1; i < n; i++) {
      d += ` L ${x(grid.returns[i]).toFixed(2)} ${y(grid.profitsPct[i]).toFixed(2)}`;
    }
    return d;
  }, [grid, x, y]);

  // ---------- Profit/Loss shading ----------
  const yZero = y(0);
  const shadedSegments = useMemo(() => {
    const segsProfit = [];
    const segsLoss = [];
    for (let i = 0; i < grid.returns.length - 1; i++) {
      const r0 = grid.returns[i], r1 = grid.returns[i + 1];
      const p0 = grid.profitsPct[i], p1 = grid.profitsPct[i + 1];
      const X0 = x(r0), X1 = x(r1);
      const Y0 = y(p0), Y1 = y(p1);

      const bothPos = p0 >= 0 && p1 >= 0;
      const bothNeg = p0 <= 0 && p1 <= 0;

      // For mixed segments we approximate with left sign (fast).
      const path = `M ${X0} ${Y0} L ${X1} ${Y1} L ${X1} ${yZero} L ${X0} ${yZero} Z`;
      if (bothPos) segsProfit.push(path);
      else if (bothNeg) segsLoss.push(path);
      else {
        // Optional: exact split at zero-cross:
        const t = p1 === p0 ? 0.5 : (0 - p0) / (p1 - p0);
        const Xm = X0 + (X1 - X0) * t;
        const Ym = y(0);
        const leftPath = `M ${X0} ${Y0} L ${Xm} ${Ym} L ${Xm} ${yZero} L ${X0} ${yZero} Z`;
        const rightPath = `M ${Xm} ${Ym} L ${X1} ${Y1} L ${X1} ${yZero} L ${Xm} ${yZero} Z`;
        if (p0 >= 0) { segsProfit.push(leftPath); segsLoss.push(rightPath); }
        else { segsLoss.push(leftPath); segsProfit.push(rightPath); }
      }
    }
    return { segsProfit, segsLoss };
  }, [grid, x, y, yZero]);

  // ---------- MC overlays (band + lines + labels) ----------
  const overlays = useMemo(() => {
    if (!mcStats || !spot || !(spot > 0)) return null;
    const rLo = mcStats.qLoST ? mcStats.qLoST / spot - 1 : null;
    const rHi = mcStats.qHiST ? mcStats.qHiST / spot - 1 : null;
    const rMean = mcStats.meanST ? mcStats.meanST / spot - 1 : null;
    if (![rLo, rHi, rMean].every((v) => Number.isFinite(v))) return null;

    const xLo = x(rLo), xHi = x(rHi), xMean = x(rMean);

    return { rLo, rHi, rMean, xLo, xHi, xMean };
  }, [mcStats, spot, x]);

  // For tiny content/guards
  const noData = !spot || !(spot > 0) || !grid.returns.length;

  return (
    <section className="card">
      <h3>Chart</h3>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* background */}
        <rect x="0" y="0" width={W} height={H} fill={C.bg} rx="8" />

        {/* axes */}
        <g>
          {/* Y axis line */}
          <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} stroke={C.axis} />
          {/* X axis line */}
          <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} stroke={C.axis} />

          {/* Y ticks/labels */}
          {niceTicksY.map((v, i) => (
            <g key={`yt${i}`}>
              <line
                x1={PADL - 6}
                x2={PADL}
                y1={y(v)}
                y2={y(v)}
                stroke={C.axis}
              />
              <text
                x={PADL - 10}
                y={y(v)}
                fill={C.tick}
                fontSize="11"
                textAnchor="end"
                dominantBaseline="central"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmtPctInt(v)}
              </text>
              {/* gridline */}
              <line
                x1={PADL}
                x2={W - PADR}
                y1={y(v)}
                y2={y(v)}
                stroke={C.axis}
                opacity="0.15"
              />
            </g>
          ))}

          {/* X ticks/labels */}
          {niceTicksX.map((r, i) => (
            <g key={`xt${i}`}>
              <line
                x1={x(r)}
                x2={x(r)}
                y1={H - PADB}
                y2={H - PADB + 6}
                stroke={C.axis}
              />
              <text
                x={x(r)}
                y={H - PADB + 18}
                fill={C.tick}
                fontSize="11"
                textAnchor="middle"
                dominantBaseline="hanging"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {fmtXR(r)}
              </text>
            </g>
          ))}

          {/* Zero horizontal */}
          <line x1={PADL} x2={W - PADR} y1={y(0)} y2={y(0)} stroke={C.zero} />
        </g>

        {noData ? (
          <text
            x={(PADL + (W - PADR)) / 2}
            y={(PADT + (H - PADB)) / 2}
            textAnchor="middle"
            fill={C.tick}
            fontSize="12"
          >
            No data
          </text>
        ) : (
          <>
            {/* Profit/Loss shading */}
            <g opacity={1}>
              {shadedSegments.segsProfit.map((d, i) => (
                <path key={`pf${i}`} d={d} fill={C.profit} opacity={C.profitAlpha} />
              ))}
              {shadedSegments.segsLoss.map((d, i) => (
                <path key={`lf${i}`} d={d} fill={C.loss} opacity={C.lossAlpha} />
              ))}
            </g>

            {/* Payoff line */}
            <path d={payoffPath} fill="none" stroke={C.payoff} strokeWidth="2" />

            {/* S vertical line at r=0 */}
            <line x1={x(0)} x2={x(0)} y1={PADT} y2={H - PADB} stroke={C.s} />
            <text
              x={x(0)}
              y={H - PADB + 32}
              fill={C.tick}
              fontSize="11"
              textAnchor="middle"
            >
              S
            </text>

            {/* MC overlays */}
            {overlays && (
              <>
                {/* 95% CI band */}
                <rect
                  x={Math.min(overlays.xLo, overlays.xHi)}
                  y={PADT}
                  width={Math.abs(overlays.xHi - overlays.xLo)}
                  height={H - PADT - PADB}
                  fill={C.ciFill}
                />
                {/* CI edges */}
                <line x1={overlays.xLo} x2={overlays.xLo} y1={PADT} y2={H - PADB} stroke={C.ci} />
                <line x1={overlays.xHi} x2={overlays.xHi} y1={PADT} y2={H - PADB} stroke={C.ci} />
                {/* Mean */}
                <line
                  x1={overlays.xMean}
                  x2={overlays.xMean}
                  y1={PADT}
                  y2={H - PADB}
                  stroke={C.ci}
                  strokeDasharray="3 3"
                />
                {/* Bottom labels below axis ticks */}
                <text x={overlays.xLo} y={H - PADB + 32} fill={C.tick} fontSize="11" textAnchor="middle">Sₗ</text>
                <text x={overlays.xHi} y={H - PADB + 32} fill={C.tick} fontSize="11" textAnchor="middle">Sᵤ</text>
                <text x={overlays.xMean} y={H - PADB + 32} fill={C.tick} fontSize="11" textAnchor="middle">E[S]</text>
              </>
            )}

            {/* Axis titles */}
            <text x={(PADL + (W - PADR)) / 2} y={H - 14} fill={C.tick} fontSize="11" textAnchor="middle">
              Price Change (%)
            </text>
            <text
              x={16}
              y={(PADT + (H - PADB)) / 2}
              fill={C.tick}
              fontSize="11"
              textAnchor="middle"
              transform={`rotate(-90 16 ${(PADT + (H - PADB)) / 2})`}
            >
              Profit (%)
            </text>
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="row" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <span className="row small">
          <span style={{ width: 18, height: 0, borderTop: `2px solid ${C.payoff}` }} />
          Payoff
        </span>
        <span className="row small">
          <span style={{ width: 14, height: 10, background: C.profit, opacity: C.profitAlpha, borderRadius: 2 }} />
          Profit area
        </span>
        <span className="row small">
          <span style={{ width: 14, height: 10, background: C.loss, opacity: C.lossAlpha, borderRadius: 2 }} />
          Loss area
        </span>
        <span className="row small">
          <span style={{ width: 18, height: 0, borderTop: `2px solid ${C.s}` }} />
          S (current)
        </span>
        <span className="row small">
          <span style={{ width: 6, height: 0, borderTop: `2px solid ${C.ci}` }} />
          <span style={{ width: 6 }} />
          <span style={{ width: 6, height: 0, borderTop: `2px solid ${C.ci}` }} />
          95% S CI
        </span>
      </div>

      {/* Distribution stats */}
      {mcStats && spot > 0 && (
        <div className="grid grid-3" style={{ fontVariantNumeric: "tabular-nums" }}>
          {[
            ["P5", mcStats.q05ST],
            ["P25", mcStats.q25ST],
            ["P50", mcStats.q50ST],
            ["P75", mcStats.q75ST],
            ["P95", mcStats.q95ST],
            ["Lower Bound", mcStats.qLoST],
            ["Upper Bound", mcStats.qHiST],
            ["E[S]", mcStats.meanST],
          ].map(([label, val]) => {
            if (!Number.isFinite(val)) return (
              <div key={label} className="card"><div className="small">{label}</div><div>—</div></div>
            );
            const pct = ((val / spot - 1) * 100);
            return (
              <div key={label} className="card">
                <div className="small">{label}</div>
                <div>{val.toFixed(2)} ({pct >= 10 || pct <= -10 ? `${Math.round(pct)}%` : `${pct.toFixed(1)}%`})</div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
