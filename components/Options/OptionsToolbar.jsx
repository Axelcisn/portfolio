// components/Options/OptionsToolbar.jsx
"use client";

import { useEffect, useState } from "react";

export default function OptionsToolbar({
  provider = "api",                 // 'api' | 'upload'
  onProviderChange = () => {},
  symbol = "",
  onSymbolChange = () => {},
  onConfirmSymbol = () => {},
  expiry = "",
  onExpiryChange = () => {},
  view = "byExp",                   // 'byExp' | 'byStrike'
  onViewChange = () => {},
  onOpenSettings = () => {},
  currency = "USD",
}) {
  const [localSymbol, setLocalSymbol] = useState(symbol || "");
  useEffect(() => { setLocalSymbol(symbol || ""); }, [symbol]);

  const confirm = () => onConfirmSymbol?.(localSymbol.trim());

  return (
    <div className="toolbar">
      <div className="left">
        {/* Provider selector */}
        <div className="seg">
          <button
            type="button"
            className={`seg-btn ${provider === "api" ? "is-active" : ""}`}
            onClick={() => onProviderChange("api")}
          >API</button>
          <button
            type="button"
            className={`seg-btn ${provider === "upload" ? "is-active" : ""}`}
            onClick={() => onProviderChange("upload")}
          >Upload screenshot</button>
        </div>

        {/* Symbol + Confirm */}
        <div className="symbol">
          <input
            className="inp"
            placeholder="Ticker (e.g., AAPL)"
            value={localSymbol}
            onChange={(e) => { setLocalSymbol(e.target.value.toUpperCase()); onSymbolChange?.(e.target.value.toUpperCase()); }}
            onKeyDown={(e) => { if (e.key === "Enter") confirm(); }}
          />
          <button className="btn" onClick={confirm}>Use</button>
        </div>

        {/* Expiry placeholder (we’ll wire to provider later) */}
        <div className="expiry">
          <label className="lab">Expiry</label>
          <select
            className="sel"
            value={expiry}
            onChange={(e) => onExpiryChange?.(e.target.value)}
          >
            <option value="">Select…</option>
            <option value="2025-09-19">19 Sep 2025</option>
            <option value="2025-12-19">19 Dec 2025</option>
            <option value="2026-03-20">20 Mar 2026</option>
          </select>
        </div>

        {/* View toggle */}
        <div className="seg">
          <button
            type="button"
            className={`seg-btn ${view === "byExp" ? "is-active" : ""}`}
            onClick={() => onViewChange("byExp")}
          >By expiration</button>
          <button
            type="button"
            className={`seg-btn ${view === "byStrike" ? "is-active" : ""}`}
            onClick={() => onViewChange("byStrike")}
          >By strike</button>
        </div>
      </div>

      <div className="right">
        <button className="icon" title="Chain table settings" onClick={onOpenSettings} aria-label="Open settings">
          {/* simple gear */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 8.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" stroke="currentColor" strokeWidth="1.6"/>
            <path d="M19.4 15.5a7.9 7.9 0 0 0 .3-1.5l2-.9-1-3.1-2.1.2a7.9 7.9 0 0 0-1.1-1.2l.6-2-3-1.2-.9 1.8c-.5 0-1-.1-1.5 0l-.9-1.8-3 1.2.6 2c-.4.4-.8.8-1.1 1.2l-2.1-.2-1 3.1 2 .9c0 .5.1 1 .3 1.5l-1.6 1.4 1.9 2.6 1.9-1a7.9 7.9 0 0 0 1.4.6l.2 2.1h3.2l.2-2.1c.5-.2 1-.4 1.4-.6l1.9 1 1.9-2.6-1.6-1.4Z" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
      </div>

      <style jsx>{`
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; padding:10px 6px 6px; border-bottom:1px solid var(--border);
          background: var(--card, transparent);
        }
        .left{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
        .right{ display:flex; align-items:center; gap:8px; }

        .seg{ display:inline-flex; border:1px solid var(--border); border-radius:10px; overflow:hidden; }
        .seg-btn{
          height:34px; padding:0 10px; background:transparent; border:0; cursor:pointer;
          color:var(--text); font-weight:700; font-size:13px; opacity:.85;
        }
        .seg-btn + .seg-btn{ border-left:1px solid var(--border); }
        .seg-btn.is-active{ background:var(--bg-strong,#111); color:var(--accent,#3b82f6); opacity:1; }

        .symbol{ display:flex; align-items:center; gap:6px; }
        .inp{
          height:34px; min-width:160px; padding:0 10px; border-radius:10px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
          font-weight:700; letter-spacing:.3px;
        }
        .btn{
          height:34px; padding:0 12px; border-radius:10px; border:1px solid var(--border);
          background:var(--accent,#3b82f6); color:#fff; font-weight:800; cursor:pointer;
        }

        .expiry{ display:flex; align-items:center; gap:6px; }
        .lab{ font-size:12px; opacity:.8; }
        .sel{
          height:34px; padding:0 10px; border-radius:10px; border:1px solid var(--border);
          background:var(--bg); color:var(--text); min-width:150px;
        }

        .icon{
          width:34px; height:34px; border-radius:10px; border:1px solid var(--border);
          display:grid; place-items:center; background:var(--bg); color:var(--text);
          cursor:pointer;
        }
        .icon:hover{ background: rgba(255,255,255,.05); }
      `}</style>
    </div>
  );
}
