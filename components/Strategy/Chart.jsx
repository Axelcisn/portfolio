// components/Strategy/Chart.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import BreakEvenBadge from "./BreakEvenBadge";
import analyticPop from "./math/analyticPop";
import { rowsToApiLegs } from "./utils";
// centralized BS math (price + greeks) via shims
import { bsValueByKey, greeksByKey } from "./math/bsGreeks";

// ✅ Hub imports made tolerant to both named and default exports
import quantPkg, * as quantNS from "lib/quant/index.js";
import payoffPkg, * as payoffNS from "lib/strategy/payoff";

// ✅ Time basis context (252/365) — keep chart in sync with Key stats
import { useTimeBasis } from "../ui/TimeBasisContext";

// 🔹 Live Stats context (sigma/rf/q/drift/μ/spot)
import { useStatsCtx } from "./statsBus";

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
/** Fast quantile on a numeric copy (no external libs). */
function quantile(arr, p) {
  if (!arr?.length) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const i = (a.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo === hi) return a[lo];
  const t = i - lo;
  return a[lo] * (1 - t) + a[hi] * t;
}
/** Build a tight, zero-aware range for Greeks; trims outliers (2%-98%). */
function greekNiceRange(values) {
  if (!values?.length) return [-1, 1];
  let lo = quantile(values, 0.02);
  let hi = quantile(values, 0.98);
  lo = Math.min(lo, 0);
  hi = Math.max(hi, 0);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
    const m = Number.isFinite(lo) ? Math.abs(lo) : 1;
    lo = -m || -1;
    hi = m || 1;
  }
  const pad = Math.max(1e-12, (hi - lo) * 0.08);
  return [lo - pad, hi + pad];
}



/* ---------- series sanitizer (remove NaN/±Inf and clamp one-sample spikes) ---------- */
function sanitizeSeries(arr){
  if (!Array.isArray(arr)) return arr;
  const out = arr.map(v => (Number.isFinite(v) ? v : 0));
  // clamp single-sample spikes that are >> neighbors
  for (let i = 1; i < out.length - 1; i++){
    const v = out[i], pv = out[i-1], nv = out[i+1];
    if (Number.isFinite(v) && Number.isFinite(pv) && Number.isFinite(nv)){
      const a = Math.abs(v), ap = Math.abs(pv)+1e-9, an = Math.abs(nv)+1e-9;
      if (a > 20*ap && a > 20*an){ out[i] = (pv + nv) / 2; }
    }
  }
  return out;
}
/* ---------- safe hub accessors + fallback ---------- */
const hasFn = (f) => typeof f === "function";
const safeGbmMean = (args) => {
  const fn = quantNS?.gbmMean ?? quantPkg?.gbmMean;
  return hasFn(fn) ? fn(args) : null;
};
const safeGbmCI95 = (args) => {
  const fn = quantNS?.gbmCI95 ?? quantPkg?.gbmCI95;
  return hasFn(fn) ? fn(args) : null;
};

