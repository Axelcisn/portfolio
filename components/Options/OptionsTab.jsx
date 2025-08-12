// components/Options/OptionsTab.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChainTable from "./ChainTable";
import ChainSettings from "./ChainSettings";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // Provider + grouping (UI only for now)
  const [provider, setProvider] = useState("api");    // 'api' | 'upload'
  const [groupBy, setGroupBy] = useState("expiry");   // 'expiry' | 'strike'

  // Settings popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Keep popover aligned to the gear
  useEffect(() => {
    if (!settingsOpen || !gearRef.current) return;
    const update = () => setAnchorRect(gearRef.current.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [settingsOpen]);

  // Close on outside click / ESC
  useEffect(() => {
    if (!settingsOpen) return;
    const onDocDown = (e) => {
      const pop = document.getElementById("chain-settings-popover");
      if (pop?.contains(e.target)) return;
      if (gearRef.current?.contains(e.target)) return;
      setSettingsOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setSettingsOpen(false); };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  /* -------------------- Expiries (filtered) -------------------- */

  // Fallback (keeps your exact visual while API loads/absent)
  const fallbackGroups = useMemo(
    () => [
      { m: "Aug", days: [15, 22, 29], k: "f-1" },
      { m: "Sep", days: [5, 12, 19, 26], k: "f-2" },
      { m: "Oct", days: [17], k: "f-3" },
      { m: "Nov", days: [21], k: "f-4" },
      { m: "Dec", days: [19], k: "f-5" },
      { m: "Jan ’26", days: [16], k: "f-6" },
      { m: "Feb", days: [20], k: "f-7" },
      { m: "Mar", days: [20], k: "f-8" },
      { m: "May", days: [15], k: "f-9" },
      { m: "Jun", days: [18], k: "f-10" },
      { m: "Aug", days: [21], k: "f-11" },
      { m: "Sep", days: [18], k: "f-12" },
      { m: "Dec", days: [18], k: "f-13" },
      { m: "Jan ’27", days: [15], k: "f-14" },
      { m: "Jun", days: [17], k: "f-15" },
      { m: "Dec", days: [17], k: "f-16" },
    ],
    []
  );

  // Live expiries from filtered API
  const [apiExpiries, setApiExpiries] = useState(null); // null = not loaded, [] = none
  const [loadingExp, setLoadingExp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!symbol) { setApiExpiries(null); return; }
      try {
        setLoadingExp(true);
        // 👇 only change: call filtered endpoint (minVol=1, useOI=1)
        const url = `/api/expiries/filtered?symbol=${encodeURIComponent(symbol)}&minVol=1&useOI=1`;
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        const list = Array.isArray(j?.data?.dates) ? j.data.dates : [];
        if (!cancelled) setApiExpiries(list);
      } catch {
        if (!cancelled) setApiExpiries([]);
      } finally {
        if (!cancelled) setLoadingExp(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [symbol]);

  // Convert YYYY-MM-DD list -> [{ m, days[], k }]
  const groups = useMemo(() => {
    if (!apiExpiries || apiExpiries.length === 0) return fallbackGroups;

    const parsed = apiExpiries
      .map((s) => {
        const d = new Date(s);
        return Number.isFinite(d?.getTime()) ? d : null;
      })
      .filter(Boolean)
      .sort((a, b) => a - b);

    const out = [];
    for (const d of parsed) {
      const y = d.getFullYear();
      const mIdx = d.getMonth();
      const labelMonth = d.toLocaleString(undefined, { month: "short" });
      // Show year suffix only for January (matches your screenshots)
      const label = mIdx === 0 ? `${labelMonth} ’${String(y).slice(-2)}` : labelMonth;
      const key = `${y}-${mIdx}`; // unique per year-month

      let g = out[out.length - 1];
      if (!g || g.k !== key) {
        g = { m: label, days: [], k: key };
        out.push(g);
      }
      g.days.push(d.getDate());
    }
    for (const g of out) g.days = Array.from(new Set(g.days)).sort((a, b) => a - b);
    return out;
  }, [apiExpiries, fallbackGroups]);

  // Selected expiry (month label + day)
  const [sel, setSel] = useState({ m: "Jan ’26", d: 16 });

  // If selection is invalid for current groups, pick the first available
  useEffect(() => {
    if (!groups?.length) return;
    const exists = groups.some((g) => g.m === sel.m && g.days.includes(sel.d));
    if (!exists) setSel({ m: groups[0].m, d: groups[0].days[0] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  /* ------------------------- Settings portal ------------------------ */

  const settingsPortal =
    mounted && settingsOpen && anchorRect
      ? createPortal(
          <div
            id="chain-settings-popover"
            className="popover"
            style={{
              position: "fixed",
              zIndex: 1000,
              top: Math.min(anchorRect.bottom + 8, window.innerHeight - 16),
              left: Math.min(
                Math.max(12, anchorRect.right - 360),
                window.innerWidth - 360 - 12
              ),
              width: 360,
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Chain table settings"
          >
            <ChainSettings onClose={() => setSettingsOpen(false)} />
          </div>,
          document.body
        )
      : null;

  return (
    <section className="opt">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="left">
          <button
            type="button"
            className={`pill ${provider === "api" ? "is-on" : ""}`}
            onClick={() => setProvider("api")}
            aria-pressed={provider === "api"}
          >
            API
          </button>
          <button
            type="button"
            className={`pill ${provider === "upload" ? "is-on" : ""}`}
            onClick={() => setProvider("upload")}
            aria-pressed={provider === "upload"}
          >
            Upload
          </button>
        </div>

        <div className="right">
          <button
            type="button"
            className={`seg ${groupBy === "expiry" ? "is-on" : ""}`}
            onClick={() => setGroupBy("expiry")}
          >
            By expiration
          </button>
          <button
            type="button"
            className={`seg ${groupBy === "strike" ? "is-on" : ""}`}
            onClick={() => setGroupBy("strike")}
          >
            By strike
          </button>

          <button
            ref={gearRef}
            type="button"
            className="gear"
            aria-label="Chain table settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((v) => !v)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 0 0 0-6.4m8.94 3.2a7.2 7.2 0 0 0-.14-1.28l2.07-1.61l-2-3.46l-2.48.98a7.36 7.36 0 0 0-2.22-1.28L14.8 1h-5.6l-.37 3.35c-.79.28-1.53.7-2.22 1.28l-2.48-.98l-2 3.46l2.07 1.61c-.06.42-.1.85-.1 1.28s.04.86.1 1.28l-2.07 1.61l2 3.46l2.48-.98c.69.58 1.43 1 2.22 1.28L9.2 23h5.6l.37-3.35c.79-.28 1.53-.7 2.22-1.28l2.48.98l2-3.46l-2.07-1.61c.1-.42.14-.85.14-1.28"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expiry strip */}
      <div className="expiry-wrap">
        <div className="expiry" aria-busy={loadingExp ? "true" : "false"}>
          {groups.map((g) => (
            <div className="group" key={g.k || g.m}>
              <div className="m">{g.m}</div>
              <div className="days">
                {g.days.map((d) => {
                  const active = sel.m === g.m && sel.d === d;
                  return (
                    <button
                      key={`${g.k}-${d}`}
                      className={`day ${active ? "is-active" : ""}`}
                      onClick={() => setSel({ m: g.m, d })}
                      aria-pressed={active}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Table */}
      <ChainTable
        symbol={symbol}
        currency={currency}
        provider={provider}
        groupBy={groupBy}
        expiry={sel}
      />

      {/* Settings portal */}
      {settingsPortal}

      <style jsx>{`
        /* ---- Layout wrappers ---- */
        .opt { margin-top: 6px; }
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin: 6px 0 10px;
        }
        .left, .right{ display:flex; align-items:center; gap:10px; }

        /* ---- Buttons (theme-aware) ---- */
        .pill{
          height:36px; padding:0 14px; border-radius:12px;
          border:1px solid var(--border); background:var(--card);
          font-weight:700; font-size:14px; line-height:1; color:var(--text);
        }
        .pill.is-on{
          background: color-mix(in srgb, var(--accent, #3b82f6) 12%, var(--card));
          border-color: color-mix(in srgb, var(--accent, #3b82f6) 40%, var(--border));
        }

        .seg{
          height:38px; padding:0 16px; border-radius:14px;
          border:1px solid var(--border);
          background:var(--surface); font-weight:800; font-size:15px;
          color:var(--text); line-height:1;
        }
        .seg.is-on{
          background: color-mix(in srgb, var(--accent, #3b82f6) 14%, var(--surface));
          border-color: color-mix(in srgb, var(--accent, #3b82f6) 40%, var(--border));
        }

        .gear{
          height:38px; width:42px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:14px; border:1px solid var(--border); background:var(--card);
          color:var(--text);
        }

        /* ---- Expiry strip (theme-aware) ---- */
        .expiry-wrap{
          margin: 14px 0 18px;
          padding: 2px 0 10px;
          border-bottom: 2px solid var(--border);
        }
        .expiry{
          display:flex; align-items:flex-start; gap:28px;
          overflow-x:auto; overscroll-behavior-x: contain;
          -webkit-overflow-scrolling: touch; padding-bottom:6px;
        }
        .expiry[aria-busy="true"] { opacity:.75; }
        .expiry::-webkit-scrollbar{ height:6px; }
        .expiry::-webkit-scrollbar-thumb{ background:var(--border); border-radius:999px; }

        .group{ flex:0 0 auto; }
        .m{
          font-weight:800; font-size:17px; letter-spacing:.2px; color:var(--text);
          padding:0 0 6px 0;
          border-bottom:1px solid var(--border);
          margin-bottom:8px;
          opacity:.95;
        }
        .days{ display:flex; gap:10px; }

        .day{
          min-width:46px; height:34px; padding:0 10px;
          border-radius:12px; border:1px solid var(--border);
          background:var(--surface); font-weight:800; font-size:16px; color:var(--text);
          display:inline-flex; align-items:center; justify-content:center;
          transition: background .15s ease, transform .12s ease;
        }
        .day:hover{
          background: color-mix(in srgb, var(--text) 6%, var(--surface));
          transform: translateY(-1px);
        }
        .day.is-active{
          background:var(--text); color:var(--bg);
          border-color:var(--text);
        }

        @media (max-width: 840px){
          .seg{ height:36px; padding:0 14px; font-size:14px; }
          .m{ font-size:16px; }
          .day{ height:32px; min-width:42px; font-size:15px; }
        }
      `}</style>
    </section>
  );
}
