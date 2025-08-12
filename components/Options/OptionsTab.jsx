// components/Options/OptionsTab.jsx
"use client";

import React, { useMemo, useState } from "react";
import OptionsToolbar from "./OptionsToolbar";
import ChainTable from "./ChainTable";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // --- local demo state (no fetching yet) ---
  const [provider, setProvider] = useState("api");       // "api" | "upload"
  const [mode, setMode] = useState("expiry");            // "expiry" | "strike"
  const [settings, setSettings] = useState({
    rows: 20,
    custom: 25,
    sort: "asc",
    columns: { bid: true, ask: true, price: true },
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Fake expiries just for structure (you’ll wire real data later)
  const months = useMemo(() => ([
    { m: "Aug", days: [15,22,29] },
    { m: "Sep", days: [5,12,19,26] },
    { m: "Oct", days: [17] },
    { m: "Nov", days: [21] },
    { m: "Dec", days: [19] },
    { m: "Jan ’26", days: [16] },
    { m: "Feb", days: [20] },
    { m: "Mar", days: [20] },
    { m: "May", days: [15] },
    { m: "Jun", days: [18] },
    { m: "Aug", days: [21] },
    { m: "Sep", days: [18] },
    { m: "Dec", days: [18] },
    { m: "Jan ’27", days: [15] },
    { m: "Jun", days: [17] },
    { m: "Dec", days: [17] },
  ]), []);

  const [active, setActive] = useState({ m: months[1]?.m, d: months[1]?.days?.[1] });

  return (
    <section className="options-root">
      {/* Toolbar (provider, grouping, settings) */}
      <OptionsToolbar
        provider={provider}
        onProviderChange={setProvider}
        mode={mode}
        onModeChange={setMode}
        settings={settings}
        onSettingsChange={setSettings}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
      />

      {/* Expiry scroller */}
      <div className="grid">
        {months.map((block, i) => (
          <div key={`${block.m}-${i}`} className="col">
            <div className="mon">{block.m}</div>
            <div className="days">
              {block.days.map((d) => {
                const on = active.m === block.m && active.d === d;
                return (
                  <button
                    key={`${block.m}-${d}`}
                    type="button"
                    className={`chip ${on ? "on" : ""}`}
                    onClick={() => setActive({ m: block.m, d })}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Dual table header */}
      <div className="split-head">
        <h3 className="sub">Calls</h3>
        <h3 className="sub right">Puts</h3>
      </div>

      {/* Chain table shell */}
      <ChainTable
        provider={provider}
        mode={mode}
        settings={settings}
        currency={currency}
        symbol={symbol}
      />

      <style jsx>{`
        .options-root{ margin-top:6px; }

        /* Months row */
        .grid{
          display:grid;
          grid-template-columns: repeat(8, minmax(0,1fr));
          gap:18px 22px; margin: 8px 0 14px;
        }
        @media (max-width:1200px){ .grid{ grid-template-columns: repeat(6, minmax(0,1fr)); } }
        @media (max-width:900px){ .grid{ grid-template-columns: repeat(4, minmax(0,1fr)); } }

        .col{ display:flex; flex-direction:column; gap:10px; }
        .mon{
          font-size:14px; font-weight:800; letter-spacing:-.1px; opacity:.9;
        }
        .days{ display:flex; gap:10px; flex-wrap:wrap; }
        .chip{
          min-width:46px; height:36px; border-radius:12px;
          border:1px solid var(--border); background:var(--bg-soft,#f7f8fa);
          font-weight:800; font-size:15px; letter-spacing:-.2px;
          color:var(--text); opacity:.95; padding:0 12px;
        }
        .chip.on{
          background:var(--text); color:var(--bg,#fff);
        }

        /* Section heads above table */
        .split-head{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items:end; margin: 12px 0 6px; }
        .sub{
          font-size:20px; line-height:1.1; font-weight:800; letter-spacing:-.2px; margin:0;
        }
        .right{ text-align:right; }

      `}</style>
    </section>
  );
}
