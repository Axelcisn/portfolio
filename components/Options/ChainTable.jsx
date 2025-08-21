// components/Options/ChainTable.jsx
// Theme-tokenized, boxed metric pills (green/red), centralized math via lib/quant
"use client";

import React, { useEffect, useMemo, useState, useCallback, useId } from "react";
import { subscribeStatsCtx, snapshotStatsCtx } from "../Strategy/statsBus";

// ---- centralized quant math (single source of truth) ----
import {
  breakEven,
  probOfProfit,
  expectedProfit,
  expectedGain,
  expectedLoss,
  stdevPayoff,
  gbmMean,
  gbmCI95,
  bsCall,
  bsPut,
} from "lib/quant/index.js";

/* ---------- tiny utils ---------- */
const isNum = (x) => Number.isFinite(x);
const pick = (x) => (isNum(x) ? x : null);
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

/* Robust wrappers for hub helpers (support object/array/object-return) */
function hubCI95({ S0, mu, sigma, T }) {
  if (!(S0 > 0) || !(sigma > 0) || !(T > 0)) return [null, null];
  try {
    const out = gbmCI95?.({ S0, mu, sigma, T }) ?? gbmCI95?.(S0, mu, sigma, T);
    if (Array.isArray(out) && out.length >= 2) return [out[0], out[1]];
    if (out && isNum(out.low) && isNum(out.high)) return [out.low, out.high];
  } catch {}
  // analytic fallback (lognormal, 95% two-sided)
  const vT = sigma * Math.sqrt(T);
  const z = 1.959963984540054;
  const mLN = Math.log(S0) + (mu - 0.5 * sigma * sigma) * T;
  return [Math.exp(mLN - z * vT), Math.exp(mLN + z * vT)];
}
function hubMean({ S0, mu, T }) {
  if (!(S0 > 0) || !(T > 0)) return null;
  try {
    const out = gbmMean?.({ S0, mu, T }) ?? gbmMean?.(S0, mu, T);
    if (isNum(out)) return out;
  } catch {}
  // fallback: E[S_T] under drift mu
  return S0 * Math.exp(mu * T);
}

