"use client";
import { useState } from "react";
import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import LegsSection from "../../components/Strategy/LegsSection";
import Chart from "../../components/Strategy/Chart";
import MiniCards from "../../components/Strategy/MiniCards";
import SummaryTiles from "../../components/Strategy/SummaryTiles";

export default function Strategy() {
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [horizon, setHorizon] = useState(30);
  const [ivSource, setIvSource] = useState("live");
  const [ivValue, setIvValue] = useState(null); // decimal (e.g., 0.30)
  const [market, setMarket] = useState({ riskFree: null, mrp: null, indexAnn: null });
  const [netPremium, setNetPremium] = useState(0);
  const [legs, setLegs] = useState(null);

  const tickerConfirmed = !!company?.symbol;

  const spot = company?.spot || null;
  const sigma = ivValue || null;
  const T = horizon > 0 ? horizon / 365 : null;

  return (
    <div className="grid">
      {/* 2-column header row */}
      <div className="grid grid-2">
        <CompanyCard
          value={company}
          market={market}
          onConfirm={(c) => { setCompany(c); setCurrency(c.currency || "EUR"); }}
          onHorizonChange={(d) => setHorizon(d)}
          onIvSourceChange={(s) => setIvSource(s)}
          onIvValueChange={(v) => setIvValue(v)}
        />
        <MarketCard onRates={(r) => setMarket(r)} />
      </div>

      {/* Full width sections */}
      <LegsSection currency={currency} onNetPremiumChange={setNetPremium} onLegsChange={setLegs} />

      <Chart
        spot={spot}
        legs={legs || {}}
        riskFree={market.riskFree ?? 0}
        carryPremium={false}       /* set true when you add a UI toggle */
        mu={null}                  /* we’ll wire CAPM later if you want */
        sigma={sigma || 0}
        T={T || 0}
        mcStats={null}             /* wire after Monte Carlo */
      />

      <MiniCards
        disabled={!tickerConfirmed}
        defaultHorizon={horizon}
        onRun={(cfg) => console.log("run MC", cfg, { ivSource, ivValue, market })}
      />

      <SummaryTiles
        currency={currency}
        netPremium={netPremium}
        probProfit={null}
        expectancy={null}
        expReturn={null}
      />
    </div>
  );
}
