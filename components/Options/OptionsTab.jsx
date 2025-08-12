// components/Options/OptionsTab.jsx
"use client";

import { useMemo, useRef, useState } from "react";
import ChainTable from "./ChainTable";
import ChainSettings from "./ChainSettings";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // Provider + grouping
  const [provider, setProvider] = useState("api");     // 'api' | 'upload'
  const [groupBy, setGroupBy] = useState("expiry");    // 'expiry' | 'strike'

  // Settings popover
  const [showSettings, setShowSettings] = useState(false);
  const settingsAnchorRef = useRef(null);
  const [settings, setSettings] = useState({
    showBy: "10",            // '10' | '20' | 'all' | 'custom'
    customRows: 25,
    sort: "asc",             // 'asc' | 'desc'
    cols: {
      bid: true, ask: true, price: true,
      delta: true, gamma: true, theta: true, vega: true, rho: true,
      tval: false, ival: false, askIv: false, bidIv: false,
    },
  });

  // Simple static expiries (visual scaffolding)
  const expiries = useMemo(
    () => [
      { m: "Aug", days: [15, 22, 29] },
      { m: "Sep", days: [5, 12, 19, 26] },
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
    ],
    []
  );

  // Selected expiry
  const [sel, setSel] = useState({ m: "Jan ’26", d: 16 });

  return (
    <section className="opt">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="left">
          <button
            type="button"
            className={`pill ${provider === "api" ? "is-on" : ""}`}
            onClick={() => setProvider("api")}
            aria-pressed={provider === "api"}
          >
            API
          </button>
          <button
            type="button"
            className={`pill ${provider === "upload" ? "is-on" : ""}`}
            onClick={() => setProvider("upload")}
            aria-pressed={provider === "upload"}
          >
            Upload
          </button>
        </div>

        <div className="right">
          <button
            type="button"
            className={`seg ${groupBy === "expiry" ? "is-on" : ""}`}
            onClick={() => setGroupBy("expiry")}
          >
            By expiration
          </button>
          <button
            type="button"
            className={`seg ${groupBy === "strike" ? "is-on" : ""}`}
            onClick={() => setGroupBy("strike")}
          >
            By strike
          </button>

          <button
            ref={settingsAnchorRef}
            type="button"
            className="gear"
            aria-label="Chain table settings"
            aria-expanded={showSettings}
            onClick={() => setShowSettings(v => !v)}
          >
            {/* Refined outline gear icon */}
            <svg
              width="18" height="18" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="1.75"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            >
              <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.54-.94 3.308.826 2.37 2.366a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.54-.826 3.308-2.366 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.54.94-3.308-.826-2.37-2.366a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.54.826-3.308 2.366-2.37.996.608 2.296.07 2.572-1.065Z" />
              <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>

          {/* Anchored settings popover */}
          <ChainSettings
            open={showSettings}
            anchorEl={settingsAnchorRef.current}
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        </div>
      </div>

      {/* Expiry strip */}
      <div className="expiry-wrap">
        <div className="expiry">
          {expiries.map((g) => (
            <div className="group" key={g.m}>
              <div className="m">{g.m}</div>
              <div className="days">
                {g.days.map((d) => {
                  const active = sel.m === g.m && sel.d === d;
                  return (
                    <button
                      key={`${g.m}-${d}`}
                      className={`day ${active ? "is-active" : ""}`}
                      onClick={() => setSel({ m: g.m, d })}
                      aria-pressed={active}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Chain table */}
      <ChainTable
        symbol={symbol}
        currency={currency}
        provider={provider}
        groupBy={groupBy}
        expiry={sel}
        settings={settings}
      />

      <style jsx>{`
        /* ---- Layout wrappers ---- */
        .opt { margin-top: 6px; }
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin: 6px 0 10px;
        }
        .left, .right{ display:flex; align-items:center; gap:10px; }
        .right{ position:relative; }

        /* ---- Buttons ---- */
        .pill{
          height:36px; padding:0 14px; border-radius:12px;
          border:1px solid var(--border, #E6E9EF); background:#fff;
          font-weight:700; font-size:14px; line-height:1; color:#0f172a;
        }
        .pill.is-on{ border-color:#bcd3ff; background:#eef5ff; }

        .seg{
          height:38px; padding:0 16px; border-radius:14px;
          border:1px solid var(--border, #E6E9EF);
          background:#f5f7fa; font-weight:800; font-size:15px;
          color:#0f172a; line-height:1;
        }
        .seg.is-on{ background:#eaf2ff; border-color:#cfe2ff; }

        .gear{
          height:38px; width:42px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:14px; border:1px solid var(--border, #E6E9EF); background:#fff;
          color:#0f172a;
        }

        /* ---- Expiry strip ---- */
        .expiry-wrap{
          margin: 14px 0 18px;
          padding: 2px 0 10px;
          border-bottom: 2px solid #E9EDF3;
        }
        .expiry{
          display:flex; align-items:flex-start; gap:28px;
          overflow-x:auto; overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch; padding-bottom:6px;
        }
        .expiry::-webkit-scrollbar{ height:6px; }
        .expiry::-webkit-scrollbar-thumb{ background:#e1e6ef; border-radius:999px; }

        .group{ flex:0 0 auto; }
        .m{
          font-weight:800; font-size:17px; letter-spacing:.2px; color:#0f172a;
          padding:0 0 6px 0;
          border-bottom:1px solid #E6E9EF;
          margin-bottom:8px;
        }
        .days{ display:flex; gap:10px; }

        .day{
          min-width:46px; height:34px; padding:0 10px;
          border-radius:12px; border:1px solid #E6E9EF;
          background:#f4f6f9; font-weight:800; font-size:16px; color:#0f172a;
          display:inline-flex; align-items:center; justify-content:center;
        }
        .day.is-active{
          background:#0f172a; color:#fff; border-color:#0f172a;
        }

        @media (max-width: 840px){
          .seg{ height:36px; padding:0 14px; font-size:14px; }
          .m{ font-size:16px; }
          .day{ height:32px; min-width:42px; font-size:15px; }
        }
      `}</style>
    </section>
  );
}
