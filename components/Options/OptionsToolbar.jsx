// components/Options/OptionsToolbar.jsx
"use client";

import React from "react";

export default function OptionsToolbar({
  provider = "api",                 // "api" | "upload"
  onProviderChange,
  groupBy = "expiry",               // "expiry" | "strike"
  onGroupByChange,
  onOpenSettings,
}) {
  const Pill = ({ active, children, onClick, ariaLabel }) => (
    <button
      type="button"
      aria-label={ariaLabel || String(children)}
      className={`pill ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      {children}
    </button>
  );

  return (
    <div className="toolbar">
      <div className="left">
        <Pill
          active={provider === "api"}
          onClick={() => onProviderChange?.("api")}
          ariaLabel="Use API provider"
        >
          API
        </Pill>

        <Pill
          active={provider === "upload"}
          onClick={() => onProviderChange?.("upload")}
          ariaLabel="Upload screenshot provider"
        >
          Upload screenshot
        </Pill>
      </div>

      <div className="right">
        <Pill
          active={groupBy === "expiry"}
          onClick={() => onGroupByChange?.("expiry")}
          ariaLabel="Group by expiration"
        >
          By expiration
        </Pill>

        <Pill
          active={groupBy === "strike"}
          onClick={() => onGroupByChange?.("strike")}
          ariaLabel="Group by strike"
        >
          By strike
        </Pill>

        <button
          type="button"
          className="icon"
          title="Chain table settings"
          aria-label="Chain table settings"
          onClick={() => onOpenSettings?.()}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8.5a3.5 3.5 0 1 1 0 7a3.5 3.5 0 0 1 0-7Zm8.94 2.08l-1.54-.89a7.9 7.9 0 0 0-.2-.48l.5-1.74a.9.9 0 0 0-.55-1.1l-1.8-.66a.9.9 0 0 0-1.1.35l-1.04 1.43c-.17-.04-.35-.07-.53-.1l-1.05-1.43a.9.9 0 0 0-1.1-.35l-1.8.66a.9.9 0 0 0-.55 1.1l.5 1.74c-.07.16-.13.32-.19.48l-1.55.89a.9.9 0 0 0-.33 1.23l.9 1.57c.1.17.25.3.43.37l1.7.62c.05.18.11.36.17.54l-.52 1.78a.9.9 0 0 0 .55 1.1l1.8.65c.4.15.84 0 1.1-.35l1.04-1.43c.18.03.36.06.54.08l1.04 1.42a.9.9 0 0 0 1.1.36l1.8-.66a.9.9 0 0 0 .55-1.1l-.5-1.74c.07-.16.13-.33.19-.49l1.54-.89a.9.9 0 0 0 .33-1.22l-.9-1.57a.9.9 0 0 0-.43-.37l-1.7-.61a6.7 6.7 0 0 0-.17-.55l.52-1.77a.9.9 0 0 0-.55-1.1" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <style jsx>{`
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin:2px 0 10px;
        }
        .left, .right{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
        .pill{
          height:44px; padding:0 18px;
          border-radius:14px;
          background: var(--card, #f6f7f8);
          border:1px solid var(--border, #e5e7eb);
          color: var(--text, #0f172a);
          font-weight:800; font-size:18px; letter-spacing:-.2px;
        }
        .pill.is-active{
          background: var(--bg, #fff);
          box-shadow: 0 2px 0 rgba(0,0,0,.04) inset;
          border-color: var(--border-strong, #d1d5db);
          color: var(--accent, #2563eb);
        }
        .pill:focus{ outline:2px solid var(--accent, #2563eb); outline-offset:2px; }

        .icon{
          width:44px; height:44px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:12px; border:1px solid var(--border, #e5e7eb);
          background: var(--card, #f6f7f8); color: var(--text, #0f172a);
        }
        .icon:hover{ background: var(--card-2, #eef0f3); }
      `}</style>
    </div>
  );
}
