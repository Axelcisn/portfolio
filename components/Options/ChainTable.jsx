// components/Options/ChainTable.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

export default function ChainTable({
  symbol,
  currency,
  provider,
  groupBy,
  expiry,
  settings, // row count / sort controls from the popover
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

  // Apply sort + row limit
  const visible = useMemo(() => {
    if (!rows?.length) return [];
    const sorted = (sortDir === "desc") ? [...rows].reverse() : rows;
    const limit = rowLimit === Infinity ? sorted.length : rowLimit;
    return sorted.slice(0, limit);
  }, [rows, sortDir, rowLimit]);

  // Find the strike closest to spot (to highlight that row)
  const closestStrike = useMemo(() => {
    const spot = Number(meta?.spot);
    if (!rows?.length || !Number.isFinite(spot)) return null;
    let best = null;
    let bestDiff = Infinity;
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
  const ariaSort  = sortDir === "desc" ? "descending" : "ascending";

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

        <div className="mid cell" role="columnheader" aria-sort={ariaSort}>
          <span className="arrow" aria-hidden="true">{arrowChar}</span> Strike
        </div>
        <div className="mid cell" role="columnheader">IV, %</div>

        <div className="p cell" role="columnheader">Bid</div>
        <div className="p cell" role="columnheader">Ask</div>
        <div className="p cell" role="columnheader">Price</div>
      </div>

      {/* States */}
      {status !== "ready" && (
        <div className="card">
          <div className="title">
            {status === "loading" ? "Loading options…" : status === "error" ? "Couldn’t load options" : "No options loaded"}
          </div>
          <div className="sub">
            {status === "loading" && "Fetching the chain for the selected expiry."}
            {status === "error" && (error || "Unknown error")}
            {status === "idle" && (
              <>
                Pick a provider or upload a screenshot, then choose an expiry
                {expiry?.m && expiry?.d ? ` (e.g., ${expiry.m} ${expiry.d})` : ""}.
              </>
            )}
          </div>
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
                <div className="mid cell val midtone">{fmt(r.strike)}</div>
                <div className="mid cell val midtone">{fmt(r.ivPct, 2)}</div>

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
          /* dark grey for Strike & IV columns */
          --midColText: #6b7280; /* professional dark grey */
          --rowHover: color-mix(in srgb, var(--text, #0f172a) 10%, transparent);
          --spotOrange: #f59e0b;
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

        /* Make Strike & IV headers dark grey */
        .head-row .mid.cell{
          color: var(--midColText);
          font-weight:800;
          letter-spacing:.01em;
        }

        /* Center-align calls/puts columns */
        .cell{ height:26px; display:flex; align-items:center; }
        .c{ justify-content:center; text-align:center; }
        .p{ justify-content:center; text-align:center; }
        .mid{ justify-content:center; text-align:center; }

        /* Arrow inherits the header color */
        .arrow{
          margin-right:6px;
          font-weight:900;
          color: currentColor;
        }

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

        /* Make Strike & IV values dark grey */
        .body .row .midtone{
          color: var(--midColText);
        }

        .val{
          font-weight:700; font-size:13.5px; color: var(--text, #0f172a);
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
