// components/Options/OptionsTab.jsx
"use client";

import { useState } from "react";
import OptionsToolbar from "./OptionsToolbar";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  const [provider, setProvider] = useState("api");    // 'api' | 'upload'
  const [view, setView] = useState("byExp");          // 'byExp' | 'byStrike'
  const [sym, setSym] = useState(symbol || "");
  const [expiry, setExpiry] = useState("");

  const openSettings = () => {
    // Will be implemented in A4 (settings panel with "SHOW BY" incl. custom rows)
    // For now, just a no-op.
  };

  return (
    <section className="options">
      <OptionsToolbar
        provider={provider}
        onProviderChange={setProvider}
        symbol={sym}
        onSymbolChange={setSym}
        onConfirmSymbol={setSym}
        expiry={expiry}
        onExpiryChange={setExpiry}
        view={view}
        onViewChange={setView}
        onOpenSettings={openSettings}
        currency={currency}
      />

      <div className="body">
        <div className="row">
          <div className="title">
            {sym ? `${sym} options` : "Options chain"}
          </div>
          <div className="sub">
            {view === "byExp" ? "Grouped by expiration" : "Grouped by strike"} • Provider: {provider.toUpperCase()}
          </div>
        </div>

        <div className="placeholder card">
          <p className="muted">
            Table will render here in the next steps (A4–A6). This is only the structure.
          </p>
        </div>
      </div>

      <style jsx>{`
        .options{ margin-top:8px; }
        .body{ padding:10px 6px; display:flex; flex-direction:column; gap:10px; }
        .row .title{ font-weight:800; font-size:16px; }
        .row .sub{ font-size:12px; opacity:.75; margin-top:2px; }
        .placeholder{ padding:18px; }
        .muted{ opacity:.75; }
      `}</style>
    </section>
  );
}
