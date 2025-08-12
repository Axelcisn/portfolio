"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchOptions } from "@/lib/client/options";

export default function ChainTable({ symbol, currency, provider, groupBy, expiry }) {
  const [state, setState] = useState({ status: "idle", error: null, data: null });

  // Try to extract a usable date (YYYY-MM-DD or unix seconds) if provided
  const dateParam = useMemo(() => {
    if (!expiry) return undefined;
    // Prefer explicit fields if you later wire the real strip
    if (expiry.iso) return expiry.iso;          // "YYYY-MM-DD"
    if (expiry.date) return expiry.date;        // "YYYY-MM-DD"
    if (typeof expiry.ts === "number") return String(expiry.ts); // unix seconds
    // Fallback: OptionsTab’s demo { m, d } is not a real date → omit
    return undefined;
  }, [expiry]);

  useEffect(() => {
    let alive = true;

    if (!symbol) {
      setState({ status: "idle", error: null, data: null });
      return () => {};
    }

    setState((s) => ({ ...s, status: "loading", error: null }));

    fetchOptions(symbol, dateParam)
      .then((data) => {
        if (!alive) return;
        setState({ status: "done", error: null, data });
      })
      .catch((err) => {
        if (!alive) return;
        setState({ status: "error", error: err?.message || "Failed to load", data: null });
      });

    return () => {
      alive = false;
    };
  }, [symbol, dateParam]);

  // Merge calls & puts by strike, sort ascending
  const rows = useMemo(() => {
    const d = state.data;
    if (!d) return [];
    const map = new Map();

    for (const c of d.calls || []) {
      if (c?.strike == null) continue;
      const key = Number(c.strike);
      const row = map.get(key) || { strike: key, call: null, put: null };
      row.call = c;
      map.set(key, row);
    }
    for (const p of d.puts || []) {
      if (p?.strike == null) continue;
      const key = Number(p.strike);
      const row = map.get(key) || { strike: key, call: null, put: null };
      row.put = p;
      map.set(key, row);
    }

    return Array.from(map.values()).sort((a, b) => a.strike - b.strike);
  }, [state.data]);

  // Basic formatting
  const fmt = (v, d = 2) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
  const fmtIv = (v) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(1));

  // Render helpers for states
  const renderCard = (title, sub) => (
    <div className="empty card">
      <div className="title">{title}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );

  const showEmpty =
    !symbol || state.status === "idle" || (state.status === "done" && rows.length === 0);

  return (
    <div className="wrap">
      <div className="heads">
        <div className="h-left">Calls</div>
        <div className="h-mid" />
        <div className="h-right">Puts</div>
      </div>

      {/* Column headers use same grid as rows for perfect alignment */}
      <div className="grid head-row" role="row">
        <div className="c cell" role="columnheader">Price</div>
        <div className="c cell" role="columnheader">Ask</div>
        <div className="c cell" role="columnheader">Bid</div>

        <div className="mid cell" role="columnheader">
          <span className="arrow" aria-hidden="true">↑</span> Strike
        </div>
        <div className="mid cell" role="columnheader">IV, %</div>

        <div className="p cell" role="columnheader">Bid</div>
        <div className="p cell" role="columnheader">Ask</div>
        <div className="p cell" role="columnheader">Price</div>
      </div>

      {/* State blocks (keep your original card style) */}
      {state.status === "loading" &&
        renderCard("Fetching option chain…", "Pulling data from Yahoo Finance.")}

      {state.status === "error" &&
        renderCard("Couldn’t load options", state.error)}

      {showEmpty &&
        renderCard(
          "No options loaded",
          `Pick a provider or upload a screenshot, then choose an expiry${
            expiry?.m && expiry?.d ? ` (e.g., ${expiry.m} ${expiry.d})` : ""
          }.`
        )}

      {/* Data rows */}
      {state.status === "done" && rows.length > 0 && (
        <div className="rows">
          {rows.slice(0, 25).map((r) => {
            const c = r.call || {};
            const p = r.put || {};
            const ivMid = c.ivPct ?? p.ivPct ?? null;

            return (
              <div className="grid row" key={r.strike}>
                {/* Calls side */}
                <div className="c cell">{fmt(c.price)}</div>
                <div className="c cell">{fmt(c.ask)}</div>
                <div className="c cell">{fmt(c.bid)}</div>

                {/* Middle */}
                <div className="mid cell">{fmt(r.strike, 0)}</div>
                <div className="mid cell">{fmtIv(ivMid)}</div>

                {/* Puts side */}
                <div className="p cell">{fmt(p.bid)}</div>
                <div className="p cell">{fmt(p.ask)}</div>
                <div className="p cell">{fmt(p.price)}</div>
              </div>
            );
          })}
        </div>
      )}

      <style jsx>{`
        .wrap{ margin-top:10px; }

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
        .head-row{
          padding: 8px 0 10px;
          border-top:1px solid var(--border, #E6E9EF);
          border-bottom:1px solid var(--border, #E6E9EF);
          font-weight:700; font-size:13.5px;
          color: var(--text, #2b3442);
        }
        .cell{ height:26px; display:flex; align-items:center; }
        .c{ justify-content:flex-start; }  /* Calls side */
        .p{ justify-content:flex-end; }    /* Puts side */
        .mid{ justify-content:center; text-align:center; }
        .arrow{ margin-right:6px; font-weight:900; color: var(--accent, #3b82f6); }

        .rows .row{
          padding: 8px 0;
          border-bottom: 1px solid color-mix(in srgb, var(--border, #E6E9EF) 60%, transparent);
          font-size: 14px;
          color: var(--text, #0f172a);
        }

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

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:20px; }
          .head-row{ font-size:13px; }
          .cell{ height:24px; }
        }
      `}</style>
    </div>
  );
}
