// components/Strategy/StrategyGallery.jsx
"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import StrategyTile from "./StrategyTile";
import StrategyModal from "./StrategyModal";
import * as Strat from "./assignStrategy";

/* NEW: OA-style icon renderer */
import StrategyIcon from "../Icons/StrategyIcon";

/**
 * Header row: "Strategy" title on the left; Search + Settings on the right (same line).
 * Filter row (no container box): All / Bullish / Neutral / Bearish on the left,
 * Sort on the right. Small extra spacing between filters.
 * Clicking a tile now also *instantiates* the strategy (if helper exists) so the chart updates instantly.
 */

/* ---------- Settings defaults ---------- */
const DEFAULT_PALETTE = {
  bullish: "#06b6d4",
  bearish: "#f59e0b",
  neutral: "#8b5cf6",
};
const DEFAULT_METRICS = {
  sharpe: true,
  pwin: true,
  eprof: true,
  eret: true,
};

/* ---------- Strategies (UI list) ---------- */
const BASE_STRATEGIES = [
  { id: "manual", name: "Manual", direction: "Neutral", isManual: true, isMulti: true, metrics: {} },
  { id: "long-call", name: "Long Call", direction: "Bullish", isMulti: false, metrics: {} },
  { id: "short-call", name: "Short Call", direction: "Bearish", isMulti: false, metrics: {} },
  { id: "long-put", name: "Long Put", direction: "Bearish", isMulti: false, metrics: {} },
  { id: "short-put", name: "Short Put", direction: "Bullish", isMulti: false, metrics: {} },
  { id: "protective-put", name: "Protective Put", direction: "Bullish", isMulti: false, metrics: {} },
  { id: "leaps", name: "LEAPS", direction: "Bullish", isMulti: false, metrics: {} },
  { id: "bear-call-spread", name: "Bear Call Spread", direction: "Bearish", isMulti: true, metrics: {} },
  { id: "bull-put-spread", name: "Bull Put Spread", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "bear-put-spread", name: "Bear Put Spread", direction: "Bearish", isMulti: true, metrics: {} },
  { id: "long-straddle", name: "Long Straddle", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "short-straddle", name: "Short Straddle", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "long-strangle", name: "Long Strangle", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "short-strangle", name: "Short Strangle", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "call-calendar", name: "Call Calendar", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "put-calendar", name: "Put Calendar", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "call-diagonal", name: "Call Diagonal", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "put-diagonal", name: "Put Diagonal", direction: "Bearish", isMulti: true, metrics: {} },
  { id: "iron-condor", name: "Iron Condor", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "iron-butterfly", name: "Iron Butterfly", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "call-butterfly", name: "Call Butterfly", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "put-butterfly", name: "Put Butterfly", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "reverse-condor", name: "Reverse Condor", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "call-ratio", name: "Call Ratio", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "put-ratio", name: "Put Ratio", direction: "Bearish", isMulti: true, metrics: {} },
  { id: "call-backspread", name: "Call Backspread", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "put-backspread", name: "Put Backspread", direction: "Bearish", isMulti: true, metrics: {} },
  { id: "covered-call", name: "Covered Call", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "covered-put", name: "Covered Put", direction: "Bearish", isMulti: true, metrics: {} },
  { id: "collar", name: "Collar", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "strap", name: "Strap", direction: "Bullish", isMulti: true, metrics: {} },
  { id: "long-box", name: "Long Box", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "short-box", name: "Short Box", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "reversal", name: "Reversal", direction: "Neutral", isMulti: true, metrics: {} },
  { id: "stock-repair", name: "Stock Repair", direction: "Bullish", isMulti: true, metrics: {} },
];


