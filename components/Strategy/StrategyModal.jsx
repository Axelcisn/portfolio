// components/Strategy/StrategyModal.jsx
"use client";

import { useEffect } from "react";
import Chart from "./Chart";
import StrategySpecs from "./StrategySpecs";         // Architecture section
import StrategyConfigTable from "./StrategyConfigTable"; // Config table (Position | Strike | Volume | Premium)

export default function StrategyModal({
  open,
  onClose,
  strategy,                // { id, name, icon, legs, ... }
  spot,
  sigma,
  T,
  riskFree,
  currency = "USD",
  onApply,                 // () => void
  onChangeLegs,            // (legs) => void
}) {
  useEffect(() => {
    function onEsc(e){ if (e.key === "Escape") onClose?.(); }
    if (open) window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="sm-portal" role="dialog" aria-modal="true">
      <div className="sm-backdrop" onClick={onClose} />
      <div className="sm-sheet white-surface">
        {/* Header */}
        <div className="sm-head">
          <div className="sm-title">
            <div className="sm-icon">{strategy?.icon ?? "🟢"}</div>
            <div className="sm-name">{strategy?.name || "Strategy"}</div>
          </div>
          <div className="sm-actions">
            <button className="button ghost" onClick={onClose}>Close</button>
            <button className="button" onClick={onApply} disabled={!strategy}>Apply</button>
          </div>
        </div>

        {/* CHART — full width */}
        <div className="sm-section">
          <Chart
            spot={spot}
            legs={strategy?.legs || {}}
            riskFree={riskFree}
            sigma={sigma}
            T={T}
            mu={0}
            currency={currency}
          />
        </div>

        {/* ARCHITECTURE */}
        <div className="sm-section">
          <StrategySpecs strategy={strategy} spot={spot} sigma={sigma} T={T} />
        </div>

        {/* CONFIGURATION (below architecture) */}
        <div className="sm-section">
          <StrategyConfigTable
            legs={strategy?.legs || {}}
            currency={currency}
            onChange={onChangeLegs}
          />
        </div>
      </div>

      <style jsx>{`
        .sm-portal{ position:fixed; inset:0; z-index:80; }
        .sm-backdrop{ position:absolute; inset:0; background:rgba(0,0,0,.35); }
        .sm-sheet{
          position:absolute; inset:auto 0 0 0; margin:0 auto;
          max-width:min(1200px, 96vw); max-height:96vh;
          border:1px solid var(--border); border-radius:20px 20px 0 0;
          box-shadow:0 24px 70px rgba(0,0,0,.25); overflow:auto;
          background:#fff;
        }

        .sm-head{
          position:sticky; top:0; z-index:1;
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; padding:16px 18px; border-bottom:1px solid var(--border);
          background:#fff;
        }
        :global(html.dark) .sm-sheet,
        :global(html.dark) .sm-head{ background:var(--bg); }

        .sm-title{ display:flex; align-items:center; gap:12px; }
        .sm-icon{
          width:36px; height:36px; border-radius:10px; display:grid; place-items:center;
          border:1px solid var(--border); background:var(--card);
        }
        .sm-name{ font-weight:700; letter-spacing:.2px; }

        .sm-actions{ display:flex; gap:8px; }

        .sm-section{ padding:18px; }
        .sm-section + .sm-section{ padding-top:8px; }

        .white-surface{ background:#fff; }
        :global(html.dark) .white-surface{ background:var(--card); }
      `}</style>
    </div>
  );
}
