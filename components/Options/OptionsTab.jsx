// components/Options/OptionsTab.jsx
"use client";

import { useMemo, useRef, useState } from "react";
import ChainSettings from "./ChainSettings";
import ChainTable from "./ChainTable";

const DEFAULT_SETTINGS = {
  showBy: "20",
  customRows: 25,
  sort: "asc",
  cols: {
    bid: true, ask: true, price: true,
    delta: false, gamma: false, theta: false, vega: false, rho: false,
    tval: false, ival: false, askIv: false, bidIv: false,
  },
};

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  const [provider, setProvider] = useState("api");
  const [groupBy, setGroupBy] = useState("expiry");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // settings popover
  const [openSettings, setOpenSettings] = useState(false);
  const settingsBtnRef = useRef(null);

  // mock months/days (UI only for structure right now)
  const months = useMemo(() => ([
    { m: "Aug", d: [15, 22, 29] },
    { m: "Sep", d: [5, 12, 19, 26] },
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

  const [activeMonth, setActiveMonth] = useState(5);
  const [activeDay, setActiveDay]   = useState(0);

  return (
    <div className="opts">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="l">
          <button className={`chip ${provider === "api" ? "is-active" : ""}`} onClick={() => setProvider("api")}>API</button>
          <button className={`chip ${provider === "upload" ? "is-active" : ""}`} onClick={() => setProvider("upload")}>Upload</button>
        </div>

        <div className="r">
          <div className="seg">
            <button className={`seg-btn ${groupBy === "expiry" ? "is-active" : ""}`} onClick={() => setGroupBy("expiry")}>By expiration</button>
            <button className={`seg-btn ${groupBy === "strike" ? "is-active" : ""}`} onClick={() => setGroupBy("strike")}>By strike</button>
          </div>
          <button
            ref={settingsBtnRef}
            className="icon-btn"
            aria-haspopup="dialog"
            aria-expanded={openSettings}
            onClick={() => setOpenSettings(v => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M19 12a7 7 0 0 0-.06-.9l2.04-1.58-1.9-3.29-2.4.96a7 7 0 0 0-1.56-.9l-.36-2.55h-3.8l-.36 2.55c-.55.22-1.07.52-1.56.9l-2.4-.96-1.9 3.3L5.06 11.1a6.9 6.9 0 0 0 0 1.8l-2.04 1.58 1.9 3.29 2.4-.96c.48.38 1 .68 1.56.9l.36 2.55h3.8l.36-2.55c.55-.22 1.07-.52 1.56-.9l2.4.96 1.9-3.29L18.94 12.9c.04-.3.06-.6.06-.9Z" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expiry strip (single horizontal line of months, dates in vertical columns) */}
      <div className="expiry-wrap">
        <div className="months">
          {months.map((m, i) => (
            <div className="month" key={`${m.m}-${i}`}>
              <div className="m-title">{m.m}</div>
              <div className="days">
                {m.d.map((d, j) => {
                  const active = i === activeMonth && j === activeDay;
                  return (
                    <button
                      key={`${i}-${j}`}
                      type="button"
                      className={`day ${active ? "is-active" : ""}`}
                      onClick={() => { setActiveMonth(i); setActiveDay(j); }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="strip-underline" />
      </div>

      {/* Head row for the table */}
      <div className="table-head">
        <div className="h-left">
          <h3 className="h-title">Calls</h3>
          <div className="cols">
            <span>Price</span><span>Ask</span><span>Bid</span>
            <span className="strike">↑&nbsp;Strike</span><span>IV, %</span>
          </div>
        </div>
        <div className="h-right">
          <h3 className="h-title">Puts</h3>
          <div className="cols"><span>Bid</span><span>Ask</span><span>Price</span></div>
        </div>
      </div>

      {/* Table area (empty state for now) */}
      <div className="table-body">
        <ChainTable
          provider={provider}
          groupBy={groupBy}
          symbol={symbol}
          currency={currency}
          settings={settings}
        />
      </div>

      {/* Settings popover */}
      <ChainSettings
        open={openSettings}
        anchorEl={settingsBtnRef.current}
        settings={settings}
        onChange={setSettings}
        onClose={() => setOpenSettings(false)}
      />

      <style jsx>{`
        .opts{
          /* size tokens to keep consistency everywhere */
          --chip-h: 40px;
          --seg-h: 36px;
          --icon-h: 44px;
          --date-chip-h: 36px;
          --date-chip-minw: 56px;
          --date-font: 16px;       /* smaller dates per your request */
          --month-font: 16px;
        }

        /* Toolbar */
        .toolbar{
          display:flex; align-items:center; justify-content:space-between; gap:16px;
          margin:4px 0 2px;
        }
        .l{ display:flex; gap:10px; }

        .chip{
          height:var(--chip-h); padding:0 16px; border-radius:12px;
          border:1px solid var(--border); background:var(--card);
          font-weight:700; font-size:14px; cursor:pointer;
        }
        .chip.is-active{ outline:2px solid var(--accent,#3b82f6); }

        .r{ display:flex; align-items:center; gap:10px; }
        .seg{ display:flex; border:1px solid var(--border); background:var(--card); border-radius:14px; padding:3px; }
        .seg-btn{
          height:var(--seg-h); padding:0 14px; border:0; background:transparent;
          border-radius:10px; font-weight:800; font-size:14px; opacity:.9; cursor:pointer;
        }
        .seg-btn.is-active{ background:var(--surface,#eef2f7); opacity:1; }

        .icon-btn{
          height:var(--icon-h); width:var(--icon-h); border-radius:12px;
          border:1px solid var(--border); background:var(--card);
          display:flex; align-items:center; justify-content:center; cursor:pointer;
        }

        /* Expiry strip — single row of months; vertical date columns; scrolls horizontally */
        .expiry-wrap{ margin:12px 0 18px; }
        .months{
          display:flex; gap:28px; overflow-x:auto; padding:2px 2px 8px;
          scrollbar-width:none; -ms-overflow-style:none; white-space:nowrap;
        }
        .months::-webkit-scrollbar{ display:none; }
        .month{
          flex:0 0 auto; min-width:120px; display:flex; flex-direction:column;
          gap:10px;
        }
        .m-title{
          font-size:var(--month-font); font-weight:800; line-height:1.1;
          padding-bottom:6px; border-bottom:2px solid var(--border);
        }
        .days{ display:flex; flex-direction:column; gap:10px; }
        .day{
          height:var(--date-chip-h); min-width:var(--date-chip-minw);
          padding:0 12px; border-radius:12px; border:1px solid var(--border);
          background:var(--surface,#f5f7fa); font-weight:800; font-size:var(--date-font);
          color:var(--text); display:flex; align-items:center; justify-content:center; cursor:pointer;
        }
        .day.is-active{ background:#0f172a; color:#fff; border-color:#0f172a; box-shadow:0 2px 0 rgba(0,0,0,.1); }

        .strip-underline{ height:6px; border-radius:999px; background:var(--border); margin-top:12px; }

        /* Table header shells */
        .table-head{
          display:grid; grid-template-columns:1fr 1fr; gap:24px;
          align-items:end; border-bottom:1px solid var(--border); padding-bottom:10px;
        }
        .h-title{ font-size:28px; font-weight:800; margin:0 0 8px; }
        .cols{
          display:grid; grid-template-columns: 1fr 1fr 1fr 1.2fr 1fr; column-gap:22px;
          font-size:16px; font-weight:700; opacity:.9;
        }
        .h-right .cols{ grid-template-columns:1fr 1fr 1fr; }
        .strike{ display:flex; align-items:center; gap:6px; }

        .table-body{ margin-top:14px; }
        @media (max-width:1100px){
          .h-title{ font-size:24px; }
        }
      `}</style>
    </div>
  );
}
