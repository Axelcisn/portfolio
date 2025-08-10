// components/Strategy/StrategyGallery.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import StrategyTile from "./StrategyTile";

/**
 * NOTE
 * - This file is self‑contained (no ./icons, no StrategyFilters/Modal imports),
 *   so it fixes the build error you saw.
 * - It ships a small, local strategies list and a Settings panel (colors + metrics).
 * - It passes {palette, metricsOn} to <StrategyTile/>. If you haven’t updated
 *   StrategyTile to consume those yet, it will still render; once you paste
 *   the new tile file, the settings will take effect automatically.
 */

/* ---------- Settings defaults ---------- */
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

/* ---------- Local strategies list (minimal, extend anytime) ---------- */
const BASE_STRATEGIES = [
  // Manual (custom) — stands out a bit in tiles
  { id: "manual", name: "Manual", direction: "Neutral", isManual: true, isMulti: true, metrics: {} },

  // Single‑leg
  { id: "long-call",        name: "Long Call",        direction: "Bullish", isMulti: false, metrics: {} },
  { id: "short-call",       name: "Short Call",       direction: "Bearish", isMulti: false, metrics: {} },
  { id: "long-put",         name: "Long Put",         direction: "Bearish", isMulti: false, metrics: {} },
  { id: "short-put",        name: "Short Put",        direction: "Bullish", isMulti: false, metrics: {} },
  { id: "protective-put",   name: "Protective Put",   direction: "Bullish", isMulti: false, metrics: {} },
  { id: "leaps",            name: "LEAPS",            direction: "Bullish", isMulti: false, metrics: {} },

  // Verticals
  { id: "bear-call-spread", name: "Bear Call Spread", direction: "Bearish", isMulti: true,  metrics: {} },
  { id: "bull-put-spread",  name: "Bull Put Spread",  direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "bear-put-spread",  name: "Bear Put Spread",  direction: "Bearish", isMulti: true,  metrics: {} },

  // Straddles & Strangles
  { id: "long-straddle",    name: "Long Straddle",    direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "short-straddle",   name: "Short Straddle",   direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "long-strangle",    name: "Long Strangle",    direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "short-strangle",   name: "Short Strangle",   direction: "Neutral", isMulti: true,  metrics: {} },

  // Calendars & Diagonals
  { id: "call-calendar",    name: "Call Calendar",    direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "put-calendar",     name: "Put Calendar",     direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "call-diagonal",    name: "Call Diagonal",    direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "put-diagonal",     name: "Put Diagonal",     direction: "Bearish", isMulti: true,  metrics: {} },

  // Butterflies & Condors
  { id: "iron-condor",      name: "Iron Condor",      direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "iron-butterfly",   name: "Iron Butterfly",   direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "call-butterfly",   name: "Call Butterfly",   direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "put-butterfly",    name: "Put Butterfly",    direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "reverse-condor",   name: "Reverse Condor",   direction: "Neutral", isMulti: true,  metrics: {} },

  // Ratios & Backspreads
  { id: "call-ratio",       name: "Call Ratio",       direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "put-ratio",        name: "Put Ratio",        direction: "Bearish", isMulti: true,  metrics: {} },
  { id: "call-backspread",  name: "Call Backspread",  direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "put-backspread",   name: "Put Backspread",   direction: "Bearish", isMulti: true,  metrics: {} },

  // Other multi‑leg
  { id: "covered-call",     name: "Covered Call",     direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "covered-put",      name: "Covered Put",      direction: "Bearish", isMulti: true,  metrics: {} },
  { id: "collar",           name: "Collar",           direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "strap",            name: "Strap",            direction: "Bullish", isMulti: true,  metrics: {} },
  { id: "long-box",         name: "Long Box",         direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "short-box",        name: "Short Box",        direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "reversal",         name: "Reversal",         direction: "Neutral", isMulti: true,  metrics: {} },
  { id: "stock-repair",     name: "Stock Repair",     direction: "Bullish", isMulti: true,  metrics: {} },
];

