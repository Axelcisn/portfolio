// components/Options/ChainTable.jsx
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

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

  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
  const moneySign = (ccy) =>
    ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

  const effCurrency = meta?.currency || currency || "USD";
  const fmtMoney = (v, d = 2) =>
    Number.isFinite(v) ? `${moneySign(effCurrency)}${Number(v).toFixed(d)}` : "—";

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
                        <div className="chart" aria-hidden="true"><span className="chart-hint">Chart</span></div>
                        <div className="metrics">
                          <Metric label="Break-even" value="—" />
                          <Metric label="Prob. Profit" value="—" />
                          <Metric label="Expected Return" value="—" />
                          <Metric label="Expected Profit" value="—" />
                          <Metric label="Sharpe" value="—" />
                          {showGreeks && (
                            <div className="greeks">
                              {/* Show greeks for focused side only */}
                              {focus === "put"
                                ? <GreekList greeks={r?.put?.greeks} side="Put" />
                                : <GreekList greeks={r?.call?.greeks} side="Call" />
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
                        <div className="chart" aria-hidden="true"><span className="chart-hint">Chart</span></div>
                        <div className="metrics">
                          <Metric label="Break-even" value="—" />
                          <Metric label="Prob. Profit" value="—" />
                          <Metric label="Expected Return" value="—" />
                          <Metric label="Expected Profit" value="—" />
                          <Metric label="Sharpe" value="—" />
                          {showGreeks && (
                            <div className="greeks">
                              {focus === "put"
                                ? <GreekList greeks={r?.put?.greeks} side="Put" />
                                : <GreekList greeks={r?.call?.greeks} side="Call" />
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
          transition: max-height .28s ease, opacity .28s ease, transform .28s ease;
          border-bottom:1px solid transparent;
        }
        .details.open{
          max-height: 560px;
          opacity: 1;
          transform: translateY(0);
          border-bottom-color: color-mix(in srgb, var(--border, #E6E9EF) 86%, transparent);
        }
        .details-inner{
          padding: 14px 10px 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          background: color-mix(in srgb, var(--text, #0f172a) 5%, transparent);
          border-radius: 14px;

          /* Subtle Apple-like depth */
          box-shadow:
            0 18px 40px rgba(0,0,0,.20),
            0 2px 0 rgba(255,255,255,.02) inset;
        }
        .panel-col{
          display:flex; flex-direction:column; gap:10px;
          padding: 10px; border:1px solid var(--border, #E6E9EF);
          border-radius:12px; background: var(--card, #fff);
        }
        .panel-head{ font-weight:800; font-size:14px; opacity:.9; }

        .panel-grid{
          display:grid; grid-template-rows: 150px auto; gap:12px;
        }
        .chart{
          border-radius:10px; border:1px dashed var(--border, #E6E9EF);
          background: color-mix(in srgb, var(--text, #0f172a) 4%, transparent);
          display:flex; align-items:center; justify-content:center;
          font-size:12px; opacity:.6;
        }
        .chart-hint{ user-select:none; }

        .metrics{ display:grid; grid-template-columns: 1fr 1fr; gap:10px 14px; }
        .metric{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .metric .k{ opacity:.7; font-size:12.5px; }
        .metric .v{ font-weight:800; font-variant-numeric: tabular-nums; }

        .greeks{ grid-column: 1 / -1; margin-top: 6px; display:grid; grid-template-columns: repeat(5, 1fr); gap:8px; }
        .greek{ font-size:12px; opacity:.85; display:flex; align-items:center; justify-content:center;
          border:1px solid var(--border, #E6E9EF); border-radius:8px; padding:6px 8px; }

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

/* ---------- Small presentational helpers ---------- */
function Metric({ label, value }) {
  return (
    <div className="metric">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
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
