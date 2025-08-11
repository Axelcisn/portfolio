// components/Strategy/StrategyPanel.jsx
"use client";

import { useCallback, useMemo, useState } from "react";
import StrategyGallery from "./StrategyGallery";
import Chart from "../Chart";
import { calculateNetPremium } from "./assignStrategy";

/**
 * Props
 * - env: { spot, currency, sigma, T, riskFree, mcStats? }
 * - onState?: (state) => void   // optional tap into internal state if needed
 */
export default function StrategyPanel({ env = {}, onState }) {
  const {
    spot = null,
    currency = "USD",
    sigma = 0.2,
    T = 30 / 365,
    riskFree = 0.02,
    mcStats = null,
  } = env;

  // Selected/active strategy state
  const [legs, setLegs] = useState(null);     // keyed { lc, sc, lp, sp }
  const [netPrem, setNetPrem] = useState(0);
  const [meta, setMeta] = useState(null);     // { order, lotSize, ... }
  const [greek, setGreek] = useState("vega");

  // When user clicks a tile in StrategyGallery (one-click instantiate)
  const handleApply = useCallback((legsKeyed, netPremium, metaFromInst /*, extra */) => {
    setLegs(legsKeyed || null);
    setNetPrem(Number.isFinite(netPremium) ? netPremium : 0);
    setMeta(metaFromInst || null);
    onState?.({ legs: legsKeyed, netPrem: netPremium, meta: metaFromInst, greek });
  }, [onState, greek]);

  // When user edits strikes/premiums (and optionally qty) in the Chart control panel
  const handleLegsChange = useCallback((updatedLegs) => {
    setLegs(updatedLegs);
    const np = calculateNetPremium(updatedLegs);
    setNetPrem(np);
    onState?.({ legs: updatedLegs, netPrem: np, meta, greek });
  }, [onState, meta, greek]);

  const envForGallery = useMemo(() => ({ spot, currency, sigma, T, riskFree, mcStats }), [spot, currency, sigma, T, riskFree, mcStats]);

  return (
    <section className="panel-wrap">
      <div className="grid">
        <div className="left">
          <StrategyGallery env={envForGallery} onApply={handleApply} />
        </div>
        <div className="right">
          <Chart
            spot={spot}
            currency={currency}
            legs={legs}
            riskFree={riskFree}
            sigma={sigma}
            T={T}
            greek={greek}
            onGreekChange={setGreek}
            onLegsChange={handleLegsChange}
            contractSize={1}
          />
          {/* You can place SummaryTiles or StatsRail under here if you want them to react to legs/netPrem */}
          {/* Example:
          <SummaryTiles
            spot={spot}
            currency={currency}
            legs={legs}
            netPremium={netPrem}
            sigma={sigma}
            T={T}
            riskFree={riskFree}
          />
          */}
        </div>
      </div>

      <style jsx>{`
        .panel-wrap { display:block; }
        .grid {
          display:grid; gap:14px;
          grid-template-columns: 380px 1fr;
        }
        @media (max-width: 1100px) {
          .grid { grid-template-columns: 1fr; }
          .left, .right { min-width: 0; }
        }
      `}</style>
    </section>
  );
}
