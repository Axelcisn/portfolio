// components/Options/ChainTable.jsx
"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { subscribeStatsCtx, snapshotStatsCtx } from "../Strategy/statsBus";

/* ---------- tiny utils ---------- */
const isNum = (x) => Number.isFinite(x);
const pick = (x) => (isNum(x) ? x : null);
const moneySign = (ccy) => (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$");

/* erf / Phi for PoP and PDF math */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x);
  return sign * y;
}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

export default function ChainTable({
  symbol,
  currency,
  provider,
  groupBy,
  expiry,
  settings,        // row count / sort controls from the popover
  onToggleSort,    // header click toggles sort
}) {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);      // { spot, currency, expiry }
  const [rows, setRows] = useState([]);        // merged by strike
  const [expanded, setExpanded] = useState(null); // { strike, side:'call'|'put' } | null

  // StatsRail (days/basis/sigma/drift…)
  const [ctx, setCtx] = useState(() => (typeof window !== "undefined" ? snapshotStatsCtx() : null));
  useEffect(() => {
    const unsub = subscribeStatsCtx(setCtx);
    return typeof unsub === "function" ? unsub : () => {};
  }, []);

  const fmt = (v, d = 2) => (isNum(v) ? Number(v).toFixed(d) : "—");
  const effCurrency = meta?.currency || currency || "USD";
  const fmtMoney = (v, d = 2) => (isNum(v) ? `${moneySign(effCurrency)}${Number(v).toFixed(d)}` : "—");
  const fmtPct   = (p, d = 2) => (isNum(p) ? `${(p * 100).toFixed(d)}%` : "—");
  const fmtRange = (a, b) => (isNum(a) && isNum(b) ? `${fmtMoney(a,2)} – ${fmtMoney(b,2)}` : "—");

  // Settings — safe defaults
  const sortDir  = settings?.sort === "desc" ? "desc" : "asc";
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
        if (!isNum(d.getTime())) return false;
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
    vega:  pick(o?.vega),
    rho:   pick(o?.rho),
  });

  // Merge calls & puts by strike; compute center IV midpoint
  const buildRows = (calls, puts) => {
    const byStrike = new Map();
    const add = (side, o) => {
      if (!isNum(o?.strike)) return;
      const k = Number(o.strike);
      if (!byStrike.has(k)) byStrike.set(k, { strike: k, call: null, put: null, ivPct: null });
      const row = byStrike.get(k);
      row[side] = {
        price: pick(o.price),
        ask:   pick(o.ask),
        bid:   pick(o.bid),
        ivPct: pick(o.ivPct),
        greeks: takeGreeks(o),
      };
    };
    for (const c of calls || []) add("call", c);
    for (const p of puts  || []) add("put", p);

    const out = Array.from(byStrike.values());
    for (const r of out) {
      const cIV = r.call?.ivPct, pIV = r.put?.ivPct;
      r.ivPct = isNum(cIV) && isNum(pIV) ? (cIV + pIV) / 2 : isNum(cIV) ? cIV : isNum(pIV) ? pIV : null;
      if (r.call) r.call.mid = strictMid(r.call.ask, r.call.bid);
      if (r.put)  r.put.mid  = strictMid(r.put.ask,  r.put.bid);
    }
    return out.sort((a, b) => a.strike - b.strike);
  };

  // Fetch chain
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null); setMeta(null); setRows([]); setExpanded(null);
      if (!symbol || !expiry?.m || !expiry?.d) { setStatus("idle"); return; }
      if (provider && provider !== "api")       { setStatus("idle"); return; }

      setStatus("loading");
      const isoFromTab = expiry?.iso || null;
      const dateISO = isoFromTab || (await resolveDate(symbol, expiry));
      if (!dateISO) {
        if (!cancelled){ setStatus("error"); setError("No chain for selected expiry."); }
        return;
      }

      try {
        const u = `/api/options?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(dateISO)}`;
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Fetch failed");
        const calls = Array.isArray(j?.data?.calls) ? j.data.calls : [];
        const puts  = Array.isArray(j?.data?.puts)  ? j.data.puts  : [];
        const m     = j?.data?.meta || {};
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
    })();
    return () => { cancelled = true; };
  }, [symbol, provider, expiry?.iso, expiry?.m, expiry?.d, currency]);

  /* ---------- visible rows centered around ATM ---------- */
  function selectAroundATM(sortedAsc, atmIndex, N) {
    const len = sortedAsc.length;
    if (!isNum(N) || N === Infinity || N >= len) return sortedAsc;
    let atm = isNum(atmIndex) && atmIndex >= 0 ? atmIndex : Math.floor(len / 2);

    const remaining = N - 1;
    let below = Math.floor(remaining / 2);
    let above = remaining - below;

    let start = atm - below;
    let end   = atm + above;

    if (start < 0) { end += -start; start = 0; }
    if (end > len - 1) { const over = end - (len - 1); start = Math.max(0, start - over); end = len - 1; }

    return sortedAsc.slice(start, end + 1);
  }

  const visible = useMemo(() => {
    if (!rows?.length) return [];
    const baseAsc = rows;
    const spot = Number(meta?.spot);
    let atmIdx = null;
    if (isNum(spot)) {
      let bestI = 0, bestD = Infinity;
      for (let i = 0; i < baseAsc.length; i++) {
        const d = Math.abs(baseAsc[i].strike - spot);
        if (d < bestD) { bestD = d; bestI = i; }
      }
      atmIdx = bestI;
    }
    const N = rowLimit === Infinity ? baseAsc.length : Math.max(1, rowLimit);
    const centered = selectAroundATM(baseAsc, atmIdx, N);
    return (sortDir === "desc") ? [...centered].reverse() : centered;
  }, [rows, rowLimit, sortDir, meta?.spot]);

  const closestStrike = useMemo(() => {
    const spot = Number(meta?.spot);
    if (!rows?.length || !isNum(spot)) return null;
    let best = null, bestDiff = Infinity;
    for (const r of rows) {
      const d = Math.abs(Number(r?.strike) - spot);
      if (isNum(d) && d < bestDiff) { bestDiff = d; best = r?.strike ?? null; }
    }
    return best;
  }, [rows, meta?.spot]);

  const arrowChar = sortDir === "desc" ? "↓" : "↑";
  const ariaSort  = sortDir === "desc" ? "descending" : "ascending";
  const handleSortClick = (e) => { e.preventDefault(); onToggleSort?.(); };
  const handleSortKey   = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleSort?.(); } };

  const shimmerCount = useMemo(() => (rowLimit === Infinity ? 12 : Math.max(8, Math.min(14, rowLimit || 12))), [rowLimit]);

  // Expansion / focus
  const openDetails = useCallback((strike, side) => {
    setExpanded((cur) => {
      if (!cur) return { strike, side };
      if (cur.strike === strike && cur.side === side) return null;
      return { strike, side };
    });
  }, []);
  const isOpen    = (strike) => expanded && expanded.strike === strike;
  const focusSide = (strike) => (isOpen(strike) ? expanded.side : null);

  /* ---------- metrics math (PoP, BE, ER, EP, Sharpe) ---------- */
  function metricsForOption({ type, pos, S0, K, premium, sigma, T, drift }) {
    if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !(sigma > 0) || !(T > 0)) {
      return { be: null, pop: null, expP: null, expR: null, sharpe: null };
    }
    const sqrtT = Math.sqrt(T), sigSqrtT = sigma * sqrtT;

    // Break-even
    const BE = type === "call" ? (K + premium) : Math.max(1e-9, K - premium);

    // PoP via lognormal threshold
    const z = (Math.log(BE / S0) - (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const needsAbove = (type === "call" && pos === "long") || (type === "put" && pos === "short");
    const PoP = needsAbove ? (1 - Phi(z)) : Phi(z);

    // d~ with chosen drift
    const d1 = (Math.log(S0 / K) + (drift + 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const d2 = d1 - sigSqrtT;

    const expST = Math.exp(drift * T);
    let Epay;
    if (type === "call")      Epay = S0 * expST * Phi(d1) - K * Phi(d2);
    else /* put */            Epay = K * Phi(-d2) - S0 * expST * Phi(-d1);

    // variance via truncated moments
    const dbar = (Math.log(S0 / K) + (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const PgtK = Phi(dbar), PltK = 1 - PgtK;
    const E1_above = S0 * expST * Phi(d1);
    const E2_above = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(d1 + sigSqrtT);
    const E1_below = S0 * expST * Phi(-d1);
    const E2_below = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(-(d1 + sigSqrtT));
    const E2pay = (type === "call")
      ? (E2_above - 2*K*E1_above + K*K*PgtK)
      : (K*K*PltK - 2*K*E1_below + E2_below);
    const varPay = Math.max(0, E2pay - Epay*Epay);
    const sdPay  = Math.sqrt(varPay);

    const expProfit = (pos === "long") ? (Epay - premium) : (premium - Epay);
    const expReturn = expProfit / Math.max(1e-12, premium);
    const sharpe    = sdPay > 0 ? (expProfit / sdPay) : null;

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

  // Effective time & drift from StatsRail context
  const effDays = ctx?.days ?? daysToExpiryISO(meta?.expiry);
  const effBasis = ctx?.basis ?? 365;
  const T = isNum(effDays) ? Math.max(1, effDays) / effBasis : null;
  const sigma = ctx?.sigma ?? (isNum(visible?.[0]?.ivPct) ? visible[0].ivPct / 100 : null);
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
        <div
          className="mid cell strike-hdr"
          role="columnheader"
          aria-sort={sortDir === "desc" ? "descending" : "ascending"}
          tabIndex={0}
          onClick={handleSortClick}
          onKeyDown={handleSortKey}
          title="Toggle strike sort"
        >
          <span className="arrow" aria-hidden="true">{sortDir === "desc" ? "↓" : "↑"}</span> Strike
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
            const open  = isOpen(r.strike);
            const focus = focusSide(r.strike); // 'call' | 'put' | null

            const callMid = r?.call?.mid ?? null;
            const putMid  = r?.put?.mid  ?? null;
            const callPrem = (callMid ?? r?.call?.price ?? null);
            const putPrem  = (putMid  ?? r?.put?.price  ?? null);

            let longM = null, shortM = null, beForChart = null, typeForChart = null, premForChart = null;
            if (open && S0 && T && sigma && isNum(r.strike)) {
              if (focus === "put") {
                typeForChart = "put"; premForChart = putPrem; beForChart = isNum(putPrem) ? Math.max(1e-9, r.strike - putPrem) : null;
                longM  = isNum(putPrem) ? metricsForOption({ type:"put",  pos:"long",  S0, K:r.strike, premium: putPrem, sigma, T, drift }) : null;
                shortM = isNum(putPrem) ? metricsForOption({ type:"put",  pos:"short", S0, K:r.strike, premium: putPrem, sigma, T, drift }) : null;
              } else {
                typeForChart = "call"; premForChart = callPrem; beForChart = isNum(callPrem) ? (r.strike + callPrem) : null;
                longM  = isNum(callPrem) ? metricsForOption({ type:"call", pos:"long",  S0, K:r.strike, premium: callPrem, sigma, T, drift }) : null;
                shortM = isNum(callPrem) ? metricsForOption({ type:"call", pos:"short", S0, K:r.strike, premium: callPrem, sigma, T, drift }) : null;
              }
            }

            // ✅ compute 95% CI & mean for legend/metrics
            const haveMonte = isNum(S0) && isNum(sigma) && isNum(T);
            const m = haveMonte ? Math.log(S0) + (Number(drift) - 0.5 * sigma * sigma) * T : null;
            const v = haveMonte ? sigma * Math.sqrt(T) : null;
            const sL = haveMonte ? Math.exp(m - 1.96 * v) : null;
            const sH = haveMonte ? Math.exp(m + 1.96 * v) : null;
            const meanPrice = haveMonte ? S0 * Math.exp(Number(drift) * T) : null;

            return (
              <div key={r.strike}>
                <div
                  className={`grid row ${spotStrike ? "is-spot" : ""} ${open ? "is-open" : ""} ${focus ? `focus-${focus}` : ""}`}
                  role="row"
                  aria-expanded={open ? "true" : "false"}
                >
                  {/* Calls */}
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(r?.call?.price)}</div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(r?.call?.ask)}</div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(r?.call?.bid)}</div>
                  <div className="c cell val clickable" onClick={() => openDetails(r.strike, "call")}>{fmtMoney(callMid)}</div>

                  {/* Center */}
                  <div className="mid cell val strike-val">{fmt(r.strike)}</div>
                  <div className="mid cell val iv-val">{fmt(r.ivPct, 2)}</div>

                  {/* Puts */}
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(putMid)}</div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(r?.put?.bid)}</div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(r?.put?.ask)}</div>
                  <div className="p cell val clickable" onClick={() => openDetails(r.strike, "put")}>{fmtMoney(r?.put?.price)}</div>
                </div>

                {/* Expanded panel */}
                <div className={`details ${open ? "open" : ""}`} role="region" aria-label={`Details for strike ${r.strike}`}>
                  <div className="details-inner">
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
                            BE={beForChart}
                            mu={drift}
                            sigma={sigma}
                            T={T}
                            sL={sL} sH={sH} meanPrice={meanPrice} // ✅ pass legend/CI data
                          />
                        </div>

                        <div className="metrics">
                          {/* ✅ pills with tone, plus extra lines (Current, CI, Mean) */}
                          <Metric label="Current Price" value={fmtMoney(S0)} tone="neu" />
                          <Metric label="95% CI (MC)" value={fmtRange(sL, sH)} tone="neu" />

                          <Metric label="Mean (MC)" value={fmtMoney(meanPrice)} tone="neu" />
                          <Metric label="Break-even" value={fmtMoney(shortM?.be)} tone="neu" />

                          <Metric label="Prob. Profit" value={fmtPct(shortM?.pop)} num={(shortM?.pop ?? 0) - 0.5} />
                          <Metric label="Expected Return" value={fmtPct(shortM?.expR)} num={shortM?.expR} />
                          <Metric label="Expected Profit" value={fmtMoney(shortM?.expP)} num={shortM?.expP} />
                          <Metric label="Sharpe" value={fmt(shortM?.sharpe, 2)} num={shortM?.sharpe} />

                          {showGreeks && (
                            <div className="greeks">
                              {(focus === "put")
                                ? <GreekList greeks={r?.put?.greeks} />
                                : <GreekList greeks={r?.call?.greeks} />
                              }
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
                            BE={beForChart}
                            mu={drift}
                            sigma={sigma}
                            T={T}
                            sL={sL} sH={sH} meanPrice={meanPrice} // ✅ pass legend/CI data
                          />
                        </div>

                        <div className="metrics">
                          <Metric label="Current Price" value={fmtMoney(S0)} tone="neu" />
                          <Metric label="95% CI (MC)" value={fmtRange(sL, sH)} tone="neu" />

                          <Metric label="Mean (MC)" value={fmtMoney(meanPrice)} tone="neu" />
                          <Metric label="Break-even" value={fmtMoney(longM?.be)} tone="neu" />

                          <Metric label="Prob. Profit" value={fmtPct(longM?.pop)} num={(longM?.pop ?? 0) - 0.5} />
                          <Metric label="Expected Return" value={fmtPct(longM?.expR)} num={longM?.expR} />
                          <Metric label="Expected Profit" value={fmtMoney(longM?.expP)} num={longM?.expP} />
                          <Metric label="Sharpe" value={fmt(longM?.sharpe, 2)} num={longM?.sharpe} />

                          {showGreeks && (
                            <div className="greeks">
                              {(focus === "put")
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
          --rowHover: color-mix(in srgb, #e5e7eb 8%, transparent);
          --spotOrange: #f59e0b;

          --panelBg: #0b0f14;
          --panelEdge: #121821;

          margin-top:10px;
        }

        .heads{
          display:flex; align-items:center; justify-content:space-between;
          margin: 10px 0 6px;
        }
        .h-left, .h-right{
          font-weight:800; font-size:22px; letter-spacing:.2px;
          color: #e8eaee;
        }
        .h-mid{ flex:1; }

        /* grid: 10 columns */
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
          border-top:1px solid var(--panelEdge);
          border-bottom:1px solid var(--panelEdge);
          font-weight:700; font-size:13.5px;
          color: #c9d1dc;
        }
        .head-row .strike-hdr{
          color: var(--strikeCol);
          font-weight:800; letter-spacing:.01em;
          cursor:pointer; user-select:none; border-radius:8px;
        }
        .head-row .strike-hdr:focus{
          outline:2px solid color-mix(in srgb, var(--strikeCol) 60%, transparent);
          outline-offset:2px;
        }
        .head-row .iv-hdr{
          color: var(--ivCol);
          font-weight:800; letter-spacing:.01em;
        }

        .cell{ height:26px; display:flex; align-items:center; }
        .c,.p,.mid{ justify-content:center; text-align:center; }
        .arrow{ margin-right:6px; font-weight:900; }

        .card{
          border:1px solid var(--panelEdge);
          border-radius:16px;
          background: radial-gradient(1200px 400px at 20% -20%, rgba(255,255,255,.06), transparent 40%), var(--panelBg);
          color:#e6e8eb;
          padding:18px 20px; margin-top:14px;
          box-shadow: 0 12px 24px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .title{ font-weight:800; font-size:16px; margin-bottom:4px; }
        .sub{ opacity:.75; font-size:13px; }

        .body .row{
          padding: 8px 0;
          border-bottom:1px solid color-mix(in srgb, var(--panelEdge) 86%, transparent);
          transition: background-color .18s ease, box-shadow .18s ease;
        }
        .clickable{ cursor:pointer; }
        .body .row:last-child{ border-bottom:0; }
        .body .row:hover{ background-color: var(--rowHover); }
        .body .row.is-spot{
          background-color: color-mix(in srgb, var(--spotOrange) 16%, transparent);
          border-bottom-color: color-mix(in srgb, var(--spotOrange) 45%, var(--panelEdge));
        }

        .val{ font-weight:700; font-size:13.5px; color:#e8eaee; }
        .body .row .strike-val{ color: var(--strikeCol); }
        .body .row .iv-val{     color: var(--ivCol); }

        .body .row.is-open.focus-call .c.cell,
        .body .row.is-open.focus-put  .p.cell{
          background: rgba(255,255,255,.04);
          border-radius: 8px;
        }

        /* Expanded panel */
        .details{
          overflow:hidden; max-height:0; opacity:0; transform: translateY(-4px);
          transition: max-height .28s ease, opacity .28s ease, transform .28s ease;
          border-bottom:1px solid transparent;
        }
        .details.open{
          max-height: 760px; opacity:1; transform: translateY(0);
          border-bottom-color: color-mix(in srgb, var(--panelEdge) 86%, transparent);
        }
        .details-inner{
          padding: 18px 12px 22px;
          display:grid; grid-template-columns: 1fr 1fr; gap:16px;

          /* ✅ Apple-like frosted surface for container */
          background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.00));
          border-radius: 16px;
          box-shadow: 0 22px 48px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .panel-col{
          display:flex; flex-direction:column; gap:12px;
          /* ❌ remove visible borders from the box container */
          border:0;
          /* ✅ Apple-style button/card finish */
          padding: 14px;
          border-radius:14px;
          background:
            radial-gradient(120% 140% at 10% -20%, rgba(255,255,255,.06), transparent 60%),
            #0c1117;
          box-shadow:
            0 24px 48px rgba(0,0,0,.35),
            0 3px 8px rgba(0,0,0,.25),
            inset 0 0 0 1px rgba(255,255,255,.03);
        }
        .panel-head{ font-weight:800; font-size:18px; color:#f5f7fa; }

        .panel-grid{ display:grid; grid-template-rows: 250px auto; gap:14px; }
        .chart{
          position:relative;
          border-radius:14px;
          /* ❌ no visible border */
          border:0;
          /* ✅ softer, Apple-y backdrop */
          background:
            radial-gradient(1200px 600px at -10% -30%, rgba(66,129,255,.08), transparent 45%),
            #0f141b;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.05),
            0 16px 40px rgba(0,0,0,.35);
          overflow:hidden;
        }

        /* Metrics with pills (✅ ensure always in pills) */
        .metrics{
          display:grid; grid-template-columns: 1fr 1fr; gap:14px 20px;
        }
        .metric{
          display:flex; align-items:center; justify-content:flex-start; gap:18px;
        }
        .metric .k{ color:#eaeef5; opacity:.86; font-size:17px; }
        .metric .v{
          font-weight:800; font-variant-numeric: tabular-nums;
          padding:7px 14px; border-radius:999px; font-size:15px; line-height:1; min-width:64px; text-align:center;
          background: rgba(148,163,184,.10); color:#e7eaf0; border:1px solid rgba(148,163,184,.22);
        }
        .metric .v.pos{ color:#22c55e; background: rgba(34,197,94,.12); border-color: rgba(34,197,94,.28); }
        .metric .v.neg{ color:#ef4444; background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.28); }
        .metric .v.neu{ color:#cbd5e1; }

        .greeks{ grid-column: 1 / -1; margin-top: 4px; display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; }
        .greek{
          font-size:12px; opacity:.9; display:flex; align-items:center; justify-content:center;
          border-radius:10px; padding:6px 8px; color:#cfd6e1; background:#0c1117; box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
        }

        /* Loading shimmer */
        .is-loading .row:hover{ background: transparent; }
        .skl{
          display:inline-block; height: 14px; border-radius: 8px; background: rgba(255,255,255,.08);
          position: relative; overflow: hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .w-45{ width:45%; } .w-50{ width:50%; } .w-60{ width:60%; } .w-70{ width:70%; }
        @keyframes shimmer{ 100% { transform: translateX(100%); } }

        @media (max-width: 980px){
          .panel-grid{ grid-template-rows: 220px auto; }
          .details-inner{ grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

/* ---------- Metric pill (✅ tone logic & pills always used) ---------- */
function Metric({ label, value, num, tone }) {
  let cls = "neu";
  if (tone === "neu") cls = "neu";
  else if (isNum(num)) {
    if (num > 0) cls = "pos";
    else if (num < 0) cls = "neg";
  }
  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className={`v ${cls}`}>{value ?? "—"}</span>
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
function fmtG(v){ return isNum(v) ? Number(v).toFixed(2) : "—"; }

/* ---------- Mini payoff chart ---------- */
function MiniPL({ S0, K, premium, type, pos, BE, mu, sigma, T, sL, sH, meanPrice }) {
  if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !type || !pos) {
    return <span className="chart-hint">Chart</span>;
  }

  const W = 560, H = 250, pad = 12;

  // center around current price for balanced view
  const centerX = S0;
  const baseSpan = 0.4 * S0;
  const [zoom, setZoom] = useState(1);
  const span = baseSpan / zoom;
  const xmin = Math.max(0.01, centerX - span);
  const xmax = centerX + span;

  const xmap = (s) => pad + ((s - xmin) / (xmax - xmin)) * (W - 2 * pad);

  // payoff samples
  const N = 220;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(xmin + (i / N) * (xmax - xmin));
  const payoff = (s) => {
    if (type === "call") {
      const intr = Math.max(s - K, 0);
      return pos === "long" ? intr - premium : premium - intr;
    }
    const intr = Math.max(K - s, 0);
    return pos === "long" ? intr - premium : premium - intr;
  };
  const pay = xs.map(payoff);

  const yMin = Math.min(...pay, -premium * 1.35);
  const yMax = Math.max(...pay, premium * 1.35);
  const ymap = (p) => H - pad - ((p - yMin) / (yMax - yMin)) * (H - 2 * pad);
  const baselineY = ymap(0);

  const lineD = xs.map((s, i) => `${i ? "L" : "M"} ${xmap(s).toFixed(2)} ${ymap(pay[i]).toFixed(2)}`).join(" ");
  const areaD = [
    `M ${xmap(xs[0]).toFixed(2)} ${baselineY.toFixed(2)}`,
    ...xs.map((s, i) => `L ${xmap(s).toFixed(2)} ${ymap(pay[i]).toFixed(2)}`),
    `L ${xmap(xs[xs.length - 1]).toFixed(2)} ${baselineY.toFixed(2)} Z`,
  ].join(" ");

  // unique clip ids for clean fills
  const idsRef = useRef({
    above: `above-${Math.random().toString(36).slice(2)}`,
    below: `below-${Math.random().toString(36).slice(2)}`
  });
  const aboveId = idsRef.current.above;
  const belowId = idsRef.current.below;

  // positions
  const xSpot = xmap(S0);
  const xMean = isNum(meanPrice) ? xmap(meanPrice) : null;
  const xBE = Number.isFinite(BE) ? xmap(BE) : null;
  const xL = isNum(sL) ? xmap(sL) : null;
  const xH = isNum(sH) ? xmap(sH) : null;

  // zoom UI
  const zoomIn  = () => setZoom((z) => Math.min(30, z * 1.15));
  const zoomOut = () => setZoom((z) => Math.max(0.5, z / 1.15));

  return (
    <div className="chart-wrap">
      <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" shapeRendering="geometricPrecision">
        <defs>
          <clipPath id={aboveId}><rect x="0" y="0" width={W} height={baselineY} /></clipPath>
          <clipPath id={belowId}><rect x="0" y={baselineY} width={W} height={H - baselineY} /></clipPath>
          <filter id="btnBlur"><feGaussianBlur in="SourceGraphic" stdDeviation="6" /></filter>
        </defs>

        {/* zero (P&L) line */}
        <line x1={pad} y1={baselineY} x2={W - pad} y2={baselineY} stroke="rgba(255,255,255,.22)" />

        {/* profit / loss areas */}
        <path d={areaD} fill="rgba(16,185,129,.12)" clipPath={`url(#${aboveId})`} />
        <path d={areaD} fill="rgba(239, 68, 68, .15)" clipPath={`url(#${belowId})`} />

        {/* ❌ remove shaded CI region (was a filled polygon) */}
        {/* ❌ remove price distribution curve (yellow PDF line) */}

        {/* 95% CI boundaries (✅ dotted, light pink) */}
        {isNum(xL) && <line x1={xL} y1={pad} x2={xL} y2={H - pad} stroke="#f9a8d4" strokeWidth="1.25" strokeDasharray="6 6" opacity="0.9" />}
        {isNum(xH) && <line x1={xH} y1={pad} x2={xH} y2={H - pad} stroke="#f9a8d4" strokeWidth="1.25" strokeDasharray="6 6" opacity="0.9" />}

        {/* spot & mean (✅ keep) */}
        <line x1={xSpot} y1={pad} x2={xSpot} y2={H - pad} stroke="#60a5fa" strokeWidth="1.2" opacity="0.95" />
        {isNum(xMean) && <line x1={xMean} y1={pad} x2={xMean} y2={H - pad} stroke="#f472b6" strokeWidth="1.2" opacity="0.95" />}

        {/* payoff line */}
        <path d={lineD} fill="none" stroke="rgba(255,255,255,.92)" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />

        {/* Break-even marker (✅ circle on axis) */}
        {Number.isFinite(xBE) && <circle cx={xBE} cy={baselineY} r="5" fill="#10b981" stroke="rgba(255,255,255,.8)" strokeWidth="1" />}

        {/* ticks on axis */}
        <g fontSize="12" fontWeight="700" fill="rgba(148,163,184,.9)">
          <text x={pad} y={baselineY - 6}>{Math.round(xmin)}</text>
          <text x={xSpot} y={baselineY - 6} textAnchor="middle" fill="#60a5fa">{Math.round(S0)}</text>
          <text x={W - pad} y={baselineY - 6} textAnchor="end">{Math.round(xmax)}</text>
        </g>

        {/* Legend (✅ circle markers beneath chart) */}
        <g transform={`translate(${pad}, ${H - 44})`} fontSize="12.5" fontWeight="700" fill="#e5e7eb">
          {/* spot */}
          <circle cx="8" cy="6" r="6" fill="#60a5fa" />
          <text x="20" y="10">Current price</text>

          {/* mean */}
          <g transform="translate(135,0)">
            <circle cx="8" cy="6" r="6" fill="#f472b6" />
            <text x="20" y="10">Mean (MC)</text>
          </g>

          {/* CI boundaries */}
          <g transform="translate(245,0)">
            <circle cx="8" cy="6" r="6" fill="none" stroke="#f9a8d4" strokeWidth="2" strokeDasharray="4 4" />
            <text x="20" y="10">95% CI boundaries</text>
          </g>

          {/* BE marker */}
          <g transform="translate(410,0)">
            <circle cx="8" cy="6" r="6" fill="#10b981" stroke="rgba(255,255,255,.8)" strokeWidth="1" />
            <text x="20" y="10">Break-even</text>
          </g>
        </g>

        {/* Zoom controls (✅ enhanced Apple-like) */}
        <g transform={`translate(${W - 110}, ${H - 38})`}>
          {/* container: no visible border, soft blur & shadow */}
          <rect x="-6" y="-10" rx="18" ry="18" width="106" height="36"
                fill="rgba(15,23,42,.55)" style={{ backdropFilter: "blur(6px)" }}
                stroke="none" filter="url(#btnBlur)" />
          <g role="button" tabIndex="0" onClick={zoomOut} style={{ cursor: "pointer" }} transform="translate(16,8)">
            <circle cx="0" cy="0" r="14" fill="rgba(17,24,39,.9)" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#cbd5e1" strokeWidth="2" />
          </g>
          <g role="button" tabIndex="0" onClick={zoomIn} style={{ cursor: "pointer" }} transform="translate(62,8)">
            <circle cx="0" cy="0" r="14" fill="rgba(17,24,39,.9)" />
            <line x1="-8" y1="0" x2="8" y2="0" stroke="#cbd5e1" strokeWidth="2" />
            <line x1="0" y1="-8" x2="0" y2="8" stroke="#cbd5e1" strokeWidth="2" />
          </g>
        </g>
      </svg>
    </div>
  );
}
