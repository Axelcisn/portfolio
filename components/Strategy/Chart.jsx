// components/Strategy/Chart.jsx
"use client";

import {useMemo} from "react";

/**
 * Strategy payoff chart (full‑width)
 * - X: Underlying price (strike region)
 * - Y: Profit (P&L)
 * - Lines: Current P&L (value today) / Expiration P&L / Probability (scaled PDF)
 *
 * Props
 *  - spot: number
 *  - legs: { lc, sc, lp, sp } with fields { enabled, K, qty }
 *  - riskFree?: number (decimal)
 *  - mu?: number (decimal/yr), sigma?: number (decimal/yr), T?: number (years)
 *  - currency?: string ("USD" | "EUR" | ...)
 *  - mcStats?: optional (unused here, kept for parity)
 */
export default function Chart({
  spot = 0,
  legs = {},
  riskFree = 0,
  mu = 0,
  sigma = 0.3,
  T = 30/365,
  currency = "USD",
}) {
  const theme = typeof window !== "undefined" && window.document?.documentElement?.classList?.contains("dark")
    ? "dark"
    : "light";

  // ---------- helpers ----------
  const N = (x) => 0.5 * (1 + Math.erf(x / Math.SQRT2));
  const pdfn = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const bs = (kind, S, K, r, sig, t) => {
    if (t <= 0 || sig <= 0) {
      return kind === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    }
    const v = sig * Math.sqrt(t);
    const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * t) / v;
    const d2 = d1 - v;
    if (kind === "call") return S * N(d1) - K * Math.exp(-r * t) * N(d2);
    return K * Math.exp(-r * t) * (1 - N(d2)) - S * (1 - N(d1));
  };
  const lognPdf = (ST, S0, muA, sig, t) => {
    if (ST <= 0 || sig <= 0 || t <= 0) return 0;
    const v = sig * Math.sqrt(t);
    const m = Math.log(S0) + (muA - 0.5 * sig * sig) * t;
    const z = (Math.log(ST) - m) / v;
    return (1 / (ST * v * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * z * z);
  };

  const fmt = (n) => {
    if (!Number.isFinite(n)) return "—";
    const v = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
    return v.replace(/\.00$/, "");
  };
  const fmtMoney = (n) => {
    if (!Number.isFinite(n)) return "—";
    const sign = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
    return `${sign}${fmt(n)}`;
  };

  // normalize legs -> array of {type:'lc'|'sc'|'lp'|'sp', K, qty}
  const legsArr = useMemo(() => {
    const L = [];
    const add = (type, src) => {
      const K = Number(src?.K ?? src?.strike);
      const qty = Number(src?.qty ?? 0);
      const enabled = !!src?.enabled;
      if (!enabled || !Number.isFinite(K) || K <= 0 || !Number.isFinite(qty) || qty === 0) return;
      L.push({type, K, qty});
    };
    if (legs?.lc) add("lc", legs.lc);
    if (legs?.sc) add("sc", legs.sc);
    if (legs?.lp) add("lp", legs.lp);
    if (legs?.sp) add("sp", legs.sp);
    return L;
  }, [legs]);

  // grid bounds (cover strikes + +/- 35% of spot)
  const grid = useMemo(() => {
    const Ks = legsArr.map((l) => l.K);
    const kMin = Math.min(...(Ks.length ? Ks : [spot]));
    const kMax = Math.max(...(Ks.length ? Ks : [spot]));
    const minX = Math.max(0.01, Math.min(kMin, spot) * 0.65);
    const maxX = Math.max(kMax, spot) * 1.45;
    const Np = 260;
    const xs = new Array(Np).fill(0).map((_, i) => minX + (maxX - minX) * (i / (Np - 1)));
    return { xs, minX, maxX };
  }, [spot, legsArr]);

  // upfront theoretical cost at S0
  const cost0 = useMemo(() => {
    const r = riskFree ?? 0;
    return legsArr.reduce((acc, l) => {
      const sign = (l.type === "lc" || l.type === "lp") ? +1 : -1;
      const kind = (l.type === "lc" || l.type === "sc") ? "call" : "put";
      const price0 = bs(kind, spot, l.K, r, Math.max(0, sigma||0), Math.max(0, T||0));
      return acc + sign * price0 * (Number(l.qty) || 0);
    }, 0);
  }, [legsArr, spot, sigma, riskFree, T]);

  // series
  const { xs, now, expiry, pdf, yMin, yMax, sIdx } = useMemo(() => {
    const r = riskFree ?? 0;
    const sig = Math.max(0, sigma || 0);
    const t = Math.max(0, T || 0);

    const now = [];
    const expiry = [];
    const pdf = [];

    const xs = grid.xs;
    const dx = xs[1] - xs[0];

    for (let i=0;i<xs.length;i++){
      const S = xs[i];
      // value now at price S minus cost0
      let vNow = 0, vExp = 0;
      for(const l of legsArr){
        const sign = (l.type === "lc" || l.type === "lp") ? +1 : -1;
        const kind = (l.type === "lc" || l.type === "sc") ? "call" : "put";
        const vN = bs(kind, S, l.K, r, sig, t) * sign * (Number(l.qty)||0);
        const intrinsic = Math.max(kind==="call" ? (S - l.K) : (l.K - S), 0);
        const vE = intrinsic * sign * (Number(l.qty)||0);
        vNow += vN; vExp += vE;
      }
      now.push(vNow - cost0);
      expiry.push(vExp - cost0);

      // lognormal pdf scaled to chart range later
      pdf.push(lognPdf(S, spot, mu ?? 0, sig, t) * dx);
    }

    // y-range with headroom
    const minY = Math.min(...expiry, ...now);
    const maxY = Math.max(...expiry, ...now);
    const head = (maxY - minY) * 0.15 + 1;
    const yMin = minY - head;
    const yMax = maxY + head;

    // find index closest to S0 for vertical marker
    let sIdx = 0;
    for (let i=1;i<xs.length;i++){
      if (Math.abs(xs[i]-spot) < Math.abs(xs[sIdx]-spot)) sIdx = i;
    }

    // normalize pdf to y-range top (~75% of chart height)
    const pdfMax = Math.max(...pdf) || 1;
    for (let i=0;i<pdf.length;i++){
      pdf[i] = yMin + (yMax - yMin) * 0.72 * (pdf[i]/pdfMax);
    }

    return { xs, now, expiry, pdf, yMin, yMax, sIdx };
  }, [grid, legsArr, spot, sigma, riskFree, mu, T, cost0]);

  // derived metrics
  const metrics = useMemo(() => {
    // max/min
    const yMinVal = Math.min(...expiry);
    const yMaxVal = Math.max(...expiry);

    // detect unbounded (if trend at edges keeps growing)
    const rightSlope = expiry[expiry.length-1] - expiry[expiry.length-2];
    const leftSlope = expiry[1] - expiry[0];
    const maxProfit = rightSlope > 2 ? Infinity : yMaxVal;
    const maxLoss = leftSlope < -2 ? -Infinity : yMinVal;

    // breakevens
    const bes = [];
    for (let i=1;i<xs.length;i++){
      const y0 = expiry[i-1], y1 = expiry[i];
      if ((y0<=0 && y1>=0) || (y0>=0 && y1<=0)){
        const t = y1 === y0 ? 0 : (0 - y0) / (y1 - y0);
        const x = xs[i-1] + t * (xs[i] - xs[i-1]);
        bes.push(x);
      }
    }

    // win rate = int(1{P>0} f(ST)dST) approx with pdf weights normalised
    let win = 0, tot = 0;
    for (let i=1;i<xs.length;i++){
      const w = Math.max(0, pdf[i] - yMin); // not actual density anymore (scaled). Use original raw? We'll approximate by monotonic mapping.
      const pos = (expiry[i] + expiry[i-1]) * 0.5 > 0 ? 1 : 0;
      win += pos * w; tot += w;
    }
    const pWin = tot > 0 ? win/tot : NaN;

    return { maxProfit, maxLoss, pWin, breakevens: bes };
  }, [expiry, xs, pdf, yMin]);

  return (
    <section className="card padless strategy-chart">
      <ChartSVG
        xs={xs} now={now} expiry={expiry} pdf={pdf}
        yMin={yMin} yMax={yMax}
        sX={xs[sIdx]} spot={spot}
        currency={currency}
        theme={theme}
      />
      <FooterMetrics
        spot={spot}
        currency={currency}
        maxProfit={metrics.maxProfit}
        maxLoss={metrics.maxLoss}
        pWin={metrics.pWin}
        breakevens={metrics.breakevens}
      />
      <style jsx>{`
        .strategy-chart svg{ width:100%; height:auto; display:block; }
      `}</style>
    </section>
  );
}

