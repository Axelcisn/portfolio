"use client";

import React, { useMemo, useRef, useState } from "react";
import OptionsToolbar from "./OptionsToolbar";
import ChainSettings from "./ChainSettings"; // existing settings popover (smaller fonts)

function buildMockExpiries() {
  // Matches your screenshot order/labels
  const months = [
    ["Aug", [15, 22, 29]],
    ["Sep", [5, 12, 19, 26]],
    ["Oct", [17]],
    ["Nov", [21]],
    ["Dec", [19]],
    ["Jan '26", [16]],
    ["Feb", [20]],
    ["Mar", [20]],
    ["May", [15]],
    ["Jun", [18]],
    ["Aug", [21]],
    ["Sep", [18]],
    ["Dec", [18]],
    ["Jan '27", [15]],
    ["Jun", [17]],
    ["Dec", [17]],
  ];
  return months.map(([m, ds]) => ({ month: m, days: ds }));
}

export default function OptionsTab({
  symbol = "",
  currency = "USD",
}) {
  // Top controls
  const [provider, setProvider] = useState("api");       // "api" | "upload"
  const [mode, setMode] = useState("expiry");            // "expiry" | "strike"
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Settings state (used later by the table)
  const [settings, setSettings] = useState({
    showRows: 20,             // 10 | 20 | Infinity | custom number
    sortDir: "asc",           // "asc" | "desc"
    cols: { bid: true, ask: true, price: true, delta: false, gamma: false, theta: false, vega: false, rho: false, tval: false, ival: false, askIv: false, bidIv: false },
  });

  // Expiry strip (UI only for now)
  const expiries = useMemo(buildMockExpiries, []);
  const [sel, setSel] = useState({ month: "Sep", day: 12 });

  const cardRef = useRef(null);

  return (
    <section className="options">
      <h3 className="title">Options</h3>

      <OptionsToolbar
        provider={provider}
        onProviderChange={setProvider}
        mode={mode}
        onModeChange={setMode}
        settingsOpen={settingsOpen}
        onOpenSettings={(open) => setSettingsOpen(open)}
      />

      {/* Settings popover (anchored under the right side of toolbar) */}
      {settingsOpen && (
        <div className="settings-pop" role="dialog" aria-label="Chain table settings">
          <ChainSettings
            value={settings}
            onChange={(next) => setSettings((s) => ({ ...s, ...next }))}
            onClose={() => setSettingsOpen(false)}
          />
        </div>
      )}

      {/* Expiry strip */}
      <div className="expiry-strip" ref={cardRef}>
        {expiries.map(({ month, days }) => (
          <div className="m" key={month}>
            <div className="m-name">{month}</div>
            <div className="m-days">
              {days.map((d) => {
                const active = sel.month === month && sel.day === d;
                return (
                  <button
                    key={`${month}-${d}`}
                    type="button"
                    className={`chip ${active ? "active" : ""}`}
                    onClick={() => setSel({ month, day: d })}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Table header skeleton (visual only, real data next step) */}
      <div className="thead">
        <div className="label calls">Calls</div>
        <div className="th">Price</div>
        <div className="th">Ask</div>
        <div className="th">Bid</div>

        <div className="th center">↑ Strike</div>
        <div className="th center">IV, %</div>

        <div className="label puts">Puts</div>
        <div className="th right">Bid</div>
        <div className="th right">Ask</div>
        <div className="th right">Price</div>
      </div>

      {/* Empty state card for now */}
      <div className="empty">
        <div className="empty-title">No options loaded</div>
        <div className="empty-sub">
          Pick a provider or upload a screenshot, then choose an expiry.
        </div>
      </div>

      <style jsx>{`
        .title{ font-size:28px; font-weight:900; letter-spacing:-.3px; margin:10px 0 6px; }

        /* Expiry strip */
        .expiry-strip{
          display:flex; flex-wrap:wrap; column-gap:26px; row-gap:16px;
          padding:8px 0 14px; margin-bottom:10px; border-bottom:1px solid var(--border,#eceff3);
        }
        .m{ display:flex; flex-direction:column; gap:8px; }
        .m-name{ font-weight:700; color:#6b7280; font-size:16px; }
        .m-days{ display:flex; gap:8px; }
        .chip{
          min-width:44px; height:36px; padding:0 10px; border-radius:10px;
          border:1px solid #e5e7eb; background:#f7f7f9; font-weight:800; color:#111827;
        }
        .chip.active{ background:#111827; color:#fff; border-color:#111827; }

        /* Table header skeleton */
        .thead{
          display:grid;
          grid-template-columns: repeat(3, 1fr) repeat(2, 1fr) repeat(4, 1fr);
          align-items:center; column-gap:8px;
          padding:14px 10px 12px;
          border-bottom:1px solid var(--border,#eceff3);
        }
        .label{ grid-column: span 3; font-weight:900; font-size:24px; letter-spacing:-.3px; }
        .label.puts{ grid-column: 7 / span 4; }
        .th{ font-size:16px; font-weight:700; color:#6b7280; }
        .center{ text-align:center; }
        .right{ text-align:right; }

        .empty{
          margin-top:10px; border:1px solid var(--border,#eceff3); border-radius:14px;
          background:#f8fafc; padding:22px; color:#374151;
          box-shadow: 0 1px 0 rgba(0,0,0,.02);
        }
        .empty-title{ font-weight:800; margin-bottom:6px; }
        .empty-sub{ opacity:.8; }

        /* Settings popover placement (right aligned under toolbar) */
        .settings-pop{
          position: absolute;
          right: 0; /* relies on parent stacking context; page container usually relative */
          z-index: 50;
          margin-top: 6px;
        }
      `}</style>
    </section>
  );
}
