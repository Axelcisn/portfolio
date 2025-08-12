// components/ui/StrategyTabs.jsx
"use client";

import TabsHost from "./TabsHost";

/**
 * StrategyTabs
 * Drop-in multi-tab container with persistent panels.
 *
 * Place this BETWEEN your Market card and Company card and pass the
 * content blocks you already render on the page.
 *
 * Props:
 *  - overview?:   ReactNode   // usually: Market + Key stats + Strategy
 *  - financials?: ReactNode
 *  - news?:       ReactNode
 *  - options?:    ReactNode   // will host the options-chain UI later
 *  - bonds?:      ReactNode
 *  - defaultActive?: "overview"|"financials"|"news"|"options"|"bonds"
 *  - onChange?: (key: string) => void
 */
export default function StrategyTabs({
  overview = <Placeholder label="Overview" />,
  financials = <Placeholder label="Financials" />,
  news = <Placeholder label="News" />,
  options = <Placeholder label="Options" />,
  bonds = <Placeholder label="Bonds" />,
  defaultActive = "overview",
  onChange,
}) {
  return (
    <section className="strategy-tabs">
      <TabsHost
        defaultActiveKey={defaultActive}
        onChange={onChange}
        tabs={[
          { key: "overview",   label: "Overview",   content: overview },
          { key: "financials", label: "Financials", content: financials },
          { key: "news",       label: "News",       content: news },
          { key: "options",    label: "Options",    content: options },
          { key: "bonds",      label: "Bonds",      content: bonds },
        ]}
      />
      <style jsx>{`
        .strategy-tabs {
          margin-top: 12px;
        }
      `}</style>
    </section>
  );
}

function Placeholder({ label }) {
  return (
    <div className="placeholder">
      <div className="ph-title">{label}</div>
      <div className="ph-text">Content coming soon.</div>
      <style jsx>{`
        .placeholder {
          padding: 18px;
          border: 1px dashed var(--border);
          border-radius: 10px;
          background: var(--bg);
        }
        .ph-title {
          font-weight: 800;
          margin-bottom: 6px;
          opacity: 0.9;
        }
        .ph-text {
          opacity: 0.7;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
