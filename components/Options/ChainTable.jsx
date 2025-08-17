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
} from "lib/quant";

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
  groupBy,
  expiry,
  settings, // row count / sort controls from the popover
  onToggleSort, // header click toggles sort
}) {
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

  // Month label helper (Jan shows year)
  const monthLabel = (d) => {
    const m = d.toLocaleString(undefined, { month: "short" });
    return d.getMonth() === 0 ? `${m} ’${String(d.getFullYear()).slice(-2)}` : m;
  };

  // Date fallback resolver (YYYY-MM-DD)
  async function resolveDate(sym, sel) {
    if (!sym || !sel?.m || !sel?.d) return null;
    try {
      const r = await fetch(`/api/expiries?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
      const j = await r.json();
      const list = Array.isArray(j?.expiries) ? j.expiries : [];
      const matches = list.filter((s) => {
        const d = new Date(s);
        if (!Number.isFinite(d.getTime())) return false;
        return monthLabel(d) === sel.m && d.getDate() === sel.d;
      });
      if (!matches.length) return null;
      const now = Date.now();
      matches.sort((a, b) => Math.abs(new Date(a) - now) - Math.abs(new Date(b) - now));
      return matches[0];
    } catch {
      return null;
    }
  }

  // STRICT mid (only if both sides exist)
  const strictMid = (ask, bid) => {
    const a = pick(ask), b = pick(bid);
    return a != null && b != null ? (a + b) / 2 : null;
  };

  const takeGreeks = (o) => ({
    delta: pick(o?.delta),
    gamma: pick(o?.gamma),
    theta: pick(o?.theta),
    vega: pick(o?.vega),
    rho: pick(o?.rho),
  });

  // Merge calls & puts by strike; compute center IV midpoint
  const buildRows = (calls, puts) => {
    const byStrike = new Map();
    const add = (side, o) => {
      if (!Number.isFinite(o?.strike)) return;
      const k = Number(o.strike);
      if (!byStrike.has(k))
        byStrike.set(k, { strike: k, call: null, put: null, ivPct: null });
      const row = byStrike.get(k);
      row[side] = {
        price: pick(o.price),
        ask: pick(o.ask),
        bid: pick(o.bid),
        ivPct: pick(o.ivPct),
        greeks: takeGreeks(o),
      };
    };
    for (const c of calls || []) add("call", c);
    for (const p of puts || []) add("put", p);

    const out = Array.from(byStrike.values());
    for (const r of out) {
      const cIV = r.call?.ivPct, pIV = r.put?.ivPct;
      r.ivPct =
        Number.isFinite(cIV) && Number.isFinite(pIV)
          ? (cIV + pIV) / 2
          : Number.isFinite(cIV)
          ? cIV
          : Number.isFinite(pIV)
          ? pIV
          : null;
      if (r.call) r.call.mid = strictMid(r.call.ask, r.call.bid);
      if (r.put) r.put.mid = strictMid(r.put.ask, r.put.bid);
    }
    return out.sort((a, b) => a.strike - b.strike);
  };

  // Fetch chain
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      setMeta(null);
      setRows([]);
      setExpanded(null);
      if (!symbol || !expiry?.m || !expiry?.d) {
        setStatus("idle");
        return;
      }
      if (provider && provider !== "api") {
        setStatus("idle");
        return;
      }

      setStatus("loading");
      const isoFromTab = expiry?.iso || null;
      const dateISO = isoFromTab || (await resolveDate(symbol, expiry));
      if (!dateISO) {
        if (!cancelled) {
          setStatus("error");
          setError("No chain for selected expiry.");
        }
        return;
      }

      try {
        const u = `/api/options?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(dateISO)}`;
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Fetch failed");
        const calls = Array.isArray(j?.data?.calls) ? j.data.calls : [];
        const puts = Array.isArray(j?.data?.puts) ? j.data.puts : [];
        const m = j?.data?.meta || {};
        const mergedAsc = buildRows(calls, puts);
        if (cancelled) return;
        setMeta({
          spot: pick(m.spot),
          currency: m.currency || currency,
          expiry: m.expiry || dateISO,
        });
        setRows(mergedAsc);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Fetch failed");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol, provider, expiry?.iso, expiry?.m, expiry?.d, currency]);

  /* ---------- visible rows centered around ATM ---------- */
  function selectAroundATM(sortedAsc, atmIndex, N) {
    const len = sortedAsc.length;
    if (!Number.isFinite(N) || N === Infinity || N >= len) return sortedAsc;
    let atm = Number.isFinite(atmIndex) && atmIndex >= 0 ? atmIndex : Math.floor(len / 2);

    const remaining = N - 1;
    let below = Math.floor(remaining / 2);
    let above = remaining - below;

    let start = atm - below;
    let end = atm + above;

    if (start < 0) {
      end += -start;
      start = 0;
    }
    if (end > len - 1) {
      const over = end - (len - 1);
      start = Math.max(0, start - over);
      end = len - 1;
    }

    return sortedAsc.slice(start, end + 1);
  }

  const visible = useMemo(() => {
    if (!rows?.length) return [];
    const baseAsc = rows;
    const spot = Number(meta?.spot);
    let atmIdx = null;
    if (Number.isFinite(spot)) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < baseAsc.length; i++) {
        const d = Math.abs(baseAsc[i].strike - spot);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      atmIdx = bestI;
    }
    const N = rowLimit === Infinity ? baseAsc.length : Math.max(1, rowLimit);
    const centered = selectAroundATM(baseAsc, atmIdx, N);
    return sortDir === "desc" ? [...centered].reverse() : centered;
  }, [rows, rowLimit, sortDir, meta?.spot]);

  const closestStrike = useMemo(() => {
    const spot = Number(meta?.spot);
    if (!rows?.length || !Number.isFinite(spot)) return null;
    let best = null, bestDiff = Infinity;
    for (const r of rows) {
      const d = Math.abs(Number(r?.strike) - spot);
      if (Number.isFinite(d) && d < bestDiff) {
        bestDiff = d;
        best = r?.strike ?? null;
      }
    }
    return best;
  }, [rows, meta?.spot]);

  const arrowChar = sortDir === "desc" ? "↓" : "↑";
  const ariaSort = sortDir === "desc" ? "descending" : "ascending";
  const handleSortClick = (e) => { e.preventDefault(); onToggleSort?.(); };
  const handleSortKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSort?.(); } };

  // shimmer skeleton length
  const shimmerCount = useMemo(
    () => (rowLimit === Infinity ? 12 : Math.max(8, Math.min(14, rowLimit || 12))),
    [rowLimit]
  );

  // Expansion / focus
  const openDetails = useCallback((strike, side) => {
    setExpanded((cur) => {
      if (!cur) return { strike, side };
      if (cur.strike === strike && cur.side === side) return null;
      return { strike, side };
    });
  }, []);
  const isOpen = (strike) => expanded && expanded.strike === strike;
  const focusSide = (strike) => (isOpen(strike) ? expanded.side : null);

  /* ---------- metrics via centralized hub ---------- */
  function metricsForOption({ type, pos, S0, K, premium, sigma, T, drift }) {
    // guards
    if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !(sigma > 0) || !(T > 0)) {
      return { be: null, pop: null, expP: null, expR: null, sharpe: null, ep: null, el: null, eX: null };
    }

    // All heavy lifting in the hub:
    const be = breakEven({ type, K, premium });
    const pop = probOfProfit({ type, pos, S0, K, premium, sigma, T, drift });

    const expP = expectedProfit({ type, pos, S0, K, premium, sigma, T, drift });
    const ep   = expectedGain({ type, pos, S0, K, premium, sigma, T, drift });
    const el   = expectedLoss({ type, pos, S0, K, premium, sigma, T, drift });

    const sd   = stdevPayoff({ type, S0, K, sigma, T, drift }); // payoff stdev (pos/short share the same)
    const expR = isNum(expP) && premium > 0 ? expP / premium : null;
    const sharpe = isNum(sd) && sd > 0 ? expP / sd : null;

    return { be, pop, expP, expR, sharpe, ep, el, eX: expP };
  }

  function daysToExpiryISO(iso, tz = "Europe/Rome") {
    if (!iso) return null;
    try {
      const endLocalString = new Date(`${iso}T23:59:59`).toLocaleString("en-US", { timeZone: tz });
      const end = new Date(endLocalString);
      const now = new Date();
      const d = Math.ceil((end.getTime() - now.getTime()) / 86400000);
      return Math.max(1, d);
    } catch {
      return null;
    }
  }

  // Effective time & drift from StatsRail context
  const effDays = ctx?.days ?? daysToExpiryISO(meta?.expiry);
  const effBasis = ctx?.basis ?? 365;
  const T = Number.isFinite(effDays) ? Math.max(1, effDays) / effBasis : null;
  const sigma =
    ctx?.sigma ??
    (Number.isFinite(visible?.[0]?.ivPct) ? visible[0].ivPct / 100 : null);
  const drift =
    ctx?.driftMode === "CAPM"
      ? Number(ctx?.muCapm) || 0
      : (Number(ctx?.rf) || 0) - (Number(ctx?.q) || 0);
  const S0 = Number(meta?.spot) || Number(ctx?.spot) || null;

  return (
    <div className="wrap" aria-live="polite">
      <div className="heads">
        <div className="h-left">Calls</div>
        <div className="h-mid" />
        <div className="h-right">Puts</div>
      </div>

      {/* Column headers */}
      <div className="grid head-row" role="row">
        <div className="c cell" role="columnheader">Price</div>
        <div className="c cell" role="columnheader">Ask</div>
        <div className="c cell" role="columnheader">Bid</div>
        <div className="c cell" role="columnheader">Mid</div>
        <div
          className="mid cell strike-hdr"
          role="columnheader"
          aria-sort={ariaSort}
          tabIndex={0}
          onClick={handleSortClick}
          onKeyDown={handleSortKey}
          title="Toggle strike sort"
        >
          <span className="arrow" aria-hidden="true">{arrowChar}</span>{" "}
          Strike
        </div>
        <div className="mid cell iv-hdr" role="columnheader">IV, %</div>
        <div className="p cell" role="columnheader">Mid</div>
        <div className="p cell" role="columnheader">Bid</div>
        <div className="p cell" role="columnheader">Ask</div>
        <div className="p cell" role="columnheader">Price</div>
      </div>

      {/* States */}
      {status === "idle" && (
        <div className="card">
          <div className="title">No options loaded</div>
          <div className="sub">
            Pick a provider or upload a screenshot, then choose an expiry
            {expiry?.m && expiry?.d ? ` (e.g., ${expiry.m} ${expiry.d})` : ""}.
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="card">
          <div className="title">Couldn’t load options</div>
          <div className="sub">{error || "Unknown error"}</div>
        </div>
      )}

      {/* Loading shimmer */}
      {status === "loading" && (
        <div className="body is-loading" aria-busy="true" aria-label="Loading options">
          {Array.from({ length: shimmerCount }).map((_, i) => (
            <div className="grid row" role="row" aria-hidden="true" key={i}>
              <div className="c cell"><span className="skl w-70" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              <div className="mid cell"><span className="skl w-50" /></div>
              <div className="mid cell"><span className="skl w-45" /></div>
              <div className="p cell"><span className="skl w-60" /></div>
              <div className="p cell"><span className="skl w-60" /></div>
              <div className="p cell"><span className="skl w-60" /></div>
              <div className="p cell"><span className="skl w-70" /></div>
            </div>
          ))}
        </div>
      )}

      {/* Rows */}
      {status === "ready" && (
        <div className="body">
          {visible.map((r) => {
            const spotStrike = closestStrike != null && Number(r.strike) === Number(closestStrike);
            const open = isOpen(r.strike);
            const focus = focusSide(r.strike); // 'call' | 'put' | null

            const callMid = r?.call?.mid ?? null;
            const putMid = r?.put?.mid ?? null;
            const callPrem = callMid ?? r?.call?.price ?? null;
            const putPrem = putMid ?? r?.put?.price ?? null;

            let longM = null, shortM = null, typeForChart = null, premForChart = null;

            if (open && S0 && T && sigma && Number.isFinite(r.strike)) {
              if (focus === "put") {
                typeForChart = "put";
                premForChart = putPrem;
                longM = isNum(putPrem)
                  ? metricsForOption({ type: "put", pos: "long", S0, K: r.strike, premium: putPrem, sigma, T, drift })
                  : null;
                shortM = isNum(putPrem)
                  ? metricsForOption({ type: "put", pos: "short", S0, K: r.strike, premium: putPrem, sigma, T, drift })
                  : null;
              } else {
                typeForChart = "call";
                premForChart = callPrem;
                longM = isNum(callPrem)
                  ? metricsForOption({ type: "call", pos: "long", S0, K: r.strike, premium: callPrem, sigma, T, drift })
                  : null;
                shortM = isNum(callPrem)
                  ? metricsForOption({ type: "call", pos: "short", S0, K: r.strike, premium: callPrem, sigma, T, drift })
                  : null;
              }
            }

            // analytic guides for legend (independent of pos)
            const mu = drift;
            const [ciL, ciU] =
              isNum(S0) && isNum(mu) && isNum(sigma) && isNum(T)
                ? hubCI95({ S0, mu, sigma, T })
                : [null, null];
            const meanMC =
              isNum(S0) && isNum(mu) && isNum(T)
                ? hubMean({ S0, mu, T })
                : null;

            return (
              <div key={r.strike}>
                <div
                  className={`grid row ${spotStrike ? "is-spot" : ""} ${open ? "is-open" : ""} ${focus ? `focus-${focus}` : ""}`}
                  role="row"
                  aria-expanded={open ? "true" : "false"}
                >
                  {/* Calls (left) */}
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>
                    {fmtMoney(r?.call?.price)}
                  </div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>
                    {fmtMoney(r?.call?.ask)}
                  </div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>
                    {fmtMoney(r?.call?.bid)}
                  </div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>
                    {fmtMoney(callMid)}
                  </div>

                  {/* Center */}
                  <div className="mid cell val strike-val">{fmt(r.strike)}</div>
                  <div className="mid cell val iv-val">{fmt(r.ivPct, 2)}</div>

                  {/* Puts (right) */}
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>
                    {fmtMoney(putMid)}
                  </div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>
                    {fmtMoney(r?.put?.bid)}
                  </div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>
                    {fmtMoney(r?.put?.ask)}
                  </div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>
                    {fmtMoney(r?.put?.price)}
                  </div>
                </div>

                {/* Expanded panel */}
                <div className={`details ${open ? "open" : ""}`} role="region" aria-label={`Details for strike ${r.strike}`}>
                  <div className="details-inner chain-metrics">
                    {/* SHORT */}
                    <div className="panel-col">
                      <div className="panel-head">{focus === "put" ? "Short Put" : "Short Call"}</div>
                      <div className="panel-grid">
                        <div className="chart" aria-hidden="true">
                          <MiniPL
                            S0={S0}
                            K={r.strike}
                            premium={premForChart}
                            type={typeForChart}
                            pos="short"
                            BE={shortM?.be ?? null}
                            sigma={sigma}
                            T={T}
                            mu={mu}
                            showLegend
                          />
                        </div>
                        <div className="opt-metrics">
                          {/* Row 1 */}
                          <Metric label="Break-even" value={fmtMoney(shortM?.be)} />
                          <Metric label="P(Profit)" value={fmtPct(shortM?.pop)} num={(shortM?.pop ?? null) - 0.5} />
                          {/* Row 2 — E[Profit] + E[Loss] side by side */}
                          <Metric label="E[Profit]" value={fmtMoney(shortM?.expP)} num={shortM?.expP} />
                          <Metric
                            label="E[Loss]"
                            value={fmtMoney(shortM?.el)}
                            num={isNum(shortM?.el) ? -shortM.el : null}  // force red tone
                          />
                          {/* Row 3 */}
                          <Metric label="E[Return]" value={fmtPct(shortM?.expR)} num={shortM?.expR} />
                          <Metric label="Sharpe" value={fmt(shortM?.sharpe, 2)} num={shortM?.sharpe} />
                          {/* Context */}
                          <Metric label="Spot Price" value={fmtMoney(S0)} />
                          <Metric label="MC(S)" value={fmtMoney(meanMC)} />
                          <Metric label="95% CI" value={`${fmtMoney(ciL)} — ${fmtMoney(ciU)}`} compact />

                          {/* Consistency note (short) */}
                          {(() => {
                            const rnMode = ctx?.driftMode !== "CAPM";
                            const tol = Math.max(0.01, Math.abs(premForChart ?? 0) * 0.02); // ≥ 1c or ~2% of premium

                            const epPlus = shortM?.ep;                 // E[X⁺]
                            const eLoss  = shortM?.el;                 // E[X⁻] (positive)
                            const eNet   = shortM?.eX ?? shortM?.expP; // E[X]

                            const idDiff = (isNum(epPlus) && isNum(eLoss) && isNum(eNet))
                              ? Math.abs((epPlus - eLoss) - eNet)
                              : null;

                            // Risk-neutral price from hub (if available)
                            let rnDiff = null;
                            if (rnMode && isNum(S0) && isNum(r.strike) && isNum(sigma) && isNum(T) && isNum(premForChart) && typeof bsCall === "function" && typeof bsPut === "function") {
                              const rRate = Number(ctx?.rf) || 0;
                              const qRate = Number(ctx?.q) || 0;
                              const priceRN = typeForChart === "call"
                                ? bsCall(S0, r.strike, rRate, qRate, sigma, T)
                                : bsPut(S0, r.strike, rRate, qRate, sigma, T);
                              rnDiff = Math.abs(priceRN - premForChart);
                            }

                            const showNote =
                              (idDiff != null && idDiff > tol) ||
                              (rnDiff != null && rnDiff > tol);

                            if (!showNote) return null;

                            return (
                              <div className="consistency">
                                <span>⚠︎ Consistency</span>
                                {idDiff != null && idDiff > tol && (
                                  <span>EP − EL vs E[X]: {fmtMoney(idDiff)}</span>
                                )}
                                {rnDiff != null && rnDiff > tol && (
                                  <span>RN price vs mid: {fmtMoney(rnDiff)}</span>
                                )}
                              </div>
                            );
                          })()}

                          {showGreeks && (
                            <div className="greeks">
                              {focus === "put" ? (
                                <GreekList greeks={r?.put?.greeks} />
                              ) : (
                                <GreekList greeks={r?.call?.greeks} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* LONG */}
                    <div className="panel-col">
                      <div className="panel-head">{focus === "put" ? "Long Put" : "Long Call"}</div>
                      <div className="panel-grid">
                        <div className="chart" aria-hidden="true">
                          <MiniPL
                            S0={S0}
                            K={r.strike}
                            premium={premForChart}
                            type={typeForChart}
                            pos="long"
                            BE={longM?.be ?? null}
                            sigma={sigma}
                            T={T}
                            mu={mu}
                            showLegend
                          />
                        </div>
                        <div className="opt-metrics">
                          {/* Row 1 */}
                          <Metric label="Break-even" value={fmtMoney(longM?.be)} />
                          <Metric label="P(Profit)" value={fmtPct(longM?.pop)} num={(longM?.pop ?? null) - 0.5} />
                          {/* Row 2 — E[Profit] + E[Loss] side by side */}
                          <Metric label="E[Profit]" value={fmtMoney(longM?.expP)} num={longM?.expP} />
                          <Metric
                            label="E[Loss]"
                            value={fmtMoney(longM?.el)}
                            num={isNum(longM?.el) ? -longM.el : null}   // force red tone
                          />
                          {/* Row 3 */}
                          <Metric label="E[Return]" value={fmtPct(longM?.expR)} num={longM?.expR} />
                          <Metric label="Sharpe" value={fmt(longM?.sharpe, 2)} num={longM?.sharpe} />
                          {/* Context */}
                          <Metric label="Spot Price" value={fmtMoney(S0)} />
                          <Metric label="MC(S)" value={fmtMoney(meanMC)} />
                          <Metric label="95% CI" value={`${fmtMoney(ciL)} — ${fmtMoney(ciU)}`} compact />

                          {/* Consistency note (long) */}
                          {(() => {
                            const rnMode = ctx?.driftMode !== "CAPM";
                            const tol = Math.max(0.01, Math.abs(premForChart ?? 0) * 0.02);

                            const epPlus = longM?.ep;
                            const eLoss  = longM?.el;
                            const eNet   = longM?.eX ?? longM?.expP;

                            const idDiff = (isNum(epPlus) && isNum(eLoss) && isNum(eNet))
                              ? Math.abs((epPlus - eLoss) - eNet)
                              : null;

                            let rnDiff = null;
                            if (rnMode && isNum(S0) && isNum(r.strike) && isNum(sigma) && isNum(T) && isNum(premForChart) && typeof bsCall === "function" && typeof bsPut === "function") {
                              const rRate = Number(ctx?.rf) || 0;
                              const qRate = Number(ctx?.q) || 0;
                              const priceRN = typeForChart === "call"
                                ? bsCall(S0, r.strike, rRate, qRate, sigma, T)
                                : bsPut(S0, r.strike, rRate, qRate, sigma, T);
                              rnDiff = Math.abs(priceRN - premForChart);
                            }

                            const showNote =
                              (idDiff != null && idDiff > tol) ||
                              (rnDiff != null && rnDiff > tol);

                            if (!showNote) return null;

                            return (
                              <div className="consistency">
                                <span>⚠︎ Consistency</span>
                                {idDiff != null && idDiff > tol && (
                                  <span>EP − EL vs E[X]: {fmtMoney(idDiff)}</span>
                                )}
                                {rnDiff != null && rnDiff > tol && (
                                  <span>RN price vs mid: {fmtMoney(rnDiff)}</span>
                                )}
                              </div>
                            );
                          })()}

                          {showGreeks && (
                            <div className="greeks">
                              {focus === "put" ? (
                                <GreekList greeks={r?.put?.greeks} />
                              ) : (
                                <GreekList greeks={r?.call?.greeks} />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* /Expanded panel */}
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .wrap {
          --strikeCol: #f2ae2e;
          --ivCol: #f27405;
          --rowHover: color-mix(in srgb, var(--text) 8%, transparent);
          --spotOrange: #f59e0b;
          margin-top: 14px;
        }

        .heads {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 12px 0 8px;
        }
        .h-left, .h-right {
          font-weight: 800;
          font-size: 22px;
          letter-spacing: 0.2px;
          color: var(--text);
          opacity: 0.9;
        }
        .h-mid { flex: 1; }

        /* grid: 10 columns */
        .grid {
          display: grid;
          grid-template-columns:
            minmax(84px, 1fr) minmax(84px, 1fr) minmax(84px, 1fr) minmax(84px, 1fr)
            112px 86px
            minmax(84px, 1fr) minmax(84px, 1fr) minmax(84px, 1fr) minmax(84px, 1fr);
          gap: 6px 14px;
          align-items: center;
        }

        .head-row {
          padding: 10px 0 12px;
          border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          font-weight: 700;
          font-size: 13.5px;
          color: color-mix(in srgb, var(--text) 80%, transparent);
        }
        .head-row .strike-hdr {
          color: var(--strikeCol);
          font-weight: 800;
          letter-spacing: 0.01em;
          cursor: pointer;
          user-select: none;
          border-radius: 8px;
        }
        .head-row .strike-hdr:focus {
          outline: 2px solid color-mix(in srgb, var(--strikeCol) 60%, transparent);
          outline-offset: 2px;
        }
        .head-row .iv-hdr {
          color: var(--ivCol);
          font-weight: 800;
          letter-spacing: 0.01em;
        }

        .cell {
          height: 26px;
          display: flex;
          align-items: center;
        }
        .c, .p, .mid { justify-content: center; text-align: center; }
        .arrow { margin-right: 6px; font-weight: 900; }

        .card {
          border: 0;
          border-radius: 16px;
          background:
            radial-gradient(
              1200px 400px at 20% -20%,
              color-mix(in srgb, var(--text) 6%, transparent),
              transparent 40%
            ),
            var(--card);
          color: var(--text);
          padding: 20px 22px;
          margin-top: 16px;
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.18),
            inset 0 1px 0 color-mix(in srgb, var(--text) 4%, transparent);
        }
        .title { font-weight: 800; font-size: 16px; margin-bottom: 4px; }
        .sub { opacity: 0.75; font-size: 13px; }

        .body .row {
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
          transition: background-color 0.18s ease, box-shadow 0.18s ease;
        }
        .clickable { cursor: pointer; }
        .body .row:last-child { border-bottom: 0; }
        .body .row:hover { background-color: var(--rowHover); }
        .body .row.is-spot {
          background-color: color-mix(in srgb, var(--spotOrange) 16%, transparent);
          border-bottom-color: color-mix(in srgb, var(--spotOrange) 45%, var(--border));
        }

        .val { font-weight: 700; font-size: 13.5px; color: var(--text); }
        .body .row .strike-val { color: var(--strikeCol); }
        .body .row .iv-val { color: var(--ivCol); }

        .body .row.is-open.focus-call .c.cell,
        .body .row.is-open.focus-put .p.cell {
          background: color-mix(in srgb, var(--text) 4%, transparent);
          border-radius: 8px;
        }

        /* Expanded details */
        .details {
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transform: translateY(-4px);
          transition: max-height 0.28s ease, opacity 0.28s ease, transform 0.28s ease;
          border-bottom: 1px solid transparent;
        }
        .details.open {
          max-height: 820px;
          opacity: 1;
          transform: translateY(0);
          border-bottom-color: var(--border);
        }

        /* transparent wrapper */
        .details-inner {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          background: transparent !important;
          box-shadow: none !important;
          border: 0 !important;
          border-radius: 0;
          padding: 0;
        }

        .panel-col {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 18px; /* a touch more space moved from chart to card */
          border: 0;
          border-radius: 14px;
          background:
            linear-gradient(180deg,
              color-mix(in srgb, var(--text) 2%, transparent),
              transparent
            ),
            var(--card);
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18),
            inset 0 1px 0 color-mix(in srgb, var(--text) 4%, transparent);
        }
        .panel-head { font-weight: 800; font-size: 18px; color: var(--text); }

        .panel-grid {
          display: grid;
          grid-template-rows: 260px auto;
          gap: 14px;
        }

        .chart {
          position: relative;
          border-radius: 12px;
          background:
            radial-gradient(
              1400px 600px at -10% -30%,
              color-mix(in srgb, var(--accent) 12%, transparent),
              transparent 40%
            ),
            var(--surface);
          box-shadow: none;
          overflow: hidden;
        }

        .legend {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 8px 10px 12px;
          color: color-mix(in srgb, var(--text) 80%, transparent);
          font-size: 12px;
          font-weight: 700;
        }
        .li { display: flex; gap: 8px; align-items: center; }
        .dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; }
        .dot.blue { background: #60a5fa; }
        .dot.pink { background: #f472b6; }
        .dot.be { background: #10b981; }
        .dash { width: 18px; height: 0; border-top: 2px dotted #f5a7cf; display: inline-block; }

        .legend .legendBtn {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 0;
          color: var(--text);
          font-weight: 800;
          font-size: 16px;
          line-height: 30px;
          background: var(--surface-soft);
          box-shadow: 0 2px 10px rgba(0,0,0,.2),
            inset 0 1px 0 color-mix(in srgb, var(--text) 6%, transparent);
          backdrop-filter: blur(6px);
          cursor: pointer;
        }

        /* namespaced metric pills */
        .opt-metrics {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 22px;
        }
        .opt-metric {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-width: 0;
        }
        .opt-label {
          color: color-mix(in srgb, var(--text) 88%, transparent);
          opacity: 0.9;
          font-size: 16px;
          font-weight: 600;
          white-space: nowrap;
        }
        .opt-pill {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          background: var(--chip-bg);
          border: 1px solid var(--chip-border);
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 15px;
          line-height: 1;
          color: var(--text);
          min-width: 84px;
          max-width: 100%;
          text-align: right;
          backdrop-filter: blur(4px);
          white-space: nowrap;
        }
        .opt-pill.compact {
          font-size: 13px;
          padding: 6px 10px;
          letter-spacing: 0;
        }
        .opt-pill.pos {
          color: var(--positive);
          background: color-mix(in srgb, var(--positive) 12%, var(--chip-bg));
          border-color: color-mix(in srgb, var(--positive) 32%, var(--chip-border));
        }
        .opt-pill.neg {
          color: var(--negative);
          background: color-mix(in srgb, var(--negative) 12%, var(--chip-bg));
          border-color: color-mix(in srgb, var(--negative) 28%, var(--chip-border));
        }
        .opt-pill.neu {
          color: color-mix(in srgb, var(--text) 90%, transparent);
        }

        .greeks {
          grid-column: 1 / -1;
          margin-top: 4px;
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }
        .greek {
          font-size: 12px;
          opacity: 0.95;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--chip-border);
          border-radius: 10px;
          padding: 6px 8px;
          color: var(--text);
          background: var(--chip-bg);
        }

        /* Subtle note for math checks */
        .consistency{
          grid-column: 1 / -1;
          margin-top: 2px;
          font-size: 12px;
          color: color-mix(in srgb, var(--text) 70%, transparent);
          display: flex;
          gap: 10px;
          align-items: center;
        }

        /* Loading shimmer */
        .is-loading .row:hover { background: transparent; }
        .skl {
          display: inline-block;
          height: 14px;
          border-radius: 8px;
          background: color-mix(in srgb, var(--text) 8%, transparent);
          position: relative;
          overflow: hidden;
        }
        .skl::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-100%);
          background: linear-gradient(
            90deg,
            transparent,
            color-mix(in srgb, var(--text) 35%, transparent),
            transparent
          );
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .w-45 { width: 45%; }
        .w-50 { width: 50%; }
        .w-60 { width: 60%; }
        .w-70 { width: 70%; }
        @keyframes shimmer { 100% { transform: translateX(100%); } }

        @media (max-width: 980px) {
          .panel-grid { grid-template-rows: 220px auto; }
          .details-inner { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

/* ---------- Metric pill (boxed, auto tone: pos/neg/neutral) ---------- */
function Metric({ label, value, num, compact = false }) {
  let tone = "neu";
  if (Number.isFinite(num)) tone = num > 0 ? "pos" : num < 0 ? "neg" : "neu";
  return (
    <div className="opt-metric">
      <span className="opt-label">{label}</span>
      <span className={`opt-pill ${tone} ${compact ? "compact" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}

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
  if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !type || !pos || !(sigma > 0) || !(T > 0)) {
    return (
      <span
        className="chart-hint"
        style={{ padding: 12, color: "color-mix(in srgb, var(--text) 70%, transparent)" }}
      >
        Chart
      </span>
    );
  }

  const uid = useId().replace(/:/g, "");
  const aboveId = `above-${uid}`;
  const belowId = `below-${uid}`;

  // base window centered at BE (or S0)
  const centerPx = Number.isFinite(BE) ? BE : S0;
  const baseSpan = 0.4 * (S0 || K) + 0.2 * Math.abs((S0 || 0) - (K || 0));
  const [zoom, setZoom] = React.useState(1);
  const span0 = baseSpan / zoom;
  let xmin = Math.max(0.01, centerPx - span0);
  let xmax = centerPx + span0;

  // analytic mean & 95% CI from hub
  const [ciL, ciU] = hubCI95({ S0, mu, sigma, T });
  const meanPrice = hubMean({ S0, mu, T });

  // ensure lines stay inside final domain
  xmin = Math.min(xmin, S0, meanPrice, ciL) * 0.995;
  xmax = Math.max(xmax, S0, meanPrice, ciU) * 1.005;

  // sizing
  const W = 520, H = 250, pad = 12;
  const xmap = (s) => pad + ((s - xmin) / (xmax - xmin)) * (W - 2 * pad);

  // payoff samples
  const N = 160;
  const xs = Array.from({ length: N + 1 }, (_, i) => xmin + (i / N) * (xmax - xmin));
  const pay = xs.map((s) => {
    if (type === "call") {
      const intr = Math.max(s - K, 0);
      return pos === "long" ? intr - premium : premium - intr;
    }
    const intr = Math.max(K - s, 0);
    return pos === "long" ? intr - premium : premium - intr;
  });

  const yMin = Math.min(...pay, -premium * 1.35);
  const yMax = Math.max(...pay, premium * 1.35);
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
  const xMean = xmap(meanPrice);
  const xBE = Number.isFinite(BE) ? xmap(BE) : null;
  const xL = xmap(ciL);
  const xU = xmap(ciU);

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
        <line x1={xMean} y1={pad} x2={xMean} y2={H - pad} stroke="#f472b6" strokeWidth="1.2" opacity="0.95" />
        <line x1={xL} y1={pad} x2={xL} y2={H - pad} stroke="#f5a7cf" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.9" />
        <line x1={xU} y1={pad} x2={xU} y2={H - pad} stroke="#f5a7cf" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.9" />
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
