"use client";
import { useEffect, useMemo, useState } from "react";
import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import LegsSection from "../../components/Strategy/LegsSection";
import Chart from "../../components/Strategy/Chart";
import MiniCards from "../../components/Strategy/MiniCards";
import SummaryTiles from "../../components/Strategy/SummaryTiles";
import useDebounce from "../../hooks/useDebounce";

export default function Strategy() {
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [horizon, setHorizon] = useState(30);

  const [ivSource, setIvSource] = useState("live");
  const [ivValue, setIvValue] = useState(null); // decimal (e.g., 0.30)

  const [market, setMarket] = useState({ riskFree: null, mrp: null, indexAnn: null });

  const [netPremium, setNetPremium] = useState(0);
  const [legsUi, setLegsUi] = useState(null);

  // MC outputs
  const [mcStats, setMcStats] = useState(null); // { meanST, q05ST, ..., qHiST }
  const [probProfit, setProbProfit] = useState(null); // 0..1
  const [expectancy, setExpectancy] = useState(null); // EV (abs)
  const [expReturn, setExpReturn] = useState(null);   // EV / |premium| (or /S if 0)

  const tickerConfirmed = !!company?.symbol;

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
      mu: 0,                          // drift: keep 0 for now; we can wire CAPM later
      sigma,                           // annualized decimal
      Tdays: horizon,                  // send days to the API
      paths: 15000,                    // responsive default
      legs,
      netPremium: Number.isFinite(netPremium) ? netPremium : 0,
      carryPremium: false,             // UI toggle can be added later
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
          // keep graceful UI on errors
          setMcStats(null);
          setProbProfit(null);
          setExpectancy(null);
          setExpReturn(null);
          return;
        }
        // Accept either envelope or flat (back-compat)
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
    return () => { aborted = true; };
  }, [debouncedPayload]);

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
      <LegsSection
        currency={currency}
        onNetPremiumChange={setNetPremium}
        onLegsChange={setLegsUi}
      />

      <Chart
        spot={spot}
        legs={legs}
        riskFree={market.riskFree ?? 0}
        carryPremium={false}   /* set true when you add a UI toggle */
        mu={null}              /* we’ll wire CAPM later if you want */
        sigma={sigma || 0}
        T={T || 0}
        mcStats={mcStats}
      />

      <MiniCards
        disabled={!tickerConfirmed}
        defaultHorizon={horizon}
        onRun={(cfg) => console.log("run MC (manual)", cfg, { ivSource, ivValue, market })}
      />

      <SummaryTiles
        currency={currency}
        netPremium={netPremium}
        probProfit={probProfit}
        expectancy={expectancy}
        expReturn={expReturn}
      />
    </div>
  );
}