/* ---------- Component ---------- */
export default function StrategyGallery({ onOpenStrategy }) {
  // Search & filters
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("az"); // az | sharpe | er | ep | pwin
  const [dir, setDir] = useState("All"); // All | Bullish | Neutral | Bearish
  const [kind, setKind] = useState("All"); // All | Single | Multi

  // Settings (colors + metrics) — persisted
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

  // UI popovers
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef(null);
  useEffect(() => { if (searchOpen) setTimeout(()=>searchRef.current?.focus(), 0); }, [searchOpen]);
  useEffect(() => {
    const onEsc = (e) => (e.key === "Escape") && (setSearchOpen(false), setSettingsOpen(false));
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // Filter + sort
  const strategies = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = BASE_STRATEGIES.filter((s) => {
      const passQ = !q || s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q);
      const passDir = dir === "All" || s.direction === dir;
      const passKind = kind === "All" || (kind === "Single" ? !s.isMulti : s.isMulti);
      return passQ && passDir && passKind;
    });

    const val = (x) => (Number.isFinite(x) ? x : -Infinity);
    switch (sortBy) {
      case "sharpe": rows.sort((a,b)=>val(b.metrics?.sharpe)-val(a.metrics?.sharpe)); break;
      case "er":     rows.sort((a,b)=>val(b.metrics?.expectedReturn)-val(a.metrics?.expectedReturn)); break;
      case "ep":     rows.sort((a,b)=>val(b.metrics?.expectedProfit)-val(a.metrics?.expectedProfit)); break;
      case "pwin":   rows.sort((a,b)=>val(b.metrics?.pWin)-val(a.metrics?.pWin)); break;
      default:       rows.sort((a,b)=>a.name.localeCompare(b.name));
    }
    return rows;
  }, [query, dir, kind, sortBy]);

  return (
    <section className="card sg-card">
      {/* Header */}
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

      {/* Simple, built‑in filters (kept minimal & robust) */}
      <div className="sg-filters">
        <div className="chip-row">
          <button className={`chip ${dir==="All"?"on":""}`} onClick={()=>setDir("All")}>All</button>
          <button className={`chip ${dir==="Bullish"?"on":""}`} onClick={()=>setDir("Bullish")}>Bullish</button>
          <button className={`chip ${dir==="Neutral"?"on":""}`} onClick={()=>setDir("Neutral")}>Neutral</button>
          <button className={`chip ${dir==="Bearish"?"on":""}`} onClick={()=>setDir("Bearish")}>Bearish</button>
        </div>
        <div className="chip-row">
          <button className={`chip ${kind==="All"?"on":""}`} onClick={()=>setKind("All")}>All types</button>
          <button className={`chip ${kind==="Single"?"on":""}`} onClick={()=>setKind("Single")}>Single‑leg</button>
          <button className={`chip ${kind==="Multi"?"on":""}`} onClick={()=>setKind("Multi")}>Multi‑leg</button>
        </div>
        <div className="chip-row">
          <label className="small muted" style={{marginRight:8}}>Sort</label>
          <select className="field sort" value={sortBy} onChange={(e)=>setSortBy(e.target.value)}>
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
            palette={palette}
            metricsOn={metricsOn}
            onOpen={() => onOpenStrategy?.(s)}
          />
        ))}
      </div>

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

        .sg-filters{ display:grid; gap:8px; margin-bottom:8px; }
        .chip-row{ display:flex; flex-wrap:wrap; gap:8px; }
        .chip{
          height:32px; padding:0 12px; border-radius:9999px;
          border:1px solid var(--border); background:var(--bg); color:var(--text);
          font-weight:600; transition:background .12s ease, border-color .12s ease;
        }
        .chip.on{ border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
        .sort{ width:160px; height:32px; }

        .sg-grid{
          display:grid;
          grid-template-columns: repeat(auto-fill, minmax(260px,1fr));
          gap:14px;
        }
      `}</style>
    </section>
  );
}
