// components/Strategy/Chart.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gridPnl, uniqueStrikes } from "./payoffLite";
import { computeBreakevens, formatBE } from "./math/breakevens";
import { bsValueByKey, greeksByKey } from "./math/bsGreeks";

/* ---------------- helpers ---------------- */
const TYPE_TO_POSITION = {
  lc: "Long Call",
  sc: "Short Call",
  lp: "Long Put",
  sp: "Short Put",
};
const POSITION_TO_KEY = {
  "Long Call": "lc",
  "Short Call": "sc",
  "Long Put": "lp",
  "Short Put": "sp",
};
const LONG_SIGN = { lc: +1, lp: +1, sc: -1, sp: -1 };

const fmtCur = (v, ccy = "USD", fd = 2) => {
  if (!Number.isFinite(Number(v))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: fd,
    }).format(Number(v));
  } catch {
    const sym = ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : "$";
    return sym + Number(v).toFixed(fd);
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

const Pill = ({ label, value }) => (
  <div className="pill">
    <div className="p-label">{label}</div>
    <div className="p-value">{value}</div>
    <style jsx>{`
      .pill {
        min-width: 160px;
        padding: 10px 12px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--bg);
        display: grid;
        gap: 4px;
      }
      .p-label { font-size: 12px; opacity: .7; }
      .p-value { font-weight: 700; }
    `}</style>
  </div>
);

/** Normalize builder rows -> payoff rows */
function normalizeRows(rows) {
  const out = [];
  for (const r of rows || []) {
    const key =
      r.type && LONG_SIGN.hasOwnProperty(r.type)
        ? r.type
        : POSITION_TO_KEY[r.position];

    if (!key) continue;

    const strike = Number(r.strike ?? r.K);
    const volume = Number(r.volume ?? r.qty ?? 0);
    const premium = Number.isFinite(Number(r.premium)) ? Number(r.premium) : 0;

    out.push({
      key,
      position: TYPE_TO_POSITION[key],
      strike,
      volume,
      premium,
    });
  }
  return out;
}

/** Build fill polygons for positive/negative areas relative to y=0 */
function buildAreas(X, Y, x, y, eps = 1e-9) {
  const segs = [];
  let cur = [];
  let curSign = 0;

  const sign = (v) => (v > eps ? 1 : v < -eps ? -1 : 0);
  const lerpZeroX = (xa, ya, xb, yb) => {
    if (ya === yb) return xb;
    const t = (0 - ya) / (yb - ya);
    return xa + t * (xb - xa);
  };

  for (let i = 0; i < X.length; i++) {
    const xi = X[i], yi = Y[i];
    const s = sign(yi);

    if (cur.length === 0) {
      cur.push([xi, yi]); curSign = s;
      continue;
    }
    const xPrev = cur[cur.length - 1][0], yPrev = cur[cur.length - 1][1];
    // sign change -> close at zero then start new
    if (s !== curSign && s !== 0 && curSign !== 0) {
      const xz = lerpZeroX(xPrev, yPrev, xi, yi);
      cur.push([xz, 0]);
      segs.push({ sign: curSign, pts: cur.slice() });
      cur = [[xz, 0], [xi, yi]];
      curSign = s;
      continue;
    }
    // into/through zero
    if (s === 0 && curSign !== 0) {
      const xz = lerpZeroX(xPrev, yPrev, xi, yi);
      cur.push([xz, 0]);
      segs.push({ sign: curSign, pts: cur.slice() });
      cur = [[xz, 0]];
      curSign = 0;
      continue;
    }
    if (curSign === 0 && s !== 0) {
      // leaving zero into +/- area
      const xz = lerpZeroX(xPrev, yPrev, xi, yi);
      cur.push([xz, 0], [xi, yi]);
      curSign = s;
      continue;
    }

    cur.push([xi, yi]);
  }
  if (cur.length > 1 && curSign !== 0) segs.push({ sign: curSign, pts: cur });

  const toPath = (pts) => {
    if (!pts.length) return "";
    const first = pts[0];
    let d = `M${x(first[0])},${y(0)} L`;
    d += pts.map(([vx, vy]) => `${x(vx)},${y(vy)}`).join(" ");
    const last = pts[pts.length - 1];
    d += ` L${x(last[0])},${y(0)} Z`;
    return d;
  };

  const pos = segs.filter((s) => s.sign === 1).map((s) => toPath(s.pts));
  const neg = segs.filter((s) => s.sign === -1).map((s) => toPath(s.pts));
  return { pos, neg };
}

/* ---------------- main ---------------- */
export default function Chart({
  frameless = false,
  spot = null,
  currency = "USD",
  rows = [],            // builder or legacy
  riskFree = 0,
  sigma = 0.2,
  T = 30 / 365,
  greek = "vega",
  onGreekChange,
  contractSize = 1,
}) {
  const wrapRef = useRef(null);
  const width = useSize(wrapRef);
  const height = 420;

  const payoffRows = useMemo(() => normalizeRows(rows), [rows]);

  // Domain from strikes / spot
  const strikesIn = rows.map((r) => Number(r.K ?? r.strike)).filter(Number.isFinite);
  const s = Number(spot);
  let minX, maxX;
  if (strikesIn.length) {
    const lo = Math.min(...strikesIn);
    const hi = Math.max(...strikesIn);
    const span = Math.max(1, hi - lo);
    minX = lo - span * 0.25;
    maxX = hi + span * 0.25;
  } else if (Number.isFinite(s)) {
    minX = s * 0.8;
    maxX = s * 1.2;
  } else {
    minX = 100; maxX = 200;
  }

  // Expiration P&L (from your existing engine)
  const { X, Y: Yexp } = useMemo(
    () => gridPnl(payoffRows, minX, maxX, 260, contractSize),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(payoffRows), minX, maxX, contractSize]
  );

  // Current P&L using BS values at time T
  const Ynow = useMemo(() => {
    return X.map((S) => {
      let sum = 0;
      for (const r of payoffRows) {
        const sgn = LONG_SIGN[r.key];
        const val = bsValueByKey(r.key, S, r.strike, riskFree, sigma, T);
        sum += (sgn * (val - (r.premium || 0))) * (r.volume || 0) * contractSize;
      }
      return sum;
    });
  }, [X, payoffRows, riskFree, sigma, T, contractSize]);

  // Greek curve (sum of legs)
  const greekCurve = useMemo(() => {
    return X.map((S) => {
      let gsum = 0;
      for (const r of payoffRows) {
        const sgn = LONG_SIGN[r.key];
        const g = greeksByKey(r.key, S, r.strike, riskFree, sigma, T);
        const v =
          greek === "delta" ? g.delta :
          greek === "gamma" ? g.gamma :
          greek === "theta" ? g.theta :
          greek === "rho"   ? g.rho   :
          g.vega; // default vega
        gsum += sgn * v * (r.volume || 0) * contractSize;
      }
      return gsum;
    });
  }, [X, payoffRows, riskFree, sigma, T, greek, contractSize]);

  // Y-range (based on both curves so nothing clips)
  const yMin = Math.min(0, ...Yexp, ...Ynow);
  const yMax = Math.max(0, ...Yexp, ...Ynow);
  const pad = Math.max(1, (yMax - yMin) * 0.1);
  const minY = yMin - pad;
  const maxY = yMax + pad;

  // Coordinates
  const P = { t: 18, r: 16, b: 44, l: 68 };
  const W = width - P.l - P.r;
  const H = height - P.t - P.b;
  const x = (v) => P.l + ((v - minX) / (maxX - minX)) * W;
  const y = (v) => P.t + (1 - (v - minY) / (maxY - minY)) * H;
  const toPath = (arrX, arrY) =>
    arrX.map((vx, i) => `${i ? "L" : "M"}${x(vx)},${y(arrY[i])}`).join(" ");

  // Profit/Loss areas from expiration curve
  const areas = useMemo(() => buildAreas(X, Yexp, x, y), [X, Yexp]);

  // Breakevens from expiration curve
  const be = useMemo(() => computeBreakevens(X, Yexp), [X, Yexp]);
  const beText = useMemo(() => {
    const fmt = (v) => (Number.isFinite(v) ? Math.round(v) : "—");
    const yLeft = Yexp?.[0], yRight = Yexp?.[Yexp.length - 1];
    return formatBE(be.lo, be.hi, yLeft, yRight, fmt);
  }, [be, Yexp]);

  // Metrics
  const maxProfit = useMemo(() => Math.max(0, ...Yexp), [Yexp]);
  const maxLoss = useMemo(() => Math.min(0, ...Yexp), [Yexp]);
  const winRate = useMemo(() => {
    const n = Yexp.length || 1;
    const wins = Yexp.filter((v) => v > 0).length;
    return (wins / n) * 100;
  }, [Yexp]);
  const lotSize = useMemo(
    () => payoffRows.filter((r) => Number(r.volume || 0) !== 0).length || 0,
    [payoffRows]
  );

  const kMarks = uniqueStrikes(payoffRows);

  /* ---------------- render ---------------- */
  return (
    <div className={frameless ? "" : "card"} ref={wrapRef}>
      {/* Legend */}
      <div className="legend">
        <div className="l-left">
          <span className="dot" style={{ background: "#60a5fa" }} />
          <span>Current P&amp;L</span>
          <span className="sep" />
          <span className="dot" style={{ background: "#f5f5f5" }} />
          <span>Expiration P&amp;L</span>
          <span className="sep" />
          <span className="dot" style={{ background: "#f59e0b" }} />
          <span>{greek[0].toUpperCase()+greek.slice(1)}</span>
        </div>
        <div className="l-right">
          <label className="small muted" style={{ marginRight: 8 }}>Greek</label>
          <select className="picker" value={greek} onChange={(e)=>onGreekChange?.(e.target.value)}>
            {["vega","delta","gamma","theta","rho"].map(g=>(
              <option key={g} value={g}>{g[0].toUpperCase()+g.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      <svg width={width} height={height} role="img" aria-label="Strategy payoff chart">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />

        {/* Grid Y */}
        {Array.from({ length: 6 + 1 }).map((_, i) => {
          const yy = P.t + (i / 6) * H;
          const val = maxY - (i / 6) * (maxY - minY);
          return (
            <g key={`gy${i}`}>
              <line x1={P.l} y1={yy} x2={width - P.r} y2={yy} stroke="rgba(255,255,255,.08)" />
              <text x={P.l - 12} y={yy + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,.65)">
                {fmtCur(val, currency, 0)}
              </text>
            </g>
          );
        })}

        {/* Grid X */}
        {Array.from({ length: 8 + 1 }).map((_, i) => {
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
          <line x1={x(s)} y1={P.t} x2={x(s)} y2={height - P.b} stroke="rgba(255,255,255,.35)" strokeDasharray="4 4" />
        )}

        {/* Profit/Loss fills from expiration curve */}
        {areas.pos.map((d, i) => (
          <path key={`pos${i}`} d={d} fill="rgba(16,185,129,.10)" stroke="none" />
        ))}
        {areas.neg.map((d, i) => (
          <path key={`neg${i}`} d={d} fill="rgba(244,63,94,.12)" stroke="none" />
        ))}

        {/* Strike markers */}
        {kMarks.map((k, i) => (
          <g key={`k${i}`}>
            <line x1={x(k)} y1={P.t} x2={x(k)} y2={height - P.b} stroke="rgba(255,255,255,.12)" />
            <circle cx={x(k)} cy={y(0)} r="2.5" fill="rgba(255,255,255,.55)" />
          </g>
        ))}

        {/* Curves */}
        <path d={toPath(X, Ynow)} fill="none" stroke="#60a5fa" strokeWidth="2" />
        <path d={toPath(X, Yexp)} fill="none" stroke="#f5f5f5" strokeWidth="2" strokeDasharray="5 4" />
        <path d={toPath(X, greekCurve)} fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 5" />
      </svg>

      {/* Metrics: horizontally scrollable */}
      <div className="metrics-scroll" role="region" aria-label="Strategy metrics">
        <Pill label="Underlying price" value={fmtCur(spot, currency)} />
        <Pill label="Max profit" value={fmtCur(maxProfit, currency, 0)} />
        <Pill label="Max loss" value={fmtCur(maxLoss, currency, 0)} />
        <Pill label="Win rate" value={`${winRate.toFixed(2)}%`} />
        <Pill label="Breakeven (Low | High)" value={beText} />
        <Pill label="Lot size" value={lotSize} />
        {/* placeholders */}
        <Pill label="CI (Low | High)" value="—" />
        <Pill label="Delta" value="—" />
        <Pill label="Gamma" value="—" />
        <Pill label="Rho" value="—" />
        <Pill label="Theta" value="—" />
        <Pill label="Vega" value="—" />
        <Pill label="Max" value="—" />
        <Pill label="Mean[Price]" value="—" />
        <Pill label="Max[Return]" value="—" />
        <Pill label="E[Return]" value="—" />
        <Pill label="Sharpe Ratio" value="—" />
        <Pill label="BS(C)" value="—" />
        <Pill label="BS(P)" value="—" />
      </div>

      <style jsx>{`
        .legend{
          display:flex; align-items:center; justify-content:space-between;
          padding: 6px 2px 10px; gap:10px;
        }
        .l-left{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .dot{ width:10px; height:10px; border-radius:50%; display:inline-block; }
        .sep{ width:10px; }
        .picker{
          height:28px; min-width:120px; padding:0 10px; border-radius:8px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
        }
        .metrics-scroll{
          margin-top:12px;
          display:flex; gap:10px; overflow-x:auto; padding-bottom:2px;
          scrollbar-width: thin;
        }
        :global(.metrics-scroll::-webkit-scrollbar){ height:8px; }
        :global(.metrics-scroll::-webkit-scrollbar-thumb){ background:var(--border); border-radius:10px; }
      `}</style>
    </div>
  );
}
