// components/Strategy/StrategyGallery.jsx
"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import StrategyFilters from "./StrategyFilters";
import StrategyTile from "./StrategyTile";
import StrategyModal from "./StrategyModal";
import { ALL_STRATEGIES, withManualTile } from "./icons";

const DEFAULT_PALETTE = {
  bullish: "#06b6d4", // cyan
  bearish: "#f59e0b", // amber
  neutral: "#8b5cf6", // violet
};
const DEFAULT_METRICS = {
  sharpe: true,
  pwin: true,
  eprof: true,
  eret: true,
};

export default function StrategyGallery({
  spot = null,
  currency = "EUR",
  sigma = null,
  T = null,
  riskFree = 0,
  mcStats = null,
  onApply,
}) {
  // filters
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("az");
  const [dirFilter, setDirFilter] = useState(new Set());
  const [kindFilter, setKindFilter] = useState(new Set());
  const [active, setActive] = useState(null);

  // header search popover
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);

  // settings (palette + visible metrics)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [metricsOn, setMetricsOn] = useState(DEFAULT_METRICS);

  // load/save settings
  useEffect(() => {
    try {
      const raw = localStorage.getItem("sg_settings");
      if (raw) {
        const j = JSON.parse(raw);
        if (j?.palette) setPalette({ ...DEFAULT_PALETTE, ...j.palette });
        if (j?.metricsOn) setMetricsOn({ ...DEFAULT_METRICS, ...j.metricsOn });
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("sg_settings", JSON.stringify({ palette, metricsOn }));
    } catch {}
  }, [palette, metricsOn]);

  // keyboard close for popovers
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 0);
  }, [searchOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = withManualTile(ALL_STRATEGIES).filter((s) => {
      const passQ = !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const passDir = dirFilter.size === 0 || dirFilter.has(s.direction);
      const passKind =
        kindFilter.size === 0 ||
        (kindFilter.has("Single") && !s.isMulti) ||
        (kindFilter.has("Multi") && s.isMulti);
      return passQ && passDir && passKind && !s.disabled;
    });

    const safe = (x) => (Number.isFinite(x) ? x : -Infinity);
    switch (sortBy) {
      case "sharpe": rows.sort((a,b)=>safe(b.metrics?.sharpe)-safe(a.metrics?.sharpe)); break;
      case "er":     rows.sort((a,b)=>safe(b.metrics?.expectedReturn)-safe(a.metrics?.expectedReturn)); break;
      case "ep":     rows.sort((a,b)=>safe(b.metrics?.expectedProfit)-safe(a.metrics?.expectedProfit)); break;
      case "pwin":   rows.sort((a,b)=>safe(b.metrics?.pWin)-safe(a.metrics?.pWin)); break;
      default:       rows.sort((a,b)=>a.name.localeCompare(b.name));
    }
    return rows;
  }, [query, sortBy, dirFilter, kindFilter]);

  return (
    <section className="card sg-card">
      {/* Header: title left, search + settings right */}
      <div className="sg-header">
        <h3 className="sg-title">Strategy</h3>

        <div className="sg-tools">
          <button
            type="button"
            className="icon-btn"
            aria-label="Search strategies"
            onClick={() => setSearchOpen((v) => !v)}
          >
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"
                fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Strategy settings"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.6a7.9 7.9 0 0 0 .05-1.8l2-1.5-2-3.5-2.3.6a7.7 7.7 0 0 0-1.6-1l-.4-2.3H9.8l-.4 2.3a7.7 7.7 0 0 0-1.6 1l-2.3-.6-2 3.5 2 1.5a7.9 7.9 0 0 0 .05 1.8l-2 1.5 2 3.5 2.3-.6c.5.4 1 .7 1.6 1l.4 2.3h4.6l.4-2.3c.6-.3 1.1-.6 1.6-1l2.3.6 2-3.5-2-1.5Z"
                fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Search popover */}
          {searchOpen && (
            <div className="sg-pop search" role="dialog" aria-label="Search strategies">
              <input
                ref={searchRef}
                className="field"
                placeholder="Search strategies…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          {/* Settings panel */}
          {settingsOpen && (
            <div className="sg-pop settings" role="dialog" aria-label="Strategy settings">
              <div className="sgs">
                <div className="sgs-group">
                  <div className="sgs-title">Tag colors</div>
                  <div className="sgs-row">
                    <label>Neutral</label>
                    <input type="color" value={palette.neutral}
                      onChange={(e)=>setPalette(p=>({...p, neutral:e.target.value}))}/>
                  </div>
                  <div className="sgs-row">
                    <label>Bullish</label>
                    <input type="color" value={palette.bullish}
                      onChange={(e)=>setPalette(p=>({...p, bullish:e.target.value}))}/>
                  </div>
                  <div className="sgs-row">
                    <label>Bearish</label>
                    <input type="color" value={palette.bearish}
                      onChange={(e)=>setPalette(p=>({...p, bearish:e.target.value}))}/>
                  </div>
                </div>

                <div className="sgs-group">
                  <div className="sgs-title">Metrics</div>
                  <label className="sgs-check">
                    <input type="checkbox" checked={!!metricsOn.sharpe}
                      onChange={(e)=>setMetricsOn(m=>({...m, sharpe:e.target.checked}))}/>
                    Sharpe
                  </label>
                  <label className="sgs-check">
                    <input type="checkbox" checked={!!metricsOn.pwin}
                      onChange={(e)=>setMetricsOn(m=>({...m, pwin:e.target.checked}))}/>
                    P[Win]
                  </label>
                  <label className="sgs-check">
                    <input type="checkbox" checked={!!metricsOn.eprof}
                      onChange={(e)=>setMetricsOn(m=>({...m, eprof:e.target.checked}))}/>
                    E[Prof]
                  </label>
                  <label className="sgs-check">
                    <input type="checkbox" checked={!!metricsOn.eret}
                      onChange={(e)=>setMetricsOn(m=>({...m, eret:e.target.checked}))}/>
                    E[Ret]
                  </label>
                </div>

                <div className="row-right">
                  <button className="button" onClick={()=>setSettingsOpen(false)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <StrategyFilters
        query={query}
        setQuery={setQuery}
        sortBy={sortBy}
        setSortBy={setSortBy}
        dirFilter={dirFilter}
        setDirFilter={setDirFilter}
        kindFilter={kindFilter}
        setKindFilter={setKindFilter}
      />

      {/* Symmetric grid */}
      <div className="sg-grid">
        {filtered.map((s) => (
          <StrategyTile
            key={s.id}
            item={s}
            palette={palette}
            metricsOn={metricsOn}
            onOpen={() => setActive(s)}
          />
        ))}
      </div>

      {active && (
        <StrategyModal
          strategy={active}
          onClose={() => setActive(null)}
          onApply={(legsObj, netPrem) => { onApply?.(legsObj, netPrem); setActive(null); }}
          env={{ spot, currency, sigma, T, riskFree, mcStats }}
        />
      )}

      {/* styles */}
      <style jsx>{`
        .sg-header{
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom:8px;
        }
        .sg-title{ margin:0; }
        .sg-tools{ position:relative; display:flex; align-items:center; gap:8px; }
        .icon-btn{
          width:36px; height:36px; border-radius:50%;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
          display:inline-flex; align-items:center; justify-content:center;
          transition:background .12s ease, transform .12s ease, border-color .12s ease;
        }
        .icon-btn:hover{ background:var(--card); }
        .ico{ width:18px; height:18px; }

        .sg-pop{
          position:absolute; top:44px; right:0;
          width:min(520px, 92vw);
          background:var(--bg);
          border:1px solid var(--border);
          border-radius:14px;
          box-shadow:0 10px 30px rgba(0,0,0,.18);
          padding:12px;
          z-index:60;
        }
        .sg-pop.search{ width:min(400px, 92vw); }
        .sgs{ display:grid; gap:14px; }
        .sgs-group{ display:grid; gap:8px; }
        .sgs-title{ font-size:12px; opacity:.75; }
        .sgs-row{ display:grid; grid-template-columns:120px 1fr; align-items:center; gap:10px; }
        .sgs-check{ display:flex; align-items:center; gap:8px; }
        .sg-grid{
          display:grid;
          grid-template-columns: repeat(auto-fill, minmax(260px,1fr));
          gap:14px;
        }
      `}</style>
    </section>
  );
}
