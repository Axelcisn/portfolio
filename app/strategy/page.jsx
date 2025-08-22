// app/strategy/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import StrategyGallery from "../../components/Strategy/StrategyGallery";
import StatsRail from "../../components/Strategy/StatsRail";
import OptionsTab from "../../components/Options/OptionsTab";
import useExpiries from "../../components/Options/useExpiries";

import useDebounce from "../../hooks/useDebounce";
import useStrategyMemory from "../../components/state/useStrategyMemory";

/* ============================ Exchange helpers ============================ */
/** Hard mappings for terse exchange codes */
const EX_CODES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};

/** Normalize arbitrary vendor strings to a clean display label */
function normalizeExchangeLabel(co) {
  const cands = [
    co?.primaryExchange,
    co?.fullExchangeName,
    co?.exchangeName,
    co?.exchange,
    co?.exch,
    co?.ex,
    co?.market,
    co?.mic,
  ].map(x => String(x || "").trim()).filter(Boolean);

  if (!cands.length) return "";

  // 1) Exact code map first (e.g., NMS → NASDAQ)
  for (const raw of cands) {
    const up = raw.toUpperCase();
    if (EX_CODES[up]) return EX_CODES[up];
  }

  // 2) Heuristic text map (handles "NasdaqGS", "Nasdaq Stock Market", etc.)
  const txt = cands.join(" ").toLowerCase();
  if (/(nasdaq|nasdaqgs|nasdaqgm|nasdaqcm)/.test(txt)) return "NASDAQ";
  if (/nyse\s*arca|arca|pcx/.test(txt)) return "NYSE Arca";
  if (/nyse(?!\s*arca)/.test(txt)) return "NYSE";
  if (/amex|nysemkt/.test(txt)) return "AMEX";
  if (/london|lse/.test(txt)) return "London";
  if (/milan|borsa italiana|mil/.test(txt)) return "Milan";
  if (/six|swiss|ebs|swx/.test(txt)) return "Swiss";
  if (/tsx|toronto/.test(txt)) return "Toronto";
  if (/b3|sao\s*paulo|bovespa|sao/.test(txt)) return "São Paulo";
  if (/buenos\s*aires|byma|bue/.test(txt)) return "Buenos Aires";

  // 3) Fallback: use the first candidate as-is
  const first = cands[0];
  return first.length > 3 ? first : first.toUpperCase();
}

