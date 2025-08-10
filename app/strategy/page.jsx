"use client";
import { useEffect, useMemo, useState } from "react";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import LegsSection from "../../components/Strategy/LegsSection";
import Chart from "../../components/Strategy/Chart";
import MiniCards from "../../components/Strategy/MiniCards";
import StatsRail from "../../components/Strategy/StatsRail";

import RomeClock from "../../components/RomeClock";
import ThemeToggle from "../../components/ThemeToggle";
import useDebounce from "../../hooks/useDebounce";

export default function Strategy() {
  // Company / market
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [horizon, setHorizon] = useState(30);

  // IV
  const [ivSource, setIvSource] = useState("live");
  const [ivValue, setIvValue] = useState(null); // decimal (e.g., 0.30)

  // Market rates
  const [market, setMarket] = useState({ riskFree: null, mrp: null, indexAnn: null });

  // Legs + premium
  const [netPremium, setNetPremium] = useState(0);
  const [legsUi, setLegsUi] = useState(null);

  // MC outputs
  const [mcStats, setMcStats] = useState(null);
  const [probProfit, setProbProfit] = useState(null);
  const [expectancy, setExpectancy] = useState(null);
  const [expReturn, setExpReturn] = useState(null);

  const spot = company?.spot || null;
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  /* ---------- helpers ---------- */
  const num = (v) => {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const toLegAPI = (leg) => ({
    enabled: !!leg?.enabled,
    K: num(leg?.strike ?? leg?.K),
    qty: Number.isFinite(+leg?.qty) ? +leg.qty : 0,
  });

  // Normalize legs coming from UI for API/Chart
  const legs = useMemo(() => {
    const lc = toLegAPI(legsUi?.lc || {});
    const sc = toLegAPI(legsUi?.sc || {});
    const lp = toLegAPI(legsUi?.lp || {});
    const sp = toLegAPI(legsUi?.sp || {});
    return { lc, sc, lp, sp };
  }, [legsUi]);

  // Build MC request input when all key params are present
  const mcInput = useMemo(() => {
    if (!(spot > 0) || !(T > 0) || !(sigma >= 0)) return null;
    return {
      spot,
      mu: 0,                     // drift: keep 0 for now; can wire CAPM later
      sigma,                     // annualized decimal
      Tdays: horizon,            // send days to the API
      paths: 15000,              // responsive default
      legs,
      netPremium: Number.isFinite(netPremium) ? netPremium : 0,
      carryPremium: false,       // UI toggle can be added later
      riskFree: market.riskFree ?? 0,
    };
  }, [spot, T, sigma, horizon, legs, netPremium, market.riskFree]);

  // Debounce to avoid spamming while the user types
  const debouncedPayload = useDebounce(mcInput ? JSON.stringify(mcInput) : "", 250);

  // Fire Monte Carlo whenever inputs change (debounced)
  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!debouncedPayload) {
        setMcStats(null); setProbProfit(null); setExpectancy(null); setExpReturn(null);
        return;
      }
      const body = JSON.parse(debouncedPayload);
      try {
        const r = await fetch("/api/montecarlo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (aborted) return;
        if (!r.ok || j?.ok === false) {
          setMcStats(null); setProbProfit(null); setExpectancy(null); setExpReturn(null);
          return;
        }
        const src = j?.data || j || {};
        const nextStats = {
          meanST: src.meanST ?? null,
          q05ST: src.q05ST ?? null,
          q25ST: src.q25ST ?? null,
          q50ST: src.q50ST ?? null,
          q75ST: src.q75ST ?? null,
          q95ST: src.q95ST ?? null,
          qLoST: src.qLoST ?? null,
          qHiST: src.qHiST ?? null,
        };
        setMcStats(nextStats);
        setProbProfit(Number.isFinite(src.pWin) ? src.pWin : null);
        setExpectancy(Number.isFinite(src.evAbs) ? src.evAbs : null);
        setExpReturn(Number.isFinite(src.evPct) ? src.evPct : null);
      } catch {
        if (!aborted) {
          setMcStats(null); setProbProfit(null); setExpectancy(null); setExpReturn(null);
        }
      }
    }
    run();
    return () => { aborted = true; };
  }, [debouncedPayload]);

  return (
    <div className="container">
      {/* Page header */}
      <header className="page-header">
        <div className="titles">
          <div className="eyebrow">Portfolio</div>
          <h1 className="page-title">Strategy</h1>
          <p className="subtitle">Build, compare, and validate your options strategy.</p>
        </div>
        <div className="header-tools">
          <RomeClock />
          <button aria-label="Toggle theme" className="toggle"><ThemeToggle /></button>
        </div>
      </header>

      <div className="tv-layout">
        {/* Main column */}
        <div>
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

          {/* Legs */}
          <section className="card">
            <h3>Legs</h3>
            <LegsSection
              currency={currency}
              onNetPremiumChange={setNetPremium}
              onLegsChange={setLegsUi}
            />
          </section>

          {/* Chart */}
          <div className="tv-chart">
            <Chart
              spot={spot}
              legs={legs}
              riskFree={market.riskFree ?? 0}
              carryPremium={false}
              mu={null}
              sigma={sigma || 0}
              T={T || 0}
              mcStats={mcStats}
            />
          </div>

          {/* Quick actions (kept) */}
          <MiniCards
            disabled={!company?.symbol}
            defaultHorizon={horizon}
            onRun={(cfg) => console.log("run MC (manual)", cfg, { ivSource, ivValue, market })}
          />
        </div>

        {/* Right rail */}
        <StatsRail
          spot={spot}
          currency={currency}
          company={company}
          iv={sigma}
          market={market}
          mcStats={mcStats}
          probProfit={probProfit}
          expectancy={expectancy}
          expReturn={expReturn}
        />
      </div>
    </div>
  );
}