/** Local expiration payoff fallback if hub function is missing. */
function localPayoffAt(S, bundle) {
  let y = 0;
  for (const l of bundle?.legs || []) {
    const qty = Math.max(0, Number(l?.qty) || 0);
    const prem = Number(l?.premium) || 0;
    const K = Number(l?.strike) || 0;
    if (l?.kind === "call") {
      const intr = Math.max(S - K, 0);
      y += qty * (l?.side === "long" ? intr - prem : prem - intr);
    } else if (l?.kind === "put") {
      const intr = Math.max(K - S, 0);
      y += qty * (l?.side === "long" ? intr - prem : prem - intr);
    } else if (l?.kind === "stock") {
      y += qty * (l?.side === "long" ? S - prem : prem - S);
    }
  }
  return y;
}
const safePayoffAt = (S, bundle) => {
  const fn = payoffNS?.payoffAt ?? payoffPkg?.payoffAt;
  return hasFn(fn) ? fn(S, bundle) : localPayoffAt(S, bundle);
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

/* ---------- expiry helpers ---------- */
function daysForRow(row, fallbackDays) {
  const d1 = Number(row?.days);
  if (Number.isFinite(d1) && d1 >= 1) return Math.round(d1);
  const d2 = Number(row?.dte);
  if (Number.isFinite(d2) && d2 >= 1) return Math.round(d2);
  const exp = row?.expiry ?? row?.expiration ?? row?.exp;
  if (exp != null) {
    const t = typeof exp === "number" ? exp : Date.parse(String(exp));
    if (Number.isFinite(t)) {
      const rem = Math.ceil((t - Date.now()) / 86_400_000);
      if (rem >= 1) return rem;
    }
  }
  const fb = Math.max(1, Number(fallbackDays) || 30);
  return fb;
}

/* ---------- centralized payoff wiring ---------- */
/**
 * Current P&L at price S.
 * - For options: P&L = sign * (mark - entryPx) * qty
 *   entryPx = user premium if provided, else BS price computed at entry spot S0.
 * - For stocks: P&L = sign * (S - entryPrice) * qty  (entry from K/premium/S0)
 */
function payoffCurrent(
  S,
  rows,
  { r, sigma, q, yearBasis, S0 },
  contractSize,
  fallbackDays
) {
  let y = 0;
  for (const r0 of rows) {
    if (!r0?.enabled) continue;
    const info = TYPE_INFO[r0.type];
    if (!info) continue;
    const qty = Number(r0.qty || 0) * contractSize;

    // Stocks
    if (info.stock) {
      const entryStock =
        Number.isFinite(Number(r0.premium)) ? Number(r0.premium) :
        Number.isFinite(Number(r0.K)) ? Number(r0.K) :
        (Number.isFinite(Number(S0)) ? Number(S0) : 0);
      y += info.sign * (S - entryStock) * qty;
      continue;
    }

    // Options
    const K = Number(r0.K || 0);
    const days = daysForRow(r0, fallbackDays);
    const T = days / (yearBasis || 365);

    // Current mark
    const pxNow = bsValueByKey(r0.type, S, K, r, sigma, T, q);

    // Entry price: manual premium beats theoretical entry at S0
    let entryPx;
    if (Number.isFinite(Number(r0.premium))) {
      entryPx = Number(r0.premium);
    } else {
      const Sentry = Number(S0);
      entryPx = Number.isFinite(Sentry)
        ? bsValueByKey(r0.type, Sentry, K, r, sigma, T, q)
        : 0;
    }

    // P&L (sign handles long/short)
    y += info.sign * (pxNow - entryPx) * qty;
  }
  return y;
}

function greekTotal(which, S, rows, { r, sigma, q, yearBasis }, contractSize, fallbackDays) {
  let g = 0;
  const w = (which || "").toLowerCase();
  for (const r0 of rows) {
    if (!r0?.enabled) continue;
    const info = TYPE_INFO[r0.type];
    if (!info) continue;
    const qty = Number(r0.qty || 0) * contractSize;

    if (info.stock) {
      if (w === "delta") g += info.sign * qty;
      continue;
    }

    const K = Number(r0.K || 0);
    const days = daysForRow(r0, fallbackDays);
    const T = days / (yearBasis || 365);

    const G = greeksByKey(r0.type, S, K, r, sigma, T, q); // long greeks; vega per 1%, theta per day
    const g1 = Number.isFinite(G[w]) ? G[w] : 0;

    g += (info.sign > 0 ? +1 : -1) * g1 * qty;
  }
  return g;
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

/** Choose drift for GBM overlays */
function deriveMu({ drift, capmMu, riskFree, customMu }) {
  const d = (drift || "").toLowerCase();
  if (d === "capm" && Number.isFinite(Number(capmMu))) return Number(capmMu);
  if (d === "custom" && Number.isFinite(Number(customMu))) return Number(customMu);
  // default to risk-free (risk-neutral)
  return Number(riskFree) || 0;
}

export default function Chart({
  spot = null,
  currency = "USD",
  rows = null,
  legs = null,
  riskFree = 0.02,
  sigma = 0.2,
  T = 30 / 365,        // legacy fallback (years)
  dividend = 0,        // q
  yearBasis = 365,     // <- prop fallback, context will override
  drift = "capm",      // "capm" | "riskfree" | "custom"
  capmMu = null,       // CAPM μ from Key stats
  customMu = null,     // optional manual μ
  greek: greekProp,
  onGreekChange,
  onLegsChange,
  contractSize = 1,
  showControls = true,
  frameless = false,
  strategy = null,
}) {
  // ✅ Pull basis from context; context wins
  const tb = (typeof useTimeBasis === "function" ? useTimeBasis() : null) || {};
  const basisEff = Number.isFinite(Number(tb?.basis)) ? Number(tb.basis) : (Number(yearBasis) || 365);

  // 🔹 Pull live stats; fall back to props
  const stats = (typeof useStatsCtx === "function" ? useStatsCtx() : {}) || {};
  const sigmaEff = Number.isFinite(Number(stats?.sigma)) ? Number(stats.sigma) : Number(sigma);
  const rfEff    = Number.isFinite(Number(stats?.rf))    ? Number(stats.rf)    : Number(riskFree);
  const qEff     = Number.isFinite(Number(stats?.q))     ? Number(stats.q)     : Number(dividend);
  const driftEff = typeof stats?.driftMode === "string"   ? stats.driftMode     : drift;
  const capmEff  = Number.isFinite(Number(stats?.muCapm))? Number(stats.muCapm): (Number(capmMu) || 0);
  const spotEff  = Number.isFinite(Number(spot)) ? Number(spot)
                   : (Number.isFinite(Number(stats?.spot)) ? Number(stats.spot) : null);

  const rowsEff = useMemo(() => {
    if (rows && Array.isArray(rows)) return rows;
    const days = Math.max(1, Math.round((T || 30 / 365) * basisEff));
    return rowsFromLegs(legs, days);
  }, [rows, legs, T, basisEff]);

  // payoff bundle for centralized payoff engine
  const payoffBundle = useMemo(() => buildPayoffBundle(rowsEff, contractSize), [rowsEff, contractSize]);

  // fallback days used when a row lacks days/dte/expiry
  const fallbackDays = useMemo(
    () => Math.max(1, Math.round((Number.isFinite(Number(T)) ? Number(T) : 30 / 365) * basisEff)),
    [T, basisEff]
  );

  // strikes and base domain
  const ks = useMemo(
    () => rowsEff.filter((r) => Number.isFinite(r?.K)).map((r) => +r.K).sort((a, b) => a - b),
    [rowsEff]
  );
  const baseDomain = useMemo(() => {
    const s = Number.isFinite(Number(spotEff)) ? Number(spotEff) : (ks[0] ?? 100);
    const lo = Math.max(0.01, Math.min(ks[0] ?? s, s) * 0.9);
    const hi = Math.max(lo * 1.1, Math.max(ks[ks.length - 1] ?? s, s) * 1.1);
    return [lo, hi];
  }, [spotEff, ks]);

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
    const [lo, hi] = xDomain, step = (hi - lo) / (N - 1);
    const arr = new Array(N);
    for (let i = 0; i < N; i++) arr[i] = lo + i * step;
    return arr;
  }, [xDomain]);
  const stepX = useMemo(() => (xs.length > 1 ? xs[1] - xs[0] : 1), [xs]);

  // All Greeks/mark-to-market use effective params (+basis)
  const env = useMemo(
    () => ({ r: Number(rfEff) || 0, sigma: Number(sigmaEff) || 0, q: Number(qEff) || 0, yearBasis: basisEff, S0: spotEff }),
    [rfEff, sigmaEff, qEff, basisEff, spotEff]
  );

  // --- CENTRALIZED EXPIRATION PAYOFF ---
  const yExp = useMemo(() => xs.map((S) => safePayoffAt(S, payoffBundle)), [xs, payoffBundle]);

  // current mark-to-market (BS) — anchored to entry (S0 or user premium)
  const yNow = useMemo(
  () =>
    sanitizeSeries(
      xs.map((S) => payoffCurrent(S, rowsEff, env, contractSize, fallbackDays))
    ),
  [xs, rowsEff, env, contractSize, fallbackDays]
);

  const greekWhich = (greekProp || "vega").toLowerCase();
  const gVals = useMemo(
    () => xs.map((S) => greekTotal(greekWhich, S, rowsEff, env, contractSize, fallbackDays)),
    [xs, rowsEff, env, contractSize, greekWhich, fallbackDays]
  );

  const beFromGraph = useMemo(() => {
    const out = [];
    for (let i = 1; i < xs.length; i++) {
      const y0 = yExp[i - 1], y1 = yExp[i];
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
  const h = 420, innerH = h - pad.t - pad.b;

  const yRange = useMemo(() => {
    const lo = Math.min(0, ...yExp, ...yNow), hi = Math.max(0, ...yExp, ...yNow);
    return [lo, hi === lo ? lo + 1 : hi];
  }, [yExp, yNow]);

  const xScale = useMemo(() => lin(xDomain, [pad.l, pad.l + innerW]), [xDomain, innerW]);
  const yScale = useMemo(() => lin([yRange[0], yRange[1]], [pad.t + innerH, pad.t]), [yRange, innerH]);

  // 🔧 RIGHT-AXIS (Greek) — trimmed, zero-aware, independent from P&L
  const [gLo, gHi] = useMemo(() => greekNiceRange(gVals), [gVals]);
  const gScale = useMemo(() => lin([gLo, gHi], [pad.t + innerH, pad.t]), [gLo, gHi, innerH]);
  const gTicks = useMemo(() => ticks(gLo, gHi, 6), [gLo, gHi]);

  const xTicks = ticks(xDomain[0], xDomain[1], 7);
  const yTicks = ticks(yRange[0], yRange[1], 6);
  const centerStrike = ks.length ? (ks[0] + ks[ks.length - 1]) / 2 : Number(spotEff) || xDomain[0];

  // shaded PL areas
  const { pos: posPaths, neg: negPaths } = useMemo(
    () => buildAreaPaths(xs, yExp, xScale, yScale),
    [xs, yExp, xScale, yScale]
  );

  // --- GBM mean & 95% CI (uses drift selection) ---
  const avgDays = useMemo(() => {
    const opt = rowsEff.filter((r) => !TYPE_INFO[r.type]?.stock);
    if (!opt.length) return fallbackDays;
    const sum = opt.reduce((s, r) => s + daysForRow(r, fallbackDays), 0);
    return Math.max(1, Math.round(sum / opt.length));
  }, [rowsEff, fallbackDays]);

  const S0 = Number.isFinite(Number(spotEff)) ? Number(spotEff) : ks[0] ?? xDomain[0];
  const Tyrs = (avgDays || 0) / basisEff;
  const mu = deriveMu({ drift: driftEff, capmMu: capmEff, riskFree: rfEff, customMu });
  const sVol = Number(sigmaEff) || 0;

  let meanPrice = Number.isFinite(S0) ? S0 * Math.exp(mu * Tyrs) : null;
  {
    const m = safeGbmMean({ S0, mu, T: Tyrs });
    if (Number.isFinite(m)) meanPrice = m;
  }

  let ciLow = null, ciHigh = null;
  {
    const res = safeGbmCI95({ S0, sigma: sVol, T: Tyrs, mu });
    if (Array.isArray(res) && res.length >= 2) [ciLow, ciHigh] = res;
    else if (res && Number.isFinite(res?.low) && Number.isFinite(res?.high)) {
      ciLow = res.low; ciHigh = res.high;
    }
  }
  if (!Number.isFinite(ciLow) || !Number.isFinite(ciHigh)) {
    const vT = sVol * Math.sqrt(Tyrs);
    const z = 1.959963984540054;
    const mLN = Math.log(S0) + (mu - 0.5 * sVol * sVol) * Tyrs;
    ciLow = Number.isFinite(S0) ? Math.exp(mLN - z * vT) : null;
    ciHigh = Number.isFinite(S0) ? Math.exp(mLN + z * vT) : null;
  }

  const lotSize = useMemo(
    () => rowsEff.reduce((s, r) => s + Math.abs(Number(r.qty || 0)), 0) || 1,
    [rowsEff]
  );

  const greekColor = GREEK_COLOR[greekWhich] || "#f59e0b";

  // --- Tooltip state ---
  const [hover, setHover] = useState(null);
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

  // KPI scroll container
  const kpiRef = useRef(null);
  useEffect(() => {
    const el = kpiRef.current;
    if (!el) return;
    const toRight = () => { el.scrollLeft = el.scrollWidth; };
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
    try { acRef2.current?.abort(); } catch {}
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

    return () => { try { acRef2.current?.abort(); } catch {} };
  }, [strategy, contractSize, apiLegs]);

  const winRate = useMemo(() => {
    if (!(Number(spotEff) > 0)) return null;
    if (!Array.isArray(beState.be) || !beState.be.length) return null;
    const out = analyticPop({
      S: Number(spotEff),
      sigma: Number(sigmaEff),
      T: Number(T),
      legs: apiLegs,
      be: beState.be,
      r: Number(rfEff),
    });
    const p = Number(out?.pop);
    if (!Number.isFinite(p)) return null;
    return Math.max(0, Math.min(1, p));
  }, [beState.be, apiLegs, spotEff, sigmaEff, T, rfEff]);

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
          <div className="leg"><span className="dot" style={{ background: SPOT_COLOR }} />Spot</div>
          <div className="leg"><span className="dot" style={{ background: MEAN_COLOR }} />Mean</div>
          <div className="leg"><span className="dot" style={{ background: CI_COLOR }} />95% CI</div>
        </div>
        <div className="header-tools">
          <div className="greek-ctl">
            <label className="small muted" htmlFor="greek">Greek</label>
            <select id="greek" value={greekWhich} onChange={(e) => onGreekChange?.(e.target.value)}>
              <option value="vega">Vega</option>
              <option value="delta">Delta</option>
              <option value="gamma">Gamma</option>
              <option value="theta">Theta</option>
              <option value="rho">Rho</option>
            </select>
          </div>
          <div className="zoom">
            <button aria-label="Zoom out" onClick={zoomOut}>−</button>
            <button aria-label="Zoom in" onClick={zoomIn}>+</button>
            <button aria-label="Reset zoom" onClick={resetZoom}>⟲</button>
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
        {negPaths.map((d, i) => (<path key={`neg-${i}`} d={d} fill="rgba(239,68,68,.10)" stroke="none" />))}
        {posPaths.map((d, i) => (<path key={`pos-${i}`} d={d} fill="rgba(16,185,129,.12)" stroke="none" />))}

        {/* grid */}
        {xTicks.map((t, i) => (
          <line key={`xg-${i}`} x1={xScale(t)} x2={xScale(t)} y1={pad.t} y2={pad.t + innerH}
                stroke="var(--border)" strokeOpacity="0.6" />
        ))}
        {yTicks.map((t, i) => (
          <line key={`yg-${i}`} x1={pad.l} x2={pad.l + innerW} y1={yScale(t)} y2={yScale(t)}
                stroke="var(--border)" strokeOpacity="0.6" />
        ))}

        {/* axes labels & guide lines */}
        <line x1={pad.l} x2={pad.l + innerW} y1={yScale(0)} y2={yScale(0)}
              stroke="var(--text)" strokeOpacity="0.8" />
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
            <line x1={xScale(t)} x2={xScale(t)} y1={pad.t + innerH} y2={pad.t + innerH + 4} stroke="var(--text)" />
            <text x={xScale(t)} y={pad.t + innerH + 16} textAnchor="middle" className="tick">
              {fmtNum(t, 0)}
            </text>
          </g>
        ))}
        {Number.isFinite(centerStrike) && (
          <line x1={xScale(centerStrike)} x2={xScale(centerStrike)} y1={pad.t} y2={pad.t + innerH}
                stroke="var(--text)" strokeDasharray="2 6" strokeOpacity="0.6" />
        )}

        {/* RIGHT GREEK AXIS */}
        <line x1={pad.l + innerW} x2={pad.l + innerW} y1={pad.t} y2={pad.t + innerH}
              stroke={greekColor} strokeOpacity="0.25" />
        {gTicks.map((t, i) => (
          <g key={`gr-${i}`}>
            <line x1={pad.l + innerW} x2={pad.l + innerW + 4} y1={gScale(t)} y2={gScale(t)}
                  stroke={greekColor} strokeOpacity="0.8" />
            <text x={pad.l + innerW + 6} y={gScale(t)} dy="0.32em" textAnchor="start"
                  className="tick" style={{ fill: greekColor }}>
              {(() => {
                const a = Math.abs(t);
                if (greekWhich === "gamma") return a >= 1 ? t.toFixed(2) : a >= 0.1 ? t.toFixed(3) : t.toFixed(4);
                if (greekWhich === "delta") return t.toFixed(2);
                if (greekWhich === "vega")  return a >= 10 ? t.toFixed(0) : a >= 1 ? t.toFixed(1) : t.toFixed(2);
                if (greekWhich === "theta") return a >= 1 ? t.toFixed(2) : t.toFixed(3);
                if (greekWhich === "rho")   return a >= 1 ? t.toFixed(2) : t.toFixed(3);
                return t.toFixed(2);
              })()}
            </text>
          </g>
        ))}
        <text transform={`translate(${w - 14} ${pad.t + innerH / 2}) rotate(90)`}
              textAnchor="middle" className="axis" style={{ fill: greekColor }}>
          {GREEK_LABEL[greekWhich] || "Greek"}
        </text>

        {/* series */}
        <path d={xs.map((v, i) => `${i ? "L" : "M"}${xScale(v)},${yScale(yNow[i])}`).join(" ")}
              fill="none" stroke="var(--accent)" strokeWidth="2.2" />
        <path d={xs.map((v, i) => `${i ? "L" : "M"}${xScale(v)},${yScale(yExp[i])}`).join(" ")}
              fill="none" stroke="var(--text-muted,#8a8a8a)" strokeWidth="2" />
        <path d={xs.map((v, i) => `${i ? "L" : "M"}${xScale(v)},${gScale(gVals[i])}`).join(" ")}
              fill="none" stroke={greekColor} strokeWidth="2" />

        {/* overlays: spot / mean / CI */}
        {Number.isFinite(spotEff) && spotEff >= xDomain[0] && spotEff <= xDomain[1] && (
          <line x1={xScale(Number(spotEff))} x2={xScale(Number(spotEff))}
                y1={pad.t} y2={pad.t + innerH} stroke={SPOT_COLOR} strokeWidth="2" />
        )}
        {Number.isFinite(meanPrice) && meanPrice >= xDomain[0] && meanPrice <= xDomain[1] && (
          <line x1={xScale(meanPrice)} x2={xScale(meanPrice)}
                y1={pad.t} y2={pad.t + innerH} stroke={MEAN_COLOR} strokeWidth="2" />
        )}
        {Number.isFinite(ciLow) && ciLow >= xDomain[0] && ciLow <= xDomain[1] && (
          <line x1={xScale(ciLow)} x2={xScale(ciLow)}
                y1={pad.t} y2={pad.t + innerH} stroke={CI_COLOR} strokeWidth="2" />
        )}
        {Number.isFinite(ciHigh) && ciHigh >= xDomain[0] && ciHigh <= xDomain[1] && (
          <line x1={xScale(ciHigh)} x2={xScale(ciHigh)}
                y1={pad.t} y2={pad.t + innerH} stroke={CI_COLOR} strokeWidth="2" />
        )}

        {/* hover markers */}
        {hover && (
          <>
            <line x1={hover.sx} x2={hover.sx} y1={pad.t} y2={pad.t + innerH} stroke="rgba(255,255,255,.25)" />
            <circle cx={hover.sx} cy={yScale(yNow[hover.i])} r="4" fill="var(--accent)" />
            <circle cx={hover.sx} cy={yScale(yExp[hover.i])} r="4" fill="var(--text-muted,#8a8a8a)" />
            <circle cx={hover.sx} cy={gScale(gVals[hover.i])} r="3.2" fill={greekColor} />
          </>
        )}

        {/* break-evens (chart markers only; numeric values live in KPI cell) */}
        {beFromGraph.map((b, i) => (
          <g key={`be-${i}`}>
            <line x1={xScale(b)} x2={xScale(b)} y1={pad.t} y2={pad.t + innerH}
                  stroke="var(--text)" strokeOpacity="0.25" />
            <circle cx={xScale(b)} cy={yScale(0)} r="3.5" fill="var(--bg,#111)" stroke="var(--text)" />
          </g>
        ))}
      </svg>

      {/* floating tooltip */}
      {hover && (() => {
        const i = hover.i;
        return (
          <div className="tip"
               style={{ left: Math.min(Math.max(hover.sx + 14, 8), w - 260),
                        top: Math.max(pad.t + 8, Math.min(hover.syNow, h - 120)) }}>
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

      {/* KPI row */}
      <div className="kpi-scroll" ref={kpiRef} aria-label="Strategy metrics">
        <div className="metrics">
          <div className="m">
            <div className="k">Underlying price</div>
            <div className="v">{Number.isFinite(Number(spotEff)) ? fmtCur(spotEff, currency) : "—"}</div>
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
        .chart-wrap { display: block; }
        .chart-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 6px 2px; }
        .legend { display:flex; gap:14px; flex-wrap:wrap; }
        .leg { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; opacity:.95; white-space:nowrap; }
        .dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
        .header-tools { display:flex; align-items:center; gap:10px; }
        .greek-ctl { display:flex; align-items:center; gap:8px; }
        .greek-ctl select { height:28px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); padding:0 8px; }
        .zoom { display:flex; align-items:center; gap:6px; margin-left:6px; }
        .zoom button{ width:28px; height:28px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); font-weight:700; line-height:1; }
        .zoom button:hover{ background:var(--card); }
        .tick { font-size:11px; fill:var(--text); opacity:.75; }
        .axis { font-size:12px; fill:var(--text); opacity:.7; }
        .kpi-scroll{ overflow-x:auto; overscroll-behavior-x: contain; -ms-overflow-style: none; scrollbar-width: none; border-top:1px solid var(--border); }
        .kpi-scroll::-webkit-scrollbar{ display:none; }
        .metrics{ display:grid; grid-template-columns: repeat(6, minmax(140px, 1fr)); gap:10px; padding:10px 6px 12px; min-width: 840px; }
        .m .k{ font-size:12px; opacity:.7; } .m .v{ font-weight:700; }
        @media (max-width:920px){ .metrics{ grid-template-columns: repeat(6, minmax(160px, 1fr)); } }
        .tip{ position:absolute; min-width:220px; max-width:260px; padding:11px 12px; background: rgba(20,20,20,1); color:#eee; border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.08); pointer-events:none; font-size:11.5px; }
        .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:650; }
        .row + .row{ margin-top:6px; }
        .val{ margin-left:auto; margin-right:0; }
        .price{ margin-top:10px; font-weight:800; font-size:12.5px; text-align:center; }
        .sub{ font-size:11px; opacity:.75; margin-top:2px; text-align:center; }
        .rule{ height:1px; background: rgba(255,255,255,.12); margin:9px 0; }
      `}</style>
    </Wrapper>
  );
}

/* ---------- build area polygons between y=0 and yExp ---------- */
function buildAreaPaths(xs, ys, xScale, yScale) {
  const pos = [], neg = [];
  const eps = 1e-9;
  let seg = null, sign = 0;

  const push = () => {
    if (!seg || seg.length < 3) { seg = null; return; }
    const d = seg
      .map((p, i) => `${i ? "L" : "M"}${xScale(p[0])},${yScale(p[1])}`)
      .join(" ")
      + " Z";
    (sign > 0 ? pos : neg).push(d);
    seg = null; sign = 0;
  };

  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    const s = y > eps ? 1 : y < -eps ? -1 : 0;

    if (i > 0) {
      const y0 = ys[i - 1], s0 = y0 > eps ? 1 : y0 < -eps ? -1 : 0;
      if (s !== s0) {
        // find zero-crossing between (x_{i-1}, y_{i-1}) and (x_i, y_i)
        const x0 = xs[i - 1], dy = y - y0;
        const xCross = dy === 0 ? x : x0 + ((0 - y0) * (x - x0)) / dy;

        if (seg) { seg.push([xCross, 0]); push(); }
        if (s !== 0) { seg = [[xCross, 0], [x, y]]; sign = s; continue; }
        seg = null; sign = 0; continue;
      }
    }

    if (s === 0) {
      if (seg) { seg.push([x, 0]); push(); }
    } else {
      if (!seg) { seg = [[x, 0]]; sign = s; }
      seg.push([x, y]);
    }
  }

  if (seg) { seg.push([xs[xs.length - 1], 0]); push(); }
  return { pos, neg };
}

// ---------- payoff helper (reintroduced) ----------
/**
 * Convert builder rows into a normalized payoff bundle for the expiration engine.
 * Hoisted function declaration so it is available to earlier calls in the module.
 * @param {Array} rows   Builder rows (lc/sc/lp/sp/ls/ss)
 * @param {number} contractSize  Multiplier per contract (e.g., 1 or 100)
 * @returns {{ legs: Array }}
 */
function buildPayoffBundle(rows, contractSize) {
  const legs = [];
  const size = Number(contractSize) || 1;

  for (const r of rows || []) {
    if (!r || !r.enabled) continue;

    const qty = (Number(r.qty) || 0) * size;
    const K = Number(r.K) || 0;
    const prem = Number.isFinite(r.premium) ? Number(r.premium) : 0;

    switch (String(r.type || "").toLowerCase()) {
      case "lc":
        legs.push({ kind: "call", side: "long",  strike: K, premium: prem, qty });
        break;
      case "sc":
        legs.push({ kind: "call", side: "short", strike: K, premium: prem, qty });
        break;
      case "lp":
        legs.push({ kind: "put",  side: "long",  strike: K, premium: prem, qty });
        break;
      case "sp":
        legs.push({ kind: "put",  side: "short", strike: K, premium: prem, qty });
        break;
      case "ls": // long stock: reuse 'premium' field to store entry/basis price for clarity
        legs.push({ kind: "stock", side: "long",  premium: K, qty });
        break;
      case "ss": // short stock
        legs.push({ kind: "stock", side: "short", premium: K, qty });
        break;
      default:
        // ignore unknown rows
        break;
    }
  }
  return { legs };
}
