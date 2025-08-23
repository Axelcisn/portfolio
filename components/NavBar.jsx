// components/NavBar.jsx
"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
      { label: "Momentum", href: "/" },
      { label: "Dashboard", href: "/dashboard" },
      { label: "Portfolio", href: "/portfolio" },
      { label: "Strategy", href: "/strategy", search: true },
      { label: "Screener", href: "/screener" },
      { label: "Status", href: "/status" },
    ],
    []
  );
  const isActive = useCallback(
    (href) => (href === "/" ? pathname === "/" : pathname?.startsWith(href)),
    [pathname]
  );

  /* search bar visibility */
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const openSearch = () => {
    setSearchOpen(true);
    setTimeout(() => searchRef.current?.focus(), 0);
  };
  const closeSearch = () => setSearchOpen(false);

  /* IBKR connection status */
  const [ibkrConnected, setIbkrConnected] = useState(false);
  const checkIbkr = useCallback(async () => {
    try {
      const res = await fetch("/api/ibkr/health");
      const data = await res.json();
      setIbkrConnected(!!data.connected);
    } catch {
      setIbkrConnected(false);
    }
  }, []);
  useEffect(() => {
    checkIbkr();
    const id = setInterval(checkIbkr, 30000);
    return () => clearInterval(id);
  }, [checkIbkr]);

  /* search -> broadcast + optional nav */
  const onPick = (item) => {
    const fire = () => {
      try {
        window.dispatchEvent(new CustomEvent("app:ticker-picked", { detail: item }));
      } catch {}
    };
    if (autoNavigateOnPick) {
      const sym = encodeURIComponent(item?.symbol || "");
      router.push(`/strategy?symbol=${sym}`);
      setTimeout(fire, 100);
    } else {
      fire();
    }
    closeSearch();
  };

  return (
    <header className={`nav${searchOpen ? " searching" : ""}`}>
      <nav className="tabs" role="tablist" aria-label="Primary" style={{ opacity: searchOpen ? 0 : 1, pointerEvents: searchOpen ? "none" : "auto" }}>
        {items.map((it, i) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href + i}
              href={it.href}
              role="tab"
              aria-selected={active}
              className={`tab ${active ? "is-active" : ""}`}
              onClick={it.search ? (e) => { e.preventDefault(); openSearch(); } : undefined}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      {/* Center search pill (input expands on activation) */}
      <div className={`center${searchOpen ? " open" : ""}`}>
        {searchOpen && (
          <div className="pill" role="search">
            <TickerSearchUnified
              ref={searchRef}
              onSelect={onPick}
              endpoint="/api/ibkr/search"
            />
          </div>
        )}
      </div>

      <div className="right">
        {searchOpen ? (
          <button
            type="button"
            className="search-close"
            aria-label="Close search"
            onClick={closeSearch}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <>
            <div className="clock">{now} <span className="muted">({tz.split("/")[1] || "Rome"})</span></div>
            <button
              type="button"
              className="health"
              aria-label="IBKR connection status"
              onClick={() => router.push('/status')}
              style={{ backgroundColor: ibkrConnected ? "#3b82f6" : "#ef4444" }}
              title={ibkrConnected ? "IBKR connected" : "IBKR disconnected"}
            />
            <button type="button" className="theme" aria-label="Toggle dark mode" onClick={toggleTheme}>
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              )}
            </button>
            <button type="button" className="search-trigger" aria-label="Search" onClick={openSearch}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
            </button>
          </>
        )}
      </div>

      <style jsx>{`
        .nav{
          position:sticky; top:0; z-index:100;
          display:flex; align-items:center; justify-content:space-between;
          padding:0 16px; height:48px;
          backdrop-filter:saturate(180%) blur(20px);
          background:rgba(var(--nav-rgb),0.35);
          border-bottom:1px solid var(--border);
          transition:background .25s ease;
        }
        .nav.searching{ background:rgba(var(--nav-rgb),0.6); }

        .tabs{ display:flex; align-items:center; gap:22px; transition:opacity .25s ease; }
        .tab{
          padding:10px 6px; font-weight:800; letter-spacing:.1px;
          color:var(--text); opacity:.85; text-decoration:none;
          border-radius:12px; transition:opacity .15s ease, background .15s ease;
        }
        .tab:hover{ opacity:1; }
        .tab.is-active{ background:var(--card); border:1px solid var(--border); padding:10px 14px; opacity:1; }

        .center{
          position:absolute; left:16px; right:16px; top:0; bottom:0;
          display:flex; align-items:center; justify-content:center;
          opacity:0; pointer-events:none; transition:opacity .25s ease;
        }
        .center.open{ opacity:1; }
        .center .pill{ pointer-events:auto; }
        .pill{
          position:relative; width:100%; max-width:600px; height:36px;
          backdrop-filter:saturate(180%) blur(20px);
          background:rgba(var(--nav-rgb),0.35); border:1px solid var(--border);
          border-radius:12px; display:flex; align-items:center; overflow:visible;
        }
        :global(.search-input){
          height:100%; width:100%; background:transparent; border:0; outline:0;
          color:var(--text); font-size:14.5px; padding-left:38px; padding-right:36px; box-sizing:border-box;
        }

        .right{ display:flex; align-items:center; gap:14px; position:relative; z-index:1; }
        .clock{ font-weight:600; color:var(--text); }
        .muted{ opacity:.7; }
        .theme, .search-trigger, .search-close{
          width:32px; height:32px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          background:var(--card); color:var(--text);
          border:1px solid var(--border); cursor:pointer;
        }
        .health{
          width:12px; height:12px; border-radius:50%;
          border:1px solid var(--border);
          cursor:pointer;
        }
        .search-close{
          backdrop-filter:saturate(180%) blur(20px);
          background:rgba(var(--nav-rgb),0.35);
          border:1px solid var(--border);
        }
        @media (max-width:1024px){ .tabs{ gap:16px; } }
        @media (max-width:720px){ .tabs{ display:none; } }
      `}</style>
    </header>
  );
}
