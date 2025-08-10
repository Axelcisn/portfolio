// components/Strategy/Chart.jsx
// components/Strategy/Chart.jsx
"use client";

import { useMemo } from "react";

/**
 * Full-width payoff chart used in the strategy view & modal.
 * X: underlying price (covers strikes)
 * Y: profit/loss
 * Lines: Current P&L (today), Expiration P&L, Vega (scaled)
 *
 * Props
 *  - spot: number
 *  - legs: { lc, sc, lp, sp } with { enabled, K, qty }
 *  - riskFree?: number (decimal)
 *  - mu?: number (drift/yr)
 *  - sigma?: number (vol/yr)
 *  - T?: number (years)
 *  - currency?: "USD"|"EUR"|...
 */
export default function Chart({
  spot = 0,
  legs = {},
  riskFree = 0,
  mu = 0,
  sigma = 0.3,
  T = 30 / 365,
  currency = "USD",
}) {
  // ===== helpers =====
  const N = (x) => 0.5 * (1 + Math.erf(x / Math.SQRT2));
  const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  const bs = (kind, S, K, r, sig, t) => {
    if (t <= 0 || !Number.isFinite(sig) || sig <= 0) {
      return kind === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    }
    const v = sig * Math.sqrt(t);
    const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * t) / v;
    const d2 = d1 - v;
    if (kind === "call") return S * N(d1) - K * Math.exp(-r * t) * N(d2);
    return K * Math.exp(-r * t) * (1 - N(d2)) - S * (1 - N(d1));
  };
  const vegaOpt = (S, K, r, sig, t) => {
    if (t <= 0 || !Number.isFinite(sig) || sig <= 0) return 0;
    const v = sig * Math.sqrt(t);
    const d1 = (Math.log(S / K) + (r + 0.5 * sig * sig) * t) / v;
    // BS vega (per 1.0 of vol, not 1%); same for call/put
    return S * Math.sqrt(t) * phi(d1);
  };

  const fmt0 = (n) => (Number.isFinite(n) ? n : 0);
  const moneySign = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const fmtNum = (n) => {
    if (!Number.isFinite(n)) return "—";
    const a = Math.abs(n);
    return (a >= 100 ? n.toFixed(0) : a >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.00$/, "");
  };
  const fmtMoney = (n) => (Number.isFinite(n) ? `${moneySign}${fmtNum(n)}` : "—");

  // normalize legs -> array
  const legsArr = useMemo(() => {
    const out = [];
    const add = (type, src) => {
      if (!src || !src.enabled) return;
      const K = Number(src.K ?? src.strike);
      const qty = Number(src.qty ?? 0);
      if (!Number.isFinite(K) || K <= 0 || !Number.isFinite(qty) || qty === 0) return;
      out.push({ type, K, qty });
    };
    add("lc", legs.lc);
    add("sc", legs.sc);
    add("lp", legs.lp);
    add("sp", legs.sp);
    return out;
  }, [legs]);

  // x-range: cover strikes +/- ~45% around spot
  const grid = useMemo(() => {
    const Ks = legsArr.map((l) => l.K);
    const baseMin = Math.min(...(Ks.length ? Ks : [spot]));
    const baseMax = Math.max(...(Ks.length ? Ks : [spot]));
    const minX = Math.max(0.01, Math.min(baseMin, spot) * 0.65);
    const maxX = Math.max(baseMax, spot) * 1.45;
    const Np = 280;
    const xs = Array.from({ length: Np }, (_, i) => minX + (maxX - minX) * (i / (Np - 1)));
    return { xs, minX, maxX };
  }, [legsArr, spot]);

  // premium at spot
  const cost0 = useMemo(() => {
    const r = fmt0(riskFree);
    const s = Math.max(0, fmt0(sigma));
    const t = Math.max(0, fmt0(T));
    let c = 0;
    for (const l of legsArr) {
      const sign = l.type === "lc" || l.type === "lp" ? 1 : -1;
      const kind = l.type === "lc" || l.type === "sc" ? "call" : "put";
      const px = bs(kind, spot, l.K, r, s, t);
      c += sign * px * l.qty;
    }
    return c;
  }, [legsArr, riskFree, sigma, T, spot]);

  const { xs, now, expiry, vegaScaled, yMin, yMax, sIdx, pWin, breakevens, maxProfit, maxLoss } =
    useMemo(() => {
      const r = fmt0(riskFree);
      const s = Math.max(0, fmt0(sigma));
      const t = Math.max(0, fmt0(T));

      const xs = grid.xs;
      const now = [];
      const expiry = [];
      const vegaRaw = [];

      for (let i = 0; i < xs.length; i++) {
        const S = xs[i];
        let vNow = 0,
          vExp = 0,
          vegaP = 0;
        for (const l of legsArr) {
          const sign = l.type === "lc" || l.type === "lp" ? 1 : -1;
          const kind = l.type === "lc" || l.type === "sc" ? "call" : "put";
          const vN = bs(kind, S, l.K, r, s, t) * sign * l.qty;
          const intr = Math.max(kind === "call" ? S - l.K : l.K - S, 0) * sign * l.qty;
          vNow += vN;
          vExp += intr;
          vegaP += vegaOpt(S, l.K, r, s, t) * sign * l.qty;
        }
        now.push(vNow - cost0);
        expiry.push(vExp - cost0);
        vegaRaw.push(vegaP);
      }

      // scale Vega to chart range (±35% of span around 0)
      const yMin0 = Math.min(...expiry, ...now);
      const yMax0 = Math.max(...expiry, ...now);
      const span = yMax0 - yMin0 || 1;
      const vMax = Math.max(...vegaRaw.map((v) => Math.abs(v))) || 1;
      const vegaScaled = vegaRaw.map((v) => (v / vMax) * span * 0.35);

      // y-range with headroom
      const hardMin = Math.min(yMin0, ...vegaScaled);
      const hardMax = Math.max(yMax0, ...vegaScaled);
      const pad = (hardMax - hardMin) * 0.15 + 1;
      const yMin = hardMin - pad;
      const yMax = hardMax + pad;

      // locate spot index
      let sIdx = 0;
      for (let i = 1; i < xs.length; i++) {
        if (Math.abs(xs[i] - spot) < Math.abs(xs[sIdx] - spot)) sIdx = i;
      }

      // breakevens & maxs from expiry
      const bes = [];
      for (let i = 1; i < xs.length; i++) {
        const y0 = expiry[i - 1],
          y1 = expiry[i];
        if ((y0 <= 0 && y1 >= 0) || (y0 >= 0 && y1 <= 0)) {
          const t0 = y1 === y0 ? 0 : (0 - y0) / (y1 - y0);
          const xb = xs[i - 1] + t0 * (xs[i] - xs[i - 1]);
          bes.push(xb);
        }
      }
      const rightSlope = expiry[expiry.length - 1] - expiry[expiry.length - 2];
      const leftSlope = expiry[1] - expiry[0];
      const maxProfit = rightSlope > 2 ? Infinity : Math.max(...expiry);
      const maxLoss = leftSlope < -2 ? -Infinity : Math.min(...expiry);

      // rough win prob using lognormal (not plotted; good enough for UI)
      const v = Math.max(1e-9, s * Math.sqrt(Math.max(1e-9, t)));
      const m = Math.log(Math.max(1e-6, spot)) + (mu - 0.5 * s * s) * Math.max(1e-9, t);
      const lnPdf = (ST) => (ST <= 0 ? 0 : (1 / (ST * v * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((Math.log(ST) - m) / v) ** 2));
      let win = 0,
        tot = 0;
      for (let i = 1; i < xs.length; i++) {
        const w = lnPdf(xs[i]) * (xs[i] - xs[i - 1]);
        const mid = (expiry[i] + expiry[i - 1]) / 2;
        if (mid > 0) win += w;
        tot += w;
      }
      const pWin = tot > 0 ? win / tot : NaN;

      return { xs, now, expiry, vegaScaled, yMin, yMax, sIdx, pWin, breakevens: bes, maxProfit, maxLoss };
    }, [grid, legsArr, riskFree, sigma, T, mu, spot, cost0]);

  // ===== view =====
  return (
    <section className="white-surface card padless strategy-chart">
      <ChartSVG
        xs={xs}
        now={now}
        expiry={expiry}
        vegaSeries={vegaScaled}
        yMin={yMin}
        yMax={yMax}
        spot={spot}
        sX={xs[sIdx]}
        currency={currency}
      />
      <FooterMetrics
        spot={spot}
        currency={currency}
        maxProfit={maxProfit}
        maxLoss={maxLoss}
        pWin={pWin}
        breakevens={breakevens}
      />
    </section>
  );
}

