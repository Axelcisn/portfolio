"use client";

import { useEffect, useRef, useState } from "react";
import ChainSettings from "./ChainSettings";

/* Small button & input primitives (unstyled enough to blend with your system) */
function SegButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      className={`seg ${active ? "is-active" : ""}`}
      onClick={onClick}
    >
      {children}
      <style jsx>{`
        .seg{
          height:34px; padding:0 12px; border:1px solid var(--border);
          border-radius:10px; background:var(--card); cursor:pointer;
          font-weight:700; font-size:13px;
        }
        .seg.is-active{ color:var(--accent-strong, #2563eb); background:var(--bg,#fff); }
      `}</style>
    </button>
  );
}

export default function OptionsToolbar({
  provider, onProviderChange,
  ticker, onTickerChange, onUse,
  expiry, expiryOptions, onExpiryChange,
  group, onGroupChange,
  settings, onSettingsChange,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // Close on click-outside / Esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current) return setOpen(false);
      const withinRoot = rootRef.current.contains(e.target);
      const withinPop = popRef.current?.contains(e.target);
      if (!withinRoot && !withinPop) setOpen(false);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  return (
    <div className="bar" ref={rootRef}>
      {/* Provider pills */}
      <div className="group">
        <SegButton active={provider === "api"} onClick={() => onProviderChange("api")}>API</SegButton>
        <SegButton active={provider === "upload"} onClick={() => onProviderChange("upload")}>
          Upload screenshot
        </SegButton>
      </div>

      {/* Ticker + Use */}
      <input
        className="text"
        placeholder="Ticker (e.g., AAPL)"
        value={ticker}
        onChange={(e) => onTickerChange(e.target.value)}
      />
      <button className="use" type="button" onClick={onUse}>Use</button>

      {/* Expiry select (stub list) */}
      <div className="field">
        <label className="lb">Expiry</label>
        <select
          value={expiry}
          onChange={(e) => onExpiryChange(e.target.value)}
          className="select"
        >
          <option value="">Select...</option>
          {Array.isArray(expiryOptions) && expiryOptions.map((o) => (
            <option key={o.value || o} value={o.value || o}>
              {o.label || o}
            </option>
          ))}
        </select>
      </div>

      {/* Group mode */}
      <div className="group">
        <SegButton active={group === "byExp"} onClick={() => onGroupChange("byExp")}>
          By expiration
        </SegButton>
        <SegButton active={group === "byStrike"} onClick={() => onGroupChange("byStrike")}>
          By strike
        </SegButton>
      </div>

      {/* Settings */}
      <button
        type="button"
        className={`gear ${open ? "is-open" : ""}`}
        aria-label="Chain table settings"
        onClick={() => setOpen((v) => !v)}
        ref={btnRef}
      >
        {/* hex-nut icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      </button>

      {/* Popover */}
      {open && (
        <div className="popover" ref={popRef}>
          <ChainSettings
            settings={settings}
            onChange={onSettingsChange}
            onClose={() => setOpen(false)}
          />
        </div>
      )}

      <style jsx>{`
        .bar{
          display:flex; align-items:center; gap:10px; flex-wrap:wrap;
          position:relative;
        }
        .group{ display:flex; gap:8px; }
        .text{
          min-width:230px; height:34px; border:1px solid var(--border); background:var(--card);
          border-radius:10px; padding:0 12px; font-weight:600;
        }
        .use{
          height:34px; padding:0 12px; border-radius:10px; border:0;
          background:var(--accent,#3b82f6); color:#fff; font-weight:800;
        }
        .field{ display:flex; align-items:center; gap:8px; }
        .lb{ font-size:12px; opacity:.7; }
        .select{
          height:34px; min-width:160px; border:1px solid var(--border);
          background:var(--card); border-radius:10px; padding:0 10px; font-weight:600;
        }
        .gear{
          height:34px; width:34px; display:inline-flex; align-items:center; justify-content:center;
          border:1px solid var(--border); background:var(--bg); border-radius:10px; cursor:pointer;
        }
        .popover{
          position:absolute; top:42px; right:0; z-index:50;
          background:var(--card); border:1px solid var(--border);
          border-radius:14px; box-shadow:0 20px 40px rgba(0,0,0,.12);
        }
      `}</style>
    </div>
  );
}
