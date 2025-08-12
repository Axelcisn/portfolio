// components/Options/OptionsTab.jsx
"use client";

import React from "react";

/**
 * OptionsTab – layout container only (Step A1).
 * Next steps will progressively fill the toolbar, settings popover, and table.
 */
export default function OptionsTab({
  symbol = "",
  currency = "USD",
  onUseSet, // will be wired in A5
}) {
  const title = symbol ? `${symbol} options` : "Options";

  return (
    <section className="card options-tab">
      {/* Header */}
      <div className="head">
        <h3 className="title">{title}</h3>
        <div className="sub">
          Monitor chains, choose strikes & premiums, then push the selection into
          your strategy. (UI scaffold only — features coming in the next steps.)
        </div>
      </div>

      {/* Toolbar placeholder (A2/A3 will render here) */}
      <div className="toolbar-placeholder" aria-hidden="true">
        Toolbar • provider • symbol • expiry • filters
      </div>

      {/* Chain table placeholder (A4 will replace this) */}
      <div className="table-placeholder">
        <div className="table-header">
          <div className="col calls">Calls</div>
          <div className="col strike">Strike</div>
          <div className="col puts">Puts</div>
        </div>
        <div className="empty">
          {symbol
            ? "Select an expiration to see the chain."
            : "Pick a company above to load the options chain."}
        </div>
      </div>

      {/* Footer with action (will enable in A5) */}
      <div className="footer">
        <button
          type="button"
          className="btn"
          disabled
          onClick={() => onUseSet?.([])}
          aria-disabled="true"
          title="Select rows first"
        >
          Use this set
        </button>
      </div>

      <style jsx>{`
        .options-tab {
          gap: 10px;
        }
        .head {
          padding: 6px 8px 4px;
        }
        .title {
          margin: 0;
          font-weight: 800;
          font-size: 18px;
          letter-spacing: -0.2px;
        }
        .sub {
          margin-top: 4px;
          font-size: 12.5px;
          opacity: 0.75;
        }

        .toolbar-placeholder {
          height: 44px;
          border: 1px dashed var(--border);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          opacity: 0.7;
        }

        .table-placeholder {
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--card);
          overflow: hidden;
        }
        .table-header {
          display: grid;
          grid-template-columns: 1fr 120px 1fr;
          gap: 0;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          font-weight: 700;
          opacity: 0.85;
        }
        .col.strike {
          text-align: center;
        }
        .empty {
          padding: 28px 16px 32px;
          text-align: center;
          font-size: 13px;
          opacity: 0.75;
        }

        .footer {
          display: flex;
          justify-content: flex-end;
          padding-top: 6px;
        }
        .btn {
          height: 34px;
          padding: 0 14px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          font-weight: 700;
          opacity: 0.7;
          cursor: not-allowed;
        }
      `}</style>
    </section>
  );
}
