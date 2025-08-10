// app/strategy/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import StrategyGallery from "../../components/Strategy/StrategyGallery";
import StatsRail from "../../components/Strategy/StatsRail";

import RomeClock from "../../components/RomeClock";
import ThemeToggle from "../../components/ThemeToggle";
import useDebounce from "../../hooks/useDebounce";

export default function Strategy() {
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [horizon, setHorizon] = useState(30);

  const [ivSource, setIvSource] = useState("live");
  const [ivValue, setIvValue] = useState(null);

  const [market, setMarket] = useState({
    riskFree: null,
    mrp: null,
    indexAnn: null,
  });

  const [netPremium, setNetPremium] = useState(0);
  const [legsUi, setLegsUi] = useState(null);

  const [mcStats, setMcStats] = useState(null);
  const [probProfit, setProbProfit] = useState(null);
  const [expectancy, setExpectancy] = useState(null);
  const [expReturn, setExpReturn] = useState(null);

  const spot = company?.spot || null;
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  // helpers -------------------------------------------------------------
  const num = (v) => {
    const n = parseFloat(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  };
  const toLegAPI = (leg) => ({
    enabled: !!leg?.enabled,
    K: num(leg?.strike ?? leg?.K),
    qty: Number.isFinite(+leg?.qty) ? +leg.qty : 0,
  });

  const legs = useMemo(() => {
    const lc = toLegAPI(legsUi?.lc || {});
    const sc = toLegAPI(legsUi?.sc || {});
    const lp = toLegAPI(legsUi?.lp || {});
    const sp = toLegAPI(legsUi?.sp || {});
    return { lc, sc, lp, sp };
  }, [legsUi]);

  const mcInput = useMemo(() => {
    if (!(spot > 0) || !(T > 0) || !(sigma >= 0)) return null;
    return {
      spot,
      mu: 0,
      sigma,
      Tdays: horizon,
      paths: 15000,
      legs,
      netPremium: Number.isFinite(netPremium) ? netPremium : 0,
      carryPremium: false,
      riskFree: market.riskFree ?? 0,
    };
  }, [spot, T, sigma, horizon, legs, netPremium, market.riskFree]);

  const debouncedPayload = useDebounce(
    mcInput ? JSON.stringify(mcInput) : "",
    250
  );

  useEffect(() => {
    let aborted = false;
    async function run() {
      if (!debouncedPayload) {
        setMcStats(null);
        setProbProfit(null);
        setExpectancy(null);
        setExpReturn(null);
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
          setMcStats(null);
          setProbProfit(null);
          setExpectancy(null);
          setExpReturn(null);
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
          setMcStats(null);
          setProbProfit(null);
          setExpectancy(null);
          setExpReturn(null);
        }
      }
    }
    run();
    return () => {
      aborted = true;
    };
  }, [debouncedPayload]);

  // Strategy tile -> Apply callback (writes legs + premium)
  const handleApply = (legsObj, netPrem) => {
    setLegsUi(legsObj || {});
    setNetPremium(Number.isFinite(netPrem) ? netPrem : 0);
  };

  return (
    <div className="container">
      <header className="page-header">
        <div className="titles">
          <div className="eyebrow">Portfolio</div>
          <h1 className="page-title">Strategy</h1>
          <p className="subtitle">
            Build, compare, and validate your options strategy.
          </p>
        </div>
        <div className="header-tools">
          <RomeClock />
          <button aria-label="Toggle theme" className="toggle">
            <ThemeToggle />
          </button>
        </div>
      </header>

      {/* Company — full width */}
      <CompanyCard
        value={company}
        market={market}
        onConfirm={(c) => {
          setCompany(c);
          setCurrency(c.currency || "EUR");
        }}
        onHorizonChange={(d) => setHorizon(d)}
        onIvSourceChange={(s) => setIvSource(s)}
        onIvValueChange={(v) => setIvValue(v)}
      />

      {/* First row: Market (left) + Key Stats (right) */}
      <div className="layout-2col">
        <div className="g-item">
          <MarketCard onRates={(r) => setMarket(r)} />
        </div>

        {/* Right column: ONLY Key Stats, scrolls normally (no sticky) */}
        <div className="g-item">
          <StatsRail
            spot={spot}
            currency={currency}
            company={company}
            iv={sigma}
            market={market}
            // removed: distribution + strategy summary
          />
        </div>

        {/* Second row: Strategy gallery spans both columns (full width) */}
        <div className="g-span">
          <StrategyGallery
            spot={spot}
            currency={currency}
            sigma={sigma}
            T={T}
            riskFree={market.riskFree ?? 0}
            mcStats={mcStats}
            onApply={handleApply}
          />
        </div>
      </div>

      <style jsx>{`
        .layout-2col {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: var(--row-gap);
          align-items: start;
        }
        .g-item {
          min-width: 0;
        }
        .g-span {
          grid-column: 1 / -1;
          min-width: 0;
        }
        @media (max-width: 1100px) {
          .layout-2col {
            grid-template-columns: 1fr;
          }
          .g-span {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </div>
  );
}
