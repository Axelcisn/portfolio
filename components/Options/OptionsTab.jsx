// components/Options/OptionsTab.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import ChainTable from "./ChainTable";
import ChainSettings from "./ChainSettings";
import ExpiryStrip from "./ExpiryStrip";

/**
 * OptionsTab
 * - Provider selector (API / Upload)
 * - Grouping selector (By expiration / By strike) + Settings button
 * - Horizontal Expiry strip (single row, scrollable)
 * - Calls / Puts header row + ChainTable placeholder
 *
 * Data wiring (API / OCR) comes next — this file focuses on layout & UX.
 */
export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // --- top controls state ---
  const [provider, setProvider] = useState("api"); // 'api' | 'upload'
  const [groupBy, setGroupBy] = useState("expiry"); // 'expiry' | 'strike'

  // currently selected expiry (YYYY-MM-DD)
  const [expiry, setExpiry] = useState(null);

  // settings popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef(null);
  const [settingsPos, setSettingsPos] = useState({ top: 0, left: 0 });

  // Chain/table settings (values are placeholders; ChainSettings controls visuals)
  const [tableSettings, setTableSettings] = useState({
    showBy: "20", // '10' | '20' | 'all' | 'custom'
    customRows: 25,
    sort: "asc", // 'asc' | 'desc'
    columns: {
      bid: true,
      ask: true,
      price: true,
      delta: false,
      gamma: false,
      theta: false,
      vega: false,
      rho: false,
      timeValue: false,
      intrValue: false,
      askIvPct: false,
      bidIvPct: false,
    },
  });

  // place the settings panel right under the button
  useEffect(() => {
    if (!settingsOpen || !settingsBtnRef.current) return;
    const r = settingsBtnRef.current.getBoundingClientRect();
    setSettingsPos({
      top: r.bottom + window.scrollY + 8,
      left: r.left + window.scrollX,
    });
  }, [settingsOpen]);

  // demo: we keep the “No options loaded” table until we wire data sources
  const providerLabel = useMemo(
    () => (provider === "api" ? "API" : "Upload"),
    [provider]
  );

  return (
    <div className="options-tab">
      {/* Top toolbar (provider on the left, grouping + settings on the right) */}
      <div className="toolbar">
        <div className="left">
          <button
            type="button"
            className={`pill ${provider === "api" ? "is-active" : ""}`}
            onClick={() => setProvider("api")}
          >
            API
          </button>
          <button
            type="button"
            className={`pill ${provider === "upload" ? "is-active" : ""}`}
            onClick={() => setProvider("upload")}
          >
            Upload
          </button>
        </div>

        <div className="right">
          <div className="group">
            <button
              type="button"
              className={`pill ${groupBy === "expiry" ? "is-active" : ""}`}
              onClick={() => setGroupBy("expiry")}
            >
              By expiration
            </button>
            <button
              type="button"
              className={`pill ${groupBy === "strike" ? "is-active" : ""}`}
              onClick={() => setGroupBy("strike")}
            >
              By strike
            </button>
          </div>

          <button
            type="button"
            ref={settingsBtnRef}
            className="icon-btn"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
            title="Chain table settings"
          >
            <span aria-hidden>⚙︎</span>
            <span className="sr-only">Open chain settings</span>
          </button>
        </div>
      </div>

      {/* Expiry strip — single horizontal row (shows fallback demo until wired) */}
      <div className="expiry-wrap">
        <ExpiryStrip
          expiries={[]} // pass real expiries when available
          value={expiry}
          onChange={setExpiry}
        />
      </div>

      {/* Columns header line */}
      <div className="cols-head">
        <div className="side">
          <h3 className="side-title">Calls</h3>
          <div className="cols">
            <div className="c">Price</div>
            <div className="c">Ask</div>
            <div className="c">Bid</div>
          </div>
        </div>

        <div className="mid">
          <div className="c">
            <span className="arrow">↑</span> Strike
          </div>
          <div className="c">IV, %</div>
        </div>

        <div className="side">
          <h3 className="side-title align-right">Puts</h3>
          <div className="cols align-right">
            <div className="c">Bid</div>
            <div className="c">Ask</div>
            <div className="c">Price</div>
          </div>
        </div>
      </div>

      {/* Chain table (placeholder until provider is wired) */}
      <div className="table-wrap">
        <ChainTable
          provider={provider}
          groupBy={groupBy}
          expiry={expiry}
          settings={tableSettings}
          symbol={symbol}
          currency={currency}
        />
      </div>

      {/* Settings popover (aligned with button) */}
      {settingsOpen && (
        <div
          className="settings-pop"
          style={{ top: settingsPos.top, left: settingsPos.left }}
          role="dialog"
          aria-label="Chain table settings"
        >
          <ChainSettings
            values={tableSettings}
            onChange={setTableSettings}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}

      <style jsx>{`
        .options-tab {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* --- Toolbar ------------------------------------------------------ */
        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 4px;
        }
        .left,
        .group {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .pill {
          height: 40px;
          padding: 0 14px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--text);
          font-size: 14px; /* compact & consistent */
          font-weight: 800;
          line-height: 1;
        }
        .pill.is-active {
          background: #eef4ff;
          border-color: #c7d7fe;
          color: #1e3a8a;
        }
        .icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--card);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-left: 8px;
        }
        .icon-btn:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        /* --- Expiry strip container -------------------------------------- */
        .expiry-wrap {
          margin-top: 6px;
          margin-bottom: 10px;
        }

        /* --- Column headers ------------------------------------------------ */
        .cols-head {
          display: grid;
          grid-template-columns: 1fr 320px 1fr; /* calls | center | puts */
          align-items: end;
          gap: 16px;
          padding: 4px 0 10px;
          border-bottom: 1px solid var(--border);
        }
        .side-title {
          margin: 0 0 8px 0;
          font-size: 18px; /* smaller, site-typography */
          font-weight: 800;
          letter-spacing: -0.2px;
        }
        .align-right {
          text-align: right;
        }
        .cols {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          font-size: 13px;
          font-weight: 700;
          opacity: 0.85;
        }
        .cols.align-right .c {
          text-align: right;
        }
        .mid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          font-size: 13px;
          font-weight: 700;
          opacity: 0.85;
          text-align: center;
        }
        .arrow {
          margin-right: 6px;
        }

        /* --- Table area --------------------------------------------------- */
        .table-wrap {
          margin-top: 8px;
        }

        /* --- Settings popover -------------------------------------------- */
        .settings-pop {
          position: absolute;
          z-index: 40;
        }

        /* --- A11y --------------------------------------------------------- */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          border: 0;
        }

        @media (max-width: 1100px) {
          .cols-head {
            grid-template-columns: 1fr 240px 1fr;
          }
        }
      `}</style>
    </div>
  );
}
