"use client";

import { useEffect, useMemo, useState } from "react";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import StrategyGallery from "../../components/Strategy/StrategyGallery";
import StatsRail from "../../components/Strategy/StatsRail";
import ExpiryStrip from "../../components/Options/ExpiryStrip";
import OptionsTab from "../../components/Options/OptionsTab";
import useExpiries from "../../components/Options/useExpiries";

import useDebounce from "../../hooks/useDebounce";

/* Exchange pretty labels used in the hero pill */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};
const prettyEx = (x) => (EX_NAMES[x] || x || "").toUpperCase();

export default function Strategy() {
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [horizon, setHorizon] = useState(30);
  const [selectedExpiry, setSelectedExpiry] = useState(null); // shared expiry

  const [ivSource, setIvSource] = useState("live");
  const [ivValue, setIvValue] = useState(null);

  const [market, setMarket] = useState({ riskFree: null, mrp: null, indexAnn: null });

  const [netPremium, setNetPremium] = useState(0);
  const [legsUi, setLegsUi] = useState(null);

  const [mcStats, setMcStats] = useState(null);
  const [probProfit, setProbProfit] = useState(null);
  const [expectancy, setExpectancy] = useState(null);
  const [expReturn, setExpReturn] = useState(null);

  const [fallbackSpot, setFallbackSpot] = useState(null);

  const { list: expiries } = useExpiries(company?.symbol);

  const rawSpot = Number(company?.spot);
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  const spotEff = useMemo(
    () => (rawSpot > 0 ? rawSpot : (Number(fallbackSpot) > 0 ? Number(fallbackSpot) : null)),
    [rawSpot, fallbackSpot]
  );

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
    if (!(spotEff > 0) || !(T > 0) || !(sigma >= 0)) return null;
    return {
      spot: spotEff,
      mu: 0,
      sigma,
      Tdays: horizon,
      paths: 15000,
      legs,
      netPremium: Number.isFinite(netPremium) ? netPremium : 0,
      carryPremium: false,
      riskFree: market.riskFree ?? 0,
    };
  }, [spotEff, T, sigma, horizon, legs, netPremium, market.riskFree]);

  const debouncedPayload = useDebounce(mcInput ? JSON.stringify(mcInput) : "", 250);

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
        const j = await r.json(); if (aborted) return;
        if (!r.ok || j?.ok === false) {
          setMcStats(null); setProbProfit(null); setExpectancy(null); setExpReturn(null);
          return;
        }
        const src = j?.data || j || {};
        setMcStats({
          meanST: src.meanST ?? null,
          q05ST: src.q05ST ?? null,
          q25ST: src.q25ST ?? null,
          q50ST: src.q50ST ?? null,
          q75ST: src.q75ST ?? null,
          q95ST: src.q95ST ?? null,
          qLoST: src.qLoST ?? null,
          qHiST: src.qHiST ?? null,
        });
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

  useEffect(() => {
    let cancel = false;
    setFallbackSpot(null);
    if (!company?.symbol) return;
    if (rawSpot > 0) return;

    (async () => {
      try {
        const u = `/api/chart?symbol=${encodeURIComponent(company.symbol)}&range=5d&interval=1d`;
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json();
        if (cancel) return;

        let last = null;
        const arrs = [
          j?.closes,
          j?.close,
          j?.data?.closes,
          j?.data?.close,
          Array.isArray(j?.prices) ? j.prices.map((p) => p?.close ?? p?.c) : null,
          Array.isArray(j?.series) ? j.series.map((p) => p?.close ?? p?.c) : null,
        ].filter(Boolean);
        for (const a of arrs) {
          if (Array.isArray(a) && a.length) { last = Number(a[a.length - 1]); break; }
        }
        if (!Number.isFinite(last) && Number.isFinite(j?.lastClose)) last = Number(j.lastClose);
        if (!Number.isFinite(last) && Number.isFinite(j?.data?.lastClose)) last = Number(j.data.lastClose);

        if (Number.isFinite(last) && last > 0) setFallbackSpot(last);
      } catch { /* ignore */ }
    })();

    return () => { cancel = true; };
  }, [company?.symbol, rawSpot]);

  const exLabel = useMemo(() => {
    const raw =
      company?.exchange ||
      company?.exchangeName ||
      company?.ex ||
      company?.exch ||
      "";
    return prettyEx(raw);
  }, [company]);

  const heroName = company?.name || company?.longName || company?.symbol || "";

  const handleApply = (legsObj, netPrem) => {
    setLegsUi(legsObj || {});
    setNetPremium(Number.isFinite(netPrem) ? netPrem : 0);
  };

  const [tab, setTab] = useState("overview");
  const TABS = [
    { key: "overview",   label: "Overview" },
    { key: "financials", label: "Financials" },
    { key: "news",       label: "News" },
    { key: "options",    label: "Options" },
    { key: "bonds",      label: "Bonds" },
  ];

  const tabTitle = useMemo(() => {
    const base = TABS.find(t => t.key === tab)?.label || "Overview";
    return company?.symbol ? `${company.symbol} ${base.toLowerCase()}` : base;
  }, [tab, company?.symbol]);

  return (
    <div className="container">
      {company?.symbol ? (
        <section className="hero">
          <div className="hero-id">
            <div className="hero-logo" aria-hidden="true">
              {String(company?.symbol || "?").slice(0, 1)}
            </div>
            <div className="hero-texts">
              <h1 className="hero-name">{heroName}</h1>
              <div className="hero-pill" aria-label="Ticker and exchange">
                <span className="tkr">{company.symbol}</span>
                {exLabel && (
                  <>
                    <span className="dot">•</span>
                    <span className="ex">{exLabel}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="hero-price">
            <div className="p-big">
              {Number.isFinite(spotEff) ? Number(spotEff).toFixed(2) : "0.00"}
              <span className="p-ccy"> {company?.currency || currency || "USD"}</span>
            </div>
          </div>
        </section>
      ) : (
        <header className="page-header">
          <div className="titles">
            <div className="eyebrow">Portfolio</div>
            <h1 className="page-title">Strategy</h1>
            <p className="subtitle">Build, compare, and validate your options strategy.</p>
          </div>
        </header>
      )}

      <CompanyCard
        value={company}
        market={market}
        onConfirm={(c) => { setCompany(c); setCurrency(c.currency || "EUR"); }}
        onHorizonChange={(d) => setHorizon(d)}
        onIvSourceChange={(s) => setIvSource(s)}
        onIvValueChange={(v) => setIvValue(v)}
      />

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <h2 className="tab-title">{tabTitle}</h2>

      {tab === "overview" && (
        <>
          <ExpiryStrip
            expiries={expiries}
            value={selectedExpiry}
            onChange={setSelectedExpiry}
          />
          <div className="layout-2col">
            <div className="g-item">
              <MarketCard onRates={(r) => setMarket(r)} />
            </div>
            <div className="g-item">
              <StatsRail
                spot={spotEff}
                currency={company?.currency || currency}
                company={company}
                iv={sigma}
                market={market}
                expiries={expiries}
                selectedExpiry={selectedExpiry}
                onExpiryChange={setSelectedExpiry}
                onDaysChange={(d) => setHorizon(d)}
                legs={legsUi}
                onLegsChange={setLegsUi}
              />
            </div>
            <div className="g-span">
              <StrategyGallery
                spot={spotEff}
                currency={currency}
                sigma={sigma}
                T={T}
                riskFree={market.riskFree ?? 0}
                mcStats={mcStats}
                onApply={handleApply}
              />
            </div>
          </div>
        </>
      )}

      {tab === "financials" && (
        <section>
          <h3 className="section-title">Financials</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "news" && (
        <section>
          <h3 className="section-title">News</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "options" && (
        <OptionsTab
          symbol={company?.symbol || ""}
          currency={company?.currency || currency}
        />
      )}

      {tab === "bonds" && (
        <section>
          <h3 className="section-title">Bonds</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}
    </div>
  );
}
