// components/Strategy/Chart.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import BreakEvenBadge from "./BreakEvenBadge";
import analyticPop from "./math/analyticPop";
// centralized leg mapper
import { rowsToApiLegs } from "./utils";
// centralized BS math (price + greeks)
import { bsValueByKey, greeksByKey } from "./math/bsGreeks";

/* ---------- utils ---------- */
function lin([d0, d1], [r0, r1]) {
  const m = (r1 - r0) / (d1 - d0);
  const b = r0 - m * d0;
  const f = (x) => m * x + b;
  f.invert = (y) => (y - b) / m;
  return f;
}
function tickStep(min, max, count) {
  const span = Math.max(1e-9, max - min);
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = span / (count * step);
  return step * (err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1);
}
function ticks(min, max, count = 6) {
  const st = tickStep(min, max, count);
  const start = Math.ceil(min / st) * st;
  const out = [];
  for (let v = start; v <= max + 1e-9; v += st) out.push(v);
  return out;
}
const fmtNum = (x, d = 2) => (Number.isFinite(x) ? Number(x).toFixed(d) : "—");
const fmtCur = (x, ccy = "USD") => {
  if (!Number.isFinite(Number(x))) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Number(x));
  } catch {
    return `${Number(x).toFixed(2)} ${ccy}`;
  }
};

/* ---------- position definitions ---------- */
const TYPE_INFO = {
  lc: { sign: +1, opt: "call" },
  sc: { sign: -1, opt: "call" },
  lp: { sign: +1, opt: "put" },
  sp: { sign: -1, opt: "put" },
  ls: { sign: +1, stock: true },
  ss: { sign: -1, stock: true },
};
function rowsFromLegs(legs, days = 30) {
  const out = [];
  const push = (k, t) => {
    const L = legs?.[k];
    if (!L) return;
    if (!Number.isFinite(L.K) || !Number.isFinite(L.qty)) return;
    out.push({
      id: k,
      type: t,
      K: +L.K,
      qty: +L.qty,
      premium: Number.isFinite(L.premium) ? +L.premium : null,
      days,
      enabled: !!L.enabled,
    });
  };
  push("lc", "lc");
  push("sc", "sc");
  push("lp", "lp");
  push("sp", "sp");
  return out;
}

/* --------- payoff / greek aggregation --------- */
function payoffAtExpiration(S, rows, contractSize) {
  let y = 0;
  for (const r of rows) {
    if (!r?.enabled) continue;
    const info = TYPE_INFO[r.type];
    if (!info) continue;
    const q = Number(r.qty || 0) * contractSize;
    if (info.stock) {
      y += info.sign * (S - Number(r.K || 0)) * q;
      continue;
    }
    const K = Number(r.K || 0);
    const prem = Number.isFinite(r.premium) ? Number(r.premium) : 0;
    const intr = info.opt === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    y += info.sign * intr * q + -info.sign * prem * q;
  }
  return y;
}

function payoffCurrent(S, rows, { r, sigma }, contractSize) {
  let y = 0;
  for (const r0 of rows) {
    if (!r0?.enabled) continue;
    const info = TYPE_INFO[r0.type];
    if (!info) continue;
    const q = Number(r0.qty || 0) * contractSize;
    if (info.stock) {
      y += info.sign * (S - Number(r0.K || 0)) * q;
      continue;
    }
    const K = Number(r0.K || 0);
    const T = Math.max(1, Number(r0.days || 0)) / 365;
    const prem = Number.isFinite(r0.premium) ? Number(r0.premium) : 0;
    // centralized Black–Scholes value (long option price)
    const px = bsValueByKey(r0.type, S, K, r, sigma, T, 0);
    y += info.sign * px * q + -info.sign * prem * q;
  }
  return y;
}

function greekTotal(which, S, rows, { r, sigma }, contractSize) {
  let g = 0;
  const w = (which || "").toLowerCase();
  for (const r0 of rows) {
    if (!r0?.enabled) continue;
    const info = TYPE_INFO[r0.type];
    if (!info) continue;
    const q = Number(r0.qty || 0) * contractSize;
    if (info.stock) {
      if (w === "delta") g += info.sign * q;
      continue;
    }
    const K = Number(r0.K || 0);
    const T = Math.max(1, Number(r0.days || 0)) / 365;
    // centralized Greeks (long option Greeks: vega per 1%, theta per day)
    const G = greeksByKey(r0.type, S, K, r, sigma, T, 0);
    const g1 = Number.isFinite(G[w]) ? G[w] : 0;
    g += (info.sign > 0 ? +1 : -1) * g1 * q;
  }
  return g;
}