// ---------- Presentational pieces ----------

function ChartSVG({ xs, now, expiry, pdf, yMin, yMax, sX, spot, currency, theme }) {
  const W = 920, H = 360, L = 54, R = 16, T = 18, B = 38;

  // scale functions
  const x = (S) => L + ((S - xs[0]) / (xs[xs.length-1] - xs[0])) * (W - L - R);
  const y = (P) => H - B - ((P - yMin) / (yMax - yMin)) * (H - T - B);

  // ticks (6)
  const ticks = new Array(6).fill(0).map((_,i)=> xs[0] + (xs[xs.length-1]-xs[0])*(i/5));
  const fmtX = (v) => {
    const s = Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(0);
    return s;
  };
  const fmtMoney = (n) => {
    const sign = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
    const v = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
    return `${sign}${v.replace(/\.00$/, "")}`;
  };

  // paths
  const line = (arr) => {
    let d = "";
    for (let i=0;i<arr.length;i++){
      const X = x(xs[i]), Y = y(arr[i]);
      d += i===0 ? `M${X},${Y}` : ` L${X},${Y}`;
    }
    return d;
  };

  const gridY = [];
  for (let i=0;i<5;i++){
    const gy = y(yMin + (yMax - yMin) * (i/4));
    gridY.push(gy);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strategy payoff chart">
      {/* bg */}
      <rect x="0" y="0" width={W} height={H} fill="none" />

      {/* gridlines */}
      {gridY.map((gy, idx) => (
        <line key={idx} x1={L} x2={W-R} y1={gy} y2={gy} stroke={theme==="dark"?"#2b2f36":"#eaecef"} strokeDasharray="2 4" />
      ))}

      {/* axes */}
      <line x1={L} x2={L} y1={T} y2={H-B} stroke={theme==="dark"?"#444":"#cfd5dc"} />
      <line x1={L} x2={W-R} y1={H-B} y2={H-B} stroke={theme==="dark"?"#444":"#cfd5dc"} />

      {/* vertical spot marker */}
      <line x1={x(sX)} x2={x(sX)} y1={T} y2={H-B} stroke={theme==="dark"?"#6b7280":"#9aa3ae"} strokeDasharray="4 4" />

      {/* shaded profit (expiration) */}
      <path d={area(expiry, xs, x, y, y(0))} fill={theme==="dark"?"rgba(16,185,129,.08)":"rgba(16,185,129,.12)"} />
      <path d={areaNegative(expiry, xs, x, y, y(0))} fill={theme==="dark"?"rgba(239,68,68,.08)":"rgba(239,68,68,.12)"} />

      {/* lines */}
      <path d={line(expiry)} fill="none" stroke={theme==="dark"?"#ef4444":"#d62828"} strokeWidth="2.2" />
      <path d={line(now)} fill="none" stroke={theme==="dark"?"#22c55e":"#16a34a"} strokeWidth="2.2" strokeDasharray="3 4" />
      <path d={line(pdf)} fill="none" stroke={theme==="dark"?"#f59e0b":"#b45309"} strokeWidth="2" strokeDasharray="6 6" />

      {/* x ticks */}
      {ticks.map((t,i)=>(
        <g key={i} transform={`translate(${x(t)}, ${H-B})`}>
          <line y2="6" stroke={theme==="dark"?"#666":"#9aa3ae"} />
          <text y="18" textAnchor="middle" fontSize="11" fill={theme==="dark"?"#c7cdd6":"#111"}>
            {fmtX(t)}
          </text>
        </g>
      ))}

      {/* y zero */}
      <line x1={L} x2={W-R} y1={y(0)} y2={y(0)} stroke={theme==="dark"?"#6b7280":"#9aa3ae"} />

      {/* legend */}
      <Legend x={W-R-190} y={T+8} theme={theme} />
    </svg>
  );
}

