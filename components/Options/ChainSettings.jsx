// components/Options/ChainSettings.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Floating settings panel anchored to a button.
 * - Opens/closes correctly
 * - Positions beside the gear button
 * - Click-away + ESC to close
 */
export default function ChainSettings({
  open,
  anchorEl,
  settings,
  onChange,
  onClose,
}) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 340 });

  // Reposition the panel when opened / on scroll / resize
  useEffect(() => {
    if (!open) return;
    function place() {
      if (!anchorEl || !panelRef.current) return;
      const rect = anchorEl.getBoundingClientRect();
      const gap = 8;
      const width = 340;
      let left = rect.right - width;
      left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
      const top = rect.bottom + gap + window.scrollY;
      setPos({ top, left, width });
    }
    place();
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const onDocDown = (e) => {
      if (!panelRef.current) return;
      const insidePanel = panelRef.current.contains(e.target);
      const insideAnchor = anchorEl?.contains?.(e.target);
      if (!insidePanel && !insideAnchor) onClose?.();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDocDown, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDocDown, true);
    };
  }, [open, anchorEl, onClose]);

  const colList = useMemo(() => ([
    ["bid", "Bid"], ["ask", "Ask"], ["price", "Price"],
    ["delta", "Delta"], ["gamma", "Gamma"], ["theta", "Theta"], ["vega", "Vega"], ["rho", "Rho"],
    ["tval", "Time value"], ["ival", "Intr. value"], ["askIv", "Ask IV, %"], ["bidIv", "Bid IV, %"],
  ]), []);

  if (!open) return null;

  const s = settings || {};
  const set = (patch) => onChange?.({ ...s, ...patch });

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Chain table settings"
      className="panel"
      style={{ top: pos.top, left: pos.left, width: pos.width }}
    >
      <div className="sec">
        <div className="label">Show by</div>
        <div className="rows">
          {[
            ["10", "10 rows"],
            ["20", "20 rows"],
            ["all", "All rows"],
          ].map(([val, lab]) => (
            <label key={val} className="row">
              <input
                type="radio"
                name="rows"
                checked={s.showBy === val}
                onChange={() => set({ showBy: val })}
              />
              <span>{lab}</span>
            </label>
          ))}
          <label className="row custom">
            <input
              type="radio"
              name="rows"
              checked={s.showBy === "custom"}
              onChange={() => set({ showBy: "custom" })}
            />
            <span>Custom</span>
            <input
              type="number"
              min={1}
              className="num"
              value={s.customRows ?? 25}
              onChange={(e) => set({ showBy: "custom", customRows: Math.max(1, +e.target.value || 1) })}
            />
          </label>
        </div>
      </div>

      <div className="sec">
        <div className="label">Strike sort</div>
        <div className="rows">
          <label className="row">
            <input
              type="radio"
              name="sort"
              checked={s.sort === "asc"}
              onChange={() => set({ sort: "asc" })}
            />
            <span>Ascending</span>
          </label>
          <label className="row">
            <input
              type="radio"
              name="sort"
              checked={s.sort === "desc"}
              onChange={() => set({ sort: "desc" })}
            />
            <span>Descending</span>
          </label>
        </div>
      </div>

      <div className="sec">
        <div className="label">Customize columns</div>
        <div className="cols">
          {colList.map(([k, lab]) => (
            <label key={k} className="col">
              <input
                type="checkbox"
                checked={!!s?.cols?.[k]}
                onChange={(e) => set({ cols: { ...(s.cols || {}), [k]: e.target.checked } })}
              />
              <span>{lab}</span>
            </label>
          ))}
        </div>
      </div>

      <style jsx>{`
        .panel{
          position: absolute; z-index: 1000; border:1px solid var(--border);
          background: var(--card); border-radius:16px; box-shadow: 0 12px 40px rgba(0,0,0,.18);
          padding:14px 14px 10px;
        }
        .sec{ padding:10px 8px; border-top:1px solid var(--border); }
        .sec:first-child{ border-top:0; padding-top:6px; }
        .label{ font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; opacity:.7; margin-bottom:8px; }
        .rows{ display:flex; flex-direction:column; gap:8px; }
        .row{ display:flex; align-items:center; gap:10px; font-weight:600; font-size:14px; }
        .row input[type="radio"]{ width:16px; height:16px; }
        .custom .num{
          margin-left:auto; width:72px; height:32px; border-radius:8px; border:1px solid var(--border);
          background:var(--surface, #f7f9fc); padding:0 8px; font-weight:700;
        }
        .cols{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:10px 14px;
        }
        .col{ display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; }
        .col input{ width:16px; height:16px; }
      `}</style>
    </div>
  );
}
