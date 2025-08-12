"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ChainSettings from "./ChainSettings";

/**
 * Night-mode ready toolbar. No behavior changes.
 * Uses site tokens: --text, --card, --border, --surface, --accent.
 */
export default function OptionsToolbar({
  provider = "api",
  onProvider,
  onProviderChange,
  groupBy = "expiry",
  onGroupBy,
  onGroupByChange,
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });

  const btnRef = useRef(null);
  const popRef = useRef(null);

  const fireProvider = (val) => {
    onProvider?.(val);
    onProviderChange?.(val);
  };
  const fireGroupBy = (val) => {
    onGroupBy?.(val);
    onGroupByChange?.(val);
  };

  // Position popover relative to the gear button
  const updateCoords = () => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const gap = 8;
    setCoords({
      top: r.bottom + gap,
      right: Math.max(8, window.innerWidth - r.right),
    });
  };

  // Open/close on click; when opening compute position
  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) updateCoords();
      return next;
    });
  };

  // Close on outside click and ESC; keep position on resize/scroll
  useEffect(() => {
    if (!open) return;

    const onDocDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onReflow = () => updateCoords();

    document.addEventListener("mousedown", onDocDown, true);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Render the popover through a portal so no parent overflow/stacking can hide it
  const Popover = () => {
    if (typeof document === "undefined") return null; // client guard
    return createPortal(
      <div
        ref={popRef}
        className={`cs-popover ${open ? "is-open" : ""}`}
        style={{ top: coords.top, right: coords.right }}
        role="dialog"
        aria-label="Chain settings"
      >
        <ChainSettings open={open} onClose={() => setOpen(false)} />
      </div>,
      document.body
    );
  };

  return (
    <div className="toolbar">
      <div className="left">
        <button
          type="button"
          className={`pill ${provider === "api" ? "is-on" : ""}`}
          onClick={() => fireProvider("api")}
          aria-pressed={provider === "api"}
        >
          API
        </button>
        <button
          type="button"
          className={`pill ${provider === "upload" ? "is-on" : ""}`}
          onClick={() => fireProvider("upload")}
          aria-pressed={provider === "upload"}
        >
          Upload
        </button>
      </div>

      <div className="right">
        <button
          type="button"
          className={`seg ${groupBy === "expiry" ? "is-on" : ""}`}
          onClick={() => fireGroupBy("expiry")}
          aria-pressed={groupBy === "expiry"}
        >
          By expiration
        </button>
        <button
          type="button"
          className={`seg ${groupBy === "strike" ? "is-on" : ""}`}
          onClick={() => fireGroupBy("strike")}
          aria-pressed={groupBy === "strike"}
        >
          By strike
        </button>

        <button
          ref={btnRef}
          type="button"
          className="gear"
          aria-haspopup="dialog"
          aria-expanded={open ? "true" : "false"}
          aria-label="Chain table settings"
          onClick={toggle}
        >
          {/* uses currentColor; adapts to theme */}
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 0 0 0-6.4m8.94 3.2a7.2 7.2 0 0 0-.14-1.28l2.07-1.61l-2-3.46l-2.48.98a7.36 7.36 0 0 0-2.22-1.28L14.8 1h-5.6l-.37 3.35c-.79.28-1.53.7-2.22 1.28l-2.48-.98l-2 3.46l2.07 1.61c-.06.42-.1.85-.1 1.28s.04.86.1 1.28l-2.07 1.61l2 3.46l2.48-.98c.69.58 1.43 1 2.22 1.28L9.2 23h5.6l.37-3.35c.79-.28 1.53-.7 2.22-1.28l2.48.98l2-3.46l-2.07-1.61c.1-.42.14-.85.14-1.28"
            />
          </svg>
        </button>
      </div>

      {/* Portal keeps layout untouched but ensures popover always appears */}
      <Popover />

      <style jsx>{`
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin: 6px 0 10px;
        }
        .left, .right{ display:flex; align-items:center; gap:10px; }

        .pill{
          height:36px; padding:0 14px; border-radius:12px;
          border:1px solid var(--border, #E6E9EF);
          background: var(--card, #fff);
          color: var(--text, #0f172a);
          font-weight:700; font-size:14px; line-height:1;
        }
        .pill.is-on{
          border-color: var(--accent, #3b82f6);
          /* pale accent bg with safe fallback */
          background: var(--accent-bg, rgba(59,130,246,.12));
        }

        .seg{
          height:38px; padding:0 16px; border-radius:14px;
          border:1px solid var(--border, #E6E9EF);
          background: var(--surface, #f5f7fa);
          color: var(--text, #0f172a);
          font-weight:800; font-size:15px; line-height:1;
        }
        .seg.is-on{
          border-color: var(--accent, #3b82f6);
          background: var(--accent-bg, rgba(59,130,246,.12));
        }

        .gear{
          height:38px; width:42px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:14px; border:1px solid var(--border, #E6E9EF);
          background: var(--card, #fff);
          color: var(--text, #0f172a);
        }

        /* Portal wrapper (panel styling lives inside ChainSettings) */
        :global(.cs-popover){
          position:fixed; z-index:1000;
          display:none;
        }
        :global(.cs-popover.is-open){
          display:block;
        }
      `}</style>
    </div>
  );
}
