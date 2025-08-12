"use client";

import { useMemo, useState } from "react";
import OptionsToolbar from "./OptionsToolbar";
import ChainTable from "./ChainTable";

/* ---------- defaults shared with toolbar/settings ---------- */
export const DEFAULT_SETTINGS = {
  rowsMode: "20",           // "10" | "20" | "all" | "custom"
  customRows: 25,           // used when rowsMode === "custom"
  sort: "asc",              // "asc" | "desc"
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
    intrinsic: false,
    askIv: false,
    bidIv: false,
  },
};

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // Provider & inputs
  const [provider, setProvider] = useState("api"); // "api" | "upload"
  const [ticker, setTicker] = useState(symbol || "");
  const [group, setGroup] = useState("byExp");     // "byExp" | "byStrike"
  const [expiry, setExpiry] = useState("");
  const expiryOptions = useMemo(() => [], []);

  // Centralized settings (single source of truth)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const onUseTicker = () => {
    // (Wire to fetch chain later — for now this is a stub.)
    // Keep UX feedback minimal.
    console.debug("Use ticker clicked:", { provider, ticker, expiry, group, settings });
  };

  return (
    <section>
      <div className="toolbar-wrap">
        <OptionsToolbar
          provider={provider}
          onProviderChange={setProvider}
          ticker={ticker}
          onTickerChange={setTicker}
          onUse={onUseTicker}
          expiry={expiry}
          expiryOptions={expiryOptions}
          onExpiryChange={setExpiry}
          group={group}
          onGroupChange={setGroup}
          settings={settings}
          onSettingsChange={setSettings}
        />
      </div>

      <div className="chain-head">
        <div className="ttl">Options chain</div>
        <div className="sub">
          {group === "byExp" ? "Grouped by expiration" : "Grouped by strike"} • Provider:{" "}
          {provider.toUpperCase()}
        </div>
      </div>

      {/* Placeholder table — will render real chain later. */}
      <div className="card empty">
        <div className="empty-title">No options loaded</div>
        <div className="empty-sub">
          Pick a provider or upload a screenshot, then choose an expiry.
        </div>
      </div>

      <style jsx>{`
        .toolbar-wrap { margin-bottom: 10px; }
        .chain-head { display:flex; align-items:baseline; gap:12px; margin:8px 0 10px; }
        .ttl { font-weight:800; font-size:18px; }
        .sub { opacity:.7; font-size:12.5px; }
        .card.empty{
          padding:18px; border:1px solid var(--border);
          border-radius:14px; background:var(--card);
        }
        .empty-title{ font-weight:800; margin-bottom:4px; }
        .empty-sub{ opacity:.75; }
      `}</style>
    </section>
  );
}
