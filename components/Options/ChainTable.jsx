// components/Options/ChainTable.jsx
"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { subscribeStatsCtx, snapshotStatsCtx } from "../Strategy/statsBus";

/* ---------- tiny utils ---------- */
const isNum = (x) => Number.isFinite(x);
const pick = (x) => (isNum(x) ? x : null);
const moneySign = (ccy) => (ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$");
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/* erf / Phi for PoP and PDF math */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  x = Math.abs(x);
  const t = 1/(1+p*x);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);
  return sign*y;
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
  const [status, setStatus] = useState("idle");     // idle | loading | ready | error
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);           // { spot, currency, expiry }
  const [rows, setRows] = useState([]);             // merged by strike
  const [expanded, setExpanded] = useState(null);   // { strike, side:'call'|'put' } | null

  // StatsRail (days/basis/sigma/drift…) — guarded subscribe to avoid invalid cleanup (#310 hard-crash)
  const [ctx, setCtx] = useState(() => (typeof window !== "undefined" ? snapshotStatsCtx() : null));
  useEffect(() => {
    const unsub = subscribeStatsCtx(setCtx);
    return typeof unsub === "function" ? unsub : () => {};
  }, []);

  const fmt = (v, d = 2) => (isNum(v) ? Number(v).toFixed(d) : "—");
  const effCurrency = meta?.currency || currency || "USD";
  const fmtMoney = (v, d = 2) => (isNum(v) ? `${moneySign(effCurrency)}${Number(v).toFixed(d)}` : "—");
  const fmtPct   = (p, d = 2) => (isNum(p) ? `${(p * 100).toFixed(d)}%` : "—");

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
        price: pick(o.price),  // theoretical/model if provided
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
      r.ivPct = isNum(cIV) && isNum(pIV) ? (cIV + pIV) / 2
              : isNum(cIV) ? cIV
              : isNum(pIV) ? pIV : null;
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
      if (!dateISO) { if (!cancelled){ setStatus("error"); setError("No chain for selected expiry."); } return; }

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

  // shimmer skeleton length
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

    // break-even (same as before)
    const BE = type === "call" ? (K + premium) : Math.max(1e-9, K - premium);

    // PoP using lognormal threshold (matches your notes)
    const z = (Math.log(BE / S0) - (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const needsAbove = (type === "call" && pos === "long") || (type === "put" && pos === "short");
    const PoP = needsAbove ? (1 - Phi(z)) : Phi(z);

    // d~ with chosen drift (real-world when CAPM, risk-neutral when rf-q)
    const d1 = (Math.log(S0 / K) + (drift + 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const d2 = d1 - sigSqrtT;

    const expST = Math.exp(drift * T);
    let Epay;
    if (type === "call")      Epay = S0 * expST * Phi(d1) - K * Phi(d2);
    else /* type === put */   Epay = K * Phi(-d2) - S0 * expST * Phi(-d1);

    // variance via truncated moments (stable)
    const dbar = (Math.log(S0 / K) + (drift - 0.5 * sigma * sigma) * T) / (sigSqrtT);
    const PgtK = Phi(dbar), PltK = 1 - PgtK;
    const E1_above = S0 * expST * Phi(d1);
    const E2_above = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(d1 + sigSqrtT);
    const E1_below = S0 * expST * Phi(-d1);
    const E2_below = S0*S0 * Math.exp(2*drift*T + sigma*sigma*T) * Phi(-(d1 + sigSqrtT));
    const E2pay = type === "call"
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
        <div className="mid cell strike-hdr" role="columnheader" aria-sort={ariaSort}
             tabIndex={0} onClick={handleSortClick} onKeyDown={handleSortKey} title="Toggle strike sort">
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

            return (
              <div key={r.strike}>
                <div
                  className={`grid row ${spotStrike ? "is-spot" : ""} ${open ? "is-open" : ""} ${focus ? `focus-${focus}` : ""}`}
                  role="row" aria-expanded={open ? "true" : "false"}
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
                            S0={S0} K={r.strike} premium={premForChart}
                            type={typeForChart} pos="short" BE={beForChart}
                            sigma={sigma} T={T} drift={drift}
                          />
                        </div>
                        <div className="metrics">
                          <Metric label="Break-even"      value={fmtMoney(shortM?.be)}                   num={shortM?.be} kind="money" />
                          <Metric label="Prob. Profit"    value={fmtPct(shortM?.pop)}                    num={(shortM?.pop ?? null) - 0.5} goodWhenHigh />
                          <Metric label="Expected Return" value={fmtPct(shortM?.expR)}                   num={shortM?.expR} kind="pct" />
                          <Metric label="Expected Profit" value={fmtMoney(shortM?.expP)}                 num={shortM?.expP} kind="money" />
                          <Metric label="Sharpe"          value={fmt(shortM?.sharpe, 2)}                 num={shortM?.sharpe} />
                          {showGreeks && (
                            <div className="greeks">
                              {(focus === "put") ? <GreekList greeks={r?.put?.greeks} /> : <GreekList greeks={r?.call?.greeks} />}
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
                            S0={S0} K={r.strike} premium={premForChart}
                            type={typeForChart} pos="long" BE={beForChart}
                            sigma={sigma} T={T} drift={drift}
                          />
                        </div>
                        <div className="metrics">
                          <Metric label="Break-even"      value={fmtMoney(longM?.be)}                    num={longM?.be} kind="money" />
                          <Metric label="Prob. Profit"    value={fmtPct(longM?.pop)}                     num={(longM?.pop ?? null) - 0.5} goodWhenHigh />
                          <Metric label="Expected Return" value={fmtPct(longM?.expR)}                    num={longM?.expR} kind="pct" />
                          <Metric label="Expected Profit" value={fmtMoney(longM?.expP)}                  num={longM?.expP} kind="money" />
                          <Metric label="Sharpe"          value={fmt(longM?.sharpe, 2)}                  num={longM?.sharpe} />
                          {showGreeks && (
                            <div className="greeks">
                              {(focus === "put") ? <GreekList greeks={r?.put?.greeks} /> : <GreekList greeks={r?.call?.greeks} />}
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
          --rowHover: color-mix(in srgb, var(--text, #e5e7eb) 8%, transparent);
          --spotOrange: #f59e0b;

          --panelBg: #0b0f14;
          --panelEdge: #121821;
          --chipBg: rgba(255,255,255,.06);
          --chipEdge: rgba(255,255,255,.12);

          margin-top:10px;
        }

        .heads{
          display:flex; align-items:center; justify-content:space-between;
          margin: 10px 0 6px;
        }
        .h-left, .h-right{
          font-weight:800; font-size:22px; letter-spacing:.2px;
          color: var(--text, #e8eaee);
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

        /* focus highlighting only on the clicked side */
        .body .row.is-open.focus-call .c.cell,
        .body .row.is-open.focus-put  .p.cell{
          background: rgba(255,255,255,.04);
          border-radius: 8px;
        }

        /* Expanded details */
        .details{
          overflow:hidden; max-height:0; opacity:0; transform: translateY(-4px);
          transition: max-height .28s ease, opacity .28s ease, transform .28s ease;
          border-bottom:1px solid transparent;
        }
        .details.open{
          max-height: 700px; opacity:1; transform: translateY(0);
          border-bottom-color: color-mix(in srgb, var(--panelEdge) 86%, transparent);
        }
        .details-inner{
          padding: 18px 12px 22px;
          display:grid; grid-template-columns: 1fr 1fr; gap:16px;
          background: linear-gradient(180deg, rgba(255,255,255,.03), transparent), rgba(0,0,0,.12);
          border-radius: 16px;
          box-shadow: 0 22px 48px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.03);
        }
        .panel-col{
          display:flex; flex-direction:column; gap:12px;
          padding: 14px; border:1px solid var(--panelEdge);
          border-radius:14px; background: linear-gradient(180deg, rgba(255,255,255,.02), transparent), #0b0f14;
          box-shadow: 0 10px 26px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.04);
        }
        .panel-head{ font-weight:800; font-size:18px; color:#f5f7fa; }

        .panel-grid{ display:grid; grid-template-rows: 220px auto; gap:14px; }
        .chart{
          position:relative;
          border-radius:12px; border:1px solid var(--panelEdge);
          background: radial-gradient(1400px 600px at -10% -30%, rgba(66,129,255,.08), transparent 40%), #0f141b;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
          overflow:hidden;
        }

        .metrics{
          display:grid; grid-template-columns: 1fr 1fr; gap:12px 18px;
        }
        .metric{
          display:flex; align-items:center; justify-content:flex-start; gap:14px;
        }
        .metric .k{ color:#eaeef5; opacity:.82; font-size:17px; }
        .metric .v{
          margin-left:6px;
          font-weight:800; font-variant-numeric: tabular-nums;
          background: var(--chipBg); border:1px solid var(--chipEdge);
          padding:6px 12px; border-radius:999px;
          font-size:15px; line-height:1;
          color:#e7eaf0;
        }
        .metric .v.pos{ color:#22c55e; background: rgba(34,197,94,.10); border-color: rgba(34,197,94,.25); }
        .metric .v.neg{ color:#ef4444; background: rgba(239,68,68,.10); border-color: rgba(239,68,68,.28); }
        .metric .v.neu{ color:#cbd5e1; }

        .greeks{ grid-column: 1 / -1; margin-top: 4px; display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; }
        .greek{
          font-size:12px; opacity:.9; display:flex; align-items:center; justify-content:center;
          border:1px solid var(--panelEdge); border-radius:10px; padding:6px 8px; color:#cfd6e1;
          background:#0c1117;
        }

        /* Loading shimmer */
        .is-loading .row:hover{ background: transparent; }
        .skl{
          display:inline-block; height: 14px; border-radius: 8px;
          background: rgba(255,255,255,.08); position: relative; overflow: hidden;
        }
        .skl::after{
          content:""; position:absolute; inset:0; transform: translateX(-100%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
          animation: shimmer 1.15s ease-in-out infinite;
        }
        .w-45{ width:45%; } .w-50{ width:50%; } .w-60{ width:60%; } .w-70{ width:70%; }
        @keyframes shimmer{ 100% { transform: translateX(100%); } }

        @media (max-width: 980px){
          .panel-grid{ grid-template-rows: 200px auto; }
          .details-inner{ grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

/* ---------- Metric pill (auto tone: pos / neg / neutral) ---------- */
function Metric({ label, value, num, kind, goodWhenHigh }) {
  let tone = "neu";
  if (isNum(num)) {
    // For PoP we pass (pop - 0.5) so positive means "good"
    if (num > 0) tone = "pos";
    else if (num < 0) tone = "neg";
  }
  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className={`v ${tone}`}>{value ?? "—"}</span>
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

/* ---------- Mini payoff + PDF overlay (Apple-style) ---------- */
function MiniPL({ S0, K, premium, type, pos, BE, sigma, T, drift }) {
  if (!(S0 > 0) || !(K > 0) || !(premium >= 0) || !type || !pos || !(sigma > 0) || !(T > 0)) {
    return <span className="chart-hint" style={{opacity:.5,color:"#9fb1c7"}}>Chart</span>;
  }

  // Slight zoom toward center
  const half = 0.35; // ±35% around spot
  const xmin = Math.max(1e-6, S0 * (1 - half));
  const xmax = S0 * (1 + half);

  const W = 560, H = 220, pad = 14;
  const N = 220;

  // helpers
  const payoff = (s) => {
    if (type === "call") {
      const intr = Math.max(s - K, 0);
      return pos === "long" ? (intr - premium) : (premium - intr);
    } else {
      const intr = Math.max(K - s, 0);
      return pos === "long" ? (intr - premium) : (premium - intr);
    }
  };
  const xmap = (s) => pad + ((s - xmin) / (xmax - xmin)) * (W - 2*pad);
  // y scale
  const ypMin = -premium * 1.4;          // show a bit below max loss
  const ypMax =  Math.max(premium * 1.2, Math.abs((xmax - K) - premium));
  const ymap = (p) => (H - pad) - ((p - ypMin) / (ypMax - ypMin)) * (H - 2*pad);

  // points for payoff
  const xs = [];
  for (let i = 0; i <= N; i++) xs.push(xmin + (i/N) * (xmax - xmin));
  const pts = xs.map((s) => [xmap(s), ymap(payoff(s))]);

  // SVG path for payoff
  const dPay = pts.map(([x,y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  // Profit/loss fills (single-kink options let us do analytic polygons)
  const zeroY = ymap(0);
  const beX   = isNum(BE) ? xmap(clamp(BE, xmin, xmax)) : null;
  const atX   = (s) => xmap(clamp(s, xmin, xmax));
  const payAt = (s) => ymap(payoff(clamp(s, xmin, xmax)));

  let dProfit = "", dLoss = "";
  if (isNum(beX)) {
    if (type === "call" && pos === "long") {
      const yMaxR = payAt(xmax);
      dProfit = `M ${beX} ${zeroY} L ${W-pad} ${zeroY} L ${W-pad} ${yMaxR} L ${beX} ${zeroY} Z`;
      dLoss   = `M ${pad} ${zeroY} L ${beX} ${zeroY} L ${beX} ${ymap(0)} L ${pad} ${ymap(-premium)} Z`;
    }
    if (type === "call" && pos === "short") {
      const yLeft = ymap(premium);
      dProfit = `M ${pad} ${zeroY} L ${beX} ${zeroY} L ${beX} ${ymap(0)} L ${pad} ${yLeft} Z`;
      dLoss   = `M ${beX} ${zeroY} L ${W-pad} ${zeroY} L ${W-pad} ${ymap(-(xmax-K) + premium)} L ${beX} ${zeroY} Z`;
    }
    if (type === "put" && pos === "long") {
      const yLeft = payAt(xmin);
      dProfit = `M ${pad} ${zeroY} L ${beX} ${zeroY} L ${beX} ${ymap(0)} L ${pad} ${yLeft} Z`;
      dLoss   = `M ${beX} ${zeroY} L ${W-pad} ${zeroY} L ${W-pad} ${ymap(-premium)} L ${beX} ${zeroY} Z`;
    }
    if (type === "put" && pos === "short") {
      const yRight = ymap(premium);
      dProfit = `M ${beX} ${zeroY} L ${W-pad} ${zeroY} L ${W-pad} ${yRight} L ${beX} ${zeroY} Z`;
      dLoss   = `M ${pad} ${zeroY} L ${beX} ${zeroY} L ${beX} ${ymap(0)} L ${pad} ${ymap((K-xmin)-premium)} Z`;
    }
  }

  // Lognormal PDF overlay — exact (smooth) “MC density”
  const m = Math.log(S0) + (drift - 0.5*sigma*sigma) * T;
  const sdev = sigma * Math.sqrt(T);
  const pdf = (s) => (1 / (s * sdev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((Math.log(s) - m) / sdev, 2));
  const dens = xs.map((s) => pdf(s));
  const dMax = Math.max(...dens);
  const amp  = 0.18 * (H - 2*pad) / (dMax || 1);          // 18% of height
  const densPts = xs.map((s, i) => [xmap(s), zeroY - dens[i] * amp]);
  const dPDF = densPts.map(([x,y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(2)}`).join(" ");

  // axes ticks (minimal)
  const xSpot  = xmap(S0);
  const tickY  = H - pad + 10;

  // Tooltip
  const ref = useRef(null);
  const tipRef = useRef(null);
  const onMove = (e) => {
    const box = ref.current?.getBoundingClientRect?.();
    if (!box) return;
    const x = clamp(e.clientX - box.left, pad, W - pad);
    const s = xmin + ((x - pad) / (W - 2*pad)) * (xmax - xmin);
    const p = payoff(s);
    const d = pdf(s);
    const y = ymap(p);
    const el = tipRef.current;
    if (el) {
      el.style.opacity = "1";
      const left = clamp(x + 12, 6, W - 160);
      const top  = clamp(y + 12, 6, H - 48);
      el.style.transform = `translate(${left}px, ${top}px)`;
      el.innerHTML = `<div class="tline"><span>S</span><b>${moneySign("USD")}${s.toFixed(2)}</b></div>
                      <div class="tline"><span>P/L</span><b>${(p>=0?"+":"")}${p.toFixed(2)}</b></div>
                      <div class="tline"><span>pdf</span><b>${d.toExponential(2)}</b></div>`;
    }
  };
  const onLeave = () => { if (tipRef.current) tipRef.current.style.opacity = "0"; };

  return (
    <svg ref={ref} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
         onPointerMove={onMove} onPointerLeave={onLeave} style={{display:"block"}}>
      {/* axes */}
      <line x1={pad} y1={zeroY} x2={W-pad} y2={zeroY} stroke="#a7b2c3" opacity="0.20" />
      <line x1={pad} y1={pad}  x2={pad}   y2={H-pad} stroke="#a7b2c3" opacity="0.12" />
      {/* profit/loss fills */}
      {dLoss && <path d={dLoss} fill="rgba(239,68,68,.10)" stroke="none" />}
      {dProfit && <path d={dProfit} fill="rgba(16,185,129,.12)" stroke="none" />}
      {/* BE line */}
      {isNum(BE) && <line x1={beX} y1={pad} x2={beX} y2={H-pad} stroke="#10b981" strokeWidth="1" opacity="0.65" />}
      {/* payoff */}
      <path d={dPay || `M ${pad} ${zeroY} L ${W-pad} ${zeroY}`} fill="none" stroke="#eef1f6" strokeWidth="1.6" />
      {/* pdf overlay */}
      <path d={dPDF} fill="none" stroke="rgba(252,211,77,.95)" strokeWidth="1.2" opacity="0.95" />
      {/* x ticks (left / spot / right) */}
      <text x={pad} y={tickY} fontSize="11" fill="#cdd6e3" opacity="0.55">{(xmin).toFixed(0)}</text>
      <text x={xSpot} y={tickY} fontSize="11" fill="#9cc6ff" textAnchor="middle">{S0.toFixed(0)}</text>
      <text x={W-pad} y={tickY} fontSize="11" fill="#cdd6e3" opacity="0.55" textAnchor="end">{(xmax).toFixed(0)}</text>

      {/* tooltip (HTML in foreignObject for nice pill style) */}
      <foreignObject x="0" y="0" width={W} height={H} pointerEvents="none">
        <div ref={tipRef} style={{position:"absolute", transform:"translate(-9999px,-9999px)", opacity:0, transition:"opacity .12s ease"}}>
          <style>{`
            .tline{ display:flex; gap:6px; justify-content:space-between; font: 600 12px/1.1 ui-sans-serif,system-ui; 
                    color:#eaf0f7; padding:6px 8px; border:1px solid rgba(255,255,255,.12);
                    border-radius:10px; background: rgba(18,24,33,.92); backdrop-filter: blur(6px);
                    box-shadow:0 8px 20px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05); }
            .tline + .tline{ margin-top:4px; }
            .tline span{ opacity:.75; }
            .tline b{ font-weight:800; }
          `}</style>
        </div>
      </foreignObject>
    </svg>
  );
}
