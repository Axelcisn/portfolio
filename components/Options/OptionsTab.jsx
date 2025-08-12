"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChainTable from "./ChainTable";
import ChainSettings from "./ChainSettings";

export default function OptionsTab({ symbol = "", currency = "USD" }) {
  // Provider + grouping (UI only for now)
  const [provider, setProvider] = useState("api");    // 'api' | 'upload'
  const [groupBy, setGroupBy] = useState("expiry");   // 'expiry' | 'strike'

  // Night mode
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return (
      localStorage.getItem("theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    );
  });
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  // Settings popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gearRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);

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

  // Lightweight, static sample expiries just for structure/visuals
  const expiries = useMemo(
    () => [
      { m: "Aug", days: [15, 22, 29] },
      { m: "Sep", days: [5, 12, 19, 26] },
      { m: "Oct", days: [17] },
      { m: "Nov", days: [21] },
      { m: "Dec", days: [19] },
      { m: "Jan ’26", days: [16] },
      { m: "Feb", days: [20] },
      { m: "Mar", days: [20] },
      { m: "May", days: [15] },
      { m: "Jun", days: [18] },
      { m: "Aug", days: [21] },
      { m: "Sep", days: [18] },
      { m: "Dec", days: [18] },
      { m: "Jan ’27", days: [15] },
      { m: "Jun", days: [17] },
      { m: "Dec", days: [17] },
    ],
    []
  );

  // Selected expiry (month label + day)
  const [sel, setSel] = useState({ m: "Jan ’26", d: 16 });

  // Settings popover (portal)
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
              left: Math.min(Math.max(12, anchorRect.right - 360), window.innerWidth - 360 - 12),
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

          {/* Theme toggle (small sun/moon) */}
          <button
            type="button"
            className="icon-btn"
            aria-label="Toggle theme"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              // Sun
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.79l1.8-1.79M1 13h3v-2H1v2m10 10h2v-3h-2v3m7.24-18.16l1.79-1.79l-1.79-1.79l-1.79 1.79l1.79 1.79M20 13h3v-2h-3v2m-8-7a5 5 0 0 0 0 10a5 5 0 0 0 0-10m6.24 12.16l1.79 1.79l1.79-1.79l-1.79-1.79l-1.79 1.79M4.84 17.24l-1.79 1.79l1.79 1.79l1.79-1.79l-1.79-1.79Z"/>
              </svg>
            ) : (
              // Moon
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M12.74 2a9 9 0 1 0 8.66 11.23a.6.6 0 0 0-.93-.65A7.5 7.5 0 1 1 13.39 3a.6.6 0 0 0-.65-.93Z"/>
              </svg>
            )}
          </button>

          <button
            ref={gearRef}
            type="button"
            className="icon-btn"
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
        <div className="expiry">
          {expiries.map((g) => (
            <div className="group" key={g.m}>
              <div className="m">{g.m}</div>
              <div className="days">
                {g.days.map((d) => {
                  const active = sel.m === g.m && sel.d === d;
                  return (
                    <button
                      key={`${g.m}-${d}`}
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

      {/* THEME VARIABLES (global) */}
      <style jsx global>{`
        :root{
          --bg: #ffffff;
          --text: #0f172a;
          --border: #E6E9EF;
          --card: #ffffff;
          --surface: #f5f7fa;
          --chip: #f4f6f9;
          --chip-active-bg: #0f172a;
          --chip-active-text: #ffffff;
          --accent-bg: #eaf2ff;
          --accent-bd: #cfe2ff;
          --accent-weak: #eef5ff;
        }
        [data-theme="dark"]{
          --bg: #0b1018;
          --text: #e8edf7;
          --border: #2a3445;
          --card: #0f1520;
          --surface: #131b28;
          --chip: #1a2332;
          --chip-active-bg: #0d172a;
          --chip-active-text: #ffffff;
          --accent-bg: #182642;
          --accent-bd: #284275;
          --accent-weak: #152038;
        }
        body{ background: var(--bg); color: var(--text); }
      `}</style>

      <style jsx>{`
        /* ---- Layout wrappers ---- */
        .opt { margin-top: 6px; }
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin: 6px 0 10px;
        }
        .left, .right{ display:flex; align-items:center; gap:10px; }

        /* ---- Buttons ---- */
        .pill{
          height:36px; padding:0 14px; border-radius:12px;
          border:1px solid var(--border); background:var(--card);
          font-weight:700; font-size:14px; line-height:1; color:var(--text);
        }
        .pill.is-on{ border-color:var(--accent-bd); background:var(--accent-weak); }

        .seg{
          height:38px; padding:0 16px; border-radius:14px;
          border:1px solid var(--border);
          background:var(--surface); font-weight:800; font-size:15px;
          color:var(--text); line-height:1;
        }
        .seg.is-on{ background:var(--accent-bg); border-color:var(--accent-bd); }

        .icon-btn{
          height:38px; width:42px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:14px; border:1px solid var(--border); background:var(--card);
          color:var(--text);
        }

        /* ---- Settings popover ---- */
        .popover{
          background:var(--card); border:1px solid var(--border); border-radius:14px;
          box-shadow: 0 10px 30px rgba(0,0,0,.18);
        }

        /* ---- Expiry strip ---- */
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
        .expiry::-webkit-scrollbar{ height:6px; }
        .expiry::-webkit-scrollbar-thumb{ background:var(--border); border-radius:999px; }

        .group{ flex:0 0 auto; }
        .m{
          font-weight:800; font-size:17px; letter-spacing:.2px; color:var(--text);
          padding:0 0 6px 0;
          border-bottom:1px solid var(--border);
          margin-bottom:8px;
        }
        .days{ display:flex; gap:10px; }

        .day{
          min-width:46px; height:34px; padding:0 10px;
          border-radius:12px; border:1px solid var(--border);
          background:var(--chip); font-weight:800; font-size:16px; color:var(--text);
          display:inline-flex; align-items:center; justify-content:center;
        }
        .day.is-active{
          background:var(--chip-active-bg); color:var(--chip-active-text); border-color:var(--chip-active-bg);
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
