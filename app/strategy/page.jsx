// app/strategy/page.jsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import StrategyGallery from "../../components/Strategy/StrategyGallery";
import StatsRail from "../../components/Strategy/StatsRail";
import OptionsTab from "../../components/Options/OptionsTab";
import useExpiries from "../../components/Options/useExpiries";
import CompanyHeader from "../../components/Strategy/CompanyHeader";
import { STRATEGY_TABS } from "../../components/Strategy/tabs";

import useDebounce from "../../hooks/useDebounce";
import useStrategyMemory from "../../components/state/useStrategyMemory";

const pickNearest = (list) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  for (const e of list) if (e >= today) return e;
  return list[list.length - 1];
};

function StrategyInner() {
  const params = useSearchParams();
  const symbolParam = params.get("symbol")?.toUpperCase() || null;
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

  // Expiries shared across tabs
  const { list: expiries = [] } = useExpiries(company?.symbol);

  // Controlled expiry selection (shared with OptionsTab + StatsRail)
  const [selectedExpiry, setSelectedExpiry] = useState(null);

  useEffect(() => {
    if (symbolParam && (!company || company.symbol !== symbolParam)) {
      setCompany({ symbol: symbolParam });
    }
  }, [symbolParam]);

  /* ===== Memory (persists by symbol) ===== */
  const { data: mem, loaded: memReady, save: memSave } = useStrategyMemory(company?.symbol);

  // hydrate from memory when available
  useEffect(() => {
    if (!memReady) return;
    if (mem.horizon != null) setHorizon(mem.horizon);
    if (mem.ivSource) setIvSource(mem.ivSource);
    if (mem.ivValue != null) setIvValue(mem.ivValue);
    if (mem.legsUi) setLegsUi(mem.legsUi);
    if (mem.netPremium != null) setNetPremium(mem.netPremium);
    if (mem.expiry) setSelectedExpiry(mem.expiry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memReady]);

  // keep selectedExpiry valid against current list (don’t override if still valid)
  useEffect(() => {
    if (!expiries.length) return;
    if (selectedExpiry && expiries.includes(selectedExpiry)) return;
    setSelectedExpiry(pickNearest(expiries));
  }, [expiries, selectedExpiry]);

  /* ===== 01 — Derived inputs ===== */
  // Some company payloads expose `displaySpot` or `spot`; use whichever is valid
  const rawSpot = Number(
    company?.spot != null ? company.spot : company?.displaySpot
  );
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  // Choose effective spot (company spot if valid, else fallback)
  const spotEff = useMemo(
    () => (rawSpot > 0 ? rawSpot : (Number(fallbackSpot) > 0 ? Number(fallbackSpot) : null)),
    [rawSpot, fallbackSpot]
  );

  /* ===== 01.b — Live IBKR polling to keep spotEff fresh ===== */
  useEffect(() => {
    if (!company?.symbol) return;
    let stopped = false;
    let id = null;

    const tick = async () => {
      try {
        const u = `/api/ibkr/basic?symbol=${encodeURIComponent(company.symbol)}`;
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok || j?.ok === false) throw new Error(j?.error || `ibkr ${r.status}`);
        const px = Number(j.price ?? j.fields?.["31"] ?? j.fields?.[31]);
        if (Number.isFinite(px) && px > 0) {
          // update fallbackSpot and notify parent company object
          setFallbackSpot(px);
          setCompany(prev => {
            if (!prev || prev.symbol !== company.symbol) return prev;
            return { ...prev, spot: px };
          });
        }
      } catch (e) {
        // silently ignore polling errors
      } finally {
        if (!stopped) id = setTimeout(tick, 5000);
      }
    };

    tick();
    return () => { stopped = true; if (id) clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.symbol]);


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

  // If we only have a ticker (no good name), try IB first, then Yahoo.
  useEffect(() => {
    if (!company?.symbol) return;
    const needName = !(company?.longName || company?.name || company?.shortName || company?.companyName);
    const needExch = !(company?.primaryExchange || company?.exchangeName || company?.exchange);
    if (!needName && !needExch) return;

    let cancel = false;
    (async () => {
      const sym = company.symbol;

      const tryIB = async () => {
        try {
          const r = await fetch(`/api/provider/ib/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
          const j = await r.json();
          if (r.ok && j?.ok !== false) return j;
          return null;
        } catch { return null; }
      };

      const tryYahoo = async () => {
        try {
          const r = await fetch(`/api/company?symbol=${encodeURIComponent(sym)}`, { cache: "no-store" });
          return await r.json();
        } catch { return null; }
      };

      const ib = await tryIB();
      const ya = ib ? null : await tryYahoo();
      if (cancel) return;

      const name =
        ib?.longName ||
        ya?.longName || ya?.shortName || ya?.name || ya?.companyName ||
        "";

      const exchange =
        ib?.primaryExchange ||
        ya?.fullExchangeName || ya?.exchangeName || ya?.exchange || "";

      const ccy = ib?.currency || ya?.currency || company?.currency;

      if (name || exchange || ccy) {
        setCompany(prev => {
          if (!prev || prev.symbol !== sym) return prev;
          return {
            ...prev,
            longName: name || prev.longName || prev.name,
            exchangeName: exchange || prev.exchangeName || prev.exchange,
            primaryExchange: ib?.primaryExchange || prev?.primaryExchange || null,
            currency: ccy || prev.currency,
          };
        });
      }
    })();

    return () => { cancel = true; };
  }, [company?.symbol]);

  const handleApply = (legsObj, netPrem, _meta, info) => {
    setLegsUi(legsObj || {});
    setNetPremium(Number.isFinite(netPrem) ? netPrem : 0);
    if (company?.symbol) {
      memSave({ legsUi: legsObj || {}, netPremium: Number.isFinite(netPrem) ? netPrem : 0 });
      if (info?.name) {
        try {
          const raw = localStorage.getItem("screener_saved");
          const list = raw ? JSON.parse(raw) : [];
          const entry = {
            symbol: company.symbol,
            strategy: info.name,
            savedAt: Date.now(),
          };
          const next = list.filter(
            (i) => !(i.symbol === entry.symbol && i.strategy === entry.strategy)
          );
          next.push(entry);
          localStorage.setItem("screener_saved", JSON.stringify(next));
        } catch {}
      }
    }
  };

  /* ===== 06 — Tabs ===== */
  const [tab, setTab] = useState("overview");
  const TABS = STRATEGY_TABS;

  // reset to Overview whenever a new company is selected
  useEffect(() => {
    setTab("overview");
  }, [company?.symbol]);

  const tabTitle = useMemo(() => {
    const base = TABS.find(t => t.key === tab)?.label || "Overview";
    return company?.symbol ? `${company.symbol} ${base.toLowerCase()}` : base;
  }, [tab, company?.symbol]);

  // persist key state to memory
  useEffect(() => { if (memReady && company?.symbol) memSave({ horizon }); }, [memReady, company?.symbol, horizon, memSave]);
  useEffect(() => { if (memReady && company?.symbol) memSave({ ivSource, ivValue }); }, [memReady, company?.symbol, ivSource, ivValue, memSave]);
  useEffect(() => { if (memReady && company?.symbol) memSave({ legsUi, netPremium }); }, [memReady, company?.symbol, legsUi, netPremium, memSave]);
  useEffect(() => { if (memReady && company?.symbol) memSave({ tab }); }, [memReady, company?.symbol, tab, memSave]);
  useEffect(() => { if (memReady && company?.symbol) memSave({ expiry: selectedExpiry || null }); }, [memReady, company?.symbol, selectedExpiry, memSave]);

  /* ===== 07 — Render ===== */
  return (
    <div className="container">
      {/* Hero */}
      {company?.symbol ? (
        <CompanyHeader company={company} spot={spotEff} currency={company?.currency || currency} />
      ) : (
        <header className="page-header">
          <div className="titles">
            <div className="eyebrow">Portfolio</div>
            <h1 className="page-title">Strategy</h1>
            {/* UPDATED COPY */}
            <p className="subtitle">Build, compare, and validate option strategies.</p>
          </div>
        </header>
      )}

      {/* Company (full width) */}
      <CompanyCard
        value={company}
        market={market}
        onConfirm={(c) => { setCompany(c); setCurrency(c.currency || "EUR"); }}
        onHorizonChange={(d) => { setHorizon(d); if (company?.symbol) memSave({ horizon: d }); }}
        onIvSourceChange={(s) => { setIvSource(s); if (company?.symbol) memSave({ ivSource: s }); }}
        onIvValueChange={(v) => { setIvValue(v); if (company?.symbol) memSave({ ivValue: v }); }}
      />

      {/* Tabs header */}
      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => { setTab(t.key); if (company?.symbol) memSave({ tab: t.key }); }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Title between tabs and cards */}
      <h2 className="tab-title">{tabTitle}</h2>

      {/* Tabbed content */}
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

              /* expiry list shared across tabs */
              expiries={expiries}
              /* Optional: pass current selection for future support */
              selectedExpiry={selectedExpiry}
              onExpiryChange={(iso) => {
                setSelectedExpiry(iso || null);
                if (company?.symbol) memSave({ expiry: iso || null });
              }}
              onDaysChange={(d) => { setHorizon(d); if (company?.symbol) memSave({ horizon: d }); }}

              /* let StatsRail stamp days on legs if needed */
              legs={legsUi}
              onLegsChange={(v) => { setLegsUi(v); if (company?.symbol) memSave({ legsUi: v }); }}
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

      {tab === "ideas" && (
        <section>
          <h3 className="section-title">Ideas</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "discussions" && (
        <section>
          <h3 className="section-title">Discussions</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "technicals" && (
        <section>
          <h3 className="section-title">Technicals</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "forecast" && (
        <section>
          <h3 className="section-title">Forecast</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "seasonals" && (
        <section>
          <h3 className="section-title">Seasonals</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      {tab === "options" && (
        <OptionsTab
          symbol={company?.symbol || ""}
          currency={company?.currency || currency}
          /* share expiries + controlled selection */
          expiries={expiries}
          selectedExpiry={selectedExpiry}
          onChangeExpiry={(iso) => {
            setSelectedExpiry(iso || null);
            if (company?.symbol) memSave({ expiry: iso || null });
          }}
          onDaysChange={(d) => { setHorizon(d); if (company?.symbol) memSave({ horizon: d }); }}
        />
      )}

      {tab === "bonds" && (
        <section>
          <h3 className="section-title">Bonds</h3>
          <p className="muted">Coming soon.</p>
        </section>
      )}

      <style jsx>{`
        /* Tabs */
        .tabs{
          display:flex; gap:6px;
          margin:20px 0 22px;
          border-bottom:1px solid var(--border);
        }
        .tab{
          height:42px; padding:0 14px; border:0; background:transparent;
          color:var(--text); opacity:.8; font-weight:600; cursor:pointer;
          border-bottom:2px solid transparent; margin-bottom:-1px;
        }
        .tab:hover{ opacity:1; }
        .tab.is-active{ opacity:1; border-bottom-color:currentColor; }

        /* Title between tabs and cards */
        .tab-title{
          margin: 2px 0 18px;
          font-size: 22px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -.2px;
        }

        /* Grid below — stretch so both cards share the same height */
        .layout-2col{ display:grid; grid-template-columns: 1fr 320px; gap: var(--row-gap); align-items: stretch; }
        .g-item{ min-width:0; }
        .g-span{ grid-column: 1 / -1; min-width:0; }
        .g-item :global(.card){ height:100%; display:flex; flex-direction:column; }

        .section-title{ font-weight:800; margin:8px 0; }
        .muted{ opacity:.7; }

        @media (max-width:1100px){
          .layout-2col{ grid-template-columns: 1fr; }
          .g-span{ grid-column: 1 / -1; }
          .tab-title{ font-size:20px; }
        }
      `}</style>
    </div>
  );
}

export default function Strategy() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-muted">Loading…</div>}>
      <StrategyInner />
    </Suspense>
  );
}
