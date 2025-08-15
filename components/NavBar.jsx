// components/NavBar.jsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import TickerSearchUnified from "./Search/TickerSearchUnified";

export default function NavBar({ tz = "Europe/Rome", autoNavigateOnPick = true }) {
  const pathname = usePathname();
  const router = useRouter();

  /* clock */
  const [now, setNow] = useState("");
  useEffect(() => {
    const tick = () =>
      new Date().toLocaleTimeString(undefined, {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: tz,
      });
    setNow(tick());
    const id = setInterval(() => setNow(tick()), 1000);
    return () => clearInterval(id);
  }, [tz]);

  /* theme */
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const t = stored || (prefersDark ? "dark" : "light");
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);
  const toggleTheme = () => {
    const t = theme === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.classList.toggle("dark", t === "dark");
    localStorage.setItem("theme", t);
  };

  /* tabs */
  const items = useMemo(
    () => [
      { label: "Portfolio", href: "/" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Strategy", href: "/strategy" },
    ],
    []
  );
  const isActive = useCallback(
    (href) => (href === "/" ? pathname === "/" : pathname?.startsWith(href)),
    [pathname]
  );

  /* search selection -> broadcast + optional navigation */
  const onPick = (item) => {
    try {
      window.dispatchEvent(new CustomEvent("app:ticker-picked", { detail: item }));
    } catch {}
    if (autoNavigateOnPick && pathname !== "/strategy") router.push("/strategy");
  };

  return (
    <header className="nav">
      {/* left */}
      <nav className="tabs" role="tablist" aria-label="Primary">
        {items.map((it, i) => {
          const active = isActive(it.href);
          return (
            <Link key={it.href + i} href={it.href} role="tab" aria-selected={active} className={`tab ${active ? "is-active" : ""}`}>
              {it.label}
            </Link>
          );
        })}
      </nav>

      {/* center search (pill) */}
      <div className="center">
        <div className="pill" role="search">
          {/* Search icon (SVG) */}
          <span className="icon-left" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="M21 21l-4.35-4.35"></path>
            </svg>
          </span>

          {/* Input (fills pill height) */}
          <TickerSearchUnified onSelect={onPick} />

        </div>
      </div>

      {/* right */}
      <div className="right">
        <div className="clock">{now} <span className="muted">({tz.split("/")[1] || "Rome"})</span></div>
        <button type="button" className="theme" aria-label="Toggle dark mode" onClick={toggleTheme}>
          {/* moon/sun SVG */}
          {theme === "dark" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          )}
        </button>
      </div>

      <style jsx>{`
        .nav{
          position:sticky; top:0; z-index:100;
          display:flex; align-items:center; justify-content:space-between;
          gap:18px; padding:10px 16px;
          background:#0e0f12; border-bottom:1px solid var(--border,#232632);
        }

        /* tabs */
        .tabs{ display:flex; align-items:center; gap:22px; }
        .tab{
          padding:10px 6px; font-weight:800; letter-spacing:.1px;
          color:var(--foreground,#e5e7eb); opacity:.85; text-decoration:none;
          border-radius:12px; transition:opacity .15s ease, background .15s ease, color .15s ease;
        }
        .tab:hover{ opacity:1; }
        .tab.is-active{ background:#161a21; border:1px solid var(--border,#232632); padding:10px 14px; opacity:1; }

        /* center search */
        .center{ flex:0 1 720px; max-width:56vw; width:100%; display:flex; justify-content:center; }
        .pill{
          position:relative; width:100%; height:44px;
          background:#171a1f; border:1px solid var(--border,#2a2f3a); border-radius:14px;
          display:flex; align-items:center; overflow:visible; /* dropdown can overflow */
        }
        .icon-left{
          position:absolute; left:12px; top:50%; transform:translateY(-50%); opacity:.9; pointer-events:none;
        }
        :global(.search-input){ /* from TickerSearchUnified */
          height:100%; width:100%; background:transparent; border:0; outline:0;
          color:var(--foreground,#e5e7eb); font-size:14.5px; padding-left:38px; padding-right:36px; box-sizing:border-box;
        }

        /* right */
        .right{ display:flex; align-items:center; gap:14px; }
        .clock{ font-weight:600; color:var(--foreground,#e5e7eb); }
        .muted{ opacity:.7; }
        .theme{
          width:36px; height:36px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          background:#161a1f; color:var(--foreground,#e5e7eb);
          border:1px solid var(--border,#2a2f3a); cursor:pointer;
        }

        @media (max-width:1024px){ .tabs{ gap:16px; } .center{ max-width:48vw; } }
        @media (max-width:720px){ .tabs{ display:none; } .center{ max-width:100%; } }
      `}</style>
    </header>
  );
}