const pickNearest = (list) => {
  if (!Array.isArray(list) || list.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  for (const e of list) if (e >= today) return e;
  return list[list.length - 1];
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

  // Expiries shared across tabs
  const { list: expiries = [] } = useExpiries(company?.symbol);

  // Controlled expiry selection (shared with OptionsTab + StatsRail)
  const [selectedExpiry, setSelectedExpiry] = useState(null);

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
    if (mem.tab) setTab(mem.tab);
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
  const rawSpot = Number(company?.spot);
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  // Choose effective spot (company spot if valid, else fallback)
  const spotEff = useMemo(
    () => (rawSpot > 0 ? rawSpot : (Number(fallbackSpot) > 0 ? Number(fallbackSpot) : null)),
    [rawSpot, fallbackSpot]
  );

  const changeAbs = useMemo(() => {
    const prev = Number(company?.prevClose);
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(spotEff)) return spotEff - prev;
    return null;
  }, [spotEff, company?.prevClose]);

  const changePct = useMemo(() => {
    if (!Number.isFinite(changeAbs) || !Number.isFinite(company?.prevClose) || company.prevClose <= 0) return null;
    return (changeAbs / company.prevClose) * 100;
  }, [changeAbs, company?.prevClose]);

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
  const exLabel = useMemo(() => (company ? normalizeExchangeLabel(company) : ""), [company]);

  // Big title = Company Name only (no "(AAPL)").
  const displayTitle = useMemo(() => {
    const name =
      company?.longName ??
      company?.name ??
      company?.shortName ??
      company?.companyName ??
      "";
    return name;
  }, [company]);

  const logoUrl = useMemo(() => {
    const n = company?.longName || company?.name || "";
    if (!n) return null;
    const core = n
      .replace(/,?\s+(inc|corp|corporation|co|company|ltd|plc|sa|ag|nv|oyj|ab)$/i, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
    if (!core) return null;
    return `https://logo.clearbit.com/${core}.com`;
  }, [company?.longName, company?.name]);

  const closeStr = useMemo(() => (
    new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
  ), []);

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
  const TABS = [
    { key: "overview",   label: "Overview" },
    { key: "financials", label: "Financials" },
    { key: "news",       label: "News" },
    { key: "ideas",      label: "Ideas" },
    { key: "discussions",label: "Discussions" },
    { key: "technicals", label: "Technicals" },
    { key: "forecast",   label: "Forecast" },
    { key: "seasonals",  label: "Seasonals" },
    { key: "options",    label: "Options" },
    { key: "bonds",      label: "Bonds" },
  ];

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
        <section className="hero">
          <div className="hero-id">
            <div className="hero-logo" aria-hidden="true">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              ) : (
                String((displayTitle || company?.symbol || "?")).slice(0, 1)
              )}
            </div>
            <div className="hero-texts">
              {/* Title: Company name only */}
              <h1 className="hero-name">{displayTitle}</h1>
              <div className="hero-pill" aria-label="Ticker and exchange">
                <span className="tkr">{company.symbol}</span>
                {exLabel && (
                  <>
                    <span className="dot">•</span>
                    <span className="ex">{exLabel}</span>
                    <span className="ex-icons">
                      <span className="icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M5 12h14"/></svg>
                      </span>
                      <span className="icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M7 20l5-5 5 5M7 4h10l-3 5 3 5H7l3-5z"/></svg>
                      </span>
                      <span className="icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none"><path d="M3 12h3l3 8 4-16 3 8h5"/></svg>
                      </span>
                    </span>
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
            {Number.isFinite(changeAbs) && Number.isFinite(changePct) && (
              <div className={`p-change ${changeAbs >= 0 ? "up" : "down"}`}>
                {changeAbs >= 0 ? "+" : ""}{changeAbs.toFixed(2)} ({changePct.toFixed(2)}%)
              </div>
            )}
            <div className="p-sub">At close at {closeStr}</div>
          </div>
        </section>
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

        /* Hero */
        .hero{ padding:20px 0 24px 0; border-bottom:1px solid var(--border); margin-bottom:20px; }
        .hero-id{ display:flex; align-items:center; gap:16px; min-width:0; }
        .hero-logo{
          width:84px; height:84px; border-radius:20px;
          background: radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,.08), rgba(0,0,0,.35));
          border:1px solid var(--border); display:flex; align-items:center; justify-content:center;
          font-weight:700; font-size:36px; overflow:hidden;
        }
        .hero-texts{ display:flex; flex-direction:column; gap:8px; min-width:0; }
        .hero-name{ margin:0; font-size:40px; line-height:1.05; letter-spacing:-.3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .hero-pill{
          display:inline-flex; align-items:center; gap:8px; height:auto; padding:0;
          border:0; background:transparent; font-weight:600; width:fit-content;
        }
        .hero-pill .dot{ opacity:.6; }
        .ex-icons{ display:inline-flex; gap:4px; margin-left:6px; }
        .icon{ width:18px; height:18px; display:flex; align-items:center; justify-content:center; border-radius:4px; border:1px solid var(--border); }

        .hero-price{ margin-top:16px; }
        .p-big{ font-size:56px; line-height:1; font-weight:800; letter-spacing:-.5px; }
        .p-ccy{ font-size:18px; font-weight:600; margin-left:10px; opacity:.9; }
        .p-change{ margin-top:6px; font-size:20px; font-weight:600; }
        .p-change.up{ color:#16a34a; }
        .p-change.down{ color:#dc2626; }
        .p-sub{ margin-top:6px; font-size:14px; opacity:.75; }

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
          .hero-logo{ width:72px; height:72px; border-radius:16px; font-size:32px; }
          .hero-name{ font-size:32px; }
          .p-big{ font-size:40px; }
          .tab-title{ font-size:20px; }
        }
      `}</style>
    </div>
  );
}
