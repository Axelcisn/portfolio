// components/Options/OptionsToolbar.jsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import ChainSettings from "./ChainSettings";

export default function OptionsToolbar({
  /* Provider: "api" | "upload" */
  provider = "api",
  onProviderChange = () => {},

  /* Ticker / symbol */
  symbol = "",
  onSymbolChange = () => {},
  onLoad = () => {},

  /* Expiry */
  expiry = "",
  expiryOptions = [], // array of strings OR { value, label }
  onExpiryChange = () => {},

  /* Chain grouping mode: "expiration" | "strike" */
  mode = "expiration",
  onModeChange = () => {},

  /* Table settings */
  settings,
  onSettingsChange = () => {},

  /* Misc */
  disabled = false,
}) {
  const [showSettings, setShowSettings] = useState(false);
  const settingsBtnRef = useRef(null);
  const menuRef = useRef(null);

  // Close settings when clicking outside
  useEffect(() => {
    if (!showSettings) return;
    const onDoc = (e) => {
      if (!menuRef.current) return;
      if (
        menuRef.current.contains(e.target) ||
        settingsBtnRef.current?.contains(e.target)
      ) {
        return;
      }
      setShowSettings(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [showSettings]);

  const handleUse = () => {
    if (!symbol?.trim()) return;
    onLoad(symbol.trim());
  };

  // Normalize expiry options to { value, label }
  const opts = (expiryOptions || []).map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  return (
    <div className="toolbar">
      {/* Provider selector */}
      <div className="seg">
        <button
          type="button"
          className={`seg-btn ${provider === "api" ? "is-active" : ""}`}
          onClick={() => onProviderChange("api")}
          aria-pressed={provider === "api"}
        >
          <span className="badge">API</span>
        </button>
        <button
          type="button"
          className={`seg-btn ${provider === "upload" ? "is-active" : ""}`}
          onClick={() => onProviderChange("upload")}
          aria-pressed={provider === "upload"}
        >
          Upload screenshot
        </button>
      </div>

      {/* Ticker input + Use */}
      <div className="ticker">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          placeholder="Ticker (e.g., AAPL)"
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleUse();
          }}
          aria-label="Ticker"
          disabled={disabled}
        />
        <button
          type="button"
          className="use-btn"
          onClick={handleUse}
          disabled={disabled || !symbol?.trim()}
          title="Fetch chain"
        >
          Use
        </button>
      </div>

      {/* Expiry dropdown */}
      <div className="expiry">
        <label className="lbl">Expiry</label>
        <div className="select-wrap">
          <select
            value={expiry || ""}
            onChange={(e) => onExpiryChange(e.target.value)}
            disabled={disabled || !symbol?.trim()}
            aria-label="Expiry"
          >
            <option value="" disabled>
              Select…
            </option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="chev" aria-hidden="true">▾</span>
        </div>
      </div>

      {/* Grouping toggle + settings */}
      <div className="right">
        <div className="seg small">
          <button
            type="button"
            className={`seg-btn ${mode === "expiration" ? "is-active" : ""}`}
            onClick={() => onModeChange("expiration")}
            aria-pressed={mode === "expiration"}
          >
            By expiration
          </button>
          <button
            type="button"
            className={`seg-btn ${mode === "strike" ? "is-active" : ""}`}
            onClick={() => onModeChange("strike")}
            aria-pressed={mode === "strike"}
          >
            By strike
          </button>
        </div>

        <button
          ref={settingsBtnRef}
          type="button"
          className="icon-btn"
          aria-label="Chain table settings"
          onClick={() => setShowSettings((s) => !s)}
          title="Chain table settings"
        >
          {/* hex gear icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="m12 2 1.2 2.7 3 .3 1.9 2-1.1 2.8 1.1 2.8-1.9 2-3 .3L12 22l-1.2-2.7-3-.3-1.9-2 1.1-2.8-1.1-2.8 1.9-2 3-.3L12 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
        </button>

        {showSettings && (
          <div ref={menuRef} className="settings-fly">
            <ChainSettings
              value={settings}
              onChange={onSettingsChange}
              onClose={() => setShowSettings(false)}
              anchorRef={settingsBtnRef}
            />
          </div>
        )}
      </div>

      <style jsx>{`
        .toolbar {
          display: grid;
          grid-template-columns: auto minmax(260px, 1fr) auto auto;
          gap: 10px 12px;
          align-items: center;
          padding: 8px 0 12px;
        }

        /* segmented controls */
        .seg {
          display: inline-flex;
          background: var(--card, #0e0e10);
          border: 1px solid var(--border, #2a2a2a);
          border-radius: 12px;
          overflow: hidden;
          height: 40px;
        }
        .seg.small { height: 36px; }
        .seg-btn {
          padding: 0 12px;
          font-weight: 700;
          font-size: 13px;
          color: var(--text, #eaeaea);
          background: transparent;
          border: 0;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          opacity: 0.85;
        }
        .seg-btn + .seg-btn { border-left: 1px solid var(--border, #2a2a2a); }
        .seg-btn:hover { opacity: 1; }
        .seg-btn.is-active {
          background: var(--accent-weak, rgba(59,130,246,.12));
          color: var(--accent, #3b82f6);
        }
        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 22px;
          padding: 0 6px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 12px;
          background: var(--accent, #3b82f6);
          color: #fff;
        }

        /* ticker */
        .ticker {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
        }
        .ticker input {
          height: 40px;
          border-radius: 12px;
          border: 1px solid var(--border, #2a2a2a);
          background: var(--card, #0e0e10);
          color: var(--text, #eaeaea);
          padding: 0 12px;
          font-weight: 700;
          letter-spacing: .4px;
        }
        .use-btn {
          height: 40px;
          padding: 0 16px;
          border-radius: 12px;
          border: 0;
          font-weight: 800;
          background: var(--accent, #3b82f6);
          color: #fff;
          cursor: pointer;
        }
        .use-btn[disabled] {
          opacity: .5; cursor: not-allowed;
        }

        /* expiry */
        .expiry { display: inline-flex; align-items: center; gap: 10px; }
        .lbl { font-size: 12px; opacity: .7; }
        .select-wrap { position: relative; }
        .select-wrap select{
          height: 40px;
          min-width: 180px;
          border-radius: 12px;
          border: 1px solid var(--border,#2a2a2a);
          background: var(--card,#0e0e10);
          color: var(--text,#eaeaea);
          padding: 0 28px 0 12px;
          font-weight: 700;
          appearance: none;
        }
        .chev{
          position:absolute; right:10px; top:50%; transform:translateY(-50%);
          pointer-events:none; opacity:.6; font-size:12px;
        }

        .right{
          display:flex; align-items:center; gap:10px; justify-self:end;
        }

        .icon-btn{
          width:36px; height:36px; border-radius:10px;
          display:inline-flex; align-items:center; justify-content:center;
          background: var(--card,#0e0e10);
          border:1px solid var(--border,#2a2a2a);
          color: var(--text,#eaeaea);
          cursor:pointer;
        }
        .icon-btn:hover{ border-color: var(--accent,#3b82f6); color: var(--accent,#3b82f6); }

        /* settings popover holder; ChainSettings handles its own inner layout */
        .settings-fly{
          position: absolute;
          right: 0;
          top: 44px;            /* drop under the icon */
          z-index: 40;
        }

        @media (max-width: 980px){
          .toolbar{
            grid-template-columns: 1fr;
          }
          .right{ justify-self:start; }
          .expiry .select-wrap select{ min-width: 160px; }
        }
      `}</style>
    </div>
  );
}