/* ---------- build area polygons between y=0 and yExp ---------- */
function buildAreaPaths(xs, ys, xScale, yScale) {
  const pos = [],
    neg = [];
  const eps = 1e-9;
  let seg = null,
    sign = 0;

  const push = () => {
    if (!seg || seg.length < 3) {
      seg = null;
      return;
    }
    const d =
      seg.map((p, i) => `${i ? "L" : "M"}${xScale(p[0])},${yScale(p[1])}`).join(" ") + " Z";
    (sign > 0 ? pos : neg).push(d);
    seg = null;
    sign = 0;
  };

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i],
      y = ys[i];
    const s = y > eps ? 1 : y < -eps ? -1 : 0;

    if (i > 0) {
      const y0 = ys[i - 1],
        s0 = y0 > eps ? 1 : y0 < -eps ? -1 : 0;
      if (s !== s0) {
        const x0 = xs[i - 1],
          dy = y - y0;
        const xCross = dy === 0 ? x : x0 + ((0 - y0) * (x - x0)) / dy;
        if (seg) {
          seg.push([xCross, 0]);
          push();
        }
        if (s !== 0) {
          seg = [[xCross, 0], [x, y]];
          sign = s;
          continue;
        } else {
          seg = null;
          sign = 0;
          continue;
        }
      }
    }

    if (s === 0) {
      if (seg) {
        seg.push([x, 0]);
        push();
      }
    } else {
      if (!seg) {
        seg = [[x, 0]];
        sign = s;
      }
      seg.push([x, y]);
    }
  }
  if (seg) {
    seg.push([xs[xs.length - 1], 0]);
    push();
  }
  return { pos, neg };
}

/* ---------- component ---------- */
const GREEK_LABEL = { vega: "Vega", delta: "Delta", gamma: "Gamma", theta: "Theta", rho: "Rho" };
const GREEK_COLOR = {
  vega: "#f59e0b",
  delta: "#60a5fa",
  gamma: "#a78bfa",
  theta: "#f97316",
  rho: "#10b981",
};
const SPOT_COLOR = "#8ab4f8";
const MEAN_COLOR = "#ff5ea8";
const CI_COLOR = "#a855f7";

