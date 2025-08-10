// app/strategy/page.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

import CompanyCard from "../../components/Strategy/CompanyCard";
import MarketCard from "../../components/Strategy/MarketCard";
import StrategyGallery from "../../components/Strategy/StrategyGallery";
import StatsRail from "../../components/Strategy/StatsRail";

import useDebounce from "../../hooks/useDebounce";

/* Exchange pretty labels used in the hero pill */
const EX_NAMES = {
  NMS: "NASDAQ", NGM: "NASDAQ GM", NCM: "NASDAQ CM",
  NYQ: "NYSE", ASE: "AMEX", PCX: "NYSE Arca",
  MIL: "Milan", LSE: "London", EBS: "Swiss", SWX: "Swiss",
  TOR: "Toronto", SAO: "São Paulo", BUE: "Buenos Aires",
};
const prettyEx = (x) => (EX_NAMES[x] || x || "").toUpperCase();

/* Remove legal suffixes (Inc., Corp., etc.) for cleaner hero name */
const cleanName = (n = "") =>
  n.replace(/\b(incorporated|inc\.?|corp\.?|corporation|plc|s\.p\.a\.|sa|nv)\b/gi, "").trim();

export default function Strategy() {
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

  const spot = company?.spot || null;
  const sigma = ivValue ?? null;
  const T = horizon > 0 ? horizon / 365 : null;

  // ---------------- helpers ----------------
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
      spot, mu: 0, sigma, Tdays: horizon, paths: 15000,
      legs, netPremium: Number.isFinite(netPremium) ? netPremium : 0,
      carryPremium: false, riskFree: market.riskFree ?? 0,
    };
  }, [spot, T, sigma, horizon, legs, netPremium, market.riskFree]);

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
          method: "POST", headers: { "Content-Type": "application/json" },
          cache: "no-store", body: JSON.stringify(body),
        });
        const j = await r.json(); if (aborted) return;
        if (!r.ok || j?.ok === false) {
          setMcStats(null); setProbProfit(null); setExpectancy(null); setExpReturn(null); return;
        }
        const src = j?.data || j || {};
        setMcStats({
          meanST: src.meanST ?? null, q05ST: src.q05ST ?? null, q25ST: src.q25ST ?? null,
          q50ST: src.q50ST ?? null, q75ST: src.q75ST ?? null, q95ST: src.q95ST ?? null,
          qLoST: src.qLoST ?? null, qHiST: src.qHiST ?? null,
        });
        setProbProfit(Number.isFinite(src.pWin) ? src.pWin : null);
        setExpectancy(Number.isFinite(src.evAbs) ? src.evAbs : null);
        setExpReturn(Number.isFinite(src.evPct) ? src.evPct : null);
      } catch {
        if (!aborted) { setMcStats(null); setProbProfit(null); setExpectancy(null); setExpReturn(null); }
      }
    }
    run();
    return () => { aborted = true; };
  }, [debouncedPayload]);

  const handleApply = (legsObj, netPrem) => {
    setLegsUi(legsObj || {}); setNetPremium(Number.isFinite(netPrem) ? netPrem : 0);
  };

  // derive a robust exchange label for the hero pill
  const exLabel = useMemo(() => {
    const raw =
      company?.exchange ||
      company?.exchangeName ||
      company?.ex ||
      company?.exch ||
      "";
    return prettyEx(raw);
  }, [company]);

  return (
    <div className="container">
      {/* Hero header (ticker • exchange). No clock / theme toggle here. */}
      {company?.symbol ? (
        <section className="hero">
          <div className="hero-id">
            <div className="hero-logo" aria-hidden="true">
              {String(company?.symbol || "?").slice(0, 1)}
            </div>
            <div className="hero-texts">
              <h1 className="hero-name">{cleanName(company?.name || company?.symbol)}</h1>
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
              {Number.isFinite(spot) ? Number(spot).toFixed(2) : "0.00"}
              <span className="p-ccy"> {company?.currency || currency || "USD"}</span>
            </div>
            <div className="p-sub">
              At close •{" "}
              {new Date().toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                timeZoneName: "short",
              })}
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

      {/* Company — full width */}
      <CompanyCard
        value={company}
        market={market}
        onConfirm={(c) => { setCompany(c); setCurrency(c.currency || "EUR"); }}
        onHorizonChange={(d) => setHorizon(d)}
        onIvSourceChange={(s) => setIvSource(s)}
        onIvValueChange={(v) => setIvValue(v)}
      />

      {/* Row 1: Market (left) + Key stats (right). Same height; no sticky. */}
      <div className="layout-2col">
        <div className="g-item">
          <MarketCard onRates={(r) => setMarket(r)} />
        </div>
        <div className="g-item">
          <StatsRail
            spot={spot}
            currency={currency}
            company={company}
            iv={sigma}
            market={market}
          />
        </div>

        {/* Row 2: Strategy gallery spans full width */}
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
        /* Hero */
        .hero{ padding:10px 0 18px 0; border-bottom:1px solid var(--border); margin-bottom:16px; }
        .hero-id{ display:flex; align-items:center; gap:14px; min-width:0; }
        .hero-logo{
          width:84px; height:84px; border-radius:20px;
          background: radial-gradient(120% 120% at 30% 20%, rgba(255,255,255,.08), rgba(0,0,0,.35));
          border:1px solid var(--border); display:flex; align-items:center; justify-content:center;
          font-weight:700; font-size:36px;
        }
        .hero-texts{ display:flex; flex-direction:column; gap:6px; min-width:0; }
        .hero-name{ margin:0; font-size:40px; line-height:1.05; letter-spacing:-.3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .hero-pill{
          display:inline-flex; align-items:center; gap:10px; height:38px; padding:0 14px;
          border-radius:9999px; border:1px solid var(--border); background:var(--card); font-weight:600;
          width:fit-content;
        }
        .hero-pill .dot{ opacity:.6; }

        .hero-price{ margin-top:12px; }
        .p-big{ font-size:48px; line-height:1; font-weight:800; letter-spacing:-.5px; }
        .p-ccy{ font-size:18px; font-weight:600; margin-left:10px; opacity:.9; }
        .p-sub{ margin-top:6px; font-size:14px; opacity:.75; }

        /* Grid below — stretch so both cards share the same height */
        .layout-2col{
          display:grid; grid-template-columns: 1fr 320px;
          gap: var(--row-gap); align-items: stretch; /* <— equal height */
        }
        .g-item{ min-width:0; }
        .g-span{ grid-column: 1 / -1; min-width:0; }

        /* Make the child .card fill available height */
        .g-item :global(.card){ height:100%; display:flex; flex-direction:column; }
        @media (max-width:1100px){
          .layout-2col{ grid-template-columns: 1fr; }
          .g-span{ grid-column: 1 / -1; }
          .hero-logo{ width:72px; height:72px; border-radius:16px; font-size:32px; }
          .hero-name{ font-size:32px; }
          .p-big{ font-size:40px; }
        }
      `}</style>
    </div>
  );
}
