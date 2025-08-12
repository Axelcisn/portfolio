// components/Options/OptionsTab.jsx
"use client";

import { useMemo, useRef, useState } from "react";
import ChainSettings from "./ChainSettings";
import ChainTable from "./ChainTable";

/** Quick defaults for the settings menu */
const DEFAULT_SETTINGS = {
  showBy: "20",          // "10" | "20" | "all" | "custom"
  customRows: 25,
  sort: "asc",           // "asc" | "desc"
  cols: { bid: true, ask: true, price: true, delta: false, gamma: false, theta: false, vega: false, rho: false, tval: false, ival: false, askIv: false, bidIv: false },
};

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  const [provider, setProvider] = useState("api");           // "api" | "upload"
  const [groupBy, setGroupBy] = useState("expiry");          // "expiry" | "strike"
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // settings popover state + anchor
  const [openSettings, setOpenSettings] = useState(false);
  const settingsBtnRef = useRef(null);

  // months mock (UI only for now)
  const months = useMemo(
    () => ([
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
    ]),
    []
  );

  const [activeMonth, setActiveMonth] = useState(5); // zero-based index into months
  const [activeDay, setActiveDay] = useState(0);

  return (
    <div className="opts">
      {/* Toolbar: provider + view toggles + settings */}
      <div className="toolbar">
        <div className="l">
          <button
            className={`chip ${provider === "api" ? "is-active" : ""}`}
            onClick={() => setProvider("api")}
          >
            API
          </button>
          <button
            className={`chip ${provider === "upload" ? "is-active" : ""}`}
            onClick={() => setProvider("upload")}
          >
            Upload
          </button>
        </div>

        <div className="r">
          <div className="seg">
            <button
              className={`seg-btn ${groupBy === "expiry" ? "is-active" : ""}`}
              onClick={() => setGroupBy("expiry")}
            >
              By expiration
            </button>
            <button
              className={`seg-btn ${groupBy === "strike" ? "is-active" : ""}`}
              onClick={() => setGroupBy("strike")}
            >
              By strike
            </button>
          </div>

          <button
            ref={settingsBtnRef}
            className="icon-btn"
            aria-haspopup="dialog"
            aria-expanded={openSettings}
            onClick={() => setOpenSettings((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M19 12a7 7 0 0 0-.06-.9l2.04-1.58-1.9-3.29-2.4.96a7 7 0 0 0-1.56-.9l-.36-2.55h-3.8l-.36 2.55c-.55.22-1.07.52-1.56.9l-2.4-.96-1.9 3.3L5.06 11.1a6.9 6.9 0 0 0 0 1.8l-2.04 1.58 1.9 3.29 2.4-.96c.48.38 1 .68 1.56.9l.36 2.55h3.8l.36-2.55c.55-.22 1.07-.52 1.56-.9l2.4.96 1.9-3.29L18.94 12.9c.04-.3.06-.6.06-.9Z" stroke="currentColor" strokeWidth="1.6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Expiry strip (more space above/below) */}
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

      {/* Header row for the (future) chain table */}
      <div className="table-head">
        <div className="h-left">
          <h3 className="h-title">Calls</h3>
          <div className="cols">
            <span>Price</span>
            <span>Ask</span>
            <span>Bid</span>
            <span className="strike">↑&nbsp;Strike</span>
            <span>IV, %</span>
          </div>
        </div>

        <div className="h-right">
          <h3 className="h-title">Puts</h3>
          <div className="cols">
            <span>Bid</span>
            <span>Ask</span>
            <span>Price</span>
          </div>
        </div>
      </div>

      {/* Empty state (table content will come later) */}
      <div className="table-body">
        <ChainTable
          provider={provider}
          groupBy={groupBy}
          symbol={symbol}
          currency={currency}
          settings={settings}
        />
      </div>

      {/* Settings popover (anchored to the gear button) */}
      <ChainSettings
        open={openSettings}
        anchorEl={settingsBtnRef.current}
        settings={settings}
        onChange={setSettings}
        onClose={() => setOpenSettings(false)}
      />

      <style jsx>{`
        .opts { }

        /* Toolbar */
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin:4px 0 6px;
        }
        .l{ display:flex; gap:10px; }
        .r{ display:flex; gap:10px; align-items:center; }

        .chip{
          height:40px; padding:0 16px; border-radius:12px; border:1px solid var(--border);
          background:var(--card); font-weight:700; font-size:14px; cursor:pointer;
        }
        .chip.is-active{ outline:2px solid var(--accent, #3b82f6); }

        .seg{
          display:flex; border:1px solid var(--border); background:var(--card);
          border-radius:14px; padding:3px;
        }
        .seg-btn{
          height:36px; padding:0 14px; border-radius:10px; border:0; background:transparent;
          font-weight:800; font-size:14px; opacity:.85; cursor:pointer;
        }
        .seg-btn.is-active{ background:var(--surface, #eef2f7); opacity:1; }

        .icon-btn{
          height:44px; width:44px; border-radius:12px; border:1px solid var(--border);
          background:var(--card); display:flex; align-items:center; justify-content:center;
          cursor:pointer;
        }

        /* Expiry strip — more spacing */
        .expiry-wrap{ margin:18px 0 22px; }
        .months{
          display:grid;
          grid-template-columns: repeat(8, minmax(120px, 1fr));
          gap:14px 22px;
        }
        .month{ min-width:120px; }
        .m-title{
          font-size:18px; font-weight:800; line-height:1.1;
          padding-bottom:6px; border-bottom:2px solid var(--border);
          margin-bottom:8px;
        }
        .days{ display:flex; flex-wrap:wrap; gap:10px; }
        .day{
          height:42px; min-width:60px; padding:0 12px; border-radius:14px;
          border:1px solid var(--border); background:var(--surface, #f5f7fa);
          font-weight:800; font-size:20px; color:var(--text);
          display:flex; align-items:center; justify-content:center; cursor:pointer;
        }
        .day.is-active{
          background:#0f172a; color:#fff; border-color:#0f172a;
          box-shadow:0 2px 0 rgba(0,0,0,.1);
        }
        .strip-underline{
          height:6px; border-radius:999px; background:var(--border);
          margin-top:12px;
        }

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
        @media (max-width:1200px){
          .months{ grid-template-columns: repeat(4, minmax(120px, 1fr)); }
        }
      `}</style>
    </div>
  );
}
