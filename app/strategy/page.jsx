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
  const [ivValue, setIvValue] = useState(null);
  const [market, setMarket] = useState({ riskFree: null, mrp: null, indexAnn: null });
  const [netPremium, setNetPremium] = useState(0);

  const tickerConfirmed = !!company?.symbol;

  return (
    <div className="grid">
      {/* Only this row is two columns */}
      <div className="grid grid-2">
        <CompanyCard
          value={company}
          onConfirm={(c) => { setCompany(c); setCurrency(c.currency || "EUR"); }}
          onHorizonChange={(d) => setHorizon(d)}
          onIvSourceChange={(s) => setIvSource(s)}
          onIvValueChange={(v) => setIvValue(v)}
        />
        <MarketCard onRates={(r) => setMarket(r)} />
      </div>

      {/* Full-width sections */}
      <LegsSection currency={currency} onNetPremiumChange={setNetPremium} />
      <Chart pLow={-0.15} pHigh={0.15} expected={0.02} />
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
