// components/Options/OptionsTab.jsx
"use client";

import React, { useMemo, useState } from "react";
import OptionsToolbar from "./OptionsToolbar";
import ChainSettings from "./ChainSettings";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // UI state only (no fetching yet)
  const [provider, setProvider] = useState("api");       // "api" | "upload"
  const [groupBy, setGroupBy] = useState("expiry");      // "expiry" | "strike"
  const [settingsOpen, setSettingsOpen] = useState(false);

  // ——— mock months/days strip (visual only) ———
  const months = useMemo(() => ([
    { m: "Aug", d: [15,22,29] },
    { m: "Sep", d: [5,12,19,26] },
    { m: "Oct", d: [17] },
    { m: "Nov", d: [21] },
    { m: "Dec", d: [19] },
    { m: "Jan ’26", d: [16] },
    { m: "Feb", d: [20] },
    { m: "Mar", d: [20] },
    { m: "May", d: [15] },
    { m: "Jun", d: [18] },
    { m: "Aug", d: [21] },
    { m: "Sep", d: [18] },
    { m: "Dec", d: [18] },
    { m: "Jan ’27", d: [15] },
    { m: "Jun", d: [17] },
    { m: "Dec", d: [17] },
  ]), []);

  const [sel, setSel] = useState({ mIdx: 1, day: 12 }); // default: Sep 12

  return (
    <section className="opt-wrap">
      <h2 className="title">Options</h2>

      {/* Top toolbar */}
      <OptionsToolbar
        provider={provider}
        onProviderChange={setProvider}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Months / days strip */}
      <div className="months" aria-label="Expiration months">
        {months.map((mm, idx) => (
          <div className="block" key={`${mm.m}-${idx}`}>
            <div className="mh">{mm.m}</div>
            <div className="days">
              {mm.d.map((dd) => {
                const active = sel.mIdx === idx && sel.day === dd;
                return (
                  <button
                    key={`${mm.m}-${dd}`}
                    type="button"
                    aria-pressed={active}
                    className={`day ${active ? "is-active" : ""}`}
                    onClick={() => setSel({ mIdx: idx, day: dd })}
                  >
                    {dd}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Section divider */}
      <div className="divider" />

      {/* Two symmetric headings */}
      <div className="hp">
        <h3 className="hp-title">Calls</h3>
        <h3 className="hp-title right">Puts</h3>
      </div>

      {/* Table header row */}
      <div className="thead">
        <div className="th l">Price</div>
        <div className="th l">Ask</div>
        <div className="th l">Bid</div>

        <div className="th c">
          <span className="u">↑</span> Strike
        </div>
        <div className="th c">IV, %</div>

        <div className="th r">Bid</div>
        <div className="th r">Ask</div>
        <div className="th r">Price</div>
      </div>

      {/* Empty state panel (unchanged logic) */}
      <div className="empty">
        <div className="empty-title">No options loaded</div>
        <div className="empty-sub">
          Pick a provider or upload a screenshot, then choose an expiry.
        </div>
      </div>

      {/* Settings popover */}
      {settingsOpen && (
        <div className="settings-pop">
          <ChainSettings
            onClose={() => setSettingsOpen(false)}
            // passthrough placeholders — wiring will come later
            showCount="20"
            sortDir="asc"
            columns={{ bid:true, ask:true, price:true }}
            onChange={() => {}}
          />
        </div>
      )}

      <style jsx>{`
        .opt-wrap{ margin-top:4px; }
        .title{
          font-size:36px; line-height:1.05; font-weight:900; letter-spacing:-.6px;
          margin:4px 0 14px;
        }

        /* Months strip */
        .months{
          display:flex; flex-wrap:wrap; gap:28px 24px; align-items:flex-start;
          padding:4px 0 6px;
        }
        .block{ min-width:160px; }
        .mh{
          font-weight:800; font-size:18px; letter-spacing:-.2px; opacity:.9; margin-bottom:10px;
        }
        .days{ display:flex; gap:10px; flex-wrap:wrap; }
        .day{
          height:44px; min-width:58px; padding:0 14px;
          border-radius:12px; border:1px solid var(--border, #e5e7eb);
          background: var(--card, #f6f7f8);
          font-weight:800; font-size:20px; letter-spacing:-.2px;
          color: var(--text, #0f172a);
        }
        .day.is-active{
          background: var(--text, #0f172a); color: var(--bg, #fff);
          border-color: var(--text, #0f172a);
        }

        .divider{ height:1px; background:var(--border,#e5e7eb); margin:14px 0 10px; }

        .hp{
          display:grid; grid-template-columns: 1fr 1fr; align-items:center;
          margin: 2px 0 6px;
        }
        .hp-title{
          font-size:28px; font-weight:900; letter-spacing:-.4px; margin:0;
        }
        .hp-title.right{ text-align:right; }

        /* Table header — symmetric 8 columns */
        .thead{
          display:grid;
          grid-template-columns: repeat(3, 1fr) repeat(2, 1.1fr) repeat(3, 1fr);
          gap: 8px;
          align-items:center;
          padding: 8px 0 12px;
          position:sticky; top:0; /* harmless on long lists later */
          background: var(--bg, #fff);
          z-index:1;
        }
        .th{ font-weight:800; font-size:18px; letter-spacing:-.2px; opacity:.85; }
        .th.l{ text-align:left; }
        .th.c{ text-align:center; }
        .th.r{ text-align:right; }
        .u{ opacity:.6; margin-right:6px; }

        .empty{
          margin-top:10px;
          border:1px solid var(--border,#e5e7eb);
          background: var(--card,#f7f8fa);
          border-radius:14px;
          padding:22px 20px;
        }
        .empty-title{ font-weight:900; margin-bottom:6px; }
        .empty-sub{ opacity:.75; }

        /* Settings popover anchored to the right */
        .settings-pop{
          position: absolute;
          right: 6px;
          margin-top: -48px; /* visually anchored to the gear */
          z-index: 10;
        }

        @media (max-width: 900px){
          .title{ font-size:28px; }
          .day{ height:40px; min-width:52px; font-size:18px; }
          .mh{ font-size:16px; }
          .th{ font-size:16px; }
        }
      `}</style>
    </section>
  );
}
