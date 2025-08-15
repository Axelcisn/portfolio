// components/NavBar.jsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import TickerSearchUnified from "./Search/TickerSearchUnified";

export default function NavBar({
  autoNavigateOnPick = true,         // when pick -> go to /strategy
  tz = "Europe/Rome",
}) {
  const pathname = usePathname();
  const router = useRouter();

  /* -------- time (Rome) -------- */
  const [now, setNow] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString(undefined, {
        hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
        timeZone: tz,
      });
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, [tz]);

  /* -------- theme toggle -------- */
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

  /* -------- nav model -------- */
  const items = useMemo(
    () => [
      { label: "Portfolio", href: "/" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Portfolio", href: "/portfolio" }, // keep both per your UI
      { label: "Strategy", href: "/strategy" },
    ],
    []
  );

  const isActive = useCallback(
    (href) => (href === "/" ? pathname === "/" : pathname?.startsWith(href)),
    [pathname]
  );

  /* -------- search pick -> broadcast + optional nav -------- */
  const handlePick = (item) => {
    try {
      window.dispatchEvent(new CustomEvent("app:ticker-picked", { detail: item }));
    } catch {}
    if (autoNavigateOnPick && pathname !== "/strategy") router.push("/strategy");
  };

  return (
    <header className="nav">
      {/* Left — tabs */}
      <nav className="tabs" role="tablist" aria-label="Primary">
        {items.map((it, i) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href + i}
              href={it.href}
              role="tab"
              aria-selected={active}
              className={`tab ${active ? "is-active" : ""}`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      {/* Center — search pill */}
      <div className="search-wrap">
        <div className="search-pill">
          <span className="loupe" aria-hidden>🔎</span>
          <TickerSearchUnified
            onSelect={handlePick}
            placeholder="Search companies, tickers…"
          />
          <span className="close-slot" aria-hidden>×</span>{/* purely visual to match screenshot */}
        </div>
      </div>

      {/* Right — clock & theme */}
      <div className="right">
        <div className="clock">{now} <span className="muted">({tz.split("/")[1] || "Rome"})</span></div>
        <button
          type="button"
          className="theme"
          aria-label="Toggle dark mode"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
      </div>

      <style jsx>{`
        .nav{
          position:sticky; top:0; z-index:50;
          display:flex; align-items:center; justify-content:space-between;
          gap:18px;
          padding:10px 16px;
          background: var(--navbg, #0e0f12);
          border-bottom: 1px solid var(--border, #232632);
        }

        /* Apple-like tabs */
        .tabs{ display:flex; align-items:center; gap:22px; }
        .tab{
          padding: 10px 6px;
          font-weight: 800; letter-spacing: .1px;
          color: var(--foreground, #e5e7eb);
          opacity: .85; text-decoration: none;
          border-radius: 12px;
          transition: opacity .15s ease, background .15s ease, color .15s ease;
        }
        .tab:hover{ opacity:1; }
        .tab.is-active{
          background: #161a21;
          border: 1px solid var(--border, #232632);
          padding: 10px 14px;
          opacity:1;
        }

        /* Center search */
        .search-wrap{ flex: 0 1 720px; max-width: 56vw; width: 100%; display:flex; justify-content:center; }
        .search-pill{
          position:relative; width:100%; height:44px;
          background:#171a1f; border:1px solid var(--border,#2a2f3a);
          border-radius:14px; display:flex; align-items:center;
        }
        .loupe{
          position:absolute; left:12px; top:50%; transform:translateY(-50%);
          opacity:.9;
        }
        /* Make inner input transparent & full width */
        :global(.search-input){
          height:42px; width:100%; background:transparent; border:0; outline:0;
          color:var(--foreground,#e5e7eb); font-size:14.5px; padding-left:38px; padding-right:32px;
        }
        .close-slot{
          position:absolute; right:10px; top:50%; transform:translateY(-50%);
          width:18px; height:18px; border:1px solid var(--border,#2a2f3a);
          border-radius:9px; display:flex; align-items:center; justify-content:center;
          font-size:12px; opacity:.45; pointer-events:none; /* just visual per screenshot */
        }

        /* Right side */
        .right{ display:flex; align-items:center; gap:14px; }
        .clock{ font-weight:600; color:var(--foreground,#e5e7eb); }
        .muted{ opacity:.7; }
        .theme{
          width:36px; height:36px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          background:#161a21; color:var(--foreground,#e5e7eb);
          border:1px solid var(--border,#2a2f3a); cursor:pointer;
        }

        @media (max-width: 1024px){
          .tabs{ gap:16px; }
          .search-wrap{ max-width: 48vw; }
        }
        @media (max-width: 720px){
          .nav{ gap:10px; }
          .tabs{ display:none; }
          .search-wrap{ max-width: 100%; }
        }
      `}</style>
    </header>
  );
}