function Legend({x, y, theme}){
  const fg = theme==="dark"?"#e5e7eb":"#0b1120";
  return (
    <g transform={`translate(${x}, ${y})`}>
      <circle cx="0" cy="0" r="4" fill={theme==="dark"?"#22c55e":"#16a34a"} />
      <text x="8" y="4" fontSize="11" fill={fg}>Current P&L</text>

      <circle cx="88" cy="0" r="4" fill={theme==="dark"?"#ef4444":"#d62828"} />
      <text x="96" y="4" fontSize="11" fill={fg}>Expiration P&L</text>

      <circle cx="210" cy="0" r="4" fill={theme==="dark"?"#f59e0b":"#b45309"} />
      <text x="218" y="4" fontSize="11" fill={fg}>Distribution</text>
    </g>
  );
}

// build filled area for positive profits (above 0)
function area(vals, xs, x, y, yZero){
  let d = `M ${x(xs[0])} ${yZero}`;
  for(let i=0;i<vals.length;i++){
    const X = x(xs[i]), Y = y(Math.max(0, vals[i]));
    d += ` L ${X} ${Y}`;
  }
  d += ` L ${x(xs[vals.length-1])} ${yZero} Z`;
  return d;
}
function areaNegative(vals, xs, x, y, yZero){
  let d = `M ${x(xs[0])} ${yZero}`;
  for(let i=0;i<vals.length;i++){
    const X = x(xs[i]), Y = y(Math.min(0, vals[i]));
    d += ` L ${X} ${Y}`;
  }
  d += ` L ${x(xs[vals.length-1])} ${yZero} Z`;
  return d;
}

