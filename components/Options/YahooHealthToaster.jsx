// components/Options/YahooHealthToaster.jsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export default function YahooHealthToaster() {
  const [mode, setMode] = useState("hidden"); // hidden | bad | repairing | ok
  const [open, setOpen] = useState(false);
  const hideT = useRef(null);
  const justRepaired = useRef(false);

  const clearHideTimer = () => { if (hideT.current) { clearTimeout(hideT.current); hideT.current = null; } };

  const check = useCallback(async () => {
    try {
      const r = await fetch("/api/yahoo/session", { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      const healthy = !!(j?.data?.ok && j?.data?.hasCookie);

      if (!healthy) {
        clearHideTimer();
        setMode("bad");
        setOpen(true);
      } else {
        // Only show the blue "OK" toast if this came right after a repair
        if (justRepaired.current) {
          setMode("ok");
          setOpen(true);
          clearHideTimer();
          hideT.current = setTimeout(() => setOpen(false), 2200);
          justRepaired.current = false;
        } else {
          setOpen(false);
          setMode("hidden");
        }
      }
    } catch {
      // Network/parse error → treat as bad to surface action
      setMode("bad");
      setOpen(true);
    }
  }, []);

  const repair = useCallback(async () => {
    try {
      clearHideTimer();
      setMode("repairing");
      setOpen(true);
      await fetch("/api/yahoo/session", { method: "POST" });
      justRepaired.current = true;
    } catch {
      // fall through; we'll re-check and surface "bad" again if needed
    } finally {
      await check();
    }
  }, [check]);

  useEffect(() => {
    check();
    const id = setInterval(check, 10 * 60 * 1000); // align with button cadence
    const onVis = () => { if (document.visibilityState === "visible") check(); };
    window.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); window.removeEventListener("visibilitychange", onVis); clearHideTimer(); };
  }, [check]);

  if (!open) return null;

  return (
    <>
      <div className={`ytoast ${mode === "bad" ? "is-bad" : mode === "ok" ? "is-ok" : "is-busy"}`} role="status" aria-live="polite">
        <div className="ico" aria-hidden="true">
          {mode === "bad" && (
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7l9-5Z" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M8 12l4 4l4-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {mode === "ok" && (
            <svg width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6"/><path d="M8.5 12.2l2.5 2.5l4.5-4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          )}
          {mode === "repairing" && (
            <svg className="spin" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" opacity=".3"/><path d="M20 12a8 8 0 0 0-8-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          )}
        </div>

        <div className="txt">
          {mode === "bad" && <><b>Yahoo blocked.</b> Repair the session to fetch options.</>}
          {mode === "repairing" && <>Repairing Yahoo session…</>}
          {mode === "ok" && <>Yahoo connection restored.</>}
        </div>

        <div className="actions">
          {mode === "bad" && (
            <button type="button" className="pill primary" onClick={repair}>Repair</button>
          )}
          <button type="button" className="pill ghost" onClick={() => setOpen(false)}>Dismiss</button>
        </div>
      </div>

      <style jsx>{`
        .ytoast{
          position: fixed;
          right: 16px;
          bottom: 16px;
          max-width: min(560px, calc(100vw - 24px));
          display: flex; align-items: center; gap: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid var(--border, #E6E9EF);
          background: color-mix(in srgb, var(--card, #fff) 86%, transparent);
          -webkit-backdrop-filter: saturate(1.8) blur(10px);
          backdrop-filter: saturate(1.8) blur(10px);
          color: var(--text, #0f172a);
          box-shadow: 0 6px 24px rgba(0,0,0,.10);
          z-index: 1200;
        }
        .ico{ display:flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:9px; }
        .ytoast.is-bad .ico{ color:#ef4444; }
        .ytoast.is-ok  .ico{ color:var(--accent, #3b82f6); }
        .ytoast.is-busy .ico{ color: color-mix(in srgb, var(--text) 65%, var(--card)); }

        .txt{ font-size:13.5px; line-height:1.25; }
        .txt b{ font-weight:800; margin-right:6px; }

        .actions{ display:flex; gap:8px; margin-left:auto; }

        .pill{
          height:32px; padding:0 12px; border-radius:12px;
          border:1px solid var(--border); background:var(--card);
          color: var(--text); font-weight:700; font-size:13px; line-height:1;
          display:inline-flex; align-items:center; justify-content:center;
          transition: background .15s ease, border-color .15s ease, opacity .15s ease;
        }
        .pill.primary{
          background: color-mix(in srgb, #ef4444 14%, var(--card));
          border-color: color-mix(in srgb, #ef4444 45%, var(--border));
          color:#ef4444;
        }
        .pill.ghost{
          background: color-mix(in srgb, var(--text) 6%, var(--card));
          border-color: color-mix(in srgb, var(--text) 18%, var(--border));
        }

        .spin{ animation: spin 0.9s linear infinite; transform-origin:center; }
        @keyframes spin{ to { transform: rotate(360deg); } }

        @media (max-width: 520px){
          .ytoast{ right: 10px; bottom: 10px; }
          .actions{ gap:6px; }
          .pill{ height:30px; padding:0 10px; font-size:12.5px; }
        }
      `}</style>
    </>
  );
}
