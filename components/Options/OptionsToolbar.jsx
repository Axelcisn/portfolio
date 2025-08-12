"use client";

import { useEffect, useRef, useState } from "react";
import ChainSettings from "./ChainSettings";

/**
 * Toolbar for the Options tab.
 * This version only adds a reliable open/close behavior for the settings popover.
 * Everything else stays the same.
 */
export default function OptionsToolbar({
  provider = "api",                          // 'api' | 'upload'
  onProvider, onProviderChange,              // support either prop name
  groupBy = "expiry",                        // 'expiry' | 'strike'
  onGroupBy, onGroupByChange,                // support either prop name
}) {
  // ---- SETTINGS POPOVER TOGGLE (the only new logic you asked for) ----
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const wrapRef = useRef(null);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      const b = btnRef.current;
      const p = popRef.current;
      if (b && b.contains(e.target)) return;
      if (p && p.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);

    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Helpers to keep existing parent APIs working (don’t change anything else)
  const fireProvider = (val) => {
    onProvider?.(val);
    onProviderChange?.(val);
  };
  const fireGroupBy = (val) => {
    onGroupBy?.(val);
    onGroupByChange?.(val);
  };

  return (
    <div className="toolbar" ref={wrapRef}>
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
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 8.8a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 0 0 0-6.4m8.94 3.2a7.2 7.2 0 0 0-.14-1.28l2.07-1.61l-2-3.46l-2.48.98a7.36 7.36 0 0 0-2.22-1.28L14.8 1h-5.6l-.37 3.35c-.79.28-1.53.7-2.22 1.28l-2.48-.98l-2 3.46l2.07 1.61c-.06.42-.1.85-.1 1.28s.04.86.1 1.28l-2.07 1.61l2 3.46l2.48-.98c.69.58 1.43 1 2.22 1.28L9.2 23h5.6l.37-3.35c.79-.28 1.53-.7 2.22-1.28l2.48.98l2-3.46l-2.07-1.61c.1-.42.14-.85.14-1.28"
            />
          </svg>
        </button>

        {/* Popover anchored to the gear; opens/closes with the button */}
        {open && (
          <div className="popover" ref={popRef} role="dialog" aria-label="Chain settings">
            <ChainSettings onClose={() => setOpen(false)} />
          </div>
        )}
      </div>

      <style jsx>{`
        .toolbar{
          display:flex; align-items:center; justify-content:space-between;
          gap:16px; margin: 6px 0 10px;
          position:relative; /* anchor for popover */
        }
        .left, .right{ display:flex; align-items:center; gap:10px; }

        .pill{
          height:36px; padding:0 14px; border-radius:12px;
          border:1px solid var(--border,#E6E9EF); background:#fff;
          font-weight:700; font-size:14px; line-height:1; color:#0f172a;
        }
        .pill.is-on{ border-color:#bcd3ff; background:#eef5ff; }

        .seg{
          height:38px; padding:0 16px; border-radius:14px;
          border:1px solid var(--border,#E6E9EF);
          background:#f5f7fa; font-weight:800; font-size:15px; color:#0f172a;
        }
        .seg.is-on{ background:#eaf2ff; border-color:#cfe2ff; }

        .gear{
          height:38px; width:42px; display:inline-flex; align-items:center; justify-content:center;
          border-radius:14px; border:1px solid var(--border,#E6E9EF); background:#fff;
          color:#0f172a;
        }

        /* Popover sits directly under the gear, aligned to the right edge */
        .popover{
          position:absolute; right:0; top:44px;
          background:#fff; border:1px solid var(--border,#E6E9EF); border-radius:14px;
          box-shadow:0 10px 30px rgba(0,0,0,.08);
          z-index:30;
        }
      `}</style>
    </div>
  );
}