function FooterMetrics({spot, currency, maxProfit, maxLoss, pWin, breakevens}){
  const ccy = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const fmt = (n) => {
    if (!Number.isFinite(n)) return "—";
    const v = Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
    return v.replace(/\.00$/, "");
  };
  const fmtMoney = (n) => (Number.isFinite(n) ? `${ccy}${fmt(n)}` : "—");

  const be = breakevens && breakevens.length
    ? breakevens.map((b)=>fmt(b)).join(" · ")
    : "—";

  const mProfit = maxProfit === Infinity ? "∞" : fmtMoney(maxProfit);
  const mLoss = maxLoss === -Infinity ? "−∞" : fmtMoney(maxLoss);

  const p = Number.isFinite(pWin) ? `${Math.round(pWin*100)}%` : "—";

  return (
    <div className="chart-footer">
      <div className="cf-item">
        <div className="cf-k">Underlying</div>
        <div className="cf-v">{fmtMoney(spot)}</div>
      </div>
      <div className="cf-item">
        <div className="cf-k">Max Profit</div>
        <div className="cf-v">{mProfit}</div>
      </div>
      <div className="cf-item">
        <div className="cf-k">Max Loss</div>
        <div className="cf-v">{mLoss}</div>
      </div>
      <div className="cf-item">
        <div className="cf-k">Win rate</div>
        <div className="cf-v">{p}</div>
      </div>
      <div className="cf-item">
        <div className="cf-k">Breakeven</div>
        <div className="cf-v">{be}</div>
      </div>
      <style jsx>{`
        .chart-footer{
          display:grid;
          grid-template-columns: repeat(5, minmax(0,1fr));
          gap:12px;
          padding:12px 14px 14px 14px;
          border-top:1px solid var(--border);
          background:var(--card);
        }
        .cf-item{ display:flex; align-items:center; justify-content:center; gap:8px; }
        .cf-k{ font-size:12px; opacity:.75; }
        .cf-v{
          min-width:64px;
          height:28px; padding:0 10px; border-radius:9999px;
          display:inline-flex; align-items:center; justify-content:center;
          border:1px solid var(--border);
          background:var(--bg);
          font-weight:600;
        }
        @media (max-width: 880px){
          .chart-footer{ grid-template-columns: repeat(2, minmax(0,1fr)); }
        }
      `}</style>
    </div>
  );
}
