// components/Options/OptionsToolbar.jsx
"use client";

import React, { useRef } from "react";
import ChainSettings from "./ChainSettings";

export default function OptionsToolbar({
  provider = "api",                // "api" | "upload"
  onProviderChange,
  mode = "expiry",                 // "expiry" | "strike"
  onModeChange,
  settings,
  onSettingsChange,
  settingsOpen,
  onSettingsOpenChange,
}) {
  const gearRef = useRef(null);

  const Btn = ({ active, children, onClick, ariaLabel }) => (
    <button
      type="button"
      aria-label={ariaLabel}
      className={`pill ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div className="bar">
      <div className="left">
        <Btn
          active={provider === "api"}
          ariaLabel="Use API provider"
          onClick={() => onProviderChange?.("api")}
        >
          API
        </Btn>

        <Btn
          active={provider === "upload"}
          ariaLabel="Upload screenshot"
          onClick={() => onProviderChange?.("upload")}
        >
          Upload
        </Btn>
      </div>

      <div className="right">
        <Btn
          active={mode === "expiry"}
          ariaLabel="Group by expiration"
          onClick={() => onModeChange?.("expiry")}
        >
          By expiration
        </Btn>
        <Btn
          active={mode === "strike"}
          ariaLabel="Group by strike"
          onClick={() => onModeChange?.("strike")}
        >
          By strike
        </Btn>

        <button
          ref={gearRef}
          type="button"
          className="gear"
          aria-label="Chain table settings"
          onClick={() => onSettingsOpenChange?.(!settingsOpen)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M3 12h2.1M18.9 12H21M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M12 3v2.1M12 18.9V21"
              stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Settings popover anchored to the gear */}
        <ChainSettings
          open={!!settingsOpen}
          anchorRef={gearRef}
          value={settings}
          onChange={onSettingsChange}
          onClose={() => onSettingsOpenChange?.(false)}
        />
      </div>

      <style jsx>{`
        .bar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin: 8px 0 10px;
        }
        .left,.right{ display:flex; align-items:center; gap:10px; }

        /* Pills */
        .pill{
          height:40px; padding:0 14px;
          border-radius:9999px; border:1px solid var(--border);
          background: var(--card);
          font-weight:700; font-size:14px; letter-spacing:-.1px;
          color:var(--text); opacity:.92;
        }
        .pill.active{ background:var(--bg-soft,#f4f6f8); border-color:var(--border-strong,#dfe3e8); }
        .pill:hover{ opacity:1; }

        /* Gear (same height as pills; slightly smaller inner icon) */
        .gear{
          height:40px; width:40px; border-radius:12px;
          display:inline-flex; align-items:center; justify-content:center;
          border:1px solid var(--border); background:var(--card);
          color:var(--text);
        }
        .gear:hover{ box-shadow:0 1px 0 rgba(0,0,0,.05), 0 4px 14px rgba(0,0,0,.07); }
      `}</style>
    </div>
  );
}