export default function StrategyGallery({
  spot = null,
  currency = "EUR",
  sigma = null,
  T = null,
  riskFree = 0,
  mcStats = null,
  onApply,
}) {
  /* filters & sort */
  const [dir, setDir] = useState("All"); // All | Bullish | Neutral | Bearish
  const [sortBy, setSortBy] = useState("az"); // az | sharpe | er | ep | pwin
  const [query, setQuery] = useState("");

  /* settings (palette + metric visibility) */
  const [palette, setPalette] = useState(DEFAULT_PALETTE);
  const [metricsOn, setMetricsOn] = useState(DEFAULT_METRICS);
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

  /* header ui */
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef(null);
  useEffect(() => { if (searchOpen) setTimeout(()=>searchInputRef.current?.focus(),0); }, [searchOpen]);
  useEffect(() => {
    const onEsc = (e) => (e.key === "Escape") && (setSearchOpen(false), setSettingsOpen(false));
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  /* modal */
  const [active, setActive] = useState(null);

  /* filter + sort */
  const strategies = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = BASE_STRATEGIES.filter((s) => {
      const passQ = !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const passDir = dir === "All" || s.direction === dir;
      return passQ && passDir;
    });

    const v = (x) => (Number.isFinite(x) ? x : -Infinity);
    switch (sortBy) {
      case "sharpe": rows.sort((a,b)=>v(b.metrics?.sharpe)-v(a.metrics?.sharpe)); break;
      case "er":     rows.sort((a,b)=>v(b.metrics?.expectedReturn)-v(a.metrics?.expectedReturn)); break;
      case "ep":     rows.sort((a,b)=>v(b.metrics?.expectedProfit)-v(a.metrics?.expectedProfit)); break;
      case "pwin":   rows.sort((a,b)=>v(b.metrics?.pWin)-v(a.metrics?.pWin)); break;
      default:       rows.sort((a,b)=>a.name.localeCompare(b.name));
    }
    return rows;
  }, [dir, sortBy, query]);

  /* presets for palette (in settings) */
  const PRESETS = [
    { name: "Cyan/Violet/Amber", v: { bullish:"#06b6d4", neutral:"#8b5cf6", bearish:"#f59e0b" } },
    { name: "Blue/Indigo/Orange", v: { bullish:"#3b82f6", neutral:"#6366f1", bearish:"#f97316" } },
    { name: "Teal/Pink/Yellow",   v: { bullish:"#14b8a6", neutral:"#ec4899", bearish:"#eab308" } },
  ];

  // ---- Quick instantiate on click (safe feature detection) ----
  const quickInstantiate = useCallback((strategyId) => {
    const instantiator = Strat && typeof Strat.instantiateStrategy === "function" ? Strat.instantiateStrategy : null;
    if (!instantiator) return null; // helper not available yet → modal path still works
    try {
      const inst = instantiator(strategyId, {
        spot, sigma, T, riskFree, widthSteps: 1,
      });
      onApply?.(inst.legsKeyed, inst.netPremium, inst.meta, {
        id: inst.id, name: inst.name, rows: inst.rows,
      });
      return inst;
    } catch (e) {
      console.error("instantiateStrategy failed:", e);
      return null;
    }
  }, [spot, sigma, T, riskFree, onApply]);

  return (
    <section className="card sg-card">
      {/* Header: title + search + settings (all on one line) */}
      <div className="sg-header">
        <h3 className="sg-title">Strategy</h3>

        <div className="sg-tools">
          {/* Search: icon expands into field */}
          <div className={`search-wrap ${searchOpen ? "open" : ""}`}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Search strategies"
              onClick={() => setSearchOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
                <path d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"
                  fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </button>
            <input
              ref={searchInputRef}
              className="search-input"
              placeholder="Search strategies…"
              value={query}
              onChange={(e)=>setQuery(e.target.value)}
            />
          </div>

          {/* Settings */}
          <div className="settings">
            <button
              type="button"
              className="icon-btn"
              aria-label="Customize"
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.6a7.9 7.9 0 0 0 .05-1.8l2-1.5-2-3.5-2.3.6a7.7 7.7 0 0 0-1.6-1l-.4-2.3H9.8l-.4 2.3a7.7 7.7 0 0 0-1.6 1l-2.3-.6-2 3.5 2 1.5a7.9 7.9 0 0 0 .05 1.8l-2 1.5 2 3.5 2.3-.6c.5.4 1 .7 1.6 1l.4 2.3h4.6l.4-2.3c.6-.3 1.1-.6 1.6-1l2.3.6 2-3.5-2-1.5Z"
                  fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            {settingsOpen && (
              <div className="panel" role="dialog" aria-label="Settings">
                <div className="p-group">
                  <div className="p-title">Presets</div>
                  <div className="swatches">
                    {PRESETS.map((p)=>(
                      <button key={p.name} className="swatch" onClick={()=>setPalette((cur)=>({ ...cur, ...p.v }))} aria-label={p.name}>
                        <span style={{ background:p.v.bullish }} />
                        <span style={{ background:p.v.neutral }} />
                        <span style={{ background:p.v.bearish }} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-group">
                  <div className="p-title">Custom</div>
                  <div className="prow"><label>Neutral</label><input type="color" value={palette.neutral} onChange={(e)=>setPalette(p=>({...p, neutral:e.target.value}))}/></div>
                  <div className="prow"><label>Bullish</label><input type="color" value={palette.bullish} onChange={(e)=>setPalette(p=>({...p, bullish:e.target.value}))}/></div>
                  <div className="prow"><label>Bearish</label><input type="color" value={palette.bearish} onChange={(e)=>setPalette(p=>({...p, bearish:e.target.value}))}/></div>
                </div>
                <div className="p-group">
                  <div className="p-title">Metrics</div>
                  <label className="pcheck"><input type="checkbox" checked={!!metricsOn.sharpe} onChange={(e)=>setMetricsOn(m=>({...m, sharpe:e.target.checked}))}/> Sharpe</label>
                  <label className="pcheck"><input type="checkbox" checked={!!metricsOn.pwin}   onChange={(e)=>setMetricsOn(m=>({...m, pwin:e.target.checked}))}/> P[Win]</label>
                  <label className="pcheck"><input type="checkbox" checked={!!metricsOn.eprof}  onChange={(e)=>setMetricsOn(m=>({...m, eprof:e.target.checked}))}/> E[Prof]</label>
                  <label className="pcheck"><input type="checkbox" checked={!!metricsOn.eret}   onChange={(e)=>setMetricsOn(m=>({...m, eret:e.target.checked}))}/> E[Ret]</label>
                </div>
                <div className="p-actions">
                  <button className="button ghost" onClick={()=>{ setPalette(DEFAULT_PALETTE); setMetricsOn(DEFAULT_METRICS); }}>Reset</button>
                  <button className="button" onClick={()=>setSettingsOpen(false)}>Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filters row: left = filters, right = sort (no box around) */}
      <div className="filters-row">
        <div className="filters-left" role="tablist" aria-label="Direction filter">
          {["All","Bullish","Neutral","Bearish"].map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={dir===k}
              className={`chip ${dir===k ? "on" : ""}`}
              onClick={() => setDir(k)}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="filters-right">
          <label className="small muted" style={{ marginRight: 8 }}>Sort</label>
          <select className="sort" value={sortBy} onChange={(e)=>setSortBy(e.target.value)} aria-label="Sort">
            <option value="az">A–Z</option>
            <option value="sharpe">Sharpe</option>
            <option value="er">E[Ret]</option>
            <option value="ep">E[Prof]</option>
            <option value="pwin">P[Win]</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      <div className="sg-grid">
        {strategies.map((s) => (
          <StrategyTile
            key={s.id}
            item={s}
            iconName={s.id}
            renderIcon={(name) => (
              <StrategyIcon
                strategy={name}
                spot={spot ?? 100}
                sigma={sigma ?? 0.2}
                T={T ?? 30 / 365}
                riskFree={riskFree ?? 0}
                size={44}
              />
            )}
            // On tile click: try instant instantiate (if helper exists), then open modal for edits.
            onOpen={() => {
              quickInstantiate(s.id);
              setActive(s);
            }}
          />
        ))}
      </div>

      {/* Modal */}
      {active && (
        <StrategyModal
          strategy={active}
          onClose={() => setActive(null)}
          onApply={(legsObj, netPrem) => { onApply?.(legsObj, netPrem); setActive(null); }}
          env={{ spot, currency, sigma, T, riskFree, mcStats }}
        />
      )}

      <style jsx>{`
        /* Header */
        .sg-header{
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom:8px;
        }
        .sg-title{ margin:0; }

        .sg-tools{ display:flex; align-items:center; gap:10px; }

        .icon-btn{
          width:36px; height:36px; border-radius:12px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
          display:inline-flex; align-items:center; justify-content:center;
          transition:background .12s ease, box-shadow .12s ease, transform .12s ease;
        }
        .icon-btn:hover{ background:var(--card); box-shadow:0 2px 10px rgba(0,0,0,.08); }
        .ico{ width:18px; height:18px; }

        .search-wrap{
          display:flex; align-items:center; gap:8px; overflow:hidden;
        }
        .search-input{
          width:0; opacity:0; height:36px;
          padding:0 10px; border-radius:10px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
          transition: width .22s ease, opacity .18s ease;
        }
        .search-wrap.open .search-input{ width:220px; opacity:1; }
        @media (max-width:560px){ .search-wrap.open .search-input{ width:120px; } }

        .settings{ position:relative; }
        .panel{
          position:absolute; top:44px; right:0; z-index:60;
          width:min(520px,92vw); background:var(--bg);
          border:1px solid var(--border); border-radius:14px;
          box-shadow:0 12px 34px rgba(0,0,0,.18);
          padding:14px; display:grid; gap:16px;
        }
        .p-group{ display:grid; gap:10px; }
        .p-title{ font-size:12px; opacity:.75; }
        .swatches{ display:flex; gap:10px; }
        .swatch{ padding:6px; border-radius:12px; border:1px solid var(--border); background:var(--bg); display:flex; gap:4px; }
        .swatch span{ width:16px; height:16px; border-radius:50%; }

        .prow{ display:grid; grid-template-columns:110px 1fr; gap:10px; align-items:center; }
        .pcheck{ display:flex; align-items:center; gap:8px; }
        .p-actions{ display:flex; justify-content:flex-end; gap:8px; }

        /* Filters row (no box) */
        .filters-row{
          display:flex; align-items:center; justify-content:space-between;
          gap:12px; margin-bottom:10px;
        }
        .filters-left{ display:flex; gap:10px; flex-wrap:wrap; } /* small extra spacing */
        .chip{
          height:32px; padding:0 12px; border-radius:9999px;
          border:1px solid var(--border); background:transparent; color:var(--text);
          font-weight:700; letter-spacing:.2px;
          transition:background .18s ease, border-color .18s ease, transform .18s ease, opacity .18s ease;
          opacity:.88;
        }
        .chip:hover{ background:var(--card); }
        .chip.on{
          background:var(--accent); border-color:var(--accent); color:#fff;
          transform: translateY(-0.5px) scale(1.01); opacity:1;
        }

        .filters-right{ display:flex; align-items:center; }
        .sort{
          height:32px; min-width:150px; padding:0 10px; border-radius:10px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
        }

        /* Grid */
        .sg-grid{
          display:grid; gap:14px;
          grid-template-columns: repeat(auto-fill, minmax(260px,1fr));
        }
      `}</style>
    </section>
  );
}