/* ---------- SVG chart ---------- */

function ChartSVG({ xs, now, expiry, vegaSeries, yMin, yMax, spot, sX, currency }) {
  // white-surface palette
  const axes = "#cfd5dc";
  const grid = "#e9edf3";
  const zero = "#9aa3ae";
  const cNow = "#2563eb";     // blue
  const cExp = "#16a34a";     // green
  const cVega = "#f59e0b";    // amber

  const W = 1100, H = 420, L = 60, R = 20, T = 22, B = 46;

  const x = (S) => L + ((S - xs[0]) / (xs[xs.length - 1] - xs[0])) * (W - L - R);
  const y = (P) => H - B - ((P - yMin) / (yMax - yMin)) * (H - T - B);

  const ticksX = 6;
  const xTicks = Array.from({ length: ticksX }, (_, i) => xs[0] + (xs[xs.length - 1] - xs[0]) * (i / (ticksX - 1)));
  const fmtX = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(0));

  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(xs[i])},${y(v)}`).join(" ");

  const yZero = y(0);
  const gridY = Array.from({ length: 5 }, (_, i) => y(yMin + (yMax - yMin) * (i / 4)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Strategy payoff chart" style={{ width: "100%", height: "auto", display: "block" }}>
      {/* grid */}
      {gridY.map((gy, i) => <line key={i} x1={L} x2={W - R} y1={gy} y2={gy} stroke={grid} />)}
      {/* axes */}
      <line x1={L} x2={L} y1={T} y2={H - B} stroke={axes} />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={axes} />
      {/* spot marker */}
      <line x1={x(sX)} x2={x(sX)} y1={T} y2={H - B} stroke={zero} strokeDasharray="4 4" />
      {/* zero line */}
      <line x1={L} x2={W - R} y1={yZero} y2={yZero} stroke={zero} />

      {/* lines */}
      <path d={line(now)} fill="none" stroke={cNow} strokeWidth="2.2" />
      <path d={line(expiry)} fill="none" stroke={cExp} strokeWidth="2.2" />
      <path d={line(vegaSeries)} fill="none" stroke={cVega} strokeWidth="2" strokeDasharray="6 6" />

      {/* x ticks */}
      {xTicks.map((t, i) => (
        <g key={i} transform={`translate(${x(t)}, ${H - B})`}>
          <line y2="6" stroke={axes} />
          <text y="20" textAnchor="middle" fontSize="12" fill="#0b1120">{fmtX(t)}</text>
        </g>
      ))}

      {/* legend */}
      <g transform={`translate(${W - R - 250}, ${T + 10})`}>
        <Legend swatch={cNow} label="Current P&L" />
        <g transform="translate(88,0)"><Legend swatch={cExp} label="Expiration P&L" /></g>
        <g transform="translate(210,0)"><Legend swatch={cVega} label="Vega" dashed /></g>
      </g>
    </svg>
  );
}

function Legend({ swatch, label, dashed }) {
  return (
    <g>
      <line x1="0" x2="14" y1="0" y2="0" stroke={swatch} strokeWidth="3" strokeDasharray={dashed ? "6 6" : "0"} />
      <text x="18" y="4" fontSize="12" fill="#0b1120">{label}</text>
    </g>
  );
}

/* ---------- bottom metrics bar ---------- */

function FooterMetrics({ spot, currency, maxProfit, maxLoss, pWin, breakevens }) {
  const sign = currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";
  const fnum = (n) => {
    if (!Number.isFinite(n)) return "—";
    const a = Math.abs(n);
    return (a >= 100 ? n.toFixed(0) : a >= 10 ? n.toFixed(1) : n.toFixed(2)).replace(/\.00$/, "");
  };
  const fMoney = (n) => (n === Infinity ? "∞" : n === -Infinity ? "−∞" : Number.isFinite(n) ? `${sign}${fnum(n)}` : "—");
  const be = breakevens?.length ? breakevens.map((b) => fnum(b)).join(" · ") : "—";
  const p = Number.isFinite(pWin) ? `${Math.round(pWin * 100)}%` : "—";

  return (
    <div className="chart-footer white-surface">
      <KV k="Underlying price" v={`${sign}${fnum(spot)}`} />
      <KV k="Max profit" v={fMoney(maxProfit)} />
      <KV k="Max loss" v={fMoney(maxLoss)} />
      <KV k="Win rate" v={p} />
      <KV k="Breakeven" v={be} />
      <style jsx>{`
        .chart-footer{
          border-top:1px solid var(--border);
          padding:14px 16px;
          display:grid;
          gap:12px;
          grid-template-columns: repeat(5, minmax(0,1fr));
        }
        @media (max-width: 980px){
          .chart-footer{ grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
}
function KV({ k, v }) {
  return (
    <div className="cf">
      <div className="cf-k">{k}</div>
      <div className="cf-v">{v}</div>
      <style jsx>{`
        .cf{ display:flex; align-items:center; gap:8px; justify-content:center; }
        .cf-k{ font-size:12px; color:#5b6471; }
        .cf-v{
          min-width:72px; height:30px; padding:0 12px; border-radius:9999px;
          display:inline-flex; align-items:center; justify-content:center;
          border:1px solid var(--border);
          background:#fff;
          font-weight:600; color:#0b1120;
        }
        :global(html.dark) .cf-k{ color:#b3bac5; }
        :global(html.dark) .cf-v{ background:var(--bg); color:var(--text); }
      `}</style>
    </div>
  );
}
