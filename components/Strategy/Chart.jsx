"use client";
import { useMemo } from "react";
import { fmtCur } from "../../utils/format";

/**
 * Chart: Options payoff (vs. return) + MC overlays.
 *
 * Props
 * - spot: number
 * - legs: { lc, sc, lp, sp } each { enabled, K, qty, premium? }
 * - riskFree?: number
 * - carryPremium?: boolean
 * - mu?: number | null
 * - sigma?: number | null
 * - T?: number | null                // years
 * - STs?: number[]                   // optional external grid of terminal prices
 * - profitsPct?: number[]            // optional external payoff% (unused here)
 * - mcStats?: { meanST, q05ST, q25ST, q50ST, q75ST, q95ST, qLoST, qHiST }
 */
export default function Chart({
  spot,
  legs = {},
  riskFree = 0,
  carryPremium = false,
  mu = null,
  sigma = null,
  T = null,
  STs = null,
  profitsPct = null,
  mcStats = null,
}) {
  const W = 960;
  const H = 420;
  const PADL = 56;
  const PADR = 24;
  const PADT = 16;
  const PADB = 40;

  // Theme
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const C = dark
    ? {
        bg: "#0b0b0c",
        axis: "#3a3a3d",
        tick: "#9ea0a6",
        grid: "#242426",
        line: "#cccccf",
        profit: "rgba(26, 172, 96, 0.18)",
        loss: "rgba(210, 56, 56, 0.18)",
        band: "rgba(100, 149, 237, 0.15)",
        marker: "#c9cbd1",
      }
    : {
        bg: "#ffffff",
        axis: "#d9d9de",
        tick: "#4a4a4d",
        grid: "#ececf0",
        line: "#0e0e10",
        profit: "rgba(26, 172, 96, 0.12)",
        loss: "rgba(210, 56, 56, 0.12)",
        band: "rgba(100, 149, 237, 0.12)",
        marker: "#1a1a1d",
      };

  // ------- helpers -------
  const L = normalizeLegs(legs);

  // Payoff in currency ignoring premiums (net premium shown elsewhere)
  const payoffAt = (S) => {
    let p = 0;
    if (L.lc.enabled) p += Math.max(S - L.lc.K, 0) * L.lc.qty;
    if (L.sc.enabled) p -= Math.max(S - L.sc.K, 0) * L.sc.qty;
    if (L.lp.enabled) p += Math.max(L.lp.K - S, 0) * L.lp.qty;
    if (L.sp.enabled) p -= Math.max(L.sp.K - S, 0) * L.sp.qty;
    return p;
  };

  // X domain (returns). Prefer MC quantiles; otherwise +/- 50%.
  const domainR = useMemo(() => {
    if (spot > 0 && mcStats?.qLoST && mcStats?.qHiST) {
      const loR = mcStats.qLoST / spot - 1;
      const hiR = mcStats.qHiST / spot - 1;
      const pad = 0.08 * Math.max(0.01, hiR - loR);
      return [loR - pad, hiR + pad];
    }
    return [-0.5, 0.5];
  }, [spot, mcStats?.qLoST, mcStats?.qHiST]);

  const gridR = useMemo(() => {
    if (!(spot > 0)) return [];
    if (Array.isArray(STs) && STs.length > 1) {
      return STs.map((S) => Number(S) / spot - 1);
    }
    const [r0, r1] = domainR;
    const N = 201;
    const step = (r1 - r0) / (N - 1);
    const out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = r0 + i * step;
    return out;
  }, [spot, domainR, STs]);

  const gridY = useMemo(() => {
    if (!(spot > 0)) return { min: -1, max: 1, values: [], STs: [] };
    const STsGrid = gridR.map((r) => spot * (1 + r));
    const vals = STsGrid.map((S) => payoffAt(S));
    let min = Math.min(...vals, 0);
    let max = Math.max(...vals, 0);
    // pad & avoid degenerate ranges
    if (min === max) {
      const m = Math.max(1, Math.abs(min));
      min -= m;
      max += m;
    } else {
      const pad = 0.06 * (max - min);
      min -= pad;
      max += pad;
    }
    return { min, max, values: vals, STs: STsGrid };
  }, [gridR, spot, L]);

  // scales
  const x = (r) =>
    PADL + ((r - domainR[0]) / (domainR[1] - domainR[0])) * (W - PADL - PADR);
  const y = (v) =>
    H -
    PADB -
    ((v - gridY.min) / (gridY.max - gridY.min)) * (H - PADT - PADB);

  // ticks
  const niceTicksX = useMemo(
    () => niceTicks(domainR[0], domainR[1], 7, true),
    [domainR]
  );
  const niceTicksY = useMemo(
    () => niceTicks(gridY.min, gridY.max, 6, false),
    [gridY.min, gridY.max]
  );

  const fmtXR = (r) => `${(r * 100).toFixed(Math.abs(r) >= 0.1 ? 0 : 1)}%`;
  const fmtY = (v) => fmtCur(v, legs?.ccy || "EUR");

  // Path for payoff curve
  const pathD = useMemo(() => {
    if (!gridR.length) return "";
    let d = "";
    for (let i = 0; i < gridR.length; i++) {
      const Y = gridY.values[i];
      const xi = x(gridR[i]);
      const yi = y(Y);
      d += (i === 0 ? "M" : "L") + xi + " " + yi + " ";
    }
    return d.trim();
  }, [gridR, gridY]);

  // Profit/loss shading polygons (split by y=0 line) -> return arrays of <polygon> point strings
  const fills = useMemo(() => {
    if (!gridR.length) return { profit: [], loss: [] };
    const zeroY = y(0);
    const xs = gridR.map(x);
    const ys = gridY.values.map(y);
    const profit = [];
    const loss = [];

    for (let i = 0; i < xs.length - 1; i++) {
      const x1 = xs[i], y1 = ys[i];
      const x2 = xs[i + 1], y2 = ys[i + 1];

      const isProfit1 = y1 < zeroY;
      const isProfit2 = y2 < zeroY;

      if (isProfit1 === isProfit2) {
        const pts = `${x1},${zeroY} ${x1},${y1} ${x2},${y2} ${x2},${zeroY}`;
        (isProfit1 ? profit : loss).push(pts);
      } else {
        // split at intersection
        const t = (zeroY - y1) / (y2 - y1); // in [0,1]
        const xm = x1 + t * (x2 - x1);
        // two triangles
        const pts1 = `${x1},${zeroY} ${x1},${y1} ${xm},${zeroY}`;
        const pts2 = `${xm},${zeroY} ${x2},${y2} ${x2},${zeroY}`;
        (isProfit1 ? profit : loss).push(pts1);
        (isProfit2 ? profit : loss).push(pts2);
      }
    }

    return { profit, loss };
  }, [gridR, gridY]);

  // MC overlays → vertical band for 95% interval + markers for mean/median
  const band = useMemo(() => {
    if (!(spot > 0) || !mcStats?.qLoST || !mcStats?.qHiST) return null;
    const rLo = mcStats.qLoST / spot - 1;
    const rHi = mcStats.qHiST / spot - 1;
    return { x1: x(rLo), x2: x(rHi) };
  }, [mcStats?.qLoST, mcStats?.qHiST, spot, domainR]);

  const markers = useMemo(() => {
    if (!(spot > 0)) return [];
    const arr = [];
    const push = (label, S) => {
      if (!Number.isFinite(S)) return;
      arr.push({ label, x: x(S / spot - 1) });
    };
    push("P5", mcStats?.q05ST);
    push("P25", mcStats?.q25ST);
    push("P50", mcStats?.q50ST);
    push("P75", mcStats?.q75ST);
    push("P95", mcStats?.q95ST);
    push("E[S]", mcStats?.meanST);
    return arr;
  }, [mcStats, spot, domainR]);

  if (!(spot > 0)) {
    return (
      <section className="card" style={{ padding: 16 }}>
        <div className="small">Chart</div>
        <div>Select a company to render payoff and distribution.</div>
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 0 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="auto"
        role="img"
        aria-label="Payoff chart"
      >
        {/* bg */}
        <rect x="0" y="0" width={W} height={H} fill={C.bg} rx="14" />

        {/* grid verticals */}
        {niceTicksX.map((r, i) => (
          <line
            key={`gx${i}`}
            x1={x(r)}
            x2={x(r)}
            y1={PADT}
            y2={H - PADB}
            stroke={C.grid}
          />
        ))}

        {/* grid horizontals */}
        {niceTicksY.map((v, i) => (
          <line
            key={`gy${i}`}
            x1={PADL}
            x2={W - PADR}
            y1={y(v)}
            y2={y(v)}
            stroke={C.grid}
          />
        ))}

        {/* axes */}
        <line x1={PADL} x2={W - PADR} y1={H - PADB} y2={H - PADB} stroke={C.axis} />
        <line x1={PADL} x2={PADL} y1={PADT} y2={H - PADB} stroke={C.axis} />

        {/* X ticks/labels — skip 0% label to avoid overlap with the “S” line */}
        {niceTicksX.map((r, i) => (
          <g key={`xt${i}`}>
            <line
              x1={x(r)}
              x2={x(r)}
              y1={H - PADB}
              y2={H - PADB + 6}
              stroke={C.axis}
            />
            {Math.abs(r) > 1e-12 && (
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
            )}
          </g>
        ))}

        {/* Y ticks/labels */}
        {niceTicksY.map((v, i) => (
          <g key={`yt${i}`}>
            <line x1={PADL - 6} x2={PADL} y1={y(v)} y2={y(v)} stroke={C.axis} />
            <text
              x={PADL - 10}
              y={y(v)}
              fill={C.tick}
              fontSize="11"
              textAnchor="end"
              dominantBaseline="middle"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {fmtY(v)}
            </text>
          </g>
        ))}

        {/* zero line */}
        <line
          x1={PADL}
          x2={W - PADR}
          y1={y(0)}
          y2={y(0)}
          stroke={C.axis}
          strokeDasharray="4 6"
        />

        {/* vertical S marker at 0% */}
        <line
          x1={x(0)}
          x2={x(0)}
          y1={PADT}
          y2={H - PADB}
          stroke={C.marker}
          strokeDasharray="3 6"
        />
        <text x={x(0)} y={PADT + 10} fill={C.tick} fontSize="11" textAnchor="middle">
          S
        </text>

        {/* MC 95% band */}
        {band && (
          <rect
            x={band.x1}
            y={PADT}
            width={Math.max(0, band.x2 - band.x1)}
            height={H - PADT - PADB}
            fill={C.band}
          />
        )}

        {/* Profit/loss shading */}
        {fills.loss.map((pts, i) => (
          <polygon key={`loss${i}`} points={pts} fill={C.loss} />
        ))}
        {fills.profit.map((pts, i) => (
          <polygon key={`prof${i}`} points={pts} fill={C.profit} />
        ))}

        {/* payoff curve */}
        <path d={pathD} fill="none" stroke={C.line} strokeWidth="2" />

        {/* markers (quantiles & mean) */}
        {markers.map((m, i) => (
          <g key={`mk${i}`}>
            <line x1={m.x} x2={m.x} y1={H - PADB} y2={H - PADB - 10} stroke={C.marker} />
            <circle cx={m.x} cy={PADT + 8} r="2" fill={C.marker} />
          </g>
        ))}
      </svg>
    </section>
  );
}

/* ===== helpers ===== */

function normalizeLegs(legs) {
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const coerce = (L) => ({
    enabled: !!L?.enabled,
    K: n(L?.K ?? L?.strike),
    qty: Math.max(0, n(L?.qty)),
  });
  return {
    lc: coerce(legs?.lc || {}),
    sc: coerce(legs?.sc || {}),
    lp: coerce(legs?.lp || {}),
    sp: coerce(legs?.sp || {}),
  };
}

function tickStep(start, stop, count) {
  const e10 = Math.sqrt(50),
    e5 = Math.sqrt(10),
    e2 = Math.sqrt(2);
  const step0 = Math.abs(stop - start) / Math.max(0, count);
  const power = Math.floor(Math.log10(step0));
  const error = step0 / Math.pow(10, power);
  const factor = error >= e10 ? 10 : error >= e5 ? 5 : error >= e2 ? 2 : 1;
  return factor * Math.pow(10, power);
}

function niceTicks(min, max, count = 5, clampToZero = false) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return [min || 0, max || 1];
  }
  let start = Math.min(min, max);
  let stop = Math.max(min, max);
  const step = tickStep(start, stop, count);
  const a = Math.ceil(start / step) * step;
  const b = Math.floor(stop / step) * step;
  const ticks = [];
  for (let v = a; v <= b + 1e-12; v += step) ticks.push(+v.toFixed(12));
  if (clampToZero) {
    // Ensure 0 is included to anchor the "S" line reference
    if (ticks[0] > 0) ticks.unshift(0);
    if (ticks[ticks.length - 1] < 0) ticks.push(0);
  }
  return ticks;
}
