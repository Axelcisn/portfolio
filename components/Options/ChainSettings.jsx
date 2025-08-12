// components/Options/ChainSettings.jsx
"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

export default function ChainSettings({
  open = false,
  anchorRef,
  value,
  onChange,
  onClose,
}) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, minWidth: 320 });

  // Align under the anchor
  const place = () => {
    const a = anchorRef?.current;
    const p = panelRef.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const w = Math.max(320, Math.min(420, window.innerWidth - 24));
    let left = r.right - w;           // right align to gear
    left = Math.max(12, Math.min(left, window.innerWidth - w - 12));
    const top = r.bottom + 8;
    setPos({ top, left, minWidth: w });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = () => place();
    window.addEventListener("resize", h);
    window.addEventListener("scroll", h, true);
    return () => { window.removeEventListener("resize", h); window.removeEventListener("scroll", h, true); };
  }, [open]);

  if (!open) return null;

  const v = value || {};
  const set = (patch) => onChange?.({ ...v, ...patch });

  const Row = ({ children, title }) => (
    <div className="group">
      <div className="title">{title}</div>
      {children}
    </div>
  );

  const Check = ({ k, label }) => (
    <label className="chk">
      <input
        type="checkbox"
        checked={!!v.columns?.[k]}
        onChange={(e) => set({ columns: { ...(v.columns||{}), [k]: e.target.checked } })}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <>
      {/* click-away */}
      <div className="veil" onClick={onClose} />

      <div
        ref={panelRef}
        className="panel"
        style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth }}
        role="dialog"
        aria-label="Chain table settings"
      >
        <Row title="Show by">
          <label className="radio">
            <input
              type="radio"
              name="rows"
              checked={v.rows === 10}
              onChange={() => set({ rows: 10 })}
            />
            <span>10 rows</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="rows"
              checked={v.rows === 20}
              onChange={() => set({ rows: 20 })}
            />
            <span>20 rows</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="rows"
              checked={v.rows === "all"}
              onChange={() => set({ rows: "all" })}
            />
            <span>All rows</span>
          </label>

          <div className="custom">
            <label className="radio">
              <input
                type="radio"
                name="rows"
                checked={typeof v.rows === "number" && v.rows !== 10 && v.rows !== 20}
                onChange={() => set({ rows: Number(v.custom || 25) || 25 })}
              />
              <span>Custom</span>
            </label>
            <input
              className="num"
              inputMode="numeric"
              value={v.custom ?? 25}
              onChange={(e) => set({ custom: e.target.value })}
              onBlur={(e) => {
                const n = Math.max(1, Math.min(999, parseInt(e.target.value || "25", 10)));
                set({ custom: n, rows: n });
              }}
            />
          </div>
        </Row>

        <div className="divider" />

        <Row title="Strike sort">
          <label className="radio">
            <input
              type="radio"
              name="sort"
              checked={v.sort === "asc"}
              onChange={() => set({ sort: "asc" })}
            />
            <span>Ascending</span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="sort"
              checked={v.sort === "desc"}
              onChange={() => set({ sort: "desc" })}
            />
            <span>Descending</span>
          </label>
        </Row>

        <div className="divider" />

        <Row title="Customize columns">
          <div className="cols">
            <div className="col">
              <Check k="bid" label="Bid" />
              <Check k="price" label="Price" />
              <Check k="gamma" label="Gamma" />
              <Check k="vega" label="Vega" />
              <Check k="askIv" label="Ask IV, %" />
            </div>
            <div className="col">
              <Check k="ask" label="Ask" />
              <Check k="delta" label="Delta" />
              <Check k="theta" label="Theta" />
              <Check k="rho" label="Rho" />
              <Check k="bidIv" label="Bid IV, %" />
            </div>
          </div>
        </Row>
      </div>

      <style jsx>{`
        .veil{
          position:fixed; inset:0; background:transparent; z-index:999;
        }
        .panel{
          position:fixed; z-index:1000;
          background:var(--card);
          border:1px solid var(--border);
          box-shadow:0 12px 40px rgba(0,0,0,.12), 0 2px 6px rgba(0,0,0,.06);
          border-radius:14px; padding:12px 14px;
          color:var(--text);
          max-width: 420px;
        }

        .group{ display:flex; flex-direction:column; gap:8px; padding:8px 2px; }
        .title{
          font-size:12.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
          color:var(--text); opacity:.72;
        }
        .radio, .chk{
          display:flex; align-items:center; gap:8px; font-size:13px;
          padding:4px 0;
        }
        .radio input[type="radio"], .chk input[type="checkbox"]{
          appearance:none; width:16px; height:16px; border-radius:999px;
          border:1.5px solid var(--border-strong,#cfd5db); display:inline-block;
          position:relative; background:#fff;
        }
        .radio input[type="radio"]:checked{
          border-color: var(--accent,#2563eb);
          box-shadow: inset 0 0 0 4px var(--accent,#2563eb);
        }
        .chk input[type="checkbox"]{ border-radius:5px; }
        .chk input[type="checkbox"]:checked{
          background: var(--accent,#2563eb);
          border-color: var(--accent,#2563eb);
        }

        .custom{ display:flex; align-items:center; gap:10px; padding:2px 0; }
        .num{
          width:68px; height:32px; border-radius:10px; border:1px solid var(--border);
          background:var(--bg); color:var(--text);
          font-weight:700; font-size:13px; text-align:center;
        }

        .divider{ height:1px; background:var(--border); margin:8px 0; opacity:.6; }

        .cols{ display:grid; grid-template-columns: 1fr 1fr; gap:8px 18px; }
        .col{ display:flex; flex-direction:column; }
      `}</style>
    </>
  );
}