export default function Chart({
  spot = null,
  currency = "USD",
  rows = null, // new builder rows
  legs = null, // legacy
  riskFree = 0.02,
  sigma = 0.2,
  T = 30 / 365,
  greek: greekProp,
  onGreekChange,
  onLegsChange,
  contractSize = 1,
  showControls = true,
  frameless = false,
  /** explicit strategy key is preferred for BE */
  strategy = null,
}) {
  const rowsEff = useMemo(() => {
    if (rows && Array.isArray(rows)) return rows;
    const days = Math.max(1, Math.round((T || 30 / 365) * 365));
    return rowsFromLegs(legs, days);
  }, [rows, legs, T]);

  // strikes and base domain
  const ks = useMemo(
    () => rowsEff.filter((r) => Number.isFinite(r?.K)).map((r) => +r.K).sort((a, b) => a - b),
    [rowsEff]
  );
  const baseDomain = useMemo(() => {
    const s = Number(spot) || ks[0] ?? 100;
    const lo = Math.max(0.01, Math.min(ks[0] ?? s, s) * 0.9);
    const hi = Math.max(lo * 1.1, Math.max(ks[ks.length - 1] ?? s, s) * 1.1);
    return [lo, hi];
  }, [spot, ks]);

  // zoomable domain
  const [xDomain, setXDomain] = useState(baseDomain);
  useEffect(() => setXDomain(baseDomain), [baseDomain[0], baseDomain[1]]);
  const zoomAt = (cx, factor) => {
    setXDomain(([lo, hi]) => {
      const span = hi - lo;
      const newSpan = Math.max(span * factor, Math.max(1e-6, span * 0.05));
      const alpha = (cx - lo) / span;
      let newLo = cx - alpha * newSpan;
      let newHi = newLo + newSpan;
      const baseSpan = baseDomain[1] - baseDomain[0];
      const maxSpan = baseSpan * 6;
      if (newSpan > maxSpan) {
        newLo = cx - maxSpan / 2;
        newHi = cx + maxSpan / 2;
      }
      return [newLo, newHi];
    });
  };
  const zoomIn = () => zoomAt((xDomain[0] + xDomain[1]) / 2, 0.9);
  const zoomOut = () => zoomAt((xDomain[0] + xDomain[1]) / 2, 1.1);
  const resetZoom = () => setXDomain(baseDomain);

  const N = 401;
  const xs = useMemo(() => {
    const [lo, hi] = xDomain,
      step = (hi - lo) / (N - 1);
    const arr = new Array(N);
    for (let i = 0; i < N; i++) arr[i] = lo + i * step;
    return arr;
  }, [xDomain]);
  const stepX = useMemo(() => (xs.length > 1 ? xs[1] - xs[0] : 1), [xs]);

  const env = useMemo(() => ({ r: riskFree, sigma }), [riskFree, sigma]);
  const yExp = useMemo(
    () => xs.map((S) => payoffAtExpiration(S, rowsEff, contractSize)),
    [xs, rowsEff, contractSize]
  );
  const yNow = useMemo(
    () => xs.map((S) => payoffCurrent(S, rowsEff, env, contractSize)),
    [xs, rowsEff, env, contractSize]
  );

  const greekWhich = (greekProp || "vega").toLowerCase();
  const gVals = useMemo(
    () => xs.map((S) => greekTotal(greekWhich, S, rowsEff, env, contractSize)),
    [xs, rowsEff, env, contractSize, greekWhich]
  );

  const beFromGraph = useMemo(() => {
    const out = [];
    for (let i = 1; i < xs.length; i++) {
      const y0 = yExp[i - 1],
        y1 = yExp[i];
      if ((y0 > 0 && y1 < 0) || (y0 < 0 && y1 > 0)) {
        const t = -y0 / (y1 - y0);
        out.push(xs[i - 1] + t * (xs[i] - xs[i - 1]));
      }
    }
    return Array.from(new Set(out.map((v) => +v.toFixed(6)))).sort((a, b) => a - b);
  }, [xs, yExp]);

  const ref = useRef(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const ro = new ResizeObserver((es) => {
      const cr = es[0]?.contentRect;
      if (cr?.width) setW(Math.max(640, cr.width));
    });
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 56, r: 56, t: 30, b: 40 };
  const innerW = Math.max(10, w - pad.l - pad.r);
  const h = 420,
    innerH = h - pad.t - pad.b;

  const yRange = useMemo(() => {
    const lo = Math.min(0, ...yExp, ...yNow),
      hi = Math.max(0, ...yExp, ...yNow);
    return [lo, hi === lo ? lo + 1 : hi];
  }, [yExp, yNow]);

  const xScale = useMemo(() => lin(xDomain, [pad.l, pad.l + innerW]), [xDomain, innerW]);
  const yScale = useMemo(
    () => lin([yRange[0], yRange[1]], [pad.t + innerH, pad.t]),
    [yRange, innerH]
  );

  const gMin = Math.min(...gVals),
    gMax = Math.max(...gVals),
    gPad = (gMax - gMin) * 0.1 || 1;
  const gScale = useMemo(
    () => lin([gMin - gPad, gMax + gPad], [pad.t + innerH, pad.t]),
    [gMin, gMax, gPad, innerH]
  );

  const xTicks = ticks(xDomain[0], xDomain[1], 7);
  const yTicks = ticks(yRange[0], yRange[1], 6);
  const gTicks = ticks(gMin - gPad, gMax + gPad, 6);
  const centerStrike = ks.length ? (ks[0] + ks[ks.length - 1]) / 2 : Number(spot) || xDomain[0];

  // shaded PL areas
  const { pos: posPaths, neg: negPaths } = useMemo(
    () => buildAreaPaths(xs, yExp, xScale, yScale),
    [xs, yExp, xScale, yScale]
  );

  // Time/vol inputs for mean & 95% CI (no tooltip probability for now)
  const avgDays = useMemo(() => {
    const opt = rowsEff.filter((r) => !TYPE_INFO[r.type]?.stock && Number.isFinite(r.days));
    if (!opt.length) return Math.round(T * 365) || 30;
    return Math.round(opt.reduce((s, r) => s + Number(r.days || 0), 0) / opt.length);
  }, [rowsEff, T]);
  const mu = riskFree,
    sVol = sigma;
  const Tyrs = avgDays / 365;
  const S0 = Number.isFinite(Number(spot)) ? Number(spot) : ks[0] ?? xDomain[0];
  const drift = (mu - 0.5 * sVol * sVol) * Tyrs;
  const volT = sVol * Math.sqrt(Tyrs);
  const ciLow = S0 * Math.exp(drift - 1.959963984540054 * volT);
  const ciHigh = S0 * Math.exp(drift + 1.959963984540054 * volT);
  const meanPrice = S0 * Math.exp(mu * Tyrs);

  const lotSize = useMemo(
    () => rowsEff.reduce((s, r) => s + Math.abs(Number(r.qty || 0)), 0) || 1,
    [rowsEff]
  );

  const greekColor = GREEK_COLOR[greekWhich] || "#f59e0b";

  // --- Tooltip state ---
  const [hover, setHover] = useState(null); // {i,x,y}
  const onMove = (evt) => {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = evt.clientX - rect.left;
    const S = Math.min(xDomain[1], Math.max(xDomain[0], xScale.invert(px)));
    let i = Math.round((S - xs[0]) / (stepX || 1));
    i = Math.max(0, Math.min(xs.length - 1, i));
    setHover({
      i,
      sx: xScale(xs[i]),
      syNow: yScale(yNow[i]),
      syExp: yScale(yExp[i]),
      gy: gScale(gVals[i]),
    });
  };
  const onLeave = () => setHover(null);

  const Wrapper = frameless ? "div" : "section";
  const wrapClass = frameless ? "chart-wrap" : "card chart-wrap";

  // KPI scroll container (hide scrollbar; default scroll to rightmost)
  const kpiRef = useRef(null);
  useEffect(() => {
    const el = kpiRef.current;
    if (!el) return;
    const toRight = () => {
      el.scrollLeft = el.scrollWidth;
    };
    toRight();
    const ro = new ResizeObserver(toRight);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- Fetch BE via API to drive analytic Win rate ---- */
  const apiLegs = useMemo(() => rowsToApiLegs(rowsEff), [rowsEff]);
  const [beState, setBeState] = useState({ be: null, meta: null, loading: false });
  const acRef2 = useRef(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!apiLegs.length) {
      setBeState({ be: null, meta: null, loading: false });
      return;
    }
    try {
      acRef2.current?.abort();
    } catch {}
    const ac = new AbortController();
    acRef2.current = ac;
    const mySeq = ++seqRef.current;
    setBeState((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        const res = await fetch("/api/strategy/breakeven", {
          method: "POST",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, legs: apiLegs, contractSize }),
        });
        const j = await res.json().catch(() => ({}));
        if (ac.signal.aborted || mySeq !== seqRef.current) return;
        const be = Array.isArray(j?.be) ? j.be : Array.isArray(j?.data?.be) ? j.data.be : null;
        const meta = j?.meta ?? j?.data?.meta ?? null;
        setBeState({ be: Array.isArray(be) && be.length ? be : null, meta, loading: false });
      } catch {
        if (!ac.signal.aborted) setBeState({ be: null, meta: null, loading: false });
      }
    })();

    return () => {
      try {
        acRef2.current?.abort();
      } catch {}
    };
  }, [strategy, contractSize, apiLegs]);

  const winRate = useMemo(() => {
    if (!(Number(spot) > 0)) return null;
    if (!Array.isArray(beState.be) || !beState.be.length) return null;
    const out = analyticPop({
      S: Number(spot),
      sigma: Number(sigma),
      T: Number(T),
      legs: apiLegs,
      be: beState.be,
      r: Number(riskFree),
    });
    const p = Number(out?.pop);
    if (!Number.isFinite(p)) return null;
    return Math.max(0, Math.min(1, p));
  }, [beState.be, apiLegs, spot, sigma, T, riskFree]);

  return (
    <Wrapper className={wrapClass} ref={ref} style={{ position: "relative" }}>
      {/* header */}
      <div className="chart-header">
        <div className="legend">
          <div className="leg">
            <span className="dot" style={{ background: "var(--accent)" }} />
            Current P&amp;L
          </div>
          <div className="leg">
            <span className="dot" style={{ background: "var(--text-muted,#8a8a8a)" }} />
            Expiration P&amp;L
          </div>
          <div className="leg">
            <span className="dot" style={{ background: greekColor }} />
            {GREEK_LABEL[greekWhich] || "Greek"}
          </div>
          <div className="leg">
            <span className="dot" style={{ background: SPOT_COLOR }} />
            Spot
          </div>
          <div className="leg">
            <span className="dot" style={{ background: MEAN_COLOR }} />
            Mean
          </div>
          <div className="leg">
            <span className="dot" style={{ background: CI_COLOR }} />
            95% CI
          </div>
        </div>
        <div className="header-tools">
          <div className="greek-ctl">
            <label className="small muted" htmlFor="greek">
              Greek
            </label>
            <select id="greek" value={greekWhich} onChange={(e) => onGreekChange?.(e.target.value)}>
              <option value="vega">Vega</option>
              <option value="delta">Delta</option>
              <option value="gamma">Gamma</option>
              <option value="theta">Theta</option>
              <option value="rho">Rho</option>
            </select>
          </div>
          <div className="zoom">
            <button aria-label="Zoom out" onClick={zoomOut}>
              −
            </button>
            <button aria-label="Zoom in" onClick={zoomIn}>
              +
            </button>
            <button aria-label="Reset zoom" onClick={resetZoom}>
              ⟲
            </button>
          </div>
        </div>
      </div>

      {/* chart */}
      <svg
        width="100%"
        height={h}
        role="img"
        aria-label="Strategy payoff chart"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ display: "block" }}
      >
        {/* shaded profit/loss areas */}
        {negPaths.map((d, i) => (
          <path key={`neg-${i}`} d={d} fill="rgba(239,68,68,.10)" stroke="none" />
        ))}
        {posPaths.map((d, i) => (
          <path key={`pos-${i}`} d={d} fill="rgba(16,185,129,.12)" stroke="none" />
        ))}

        {/* grid */}
        {xTicks.map((t, i) => (
          <line
            key={`xg-${i}`}
            x1={xScale(t)}
            x2={xScale(t)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke="var(--border)"
            strokeOpacity="0.6"
          />
        ))}
        {yTicks.map((t, i) => (
          <line
            key={`yg-${i}`}
            x1={pad.l}
            x2={pad.l + innerW}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke="var(--border)"
            strokeOpacity="0.6"
          />
        ))}

        {/* axes labels & guide lines */}
        <line
          x1={pad.l}
          x2={pad.l + innerW}
          y1={yScale(0)}
          y2={yScale(0)}
          stroke="var(--text)"
          strokeOpacity="0.8"
        />
        {yTicks.map((t, i) => (
          <g key={`yl-${i}`}>
            <line x1={pad.l - 4} x2={pad.l} y1={yScale(t)} y2={yScale(t)} stroke="var(--text)" />
            <text x={pad.l - 8} y={yScale(t)} dy="0.32em" textAnchor="end" className="tick">
              {fmtNum(t)}
            </text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <g key={`xl-${i}`}>
            <line
              x1={xScale(t)}
              x2={xScale(t)}
              y1={pad.t + innerH}
              y2={pad.t + innerH + 4}
              stroke="var(--text)"
            />
            <text x={xScale(t)} y={pad.t + innerH + 16} textAnchor="middle" className="tick">
              {fmtNum(t, 0)}
            </text>
          </g>
        ))}
        {Number.isFinite(centerStrike) && (
          <line
            x1={xScale(centerStrike)}
            x2={xScale(centerStrike)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke="var(--text)"
            strokeDasharray="2 6"
            strokeOpacity="0.6"
          />
        )}

        {/* RIGHT GREEK AXIS */}
        <line
          x1={pad.l + innerW}
          x2={pad.l + innerW}
          y1={pad.t}
          y2={pad.t + innerH}
          stroke={greekColor}
          strokeOpacity="0.25"
        />
        {gTicks.map((t, i) => (
          <g key={`gr-${i}`}>
            <line
              x1={pad.l + innerW}
              x2={pad.l + innerW + 4}
              y1={gScale(t)}
              y2={gScale(t)}
              stroke={greekColor}
              strokeOpacity="0.8"
            />
            <text
              x={pad.l + innerW + 6}
              y={gScale(t)}
              dy="0.32em"
              textAnchor="start"
              className="tick"
              style={{ fill: greekColor }}
            >
              {(() => {
                const a = Math.abs(t);
                if (greekWhich === "gamma") return a >= 1 ? t.toFixed(2) : a >= 0.1 ? t.toFixed(3) : t.toFixed(4);
                if (greekWhich === "delta") return t.toFixed(2);
                if (greekWhich === "vega") return a >= 10 ? t.toFixed(0) : a >= 1 ? t.toFixed(1) : t.toFixed(2);
                if (greekWhich === "theta") return a >= 1 ? t.toFixed(2) : t.toFixed(3);
                if (greekWhich === "rho") return a >= 1 ? t.toFixed(2) : t.toFixed(3);
                return t.toFixed(2);
              })()}
            </text>
          </g>
        ))}
        <text
          transform={`translate(${w - 14} ${pad.t + innerH / 2}) rotate(90)`}
          textAnchor="middle"
          className="axis"
          style={{ fill: greekColor }}
        >
          {GREEK_LABEL[greekWhich] || "Greek"}
        </text>

        {/* series */}
        <path
          d={xs.map((v, i) => `${i ? "L" : "M"}${xScale(v)},${yScale(yNow[i])}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
        />
        <path
          d={xs.map((v, i) => `${i ? "L" : "M"}${xScale(v)},${yScale(yExp[i])}`).join(" ")}
          fill="none"
          stroke="var(--text-muted,#8a8a8a)"
          strokeWidth="2"
        />
        <path
          d={xs.map((v, i) => `${i ? "L" : "M"}${xScale(v)},${gScale(gVals[i])}`).join(" ")}
          fill="none"
          stroke={greekColor}
          strokeWidth="2"
        />

        {/* overlays: spot / mean / CI (solid lines) */}
        {Number.isFinite(spot) && spot >= xDomain[0] && spot <= xDomain[1] && (
          <line
            x1={xScale(Number(spot))}
            x2={xScale(Number(spot))}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke={SPOT_COLOR}
            strokeWidth="2"
          />
        )}
        {Number.isFinite(meanPrice) && meanPrice >= xDomain[0] && meanPrice <= xDomain[1] && (
          <line
            x1={xScale(meanPrice)}
            x2={xScale(meanPrice)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke={MEAN_COLOR}
            strokeWidth="2"
          />
        )}
        {Number.isFinite(ciLow) && ciLow >= xDomain[0] && ciLow <= xDomain[1] && (
          <line
            x1={xScale(ciLow)}
            x2={xScale(ciLow)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke={CI_COLOR}
            strokeWidth="2"
          />
        )}
        {Number.isFinite(ciHigh) && ciHigh >= xDomain[0] && ciHigh <= xDomain[1] && (
          <line
            x1={xScale(ciHigh)}
            x2={xScale(ciHigh)}
            y1={pad.t}
            y2={pad.t + innerH}
            stroke={CI_COLOR}
            strokeWidth="2"
          />
        )}

        {/* hover markers */}
        {hover && (
          <>
            <line x1={hover.sx} x2={hover.sx} y1={pad.t} y2={pad.t + innerH} stroke="rgba(255,255,255,.25)" />
            <circle cx={hover.sx} cy={hover.syNow} r="4" fill="var(--accent)" />
            <circle cx={hover.sx} cy={hover.syExp} r="4" fill="var(--text-muted,#8a8a8a)" />
            <circle cx={hover.sx} cy={hover.gy} r="3.2" fill={greekColor} />
          </>
        )}

        {/* break-evens (chart markers only; numeric values live in KPI cell) */}
        {beFromGraph.map((b, i) => (
          <g key={`be-${i}`}>
            <line
              x1={xScale(b)}
              x2={xScale(b)}
              y1={pad.t}
              y2={pad.t + innerH}
              stroke="var(--text)"
              strokeOpacity="0.25"
            />
            <circle cx={xScale(b)} cy={yScale(0)} r="3.5" fill="var(--bg,#111)" stroke="var(--text)" />
          </g>
        ))}
      </svg>

      {/* floating tooltip — probability row removed for now */}
      {hover &&
        (() => {
          const i = hover.i;
          return (
            <div
              className="tip"
              style={{
                left: Math.min(Math.max(hover.sx + 14, 8), w - 260),
                top: Math.max(pad.t + 8, Math.min(hover.syNow, h - 120)),
              }}
            >
              <div className="row">
                <span className="dot" style={{ background: "var(--accent)" }} />
                <span>Current P&amp;L</span>
                <span className="val">{fmtCur(yNow[i], currency)}</span>
              </div>
              <div className="row">
                <span className="dot" style={{ background: "var(--text-muted,#8a8a8a)" }} />
                <span>Expiration P&amp;L</span>
                <span className="val">{fmtCur(yExp[i], currency)}</span>
              </div>
              <div className="row">
                <span className="dot" style={{ background: greekColor }} />
                <span>{GREEK_LABEL[greekWhich]}</span>
                <span className="val">{fmtNum(gVals[i], 2)}</span>
              </div>

              <div className="price">{fmtCur(xs[i], currency)}</div>
              <div className="sub">Underlying price</div>

              <div className="rule" />
              <div className="sub">95% CI & Mean shown on chart</div>
            </div>
          );
        })()}

      {/* KPI row (scrollable, hidden scrollbar) */}
      <div className="kpi-scroll" ref={kpiRef} aria-label="Strategy metrics">
        <div className="metrics">
          <div className="m">
            <div className="k">Underlying price</div>
            <div className="v">{Number.isFinite(Number(spot)) ? fmtCur(spot, currency) : "—"}</div>
          </div>
          <div className="m">
            <div className="k">Max profit</div>
            <div className="v">{fmtNum(Math.max(...yExp), 2)}</div>
          </div>
          <div className="m">
            <div className="k">Max loss</div>
            <div className="v">{fmtNum(Math.min(...yExp), 2)}</div>
          </div>
          <div className="m">
            <div className="k">Win rate</div>
            <div className="v">{winRate == null ? "—" : `${(winRate * 100).toFixed(2)}%`}</div>
          </div>

          {/* Breakeven cell uses the shared API-based badge */}
          <div className="m">
            <div className="k">Breakeven</div>
            <BreakEvenBadge rows={rowsEff} currency={currency} strategy={strategy} />
          </div>

          <div className="m">
            <div className="k">Lot size</div>
            <div className="v">{lotSize}</div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .chart-wrap {
          display: block;
        }
        .chart-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 6px 2px;
        }
        .legend {
          display: flex;
          gap: 14px;
          flex-wrap: wrap;
        }
        .leg {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12.5px;
          opacity: 0.95;
          white-space: nowrap;
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .header-tools {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .greek-ctl {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .greek-ctl select {
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          padding: 0 8px;
        }
        .zoom {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-left: 6px;
        }
        .zoom button {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font-weight: 700;
          line-height: 1;
        }
        .zoom button:hover {
          background: var(--card);
        }

        .tick {
          font-size: 11px;
          fill: var(--text);
          opacity: 0.75;
        }
        .axis {
          font-size: 12px;
          fill: var(--text);
          opacity: 0.7;
        }

        .kpi-scroll {
          overflow-x: auto;
          overscroll-behavior-x: contain;
          -ms-overflow-style: none;
          scrollbar-width: none;
          border-top: 1px solid var(--border);
        }
        .kpi-scroll::-webkit-scrollbar {
          display: none;
        }
        .metrics {
          display: grid;
          grid-template-columns: repeat(6, minmax(140px, 1fr));
          gap: 10px;
          padding: 10px 6px 12px;
          min-width: 840px;
        }
        .m .k {
          font-size: 12px;
          opacity: 0.7;
        }
        .m .v {
          font-weight: 700;
        }
        @media (max-width: 920px) {
          .metrics {
            grid-template-columns: repeat(6, minmax(160px, 1fr));
          }
        }

        .tip {
          position: absolute;
          min-width: 220px;
          max-width: 260px;
          padding: 11px 12px;
          background: rgba(20, 20, 20, 1);
          color: #eee;
          border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
          border: 1px solid rgba(255, 255, 255, 0.08);
          pointer-events: none;
          font-size: 11.5px;
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          font-weight: 650;
        }
        .row + .row {
          margin-top: 6px;
        }
        .val {
          margin-left: auto;
          margin-right: 0;
        }
        .price {
          margin-top: 10px;
          font-weight: 800;
          font-size: 12.5px;
          text-align: center;
        }
        .sub {
          font-size: 11px;
          opacity: 0.75;
          margin-top: 2px;
          text-align: center;
        }
        .rule {
          height: 1px;
          background: rgba(255, 255, 255, 0.12);
          margin: 9px 0;
        }
      `}</style>
    </Wrapper>
  );
}
