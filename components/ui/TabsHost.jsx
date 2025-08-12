// components/ui/TabsHost.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import TabsNav from "./TabsNav";

/**
 * TabsHost
 * Controlled or uncontrolled tabs with persistent panels.
 *
 * Props:
 *  - tabs: [{ key, label, render?: () => ReactNode, content?: ReactNode }]
 *  - activeKey?: string              // (controlled) current tab key
 *  - defaultActiveKey?: string       // (uncontrolled) initial tab key
 *  - onChange?: (key: string) => void
 *  - className?: string
 *
 * Notes:
 *  - If both `render` and `content` are provided, `render()` wins.
 *  - Panels remain mounted; we toggle visibility via CSS.
 */
export default function TabsHost({
  tabs: tabsProp,
  activeKey: controlledKey,
  defaultActiveKey,
  onChange,
  className = "",
}) {
  const tabs = useMemo(
    () =>
      (tabsProp && tabsProp.length
        ? tabsProp
        : [
            { key: "overview",   label: "Overview" },
            { key: "financials", label: "Financials" },
            { key: "news",       label: "News" },
            { key: "options",    label: "Options" },
            { key: "bonds",      label: "Bonds" },
          ]),
    [tabsProp]
  );

  const firstKey = tabs[0]?.key ?? "overview";
  const [internalKey, setInternalKey] = useState(defaultActiveKey || firstKey);
  const activeKey = controlledKey ?? internalKey;

  useEffect(() => {
    // keep active key valid if tab set changes
    if (!tabs.some(t => t.key === activeKey)) {
      const k = tabs[0]?.key ?? "overview";
      setInternalKey(k);
      onChange?.(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map(t => t.key).join("|")]);

  const handleChange = (k) => {
    if (controlledKey == null) setInternalKey(k);
    onChange?.(k);
  };

  return (
    <section className={`tabs-host ${className}`}>
      <TabsNav tabs={tabs} activeKey={activeKey} onChange={handleChange} />

      <div className="panels">
        {tabs.map((t) => {
          const isActive = t.key === activeKey;
          const PanelContent = t.render ? t.render : () => t.content ?? null;
          return (
            <section
              key={t.key}
              id={`panel-${t.key}`}
              role="tabpanel"
              aria-labelledby={`tab-${t.key}`}
              className={`panel ${isActive ? "active" : "hidden"}`}
            >
              <h3 className="panel-title">{t.label}</h3>
              <div className="panel-body">
                <PanelContent />
              </div>
            </section>
          );
        })}
      </div>

      <style jsx>{`
        .tabs-host {
          display: block;
          background: transparent;
        }
        .panels {
          padding-top: 8px;
        }
        .panel-title {
          margin: 6px 2px 10px;
          font-size: 14px;
          font-weight: 800;
          opacity: 0.9;
        }
        .panel-body {
          display: block;
        }
        .panel.hidden {
          display: none;     /* stays mounted but not visible */
        }
        .panel.active {
          display: block;
        }
      `}</style>
    </section>
  );
}
