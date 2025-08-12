// components/Options/OptionsTab.jsx
"use client";

import { useState } from "react";
import OptionsToolbar from "./OptionsToolbar";
import ChainSettings from "./ChainSettings";
import ChainTable from "./ChainTable";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  const [provider, setProvider] = useState("api");    // 'api' | 'upload'
  const [view, setView] = useState("byExp");          // 'byExp' | 'byStrike'
  const [sym, setSym] = useState(symbol || "");
  const [expiry, setExpiry] = useState("");

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowsMode, setRowsMode] = useState("10");     // '10' | '20' | 'all' | 'custom'
  const [customRows, setCustomRows] = useState(25);
  const [sort, setSort] = useState("asc");            // 'asc' | 'desc'
  const [columns, setColumns] = useState({
    bid: true, ask: true, price: true,
    delta: false, gamma: false, theta: false, vega: false, rho: false,
    timeValue: false, intrinsicValue: false,
    askIv: false, bidIv: false,
  });

  // Placeholder dataset (empty); will be filled by API/Upload in A6
  const rows = []; // keep empty now

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
        onOpenSettings={() => setSettingsOpen((v) => !v)}
        currency={currency}
      />

      <ChainSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        rowsMode={rowsMode}
        customRows={customRows}
        onRowsModeChange={setRowsMode}
        onCustomRowsChange={setCustomRows}
        sort={sort}
        onSortChange={setSort}
        columns={columns}
        onColumnsChange={setColumns}
      />

      <div className="body">
        <div className="row">
          <div className="title">
            {sym ? `${sym} options` : "Options chain"}
          </div>
          <div className="sub">
            {view === "byExp" ? "Grouped by expiration" : "Grouped by strike"}
            {" • Provider: "}{provider.toUpperCase()}
          </div>
        </div>

        <ChainTable
          currency={currency}
          rows={rows}
          sort={sort}
          rowsMode={rowsMode}
          customRows={customRows}
          columns={columns}
          onUseSelection={(ids) => {
            // wired in A6 to push into Strategy builder
            console.log("Selected row ids:", ids);
          }}
        />
      </div>

      <style jsx>{`
        .options{ margin-top:8px; position:relative; }
        .body{ padding:10px 6px; display:flex; flex-direction:column; gap:10px; }
        .row .title{ font-weight:800; font-size:16px; }
        .row .sub{ font-size:12px; opacity:.75; margin-top:2px; }
      `}</style>
    </section>
  );
}
