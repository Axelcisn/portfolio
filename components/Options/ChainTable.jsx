// components/Options/ChainTable.jsx
"use client";

/**
 * Minimal table shell with ONLY the empty-state.
 * (Headers are rendered by OptionsTab, so we DON'T render them here.)
 */
export default function ChainTable({
  provider = "api",
  groupBy = "expiry",
  expiry = null,
  settings = {},
  symbol = "",
  currency = "USD",
}) {
  const hasData = false; // wire later

  if (!hasData) {
    return (
      <div className="empty-wrap">
        <div className="empty">
          <div className="title">No options loaded</div>
          <div className="sub">
            Pick a provider or upload a screenshot, then choose an expiry.
          </div>
        </div>
        <style jsx>{`
          .empty-wrap {
            border: 1px solid var(--border);
            background: var(--card);
            border-radius: 14px;
            padding: 24px;
          }
          .empty {
            text-align: left;
          }
          .title {
            font-weight: 800;
            font-size: 16px;
            margin-bottom: 6px;
          }
          .sub {
            opacity: 0.75;
            font-size: 14px;
          }
        `}</style>
      </div>
    );
  }

  // Placeholder for future data rendering (no headers here!)
  return <div />;
}
