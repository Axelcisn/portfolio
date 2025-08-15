// app/strategy/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import StrategyGallery from "../../components/Strategy/StrategyGallery";
import StatsRail from "../../components/Strategy/StatsRail";
import OptionsTab from "../../components/Options/OptionsTab"; // NEW

import useDebounce from "../../hooks/useDebounce";

/* Exchange pretty labels used in the hero pill */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};
const prettyEx = (x) => (EX_NAMES[x] || x || "").toUpperCase();

/* ---------- helpers for expiries ---------- */
const toISO = (v) => {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export default function Strategy() {
  /* ===== 00 — Local state ===== */
  const [company, setCompany] = useState(null);
  const [currency, setCurrency] = useState("EUR");
  const [horizon, setHorizon] = useState(30);

  const [ivSource, setIvSource] = useState("live");
  const [ivValue, setIvValue] = useState(null);

  const [market, setMarket] = useState({ riskFree: null, mrp: null, indexAnn: null });

  const [netPremium, setNetPremium] = useState(0);
  const [legsUi, setLegsUi] = useState(null);

  const [mcStats, setMcStats] = useState(null);
  const [probProfit, setProbProfit] = useState(null);
  const [expectancy, setExpectancy] = useState(null);
  const [expReturn, setExpReturn] = useState(null);

  // Fallback price (when /api/company returns spot = 0)
  const [fallbackSpot, setFallbackSpot] = useState(null);

  // 🔹 Expiries shared with StatsRail (matches OptionsTab sources)
  const [expiries, setExpiries] = useState([]);

  /* ===== fetch expiries when symbol changes (same endpoints as OptionsTab) ===== */
  useEffect(() => {
    let aborted = false;
    async function load() {
      const sym = company?.symbol;
      if (!sym) { setExpiries([]); return; }
      try {
        // Base list
        const r1 = await fetch(`/api/expiries?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
        const j1 = await r1.json();
        const list1 = (j1?.dates || j1?.data?.dates || j1?.data || [])
          .map(toISO).filter(Boolean);

        // Volume-backed extras (mirror OptionsTab behavior)
        let list2 = [];
        try {
          const r2 = await fetch(`/api/expiries/volume?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
          const j2 = await r2.json();
          const items = j2?.items || j2?.data || [];
          list2 = items
            .filter(it => Number(it?.totalVol) > 0.5)
            .map(it => toISO(it?.date))
            .filter(Boolean);
        } catch { /* optional */ }

        const unique = Array.from(new Set([...list1, ...list2])).sort();
        if (!aborted) setExpiries(unique);
      } catch {
        if (!aborted) setExpiries([]);
      }
    }
    load();
    return () => { aborted = true; };
  }, [company?.symbol]);

  /* ===== 01 — Derived inputs ===== */
  const rawSpot = Number(company?.spot);
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  // Choose effective spot (company spot if valid, else fallback)
  const spotEff = useMemo(
    () => (rawSpot > 0 ? rawSpot : (Number(fallbackSpot) > 0 ? Number(fallbackSpot) : null)),
    [rawSpot, fallbackSpot]
  );

  /* ===== 02 — Helpers ===== */
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

  /* ===== 03 — Monte Carlo payload & call ===== */
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

  /* ===== 04 — Fallback last close when company spot is 0 ===== */
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

  /* ===== 05 — Hero helpers ===== */
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

  /* ===== 06 — Tabs state (pure CSS underline) ===== */
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

  /* ===== 07 — Render ===== */
  return (
    <div className="container">
      {/* Hero */}
      {company?.symbol ? (
        <section className="hero">
          {/* ... hero UI ... */}
        </section>
      ) : (
        <header className="page-header">
          {/* ... header UI ... */}
        </header>
      )}

      {/* Company (full width) */}
      <CompanyCard
        value={company}
        market={market}
        onConfirm={(c) => { setCompany(c); setCurrency(c.currency || "EUR"); }}
        onHorizonChange={(d) => setHorizon(d)}
        onIvSourceChange={(s) => setIvSource(s)}
        onIvValueChange={(v) => setIvValue(v)}
      />

      {/* Tabs */}
      {/* ... tabs UI ... */}

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="layout-2col">
          <div className="g-item">
            <MarketCard onRates={(r) => setMarket(r)} />
          </div>

          <div className="g-item">
            <StatsRail
              /* pricing context */
              spot={spotEff}
              currency={company?.currency || currency}
              company={company}
              iv={sigma}
              market={market}

              /* expiry list shared with Options tab */
              expiries={expiries}
              onDaysChange={(d) => setHorizon(d)}

              /* let StatsRail stamp days on legs if needed */
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
      )}

      {tab === "options" && (
        <OptionsTab
          symbol={company?.symbol || ""}
          currency={company?.currency || currency}
        />
      )}

      {/* ... other tabs ... */}
    </div>
  );
}
