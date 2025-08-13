// components/Options/ChainTable.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

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

  const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");

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

  // Merge calls & puts by strike; compute a center IV (%) as mid(callIV, putIV) when both exist
  const buildRows = (calls, puts) => {
    const byStrike = new Map();
    const add = (side, o) => {
      if (!Number.isFinite(o?.strike)) return;
      const k = Number(o.strike);
      if (!byStrike.has(k)) byStrike.set(k, { strike: k, call: null, put: null, ivPct: null });
      const row = byStrike.get(k);
      row[side] = {
        price: Number.isFinite(o.price) ? o.price : null,
        ask: Number.isFinite(o.ask) ? o.ask : null,
        bid: Number.isFinite(o.bid) ? o.bid : null,
        ivPct: Number.isFinite(o.ivPct) ? o.ivPct : null,
      };
      const cIV = row.call?.ivPct;
      const pIV = row.put?.ivPct;
      row.ivPct =
        Number.isFinite(cIV) && Number.isFinite(pIV)
          ? (cIV + pIV) / 2
          : (Number.isFinite(cIV) ? cIV : (Number.isFinite(pIV) ? pIV : null));
    };
    for (const c of calls || []) add("call", c);
    for (const p of puts || []) add("put", p);
    return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  };

  // Load chain when symbol/expiry changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setMeta(null);
      setRows([]);

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
        setMeta({ spot: m.spot ?? null, currency: m.currency || currency, expiry: m.expiry || dateISO });
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

  // Pick N rows centered around ATM. ATM is always part of the slice.
  function selectAroundATM(sortedAsc, atmIndex, N) {
    const len = sortedAsc.length;
    if (!Number.isFinite(N) || N === Infinity || N >= len) return sortedAsc;

    // Fallback ATM index if not found
    let atm = Number.isFinite(atmIndex) && atmIndex >= 0 ? atmIndex : Math.floor(len / 2);

    // Always include ATM; distribute remaining rows around it
    const remaining = N - 1;
    let below = Math.floor(remaining / 2);    // e.g., N=10 -> 4
    let above = remaining - below;            // e.g., N=10 -> 5

    // Initial window (inclusive)
    let start = atm - below;
    let end   = atm + above;

    // Shift window if it overflows left
    if (start < 0) {
      end += -start;
      start = 0;
    }
    // Shift window if it overflows right
    if (end > len - 1) {
      const overshoot = end - (len - 1);
      start = Math.max(0, start - overshoot);
      end = len - 1;
    }

    return sortedAsc.slice(start, end + 1);
  }

  // Apply ATM-centered selection + sort direction
  const visible = useMemo(() => {
    if (!rows?.length) return [];

    // Ascending base
    const baseAsc = rows; // buildRows already returns ascending by strike

    // Find ATM index by closest strike to spot
    const spot = Number(meta?.spot);
    let atmIdx = null;
    if (Number.isFinite(spot)) {
      let bestI = 0;
      let bestD = Infinity;
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

  // For orange highlight, find the (global) closest strike to spot
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

  // Shimmer row count (subtle, Apple-like)
  const shimmerCount = useMemo(() => {
    if (rowLimit === Infinity) return 12;
    return Math.max(8, Math.min(14, rowLimit || 12));
  }, [rowLimit]);

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

      {/* Loading shimmer (D1) */}
      {status === "loading" && (
        <div className="body is-loading" aria-busy="true" aria-label="Loading options">
          {Array.from({ length: shimmerCount }).map((_, i) => (
            <div className="grid row" role="row" aria-hidden="true" key={i}>
              {/* Calls (left) */}
              <div className="c cell"><span className="skl w-70" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              <div className="c cell"><span className="skl w-60" /></div>
              {/* Center */}
              <div className="mid cell"><span className="skl w-50" /></div>
              <div className="mid cell"><span className="skl w-45" /></div>
              {/* Puts (right) */}
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
            const isSpot = closestStrike != null && Number(r.strike) === Number(closestStrike);
            return (
              <div className={`grid row ${isSpot ? "is-spot" : ""}`} role="row" key={r.strike}>
                {/* Calls (left) */}
                <div className="c cell val">{fmt(r?.call?.price)}</div>
                <div className="c cell val">{fmt(r?.call?.ask)}</div>
                <div className="c cell val">{fmt(r?.call?.bid)}</div>

                {/* Center */}
                <div className="mid cell val strike-val">{fmt(r.strike)}</div>
                <div className="mid cell val iv-val">{fmt(r.ivPct, 2)}</div>

                {/* Puts (right) */}
                <div className="p cell val">{fmt(r?.put?.bid)}</div>
                <div className="p cell val">{fmt(r?.put?.ask)}</div>
                <div className="p cell val">{fmt(r?.put?.price)}</div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .wrap{
          /* brand colors for mid columns */
          --strikeCol: #F2AE2E; /* Strike */
          --ivCol:     #F27405; /* IV, %  */
          --rowHover: color-mix(in srgb, var(--text, #0f172a) 10%, transparent);
          --spotOrange: #f59e0b;

          /* shimmer palette (theme-aware, subtle) */
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

        /* 8 columns: 3 (calls) + 2 (center) + 3 (puts)  */
        .grid{
          display:grid;
          grid-template-columns:
            minmax(86px,1fr) minmax(86px,1fr) minmax(86px,1fr)
            112px 86px
            minmax(86px,1fr) minmax(86px,1fr) minmax(86px,1fr);
          gap: 6px 14px;
          align-items:center;
        }

        /* Header row */
        .head-row{
          padding: 8px 0 10px;
          border-top:1px solid var(--border, #E6E9EF);
          border-bottom:1px solid var(--border, #E6E9EF);
          font-weight:700; font-size:13.5px;
          color: var(--text, #2b3442);
        }

        /* Color the two center headers */
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

        /* Center-align columns */
        .cell{ height:26px; display:flex; align-items:center; }
        .c{ justify-content:center; text-align:center; }
        .p{ justify-content:center; text-align:center; }
        .mid{ justify-content:center; text-align:center; }

        /* Arrow inherits header color (Strike) */
        .arrow{ margin-right:6px; font-weight:900; color: currentColor; }

        /* Status card */
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

        /* Body rows + hover + spot highlight */
        .body .row{
          padding: 8px 0;
          border-bottom:1px solid color-mix(in srgb, var(--border, #E6E9EF) 86%, transparent);
          transition: background-color .18s ease;
        }
        .body .row:last-child{ border-bottom:0; }
        .body .row:hover{ background-color: var(--rowHover); }
        .body .row.is-spot{
          background-color: color-mix(in srgb, var(--spotOrange) 20%, transparent);
          border-bottom-color: color-mix(in srgb, var(--spotOrange) 45%, var(--border));
        }

        /* Apply brand colors to Strike & IV values */
        .body .row .strike-val{ color: var(--strikeCol); }
        .body .row .iv-val{     color: var(--ivCol); }

        .val{
          font-weight:700; font-size:13.5px; color: var(--text, #0f172a);
        }

        /* ---------- Shimmer styles ---------- */
        .is-loading .row:hover{ background: transparent; } /* keep calm during loading */

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

        @keyframes shimmer{
          100% { transform: translateX(100%); }
        }

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:20px; }
          .head-row{ font-size:13px; }
          .cell{ height:24px; }
          .val{ font-size:13px; }
        }
      `}</style>
    </div>
  );
}
