"use client";

import React from "react";

export default function OptionsToolbar({
  provider = "api",                 // "api" | "upload"
  onProviderChange = () => {},
  mode = "expiry",                  // "expiry" | "strike"
  onModeChange = () => {},
  onOpenSettings = () => {},
  settingsOpen = false,
}) {
  return (
    <div className="toolbar">
      {/* LEFT: provider buttons */}
      <div className="left">
        <button
          type="button"
          className={`pill ${provider === "api" ? "active" : ""}`}
          onClick={() => onProviderChange("api")}
        >
          <span className="mono">API</span>
        </button>

        <button
          type="button"
          className={`pill ${provider === "upload" ? "active" : ""}`}
          onClick={() => onProviderChange("upload")}
        >
          Upload
        </button>
      </div>

      {/* RIGHT: mode toggle + settings */}
      <div className="right">
        <div className="seg">
          <button
            type="button"
            className={`seg-btn ${mode === "expiry" ? "is-active" : ""}`}
            onClick={() => onModeChange("expiry")}
          >
            By expiration
          </button>
          <button
            type="button"
            className={`seg-btn ${mode === "strike" ? "is-active" : ""}`}
            onClick={() => onModeChange("strike")}
          >
            By strike
          </button>
        </div>

        <button
          type="button"
          aria-label="Chain settings"
          className={`icon ${settingsOpen ? "on" : ""}`}
          onClick={() => onOpenSettings(!settingsOpen)}
        >
          {/* hex-nut icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M9.6 3.6 4.8 6.4v7.2l4.8 2.8 4.8-2.8V6.4L9.6 3.6Zm0 0 4.8 2.8m-4.8-2.8L4.8 6.4m9.6 0-4.8 2.8m4.8-2.8v7.2m-4.8-4.4L4.8 6.4m4.8 4.4v7.2m0-7.2 4.8-2.8M4.8 13.6l4.8 2.8m0 0 4.8-2.8"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity=".9"
            />
          </svg>
        </button>
      </div>

      <style jsx>{`
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; margin-bottom:12px;
        }
        .left, .right{ display:flex; align-items:center; gap:10px; }

        .pill{
          height:44px; padding:0 18px; border-radius:14px;
          border:1px solid var(--border, #e5e7eb); background:#fff;
          font-weight:800; font-size:16px; letter-spacing:.2px;
          color:#111827; box-shadow:0 1px 0 rgba(0,0,0,.02);
        }
        .pill.active{
          background:#eef2ff; border-color:#c7d2fe; color:#1e40af;
        }
        .pill .mono{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

        .seg{
          display:inline-flex; border:1px solid var(--border,#e5e7eb);
          border-radius:14px; padding:2px; background:#fff;
        }
        .seg-btn{
          min-width:148px; height:44px; padding:0 14px; border:0; background:transparent;
          font-weight:800; font-size:16px; color:#374151; border-radius:12px;
        }
        .seg-btn.is-active{ background:#eaf2ff; color:#0b63f6; }

        .icon{
          height:44px; width:44px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:12px; border:1px solid var(--border,#e5e7eb); background:#fff; color:#111827;
        }
        .icon.on{ background:#f3f4f6; }
      `}</style>
    </div>
  );
}
