// components/Options/ChainTable.jsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { subscribeStatsCtx, snapshotStatsCtx } from "../Strategy/statsBus";

export default function ChainTable({
  symbol,
  currency,
  provider,
  groupBy,
  expiry,
  settings,        // row count / sort controls from the popover
  onToggleSort,    // header click toggles sort
}) {
  const [status, setStatus] = useState("idle"); // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);      // {spot, currency, expiry}
  const [rows, setRows] = useState([]);        // merged by strike: { strike, call, put, ivPct }
  const [expanded, setExpanded] = useState(null); // { strike, side: 'call'|'put' } | null

  // StatsRail context (days/basis/sigma/drift…)
  const [ctx, setCtx] = useState(() => (typeof window !== "undefined" ? snapshotStatsCtx() : null));
  useEffect(() => subscribeStatsCtx(setCtx), []);

  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const moneySign = (ccy) =>
    ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

  const effCurrency = meta?.currency || currency || "USD";
  const fmtMoney = (v, d = 2) =>
    Number.isFinite(v) ? `${moneySign(effCurrency)}${Number(v).toFixed(d)}` : "—";
  const fmtPct = (p, d = 2) => (Number.isFinite(p) ? `${(p * 100).toFixed(d)}%` : "—");

  // Settings — safe defaults
  const sortDir = (settings?.sort === "desc" ? "desc" : "asc");
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

  // --- helpers to mirror the month labeling from OptionsTab (Jan shows year, others don't)
  const monthLabel = (d) => {
    const m = d.toLocaleString(undefined, { month: "short" });
    return d.getMonth() === 0 ? `${m} ’${String(d.getFullYear()).slice(-2)}` : m;
  };

  // Pick the best YYYY-MM-DD from /api/expiries that matches { m, d } (fallback only)
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

  const pick = (x) => (Number.isFinite(x) ? x : null);

  // STRICT Mid: only when BOTH ask & bid exist; otherwise null (render "—")
  const strictMid = (ask, bid) => {
    const a = pick(ask), b = pick(bid);
    return a != null && b != null ? (a + b) / 2 : null;
  };

  const takeGreeks = (o) => ({
    delta: pick(o?.delta),
    gamma: pick(o?.gamma),
    theta: pick(o?.theta),
    vega:  pick(o?.vega),
    rho:   pick(o?.rho),
  });

  // Merge calls & puts by strike; compute center IV (%) as mid(callIV, putIV)
  const buildRows = (calls, puts) => {
    const byStrike = new Map();
    const add = (side, o) => {
      if (!Number.isFinite(o?.strike)) return;
      const k = Number(o.strike);
      if (!byStrike.has(k)) byStrike.set(k, { strike: k, call: null, put: null, ivPct: null });
      const row = byStrike.get(k);
      row[side] = {
        // NOTE: price = theoretical/model price (e.g., BS) from API if present
        price: pick(o.price),
        ask: pick(o.ask),
        bid: pick(o.bid),
        ivPct: pick(o.ivPct),
        greeks: takeGreeks(o),
      };
    };
    for (const c of calls || []) add("call", c);
    for (const p of puts || []) add("put", p);

    // finalize iv midpoint + compute strict mids
    const out = Array.from(byStrike.values());
    for (const r of out) {
      const cIV = r.call?.ivPct;
      const pIV = r.put?.ivPct;
      r.ivPct =
        Number.isFinite(cIV) && Number.isFinite(pIV)
          ? (cIV + pIV) / 2
          : (Number.isFinite(cIV) ? cIV : (Number.isFinite(pIV) ? pIV : null));
      if (r.call) r.call.mid = strictMid(r.call.ask, r.call.bid);
      if (r.put)  r.put.mid  = strictMid(r.put.ask,  r.put.bid);
    }

    return out.sort((a, b) => a.strike - b.strike);
  };

  // Load chain when symbol/expiry changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setMeta(null);
      setRows([]);
      setExpanded(null);

      if (!symbol || !expiry?.m || !expiry?.d) { setStatus("idle"); return; }
      if (provider && provider !== "api") { setStatus("idle"); return; } // not implemented yet

      setStatus("loading");

      // Prefer the ISO date provided by OptionsTab; if absent, fall back to resolver
      const isoFromTab = expiry?.iso || null;
      const dateISO = isoFromTab || (await resolveDate(symbol, expiry));

      if (!dateISO) {
        if (!cancelled) { setStatus("error"); setError("No chain for selected expiry."); }
        return;
      }

      try {
        const u = `/api/options?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(dateISO)}`;
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Fetch failed");

        const calls = Array.isArray(j?.data?.calls) ? j.data.calls : [];
        const puts  = Array.isArray(j?.data?.puts)  ? j.data.puts  : [];
        const m = j?.data?.meta || {};
        const mergedAsc = buildRows(calls, puts);

        if (cancelled) return;
        setMeta({ spot: pick(m.spot), currency: m.currency || currency, expiry: m.expiry || dateISO });
        setRows(mergedAsc);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Fetch failed");
        setStatus("error");
      }
    }
    load();
    return () => { cancelled = true; };
  }, [symbol, provider, expiry?.iso, expiry?.m, expiry?.d, currency]);

  /* ---------- ATM-centered window (ATM always included) ---------- */

  function selectAroundATM(sortedAsc, atmIndex, N) {
    const len = sortedAsc.length;
    if (!Number.isFinite(N) || N === Infinity || N >= len) return sortedAsc;

    let atm = Number.isFinite(atmIndex) && atmIndex >= 0 ? atmIndex : Math.floor(len / 2);

    const remaining = N - 1;
    let below = Math.floor(remaining / 2);
    let above = remaining - below;

    let start = atm - below;
    let end   = atm + above;

    if (start < 0) { end += -start; start = 0; }
    if (end > len - 1) { const overshoot = end - (len - 1); start = Math.max(0, start - overshoot); end = len - 1; }

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
    const centeredAsc = selectAroundATM(baseAsc, atmIdx, N);

    return (sortDir === "desc") ? [...centeredAsc].reverse() : centeredAsc;
  }, [rows, rowLimit, sortDir, meta?.spot]);

  const closestStrike = useMemo(() => {
    const spot = Number(meta?.spot);
    if (!rows?.length || !Number.isFinite(spot)) return null;
    let best = null, bestDiff = Infinity;
    for (const r of rows) {
      const d = Math.abs(Number(r?.strike) - spot);
      if (Number.isFinite(d) && d < bestDiff) { bestDiff = d; best = r?.strike ?? null; }
    }
    return best;
  }, [rows, meta?.spot]);

  const atmRow = useMemo(() => {
    if (closestStrike == null) return null;
    return rows.find((r) => Number(r?.strike) === Number(closestStrike)) || null;
  }, [rows, closestStrike]);

  const arrowChar = sortDir === "desc" ? "↓" : "↑";
  const ariaSort  = sortDir === "desc" ? "descending" : "ascending";

  const handleSortClick = (e) => { e.preventDefault(); onToggleSort?.(); };
  const handleSortKey   = (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSort?.(); }
  };

  // Shimmer row count
  const shimmerCount = useMemo(() => {
    if (rowLimit === Infinity) return 12;
    return Math.max(8, Math.min(14, rowLimit || 12));
  }, [rowLimit]);

  // open details for a specific side
  const openDetails = useCallback((strike, side) => {
    setExpanded((cur) => {
      if (!cur) return { strike, side };
      if (cur.strike === strike && cur.side === side) return null;     // toggle close
      return { strike, side };                                          // switch/open
    });
  }, []);

  const isOpen = (strike) => expanded && expanded.strike === strike;
  const focusSide = (strike) => (isOpen(strike) ? expanded.side : null);

  // ===== Math helpers (normal CDF & lognormal tools) =====
  function erf(x) {
    const sign = x < 0 ? -1 : 1;
    const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
    x = Math.abs(x);
    const t = 1/(1+p*x);
    const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
    return sign*y;
  }
  const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

  function metricsForOption({ type, pos, S0, K, premium, sigma, T, drift }) {
    // Guards
    if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !(sigma > 0) || !(T > 0)) {
      return { be: null, pop: null, expP: null, expR: null, sharpe: null };
    }

    const sqrtT = Math.sqrt(T);
    const sigSqrtT = sigma * sqrtT;

    // Break-even
    const BE = type === "call" ? (K + premium) : Math.max(1e-9, K - premium);

    // PoP via lognormal threshold
    const z = (Math.log(BE / S0) - (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const needsAbove = (type === "call" && pos === "long") || (type === "put" && pos === "short");
    const PoP = needsAbove ? (1 - Phi(z)) : Phi(z);

    // d~ with chosen drift (not risk-neutral unless drift = rf - q)
    const d1 = (Math.log(S0 / K) + (drift + 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const d2 = d1 - sigSqrtT;

    // Expected payoff under lognormal with selected drift
    const expST = Math.exp(drift * T); // factor for E[S_T] = S0 * exp(drift T)
    let Epay;
    if (type === "call") {
      Epay = S0 * expST * Phi(d1) - K * Phi(d2);
    } else {
      Epay = K * Phi(-d2) - S0 * expST * Phi(-d1);
    }

    // Second moment via truncated moments
    const dbar = (Math.log(S0 / K) + (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT); // P(S_T > K) = Phi(dbar)
    const PgtK = Phi(dbar);
    const PltK = 1 - PgtK;

    const E1_above = S0 * expST * Phi(d1);                 // E[S_T 1_{S>K}]
    const E2_above = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(d1 + sigSqrtT);  // E[S_T^2 1_{S>K}]
    const E1_below = S0 * expST * Phi(-d1);                // E[S_T 1_{S<K}]
    const E2_below = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(-(d1 + sigSqrtT)); // E[S_T^2 1_{S<K}]

    let E2pay;
    if (type === "call") {
      // E[(S-K)^2 1_{S>K}] = E[S^2 1_{>K}] - 2K E[S 1_{>K}] + K^2 P(S>K)
      E2pay = E2_above - 2*K*E1_above + K*K*PgtK;
    } else {
      // E[(K-S)^2 1_{S<K}] = K^2 P(S<K) - 2K E[S 1_{<K}] + E[S^2 1_{<K}]
      E2pay = K*K*PltK - 2*K*E1_below + E2_below;
    }
    const varPay = Math.max(0, E2pay - Epay*Epay);
    const sdPay = Math.sqrt(varPay);

    // Expected profit/return by position
    const expProfitLong  = Epay - premium;
    const expProfitShort = premium - Epay;
    const expProfit = pos === "long" ? expProfitLong : expProfitShort;

    const denom = Math.max(1e-12, premium);
    const expReturn = expProfit / denom;
    const sharpe = sdPay > 0 ? (expProfit / sdPay) : null;

    return { be: BE, pop: PoP, expP: expProfit, expR: expReturn, sharpe };
  }

  function daysToExpiryISO(iso, tz = "Europe/Rome") {
    if (!iso) return null;
    try {
      const endLocalString = new Date(`${iso}T23:59:59`).toLocaleString("en-US", { timeZone: tz });
      const end = new Date(endLocalString);
      const now = new Date();
      const d = Math.ceil((end.getTime() - now.getTime()) / 86400000);
      return Math.max(1, d);
    } catch { return null; }
  }

  // Derived context AFTER visible exists (avoid TDZ)
  const effDays = ctx?.days ?? daysToExpiryISO(meta?.expiry);
  const effBasis = ctx?.basis ?? 365;
  const T = Number.isFinite(effDays) ? Math.max(1, effDays) / effBasis : null;
  const fallbackSigma = Number.isFinite(atmRow?.ivPct) ? atmRow.ivPct / 100 : null;
  const sigma = Number.isFinite(ctx?.sigma) ? ctx.sigma : fallbackSigma;
  const drift = ctx?.driftMode === "CAPM"
    ? (Number(ctx?.muCapm) || 0)
    : ((Number(ctx?.rf) || 0) - (Number(ctx?.q) || 0));
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

        {/* Interactive Strike header */}
        <div
          className="mid cell strike-hdr"
          role="columnheader"
          aria-sort={ariaSort}
          tabIndex={0}
          onClick={handleSortClick}
          onKeyDown={handleSortKey}
          title="Toggle strike sort"
        >
          <span className="arrow" aria-hidden="true">{arrowChar}</span> Strike
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
              {/* Calls (left) */}
              <div className="c cell"><span className="skl w-70" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              {/* Center */}
              <div className="mid cell"><span className="skl w-50" /></div>
              <div className="mid cell"><span className="skl w-45" /></div>
              {/* Puts (right) */}
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
            const putMid  = r?.put?.mid  ?? null;
            const callPrem = (callMid ?? r?.call?.price ?? null);
            const putPrem  = (putMid ?? r?.put?.price  ?? null);

            // Compute metrics only when expanded (perf)
            let longMetrics = null, shortMetrics = null, beForChart = null, typeForChart = null, premForChart = null;
            if (open && S0 && T && sigma && Number.isFinite(r.strike)) {
              if (focus === "put") {
                typeForChart = "put"; premForChart = putPrem; beForChart = Number.isFinite(putPrem) ? Math.max(1e-9, r.strike - putPrem) : null;
                longMetrics  = Number.isFinite(putPrem) ? metricsForOption({ type:"put", pos:"long",  S0, K:r.strike, premium: putPrem, sigma, T, drift }) : null;
                shortMetrics = Number.isFinite(putPrem) ? metricsForOption({ type:"put", pos:"short", S0, K:r.strike, premium: putPrem, sigma, T, drift }) : null;
              } else {
                typeForChart = "call"; premForChart = callPrem; beForChart = Number.isFinite(callPrem) ? (r.strike + callPrem) : null;
                longMetrics  = Number.isFinite(callPrem) ? metricsForOption({ type:"call", pos:"long",  S0, K:r.strike, premium: callPrem, sigma, T, drift }) : null;
                shortMetrics = Number.isFinite(callPrem) ? metricsForOption({ type:"call", pos:"short", S0, K:r.strike, premium: callPrem, sigma, T, drift }) : null;
              }
            }

            return (
              <div key={r.strike}>
                <div
                  className={`grid row ${spotStrike ? "is-spot" : ""} ${open ? "is-open" : ""} ${focus ? `focus-${focus}` : ""}`}
                  role="row"
                  aria-expanded={open ? "true" : "false"}
                >
                  {/* Calls (left) — clicking any CALL cell focuses/open CALL side */}
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(r?.call?.price)}</div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(r?.call?.ask)}</div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(r?.call?.bid)}</div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(callMid)}</div>

                  {/* Center */}
                  <div className="mid cell val strike-val">{fmt(r.strike)}</div>
                  <div className="mid cell val iv-val">{fmt(r.ivPct, 2)}</div>

                  {/* Puts (right) — clicking any PUT cell focuses/open PUT side */}
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(putMid)}</div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(r?.put?.bid)}</div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(r?.put?.ask)}</div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(r?.put?.price)}</div>
                </div>

                {/* Expanded details */}
                <div className={`details ${open ? "open" : ""}`} role="region" aria-label={`Details for strike ${r.strike}`}>
                  <div className="details-inner">
                    {/* LEFT — SHORT */}
                    <div className="panel-col">
                      <div className="panel-head">
                        {focus === "put" ? "Short Put" : "Short Call"}
                      </div>
                      <div className="panel-grid">
                        <div className="chart" aria-hidden="true">
                          {/* legend chips */}
                          <div className="chart-legend">
                            <span className="chip chip-spot">Spot {fmtMoney(S0)}</span>
                            <span className="chip chip-strike">Strike {fmtMoney(r.strike)}</span>
                            {Number.isFinite(beForChart) && (
                              <span className="chip chip-be">BE {fmtMoney(beForChart)}</span>
                            )}
                          </div>
                          <MiniPL
                            S0={S0}
                            K={r.strike}
                            premium={premForChart}
                            type={typeForChart}
                            pos="short"
                            BE={beForChart}
                            sigma={sigma}
                            T={T}
                            drift={drift}
                          />
                        </div>
                        <div className="metrics">
                          <Metric label="Break-even"       value={fmtMoney(shortMetrics?.be)} />
                          <Metric label="Prob. Profit"     value={fmtPct(shortMetrics?.pop)} />
                          <Metric label="Expected Return"  value={fmtPct(shortMetrics?.expR)} />
                          <Metric label="Expected Profit"  value={fmtMoney(shortMetrics?.expP)} />
                          <Metric label="Sharpe"           value={fmt(shortMetrics?.sharpe, 2)} />
                          {showGreeks && (
                            <div className="greeks">
                              {focus === "put"
                                ? <GreekList greeks={r?.put?.greeks} />
                                : <GreekList greeks={r?.call?.greeks} />
                              }
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT — LONG */}
                    <div className="panel-col">
                      <div className="panel-head">
                        {focus === "put" ? "Long Put" : "Long Call"}
                      </div>
                      <div className="panel-grid">
                        <div className="chart" aria-hidden="true">
                          {/* legend chips */}
                          <div className="chart-legend">
                            <span className="chip chip-spot">Spot {fmtMoney(S0)}</span>
                            <span className="chip chip-strike">Strike {fmtMoney(r.strike)}</span>
                            {Number.isFinite(beForChart) && (
                              <span className="chip chip-be">BE {fmtMoney(beForChart)}</span>
                            )}
                          </div>
                          <MiniPL
                            S0={S0}
                            K={r.strike}
                            premium={premForChart}
                            type={typeForChart}
                            pos="long"
                            BE={beForChart}
                            sigma={sigma}
                            T={T}
                            drift={drift}
                          />
                        </div>
                        <div className="metrics">
                          <Metric label="Break-even"       value={fmtMoney(longMetrics?.be)} />
                          <Metric label="Prob. Profit"     value={fmtPct(longMetrics?.pop)} />
                          <Metric label="Expected Return"  value={fmtPct(longMetrics?.expR)} />
                          <Metric label="Expected Profit"  value={fmtMoney(longMetrics?.expP)} />
                          <Metric label="Sharpe"           value={fmt(longMetrics?.sharpe, 2)} />
                          {showGreeks && (
                            <div className="greeks">
                              {focus === "put"
                                ? <GreekList greeks={r?.put?.greeks} />
                                : <GreekList greeks={r?.call?.greeks} />
                              }
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .wrap{
          --strikeCol: #F2AE2E;
          --ivCol:     #F27405;
          --rowHover: color-mix(in srgb, var(--text, #0f172a) 10%, transparent);
          --spotOrange: #f59e0b;

          --sk-base: color-mix(in srgb, var(--text, #0f172a) 12%, var(--surface, #f7f9fc));
          --sk-sheen: color-mix(in srgb, #ffffff 40%, transparent);

          margin-top:10px;
        }

        .heads{
          display:flex; align-items:center; justify-content:space-between;
          margin: 10px 0 6px;
        }
        .h-left, .h-right{
          font-weight:800; font-size:22px; letter-spacing:.2px;
          color: var(--text, #0f172a);
        }
        .h-mid{ flex:1; }

        /* 10 columns: 4 (calls) + 2 (center) + 4 (puts)  */
        .grid{
          display:grid;
          grid-template-columns:
            minmax(84px,1fr) minmax(84px,1fr) minmax(84px,1fr) minmax(84px,1fr)
            112px 86px
            minmax(84px,1fr) minmax(84px,1fr) minmax(84px,1fr) minmax(84px,1fr);
          gap: 6px 14px;
          align-items:center;
        }

        .head-row{
          padding: 8px 0 10px;
          border-top:1px solid var(--border, #E6E9EF);
          border-bottom:1px solid var(--border, #E6E9EF);
          font-weight:700; font-size:13.5px;
          color: var(--text, #2b3442);
        }

        .head-row .strike-hdr{
          color: var(--strikeCol);
          font-weight:800; letter-spacing:.01em;
          cursor: pointer; user-select: none;
          border-radius: 8px;
        }
        .head-row .strike-hdr:focus{
          outline: 2px solid color-mix(in srgb, var(--strikeCol) 60%, transparent);
          outline-offset: 2px;
        }
        .head-row .iv-hdr{
          color: var(--ivCol);
          font-weight:800; letter-spacing:.01em;
        }

        .cell{ height:26px; display:flex; align-items:center; }
        .c{ justify-content:center; text-align:center; }
        .p{ justify-content:center; text-align:center; }
        .mid{ justify-content:center; text-align:center; }
        .arrow{ margin-right:6px; font-weight:900; color: currentColor; }

        .card{
          border:1px solid var(--border, #E6E9EF);
          border-radius:14px;
          background: var(--card, #fff);
          color: var(--text, #0f172a);
          padding:16px 18px;
          margin-top:14px;
        }
        .title{ font-weight:800; font-size:16px; margin-bottom:4px; }
        .sub{ opacity:.75; font-size:13px; }

        .body .row{
          padding: 8px 0;
          border-bottom:1px solid color-mix(in srgb, var(--border, #E6E9EF) 86%, transparent);
          transition: background-color .18s ease, box-shadow .18s ease;
        }
        .clickable{ cursor: pointer; }
        .body .row:last-child{ border-bottom:0; }
        .body .row:hover{ background-color: var(--rowHover); }
        .body .row.is-spot{
          background-color: color-mix(in srgb, var(--spotOrange) 20%, transparent);
          border-bottom-color: color-mix(in srgb, var(--spotOrange) 45%, var(--border));
        }

        .val{ font-weight:700; font-size:13.5px; color: var(--text, #0f172a); }
        .body .row .strike-val{ color: var(--strikeCol); }
        .body .row .iv-val{     color: var(--ivCol); }

        /* Focus highlighting per side (only the side the user clicked) */
        .body .row.is-open.focus-call .c.cell{
          background: color-mix(in srgb, var(--text, #0f172a) 12%, transparent);
          border-radius: 8px;
        }
        .body .row.is-open.focus-put .p.cell{
          background: color-mix(in srgb, var(--text, #0f172a) 12%, transparent);
          border-radius: 8px;
        }

        /* Expanded panel */
        .details{
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transform: translateY(-4px);
          transition: max-height .30s ease, opacity .30s ease, transform .30s ease;
          border-bottom:1px solid transparent;
        }
        .details.open{
          max-height: 700px;
          opacity: 1;
          transform: translateY(0);
          border-bottom-color: color-mix(in srgb, var(--border, #0b1220) 86%, transparent);
        }

        /* Premium container */
        .details-inner{
          padding: 18px 14px 20px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          background: linear-gradient(180deg, #0a0c12, #090b10 40%, #080a0e);
          border-radius: 16px;
          box-shadow:
            0 24px 60px rgba(0,0,0,.35),
            0 1px 0 rgba(255,255,255,.03) inset;
        }

        /* Dark cards */
        .panel-col{
          display:flex; flex-direction:column; gap:14px;
          padding: 14px;
          border:1px solid #1a2030;
          border-radius:14px;
          background: radial-gradient(120% 140% at 30% -10%, rgba(255,255,255,.04), transparent 60%), #0b0d12;
          box-shadow:
            0 8px 18px rgba(0,0,0,.35),
            0 1px 0 rgba(255,255,255,.02) inset;
          transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
        }
        .panel-col:hover{
          transform: translateY(-1px);
          border-color:#273047;
          box-shadow:
            0 10px 22px rgba(0,0,0,.40),
            0 1px 0 rgba(255,255,255,.03) inset;
        }
        .panel-head{ font-weight:800; font-size:15px; opacity:.95; letter-spacing:.2px; }

        /* Bigger chart */
        .panel-grid{ display:grid; grid-template-rows: 220px auto; gap:14px; }

        /* Chart surface */
        .chart{
          position: relative;
          border-radius:12px;
          background: #0b0f17;
          box-shadow: inset 0 0 0 1px #171d2b, inset 0 -30px 50px rgba(0,0,0,.35);
          overflow: hidden;
        }

        /* Legend chips inside chart */
        .chart-legend{
          position:absolute; top:8px; left:8px; display:flex; gap:8px; flex-wrap:wrap; z-index:2;
        }
        .chip{
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 12px; font-weight:700;
          letter-spacing:.1px;
          background: #0e1422;
          border:1px solid #1c263b;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .chip-spot{ color:#93c5fd; border-color:#223152; }
        .chip-strike{ color:#fbbf24; border-color:#3b2c12; }
        .chip-be{ color:#34d399; border-color:#113428; }

        /* Metrics + value pills */
        .metrics{ display:grid; grid-template-columns: 1fr 1fr; gap:14px 18px; }
        .metric{ display:flex; align-items:center; justify-content:space-between; gap:16px; }
        .metric .k{ opacity:.78; font-size:13px; }
        .pill{
          padding: 6px 10px;
          min-width: 88px;
          text-align: right;
          border-radius: 999px;
          font-weight:800; font-size:14px; font-variant-numeric: tabular-nums;
          background:#0f1421; color:#e5e7eb;
          border:1px solid #1b2335;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
          transition: transform .12s ease, background .12s ease, border-color .12s ease;
        }
        .pill:hover{ transform: translateY(-1px); }
        .pill.pos{ background: color-mix(in srgb, #10b981 22%, #0f1421); border-color:#134e40; color:#dbffe9; }
        .pill.neg{ background: color-mix(in srgb, #ef4444 20%, #0f1421); border-color:#4a1010; color:#ffe1e1; }
        .pill.neutral{}

        /* Greeks row */
        .greeks{ grid-column: 1 / -1; margin-top: 2px;
          display:grid; grid-template-columns: repeat(5, minmax(90px,1fr)); gap:8px; }
        .greek{
          font-size:12px; opacity:.9; display:flex; align-items:center; justify-content:center;
          border:1px solid #1a2030; border-radius:9px; padding:6px 8px; background:#0c1019;
        }

        /* ---------- Shimmer styles ---------- */
        .is-loading .row:hover{ background: transparent; }

        .skl{
          display:inline-block;
          height: 14px;
          border-radius: 8px;
          background: var(--sk-base);
          position: relative;
          overflow: hidden;
        }
        .skl::after{
          content:"";
          position:absolute; inset:0;
          transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, var(--sk-sheen), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .w-45{ width:45%; } .w-50{ width:50%; } .w-60{ width:60%; }
        .w-70{ width:70%; }

        @keyframes shimmer{ 100% { transform: translateX(100%); } }

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:20px; }
          .head-row{ font-size:13px; }
          .cell{ height:24px; }
          .val{ font-size:13px; }
          .details-inner{ grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

/* ---------- Small presentational helpers (with value pills) ---------- */
function Metric({ label, value }) {
  const tone = useMemo(() => {
    if (value == null || value === "—") return "neutral";
    const raw = String(value).replace(/[,\s$€£¥%]/g, "");
    const num = Number(raw);
    if (!Number.isFinite(num)) return "neutral";
    const lower = label.toLowerCase();

    if (lower.includes("prob")) return num >= 50 ? "pos" : "neg"; // 50% threshold
    if (lower.includes("return") || lower.includes("profit")) return num >= 0 ? "pos" : "neg";
    if (lower.includes("sharpe")) return num >= 0 ? "pos" : "neg";
    return "neutral";
  }, [label, value]);

  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className={`pill ${tone}`}>{value ?? "—"}</span>
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
function fmtG(v){ return Number.isFinite(v) ? Number(v).toFixed(2) : "—"; }

/* ---------- Mini payoff chart with profit/loss fill + density + tooltip ---------- */
function MiniPL({ S0, K, premium, type, pos, BE, sigma, T, drift }) {
  const [tip, setTip] = useState(null); // {x, y, price, pdf}

  if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !type || !pos) {
    return <span className="chart-hint">Chart</span>;
  }

  const xmin = Math.max(0, S0 * 0.4);
  const xmax = S0 * 1.8;
  const W = 520, H = 220, pad = 14;

  // sample payoff points
  const N = 140;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const s = xmin + (i / N) * (xmax - xmin);
    const intrinsic = type === "call" ? Math.max(s - K, 0) : Math.max(K - s, 0);
    const p = pos === "long" ? (intrinsic - premium) : (premium - intrinsic);
    pts.push([s, p]);
  }
  const ys = pts.map((p) => p[1]);
  const yMin = Math.min(...ys, -premium * 1.3);
  const yMax = Math.max(...ys, premium * 1.3);

  const xmap = (s) => pad + ((s - xmin) / (xmax - xmin)) * (W - 2 * pad);
  const ymap = (p) => H - pad - ((p - yMin) / (yMax - yMin)) * (H - 2 * pad);
  const yZero = ymap(0);

  // build payoff line path + profit/loss area paths
  const screenPts = pts.map(([s, p]) => ({ x: xmap(s), y: ymap(p), p, s }));
  let dLine = "";
  let dPos = "", dNeg = "";
  let cur = null, xStart = null;
  for (let i = 0; i < screenPts.length; i++) {
    const { x, y, p } = screenPts[i];
    dLine += `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)} `;

    const sign = p >= 0 ? "pos" : "neg";
    if (cur == null) {
      cur = sign; xStart = x;
      if (cur === "pos") dPos += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
      else dNeg += `M ${x.toFixed(1)} ${y.toFixed(1)} `;
      continue;
    }

    const prev = screenPts[i - 1];
    if ((p >= 0 && cur === "pos") || (p < 0 && cur === "neg")) {
      if (cur === "pos") dPos += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
      else dNeg += `L ${x.toFixed(1)} ${y.toFixed(1)} `;
    } else {
      // sign change — compute intersection with y=0
      const t = (0 - prev.p) / (p - prev.p);
      const xInt = prev.x + t * (x - prev.x);
      const yInt = yZero;

      if (cur === "pos") {
        dPos += `L ${xInt.toFixed(1)} ${yInt.toFixed(1)} L ${xInt.toFixed(1)} ${yZero.toFixed(1)} L ${xStart.toFixed(1)} ${yZero.toFixed(1)} Z `;
      } else {
        dNeg += `L ${xInt.toFixed(1)} ${yInt.toFixed(1)} L ${xInt.toFixed(1)} ${yZero.toFixed(1)} L ${xStart.toFixed(1)} ${yZero.toFixed(1)} Z `;
      }

      // new segment
      cur = sign; xStart = xInt;
      if (cur === "pos") { dPos += `M ${xInt.toFixed(1)} ${yInt.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} `; }
      else { dNeg += `M ${xInt.toFixed(1)} ${yInt.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)} `; }
    }
  }
  // close last segment to baseline
  const last = screenPts[screenPts.length - 1];
  if (cur === "pos") dPos += `L ${last.x.toFixed(1)} ${yZero.toFixed(1)} L ${xStart.toFixed(1)} ${yZero.toFixed(1)} Z `;
  if (cur === "neg") dNeg += `L ${last.x.toFixed(1)} ${yZero.toFixed(1)} L ${xStart.toFixed(1)} ${yZero.toFixed(1)} Z `;

  // density (lognormal pdf) as a thin yellow line
  let dDen = "";
  if (Number.isFinite(sigma) && Number.isFinite(T) && T > 0 && sigma > 0) {
    const mu = Math.log(S0) + (Number(drift) - 0.5 * sigma * sigma) * T;
    const v = sigma * sigma * T;
    const pdf = (s) => (1 / (s * Math.sqrt(2 * Math.PI * v))) *
      Math.exp(-Math.pow(Math.log(s) - mu, 2) / (2 * v));
    // sample & scale
    const M = 160;
    const den = [];
    let maxPdf = 0;
    for (let i = 0; i <= M; i++) {
      const s = xmin + (i / M) * (xmax - xmin);
      const y = pdf(s);
      if (y > maxPdf) maxPdf = y;
      den.push([s, y]);
    }
    const scale = 0.60; // use 60% of drawable height
    for (let i = 0; i < den.length; i++) {
      const [s, y] = den[i];
      const x = xmap(s);
      const yy = pad + (H - 2 * pad) * (1 - (y / maxPdf) * scale);
      dDen += `${i ? "L" : "M"} ${x.toFixed(1)} ${yy.toFixed(1)} `;
    }
  }

  const strikeX = xmap(K);
  const beX = Number.isFinite(BE) ? xmap(BE) : null;
  const spotX = xmap(S0);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const clamped = Math.max(pad, Math.min(W - pad, px));
    const s = xmin + ((clamped - pad) / (W - 2 * pad)) * (xmax - xmin);

    let pdfVal = null;
    if (Number.isFinite(sigma) && Number.isFinite(T) && T > 0 && sigma > 0) {
      const mu = Math.log(S0) + (Number(drift) - 0.5 * sigma * sigma) * T;
      const v = sigma * sigma * T;
      pdfVal = (1 / (s * Math.sqrt(2 * Math.PI * v))) *
        Math.exp(-Math.pow(Math.log(s) - mu, 2) / (2 * v));
    }
    setTip({ x: clamped, y: pad + 8, price: s, pdf: pdfVal });
  };

  return (
    <div className="pl-root" onMouseMove={handleMove} onMouseLeave={() => setTip(null)}>
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {/* profit / loss background fills */}
        <path d={dPos} fill="rgba(34,197,94,.18)" />
        <path d={dNeg} fill="rgba(239,68,68,.16)" />

        {/* zero line */}
        <line x1={pad} y1={yZero} x2={W-pad} y2={yZero} stroke="#9ca3af" opacity="0.18" />

        {/* payoff line */}
        <path d={dLine} fill="none" stroke="#e5e7eb" strokeWidth="1.6" />

        {/* vertical guides */}
        <line x1={strikeX} y1={pad} x2={strikeX} y2={H-pad} stroke="#fbbf24" strokeWidth="1" opacity=".9" />
        {Number.isFinite(beX) && <line x1={beX} y1={pad} x2={beX} y2={H-pad} stroke="#34d399" strokeWidth="1" opacity=".9" />}
        <line x1={spotX} y1={pad} x2={spotX} y2={H-pad} stroke="#93c5fd" strokeWidth="1" opacity=".95" />

        {/* density curve */}
        {dDen && <path d={dDen} fill="none" stroke="rgba(250,204,21,.9)" strokeWidth="1.5" opacity=".9" />}
      </svg>

      {/* tooltip (optional) */}
      {tip && (
        <div className="tooltip" style={{ left: tip.x, top: tip.y }}>
          <div className="tt-line">
            <span className="tt-k">Price</span>
            <span className="tt-v">${tip.price.toFixed(2)}</span>
          </div>
          {Number.isFinite(tip.pdf) && (
            <div className="tt-line">
              <span className="tt-k">Density</span>
              <span className="tt-v">{tip.pdf.toExponential(2)}</span>
            </div>
          )}
        </div>
      )}

      <style jsx>{`
        .pl-root{ position:relative; width:100%; height:100%; }
        .tooltip{
          position:absolute; transform: translate(-50%, -100%);
          background:#0b0f17; border:1px solid #1a2030; border-radius:10px;
          padding:8px 10px; font-size:12px; font-weight:700; color:#e5e7eb;
          box-shadow: 0 8px 18px rgba(0,0,0,.35);
          pointer-events:none; min-width:120px;
        }
        .tt-line{ display:flex; justify-content:space-between; gap:12px; }
        .tt-k{ opacity:.75; }
        .tt-v{ font-variant-numeric: tabular-nums; }
      `}</style>
    </div>
  );
}