/* ---------- main component ---------- */
export default function ChainTable({
  symbol,
  currency,
  provider,
  expiry,
  settings, // row count / sort controls from the popover
  onToggleSort, // header click toggles sort
}) {
  // Hoisted hooks (Rules of Hooks)
  const uid = useId().replace(/:/g, "");
  const [zoom, setZoom] = useState(1);
  const aboveId = `above-${uid}`;
  const belowId = `below-${uid}`;

  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null); // { spot, currency, expiry }
  const [rows, setRows] = useState([]); // merged by strike
  const [expanded, setExpanded] = useState(null); // { strike, side:'call'|'put' } | null

  // StatsRail (days/basis/sigma/drift…) — guarded subscribe to avoid invalid cleanup
  const [ctx, setCtx] = useState(() =>
    typeof window !== "undefined" ? snapshotStatsCtx() : null
  );
  useEffect(() => {
    const unsub = subscribeStatsCtx(setCtx);
    return typeof unsub === "function" ? unsub : () => {};
  }, []);
  const fmt = (v, d = 2) => (isNum(v) ? Number(v).toFixed(d) : "—");
  const effCurrency = meta?.currency || currency || "USD";
  const fmtMoney = (v, d = 2) =>
    isNum(v) ? `${moneySign(effCurrency)}${Number(v).toFixed(d)}` : "—";
  const fmtPct = (p, d = 2) => (isNum(p) ? `${(p * 100).toFixed(d)}%` : "—");

  // Settings — safe defaults
  const sortDir = settings?.sort === "desc" ? "desc" : "asc";
  const rowLimit = useMemo(() => {
    const mode = settings?.showBy || "20";
    if (mode === "10") return 10;
    if (mode === "20") return 20;
    if (mode === "all") return Infinity;
    if (mode === "custom") return Math.max(1, Number(settings?.customRows) || 25);
    return 20;
  }, [settings?.showBy, settings?.customRows]);

  const showGreeks =
    settings?.showGreeks === true || settings?.cols?.greeks === true || false;


  // Date fallback resolver (YYYY-MM-DD)
  const resolveDate = useCallback(async (sym, sel) => {
  if (!sym || !sel?.m || !sel?.d) return null;
  try {
    const r = await fetch(`/api/expiries?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
    const j = await r.json();
    const list = Array.isArray(j?.expiries) ? j.expiries : [];
    const matches = list.filter((s) => {
      const d = new Date(s);
      if (!Number.isFinite(d.getTime())) return false;
      const m = d.toLocaleString(undefined, { month: "short" });
      const label = d.getMonth() === 0 ? `${m} ’${String(d.getFullYear()).slice(-2)}` : m;
      return label === sel.m && d.getDate() === sel.d;
    });
    if (!matches.length) return null;
    const now = Date.now();
    matches.sort((a, b) => Math.abs(new Date(a) - now) - Math.abs(new Date(b) - now));
    return matches[0];
  } catch {
    return null;
  }
}, []);
function GreekList({ greeks }) {
  const g = greeks || {};
  return (
    <>
      <div className="greek">Δ {fmtG(g.delta)}</div>
      <div className="greek">Γ {fmtG(g.gamma)}</div>
      <div className="greek">Θ {fmtG(g.theta)}</div>
      <div className="greek">V {fmtG(g.vega)}</div>
      <div className="greek">ρ {fmtG(g.rho)}</div>
    </>
  );
}
function fmtG(v) { return Number.isFinite(v) ? Number(v).toFixed(2) : "—"; }

/* ---------- Mini payoff chart (legend outside, CI/mean/current lines) ---------- */
function MiniPL({ S0, K, premium, type, pos, BE, mu, sigma, T, showLegend }) {
  // Payoff rendering does NOT require sigma/T; only CI/mean do.
  const s0Ok = Number.isFinite(S0) && S0 > 0;
  const kOk = Number.isFinite(K) && K > 0;
  if (!s0Ok || !kOk || !type || !pos) {
    return (
      <span
        className="chart-hint"
        style={{ padding: 12, color: "color-mix(in srgb, var(--text) 70%, transparent)" }}
      >
        Chart
      </span>
    );
  }

  // Premium: allow 0 when missing, but keep as number
  const premRaw = Number(premium);
  const prem = Number.isFinite(premRaw) && premRaw >= 0 ? premRaw : 0;

  // base window centered at BE (or S0)
  const centerPx = Number.isFinite(BE) ? BE : S0;
  const baseSpan = Math.max(
    1e-6,
    0.4 * (S0 || K) + 0.2 * Math.abs((S0 || 0) - (K || 0))
  );
  const span0 = baseSpan / Math.max(1e-6, zoom);
  let xmin = Math.max(0.01, centerPx - span0);
  let xmax = centerPx + span0;

  // analytic mean & 95% CI (optional)
  const haveSigma = Number.isFinite(sigma) && sigma > 0 && Number.isFinite(T) && T > 0;
  const meanPrice = Number.isFinite(mu) && Number.isFinite(T) ? hubMean({ S0, mu, T }) : null;
  let ciL = null, ciU = null;
  if (haveSigma) {
    const [l, u] = hubCI95({ S0, mu: Number(mu) || 0, sigma, T });
    ciL = isNum(l) ? l : null;
    ciU = isNum(u) ? u : null;
  }

  // ensure lines stay inside final domain
  const mins = [xmin, S0, meanPrice, ciL].filter((v) => Number.isFinite(v));
  const maxs = [xmax, S0, meanPrice, ciU].filter((v) => Number.isFinite(v));
  if (mins.length) xmin = Math.min(...mins) * 0.995;
  if (maxs.length) xmax = Math.max(...maxs) * 1.005;
  if (!(xmax > xmin)) {
    xmin = Math.max(0.01, centerPx * 0.6);
    xmax = Math.max(xmin + 1e-6, centerPx * 1.4);
  }

  // sizing
  const W = 520, H = 250, pad = 12;
  const xmap = (s) => pad + ((s - xmin) / (xmax - xmin)) * (W - 2 * pad);

  // payoff samples
  const N = 160;
  const xs = Array.from({ length: N + 1 }, (_, i) => xmin + (i / N) * (xmax - xmin));
  const pay = xs.map((s) => {
    const intr = type === "call" ? Math.max(s - K, 0) : Math.max(K - s, 0);
    return pos === "long" ? intr - prem : prem - intr;
  });

  // Y-range with guards (avoid NaNs/flat span)
  let yMin = Math.min(...pay, -prem * 1.35);
  let yMax = Math.max(...pay,  prem * 1.35);
  if (!(yMax > yMin) || !Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    const padY = Math.max(1, Math.abs(prem) || 1);
    yMin = -padY;
    yMax = +padY;
  }
  const ymap = (p) => H - pad - ((p - yMin) / (yMax - yMin)) * (H - 2 * pad);
  const baselineY = ymap(0);

  const lineD = xs
    .map((s, i) => `${i ? "L" : "M"} ${xmap(s).toFixed(2)} ${ymap(pay[i]).toFixed(2)}`)
    .join(" ");

  const areaD = [
    `M ${xmap(xs[0]).toFixed(2)} ${baselineY.toFixed(2)}`,
    ...xs.map((s, i) => `L ${xmap(s).toFixed(2)} ${ymap(pay[i]).toFixed(2)}`),
    `L ${xmap(xs[xs.length - 1]).toFixed(2)} ${baselineY.toFixed(2)} Z`,
  ].join(" ");

  // guides
  const xSpot = xmap(S0);
  const xMean = Number.isFinite(meanPrice) ? xmap(meanPrice) : null;
  const xBE = Number.isFinite(BE) ? xmap(BE) : null;
  const xL = Number.isFinite(ciL) ? xmap(ciL) : null;
  const xU = Number.isFinite(ciU) ? xmap(ciU) : null;

  // ticks aligned to the zero P&L axis
  const tickFmt = (s) => Math.round(s).toString();
  const leftTick = tickFmt(xmin);
  const midTick = tickFmt(centerPx);
  const rightTick = tickFmt(xmax);

  const zoomIn = () => setZoom((z) => Math.min(20, z * 1.15));
  const zoomOut = () => setZoom((z) => Math.max(0.5, z / 1.15));

  return (
    <>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
        style={{ touchAction: "none" }}
        shapeRendering="geometricPrecision"
      >
        <defs>
          <clipPath id={aboveId}>
            <rect x="0" y="0" width={W} height={baselineY} />
          </clipPath>
          <clipPath id={belowId}>
            <rect x="0" y={baselineY} width={W} height={H - baselineY} />
          </clipPath>
        </defs>

        {/* baseline */}
        <line x1={pad} y1={baselineY} x2={W - pad} y2={baselineY} stroke="rgba(255,255,255,.18)" />

        {/* profit / loss areas */}
        <path d={areaD} fill="rgba(16,185,129,.12)" clipPath={`url(#${aboveId})`} />
        <path d={areaD} fill="rgba(239, 68, 68, .15)" clipPath={`url(#${belowId})`} />

        {/* payoff line */}
        <path d={lineD} fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />

        {/* vertical guides */}
        <line x1={xSpot} y1={pad} x2={xSpot} y2={H - pad} stroke="#60a5fa" strokeWidth="1.2" opacity="0.95" />
        {Number.isFinite(xMean) && (
          <line x1={xMean} y1={pad} x2={xMean} y2={H - pad} stroke="#f472b6" strokeWidth="1.2" opacity="0.95" />
        )}
        {Number.isFinite(xL) && (
          <line x1={xL} y1={pad} x2={xL} y2={H - pad} stroke="#f5a7cf" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.9" />
        )}
        {Number.isFinite(xU) && (
          <line x1={xU} y1={pad} x2={xU} y2={H - pad} stroke="#f5a7cf" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.9" />
        )}
        {Number.isFinite(xBE) && (
          <>
            <line x1={xBE} y1={pad} x2={xBE} y2={H - pad} stroke="#10b981" strokeWidth="1.25" opacity="0.95" />
            <circle cx={xBE} cy={baselineY} r="4" fill="#10b981" opacity="0.95" />
          </>
        )}

        {/* ticks aligned to axis line */}
        <g fontSize="12" fill="rgba(148,163,184,.85)" fontWeight="700">
          <text x={pad} y={baselineY + 14}>{leftTick}</text>
          <text x={W / 2} y={baselineY + 14} textAnchor="middle">{midTick}</text>
          <text x={W - pad} y={baselineY + 14} textAnchor="end">{rightTick}</text>
        </g>
      </svg>

      {showLegend && (
        <div className="legend">
          <div className="li"><span className="dot blue" /> Current</div>
          <div className="li"><span className="dot pink" /> Mean (MC)</div>
          <div className="li"><span className="dash" /> 95% CI</div>
          <div className="li"><span className="dot be" /> Break-even</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button type="button" aria-label="Zoom out" onClick={zoomOut} className="legendBtn">–</button>
            <button type="button" aria-label="Zoom in" onClick={zoomIn} className="legendBtn">+</button>
          </div>
        </div>
      )}
    </>
  );
}
}
