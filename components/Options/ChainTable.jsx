// components/Options/ChainTable.jsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { subscribeStatsCtx, snapshotStatsCtx } from "../Strategy/statsBus";

/* ------------------------------- Component ------------------------------- */

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
  const [ctx, setCtx] = useState(() =>
    (typeof window !== "undefined" ? snapshotStatsCtx() : null)
  );
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
        price: pick(o.price), // model price from API if present
        ask: pick(o.ask),
        bid: pick(o.bid),
        ivPct: pick(o.ivPct),
        greeks: takeGreeks(o),
      };
    };
    for (const c of (calls || [])) add("call", c);
    for (const p of (puts  || [])) add("put",  p);

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

  const isOpen  = (strike) => expanded && expanded.strike === strike;
  const focusSide = (strike) => (isOpen(strike) ? expanded.side : null);

  /* ----------------------------- Math helpers ---------------------------- */

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
    if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !(sigma > 0) || !(T > 0)) {
      return { be: null, pop: null, expP: null, expR: null, sharpe: null };
    }
    const sqrtT = Math.sqrt(T);
    const sigSqrtT = sigma * sqrtT;

    const BE = type === "call" ? (K + premium) : Math.max(1e-9, K - premium);

    const z = (Math.log(BE / S0) - (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const needsAbove = (type === "call" && pos === "long") || (type === "put" && pos === "short");
    const PoP = needsAbove ? (1 - Phi(z)) : Phi(z);

    const d1 = (Math.log(S0 / K) + (drift + 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const d2 = d1 - sigSqrtT;

    const expST = Math.exp(drift * T);
    let Epay;
    if (type === "call") {
      Epay = S0 * expST * Phi(d1) - K * Phi(d2);
    } else {
      Epay = K * Phi(-d2) - S0 * expST * Phi(-d1);
    }

    const dbar = (Math.log(S0 / K) + (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const PgtK = Phi(dbar);
    const PltK = 1 - PgtK;
    const E1_above = S0 * expST * Phi(d1);
    const E2_above = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(d1 + sigSqrtT);
    const E1_below = S0 * expST * Phi(-d1);
    const E2_below = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(-(d1 + sigSqrtT));

    let E2pay;
    if (type === "call") {
      E2pay = E2_above - 2*K*E1_above + K*K*PgtK;
    } else {
      E2pay = K*K*PltK - 2*K*E1_below + E2_below;
    }
    const varPay = Math.max(0, E2pay - Epay*Epay);
    const sdPay = Math.sqrt(varPay);

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

  // Effective time & drift parameters from StatsRail (fallbacks for safety)
  const effDays = ctx?.days ?? daysToExpiryISO(meta?.expiry);
  const effBasis = ctx?.basis ?? 365;
  const T = Number.isFinite(effDays) ? Math.max(1, effDays) / effBasis : null;
  const sigma = ctx?.sigma ?? (Number.isFinite(visible?.[0]?.ivPct) ? visible[0].ivPct / 100 : null);
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
            let longMetrics = null, shortMetrics = null,
                beForChart = null, typeForChart = null, premForChart = null;
            if (open && S0 && T && sigma && Number.isFinite(r.strike)) {
              if (focus === "put") {
                typeForChart = "put";
                premForChart = putPrem;
                beForChart   = Number.isFinite(putPrem) ? Math.max(1e-9, r.strike - putPrem) : null;
                longMetrics  = Number.isFinite(putPrem) ? metricsForOption({ type:"put", pos:"long",  S0, K:r.strike, premium: putPrem, sigma, T, drift }) : null;
                shortMetrics = Number.isFinite(putPrem) ? metricsForOption({ type:"put", pos:"short", S0, K:r.strike, premium: putPrem, sigma, T, drift }) : null;
              } else {
                typeForChart = "call";
                premForChart = callPrem;
                beForChart   = Number.isFinite(callPrem) ? (r.strike + callPrem) : null;
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
                          <MiniPL
                            S0={S0}
                            K={r.strike}
                            premium={premForChart}
                            type={typeForChart}
                            pos="short"
                            BE={beForChart}
                            drift={drift}
                            sigma={sigma}
                            T={T}
                          />
                        </div>
                        <div className="metrics">
                          <Metric label="Break-even"       kind="money" ccy={effCurrency} num={shortMetrics?.be} />
                          <Metric label="Prob. Profit"     kind="prob"  num={shortMetrics?.pop} />
                          <Metric label="Expected Return"  kind="pct"   num={shortMetrics?.expR} />
                          <Metric label="Expected Profit"  kind="money" ccy={effCurrency} num={shortMetrics?.expP} />
                          <Metric label="Sharpe"           kind="num"   num={shortMetrics?.sharpe} />
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
                          <MiniPL
                            S0={S0}
                            K={r.strike}
                            premium={premForChart}
                            type={typeForChart}
                            pos="long"
                            BE={beForChart}
                            drift={drift}
                            sigma={sigma}
                            T={T}
                          />
                        </div>
                        <div className="metrics">
                          <Metric label="Break-even"       kind="money" ccy={effCurrency} num={longMetrics?.be} />
                          <Metric label="Prob. Profit"     kind="prob"  num={longMetrics?.pop} />
                          <Metric label="Expected Return"  kind="pct"   num={longMetrics?.expR} />
                          <Metric label="Expected Profit"  kind="money" ccy={effCurrency} num={longMetrics?.expP} />
                          <Metric label="Sharpe"           kind="num"   num={longMetrics?.sharpe} />
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
          --spotBlue:  #60a5fa; /* for spot line */
          --profit:    rgba(34,197,94,.16);  /* soft green */
          --loss:      rgba(239,68,68,.16);  /* soft red */
          --pdf:       rgba(252,211,77,.9);  /* warm yellow */
          --pill-bg:   rgba(255,255,255,.08);
          --pill-bd:   rgba(255,255,255,.14);
          --pill-neg:  #ef4444;
          --pill-pos:  #22c55e;

          --sk-base: color-mix(in srgb, var(--text, #0f172a) 12%, var(--surface, #0b0d12));
          --sk-sheen: color-mix(in srgb, #ffffff 40%, transparent);
          margin-top:10px;
        }

        .heads{
          display:flex; align-items:center; justify-content:space-between;
          margin: 10px 0 6px;
        }
        .h-left, .h-right{
          font-weight:800; font-size:22px; letter-spacing:.2px;
          color: var(--text, #e9edf6);
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
          border-top:1px solid rgba(255,255,255,.06);
          border-bottom:1px solid rgba(255,255,255,.06);
          font-weight:700; font-size:13.5px;
          color:#c7cedd;
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
        .head-row .iv-hdr{ color: var(--ivCol); font-weight:800; letter-spacing:.01em; }

        .cell{ height:26px; display:flex; align-items:center; }
        .c,.p,.mid{ justify-content:center; text-align:center; }
        .arrow{ margin-right:6px; font-weight:900; color: currentColor; }

        .card{
          border:1px solid rgba(255,255,255,.08);
          border-radius:18px;
          background: radial-gradient(1200px 400px at -10% -10%, rgba(255,255,255,.04), transparent),
                      #0c0f14;
          color:#e9edf6;
          padding:16px 18px;
          margin-top:14px;
          box-shadow:
            0 30px 60px rgba(0,0,0,.45),
            0 1px 0 rgba(255,255,255,.05) inset;
        }
        .title{ font-weight:800; font-size:16px; margin-bottom:4px; }
        .sub{ opacity:.75; font-size:13px; }

        .body .row{
          padding: 8px 0;
          border-bottom:1px solid rgba(255,255,255,.06);
          transition: background-color .18s ease, box-shadow .18s ease;
        }
        .clickable{ cursor: pointer; }
        .body .row:last-child{ border-bottom:0; }
        .body .row:hover{ background-color: rgba(255,255,255,.03); }
        .body .row.is-spot{
          background-color: rgba(245,158,11,.10);
          border-bottom-color: rgba(245,158,11,.35);
        }

        .val{ font-weight:700; font-size:13.5px; color:#e9edf6; }
        .body .row .strike-val{ color: var(--strikeCol); }
        .body .row .iv-val{     color: var(--ivCol); }

        /* Focus highlighting per side (only the side the user clicked) */
        .body .row.is-open.focus-call .c.cell,
        .body .row.is-open.focus-put  .p.cell{
          background: rgba(255,255,255,.04);
          border-radius: 10px;
        }

        /* Expanded panel */
        .details{
          overflow: hidden;
          max-height: 0;
          opacity: 0;
          transform: translateY(-4px);
          transition: max-height .28s ease, opacity .28s ease, transform .28s ease;
          border-bottom:1px solid transparent;
        }
        .details.open{
          max-height: 640px;
          opacity: 1;
          transform: translateY(0);
          border-bottom-color: rgba(255,255,255,.06);
        }
        .details-inner{
          padding: 18px 12px 22px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
          background: rgba(255,255,255,.03);
          border-radius: 16px;
          box-shadow: 0 18px 40px rgba(0,0,0,.30), 0 2px 0 rgba(255,255,255,.02) inset;
        }
        .panel-col{
          display:flex; flex-direction:column; gap:12px;
          padding: 12px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:14px; background: #0d1117;
        }
        .panel-head{ font-weight:800; font-size:18px; opacity:.95; }

        .panel-grid{ display:grid; grid-template-rows: 200px auto; gap:14px; }
        .chart{
          position:relative;
          border-radius:12px; border:1px solid rgba(255,255,255,.08);
          background: radial-gradient(1000px 300px at 10% -20%, rgba(255,255,255,.03), transparent),
                      #0b0f15;
          display:flex; align-items:center; justify-content:center;
          overflow:hidden;
        }

        /* Metrics layout + pills */
        .metrics{ display:grid; grid-template-columns: 1fr 1fr; gap:14px 22px; }
        .metric{ display:flex; align-items:center; justify-content:space-between; gap:18px; }
        .metric .k{ opacity:.85; font-size:16px; letter-spacing:.2px; }
        .metric .pill{
          margin-left:10px;
          padding: 6px 10px;
          border-radius: 9999px;
          background: var(--pill-bg);
          border: 1px solid var(--pill-bd);
          font-weight:700; font-variant-numeric: tabular-nums;
          min-width: 68px; text-align:center;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.05);
          line-height: 1.2;
        }
        .metric .pill.pos { color: var(--pill-pos); }
        .metric .pill.neg { color: var(--pill-neg); }

        .greeks{ grid-column: 1 / -1; margin-top: 6px; display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; }
        .greek{
          font-size:12px; opacity:.85; display:flex; align-items:center; justify-content:center;
          border:1px solid rgba(255,255,255,.12); border-radius:8px; padding:6px 8px;
          background: rgba(255,255,255,.03);
        }

        /* ---------- Shimmer styles ---------- */
        .is-loading .row:hover{ background: transparent; }
        .skl{
          display:inline-block; height: 14px; border-radius: 8px;
          background: var(--sk-base); position: relative; overflow: hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, var(--sk-sheen), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .w-45{ width:45%; } .w-50{ width:50%; } .w-60{ width:60%; } .w-70{ width:70%; }
        @keyframes shimmer{ 100% { transform: translateX(100%); } }

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:20px; }
          .head-row{ font-size:13px; }
          .cell{ height:24px; }
          .val{ font-size:13px; }
          .details-inner{ grid-template-columns: 1fr; }
          .panel-grid{ grid-template-rows: 210px auto; }
        }
      `}</style>
    </div>
  );
}

/* ------------------------ Metric pill w/ sign color ----------------------- */

function Metric({ label, kind = "num", num, ccy = "USD" }) {
  const sign = Number.isFinite(num) ? (num > 0 ? "pos" : num < 0 ? "neg" : "") : "";
  const moneySign = (ccy) =>
    ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";
  const format = () => {
    if (!Number.isFinite(num)) return "—";
    if (kind === "money") return `${moneySign(ccy)}${num.toFixed(2)}`;
    if (kind === "pct")   return `${(num * 100).toFixed(2)}%`;
    if (kind === "prob")  return `${(num * 100).toFixed(2)}%`;
    return String(num.toFixed(2));
  };
  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className={`pill ${sign}`}>{format()}</span>
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

/* -------------------- Inline worker for Monte Carlo PDF ------------------- */

function createMCWorker() {
  const code = `
    self.onmessage = (e) => {
      const { S0, sigma, drift, T, xmin, xmax, paths = 500000, bins = 220 } = e.data;
      const N = Math.max(500000, paths|0);
      const B = Math.max(120, Math.min(600, bins|0));
      const counts = new Float64Array(B);
      const width  = (xmax - xmin) / B;

      // tiny PRNG (Mulberry32)
      let seed = Math.floor((S0*1000) % 0xFFFFFFFF) ^ 0x9E3779B9;
      const rnd = () => {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };

      // Box-Muller
      const mu = (drift - 0.5 * sigma * sigma) * T;
      const vol = sigma * Math.sqrt(T);

      for (let i = 0; i < N; i += 2) {
        const u1 = Math.max(1e-12, rnd());
        const u2 = rnd();
        const R = Math.sqrt(-2 * Math.log(u1));
        const z1 = R * Math.cos(2 * Math.PI * u2);
        const z2 = R * Math.sin(2 * Math.PI * u2);

        const s1 = S0 * Math.exp(mu + vol * z1);
        const s2 = S0 * Math.exp(mu + vol * z2);

        const i1 = Math.floor((s1 - xmin) / (xmax - xmin) * B);
        if (i1 >= 0 && i1 < B) counts[i1] += 1;
        const i2 = Math.floor((s2 - xmin) / (xmax - xmin) * B);
        if (i2 >= 0 && i2 < B) counts[i2] += 1;
      }

      // convert to density
      const total = counts.reduce((a, b) => a + b, 0);
      const density = new Float64Array(B);
      const xs = new Float64Array(B);
      for (let i = 0; i < B; i++) {
        xs[i] = xmin + (i + 0.5) * width;
        density[i] = total > 0 ? counts[i] / (total * width) : 0;
      }

      // light smoothing (moving average)
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < B - 1; i++) {
          density[i] = (density[i-1] + density[i] + density[i+1]) / 3;
        }
      }

      self.postMessage({ xs, density });
    };
  `;
  const blob = new Blob([code], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const w = new Worker(url, { type: "module" });
  return w;
}

/* --------------------------- Mini payoff chart --------------------------- */

function MiniPL({ S0, K, premium, type, pos, BE, drift, sigma, T }) {
  const hostRef = useRef(null);
  const [pdf, setPdf] = useState(null); // { xs: Float64Array, density: Float64Array }
  const [tooltip, setTooltip] = useState(null); // { x, y, s, prob }
  const workerRef = useRef(null);

  if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !type || !pos) {
    return <span className="chart-hint" style={{opacity:.5,color:"#9aa5b1"}}>Chart</span>;
  }

  // Slight zoom to make PDF stand out
  const xmin = Math.max(0, S0 * 0.60);
  const xmax = S0 * 1.60;

  const W = 520, H = 200, pad = 14;

  // Monte Carlo PDF (>= 500k paths) based on selected drift
  useEffect(() => {
    if (!(S0>0) || !(sigma>0) || !(T>0)) { setPdf(null); return; }
    try {
      if (!workerRef.current) workerRef.current = createMCWorker();
      const w = workerRef.current;
      const onMsg = (ev) => setPdf(ev.data);
      w.addEventListener("message", onMsg, { once: true });
      w.postMessage({ S0, sigma, drift, T, xmin, xmax, paths: 500000, bins: 220 });
      return () => w.removeEventListener("message", onMsg);
    } catch {
      setPdf(null);
    }
  }, [S0, sigma, drift, T, xmin, xmax]);

  // Build payoff path & areas
  const N = 120;
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(xmin + (i/N) * (xmax - xmin));

  const payoff = xs.map((s) => {
    let intrinsic = type === "call" ? Math.max(s - K, 0) : Math.max(K - s, 0);
    return pos === "long" ? (intrinsic - premium) : (premium - intrinsic);
  });

  const yMin = Math.min(...payoff, -premium * 1.25);
  const yMax = Math.max(...payoff,  premium * 1.25);

  const xmap = (s) => pad + ((s - xmin) / (xmax - xmin)) * (W - 2*pad);
  const ymap = (p) => H - pad - ((p - yMin) / (yMax - yMin)) * (H - 2*pad);

  const dPay = payoff.map((p, i) =>
    `${i ? "L" : "M"} ${xmap(xs[i]).toFixed(1)} ${ymap(p).toFixed(1)}`
  ).join(" ");

  // Areas split into positive / negative fills
  const baseY = ymap(0);
  const pathArea = (sign) => {
    let d = "";
    let open = false;
    for (let i = 0; i <= N; i++) {
      const s = xs[i];
      const p = payoff[i];
      const isPos = p >= 0;
      if ((sign === "pos" && isPos) || (sign === "neg" && !isPos)) {
        const X = xmap(s); const Y = ymap(p);
        if (!open) { d += `M ${X} ${baseY} L ${X} ${Y} `; open = true; }
        else d += `L ${X} ${Y} `;
        if (i === N) d += `L ${X} ${baseY} Z`;
      } else if (open) {
        const X = xmap(xs[i-1]); const Y = ymap(payoff[i-1]);
        d += `L ${X} ${baseY} Z`;
        open = false;
      }
    }
    return d;
  };

  // Minimal axes ticks: x at {xmin, S0, K, BE, xmax}, y at {0}
  const ticksX = [xmin, S0, K, ...(Number.isFinite(BE)?[BE]:[]), xmax]
    .filter((v, i, a) => a.findIndex(z => Math.abs(z - v) < 1e-6) === i)
    .sort((a, b) => a - b);

  const onMove = (evt) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = evt.clientX - rect.left;
    const py = evt.clientY - rect.top;

    // nearest price
    const s = xmin + ((px - pad) / (W - 2*pad)) * (xmax - xmin);
    const sClamped = Math.max(xmin, Math.min(xmax, s));

    let prob = null;
    if (pdf?.xs && pdf?.density) {
      // find nearest bin
      const B = pdf.xs.length;
      let lo = 0, hi = B - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pdf.xs[mid] < sClamped) lo = mid; else hi = mid;
      }
      const i = Math.abs(pdf.xs[lo]-sClamped) < Math.abs(pdf.xs[hi]-sClamped) ? lo : hi;
      prob = pdf.density[i];
    }

    // tooltip placement (keep inside & slightly below cursor)
    const ttW = 120, ttH = 46, offset = 14;
    let tx = px + 12, ty = py + offset;
    if (tx + ttW > W - 6) tx = W - ttW - 6;
    if (ty + ttH > H - 6) ty = H - ttH - 6;
    if (tx < 6) tx = 6;
    if (ty < 6) ty = 6;
    setTooltip({ x: tx, y: ty, s: sClamped, prob });
  };
  const onLeave = () => setTooltip(null);

  // Build PDF path (scaled to 75% chart height)
  let dPdf = null;
  if (pdf?.xs && pdf?.density) {
    const peak = Math.max(...pdf.density);
    const scale = (H - 2*pad) * 0.75 / (peak > 0 ? peak : 1);
    dPdf = pdf.xs.map((s, i) => {
      const X = xmap(s).toFixed(1);
      const Y = (H - pad - pdf.density[i] * scale).toFixed(1);
      return `${i ? "L" : "M"} ${X} ${Y}`;
    }).join(" ");
  }

  const spotX = xmap(S0);
  const strikeX = xmap(K);
  const beX = Number.isFinite(BE) ? xmap(BE) : null;

  return (
    <div ref={hostRef} style={{position:"relative", width:"100%", height:"100%"}}>
      <svg
        width="100%" height="100%"
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        onMouseMove={onMove} onMouseLeave={onLeave}
      >
        {/* grid & axes */}
        <rect x="0" y="0" width={W} height={H} fill="transparent" />
        <line x1={pad} y1={ymap(0)} x2={W-pad} y2={ymap(0)} stroke="#e5e7eb" opacity="0.18" />
        {/* X ticks */}
        {ticksX.map((t,i) => (
          <g key={i} opacity="0.55">
            <line x1={xmap(t)} y1={H-pad} x2={xmap(t)} y2={H-pad+6} stroke="#e5e7eb" opacity="0.25" />
            <text x={xmap(t)} y={H-pad+18} textAnchor="middle" fontSize="10" fill="#cbd5e1">{t.toFixed(0)}</text>
          </g>
        ))}
        {/* Y tick at 0 */}
        <text x={pad-6} y={ymap(0)-4} textAnchor="end" fontSize="10" fill="#cbd5e1">0</text>

        {/* profit / loss areas */}
        <path d={pathArea("pos")} fill="var(--profit)" />
        <path d={pathArea("neg")} fill="var(--loss)" />

        {/* payoff */}
        <path d={dPay} fill="none" stroke="#e5e7eb" strokeWidth="1.6" />

        {/* reference lines (no labels) */}
        <line x1={spotX}   y1={pad} x2={spotX}   y2={H-pad} stroke="var(--spotBlue)" strokeWidth="1" opacity="0.85" />
        <line x1={strikeX} y1={pad} x2={strikeX} y2={H-pad} stroke="#f59e0b" strokeWidth="1" opacity="0.9" />
        {Number.isFinite(beX) && <line x1={beX} y1={pad} x2={beX} y2={H-pad} stroke="#10b981" strokeWidth="1" opacity="0.9" />}

        {/* Monte Carlo density (on top) */}
        {dPdf && <path d={dPdf} fill="none" stroke="var(--pdf)" strokeWidth="1.5" opacity="0.9" />}

      </svg>

      {/* Floating tooltip (clamped inside, below pointer) */}
      {tooltip && (
        <div
          style={{
            position:"absolute", left: tooltip.x, top: tooltip.y,
            padding:"8px 10px", borderRadius:10, fontSize:12, lineHeight:1.2,
            background:"rgba(20,24,31,.92)", color:"#e5e7eb",
            border:"1px solid rgba(255,255,255,.12)",
            boxShadow:"0 8px 20px rgba(0,0,0,.45)", pointerEvents:"none",
            width:120
          }}
        >
          <div style={{opacity:.7}}>Price</div>
          <div style={{fontWeight:800, fontVariantNumeric:"tabular-nums"}}>${tooltip.s.toFixed(2)}</div>
          {Number.isFinite(tooltip.prob) && (
            <>
              <div style={{opacity:.7, marginTop:4}}>Density</div>
              <div style={{fontWeight:800, fontVariantNumeric:"tabular-nums"}}>
                {tooltip.prob.toExponential(2)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
