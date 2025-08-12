// components/Options/ChainSettings.jsx
"use client";

import { useEffect, useRef } from "react";

/**
 * Props
 * - value: { rows: 10|20|number|'all', sort:'asc'|'desc', columns:{...} }
 * - onChange(next)
 * - onClose()
 * - anchorRef: ref to the settings button (for outside-click)
 */
export default function ChainSettings({ value, onChange, onClose, anchorRef }) {
  const ref = useRef(null);

  // close when clicking outside
  useEffect(() => {
    const onDoc = (e) => {
      if (!ref.current) return;
      const hitPanel = ref.current.contains(e.target);
      const hitAnchor = anchorRef?.current?.contains?.(e.target);
      if (!hitPanel && !hitAnchor) onClose?.();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose, anchorRef]);

  const v = value || { rows: 20, sort: "asc", columns: { bid: true, ask: true, price: true } };
  const set = (patch) => onChange?.({ ...v, ...patch });

  // ---- rows (10 / 20 / all / custom) ----
  const rowsKind =
    v.rows === "all"
      ? "all"
      : typeof v.rows === "number"
      ? v.rows === 10
        ? "10"
        : v.rows === 20
        ? "20"
        : "custom"
      : "20";
  const customVal =
    typeof v.rows === "number" && ![10, 20].includes(v.rows) ? v.rows : 25;

  const setRows = (kind, val) => {
    if (kind === "all") return set({ rows: "all" });
    if (kind === "custom") return set({ rows: Math.max(1, Number(val) || 25) });
    return set({ rows: Number(kind) });
  };

  // ---- columns helpers ----
  const col = (k) => !!v.columns?.[k];
  const flip = (k) => set({ columns: { ...v.columns, [k]: !col(k) } });

  return (
    <div className="menu" role="dialog" aria-label="Chain table settings" ref={ref}>
      {/* SHOW BY */}
      <div className="sec">
        <div className="sec-h">SHOW BY</div>
        <label className="r">
          <input
            type="radio"
            name="rows"
            checked={rowsKind === "10"}
            onChange={() => setRows("10")}
          />
          10 rows
        </label>
        <label className="r">
          <input
            type="radio"
            name="rows"
            checked={rowsKind === "20"}
            onChange={() => setRows("20")}
          />
          20 rows
        </label>
        <label className="r">
          <input
            type="radio"
            name="rows"
            checked={rowsKind === "all"}
            onChange={() => setRows("all")}
          />
          All rows
        </label>

        <div className="r-flex">
          <label className="r">
            <input
              type="radio"
              name="rows"
              checked={rowsKind === "custom"}
              onChange={() => setRows("custom", customVal)}
            />
            Custom
          </label>
          <input
            className="num"
            inputMode="numeric"
            pattern="[0-9]*"
            value={customVal}
            onChange={(e) => setRows("custom", e.target.value)}
            aria-label="Custom rows"
          />
        </div>
      </div>

      <div className="sep" />

      {/* STRIKE SORT */}
      <div className="sec">
        <div className="sec-h">STRIKE SORT</div>
        <label className="r">
          <input
            type="radio"
            name="sort"
            checked={v.sort === "asc"}
            onChange={() => set({ sort: "asc" })}
          />
          Ascending
        </label>
        <label className="r">
          <input
            type="radio"
            name="sort"
            checked={v.sort === "desc"}
            onChange={() => set({ sort: "desc" })}
          />
          Descending
        </label>
      </div>

      <div className="sep" />

      {/* COLUMNS */}
      <div className="sec">
        <div className="sec-h">CUSTOMIZE COLUMNS</div>
        {[
          ["bid", "Bid"],
          ["ask", "Ask"],
          ["price", "Price"],
          ["delta", "Delta"],
          ["gamma", "Gamma"],
          ["theta", "Theta"],
          ["vega", "Vega"],
          ["rho", "Rho"],
          ["time", "Time value"],
          ["intrinsic", "Intr. value"],
          ["askIv", "Ask IV, %"],
          ["bidIv", "Bid IV, %"],
        ].map(([k, label]) => (
          <label key={k} className="c">
            <input type="checkbox" checked={col(k)} onChange={() => flip(k)} />
            {label}
          </label>
        ))}
      </div>

      <style jsx>{`
        .menu{
          position:absolute; top:100%; right:0; margin-top:8px;
          width:280px; max-height:70vh; overflow:auto;
          background:var(--card,#0e0e10); color:var(--text,#eaeaea);
          border:1px solid var(--border,#2a2a2a); border-radius:14px;
          box-shadow:0 16px 36px rgba(0,0,0,.55);
          padding:12px;
          font-size:12.5px; line-height:1.25;
        }
        .sec{ padding:6px 2px; }
        .sec-h{
          font-size:11px; letter-spacing:.08em; opacity:.7;
          margin:2px 0 8px; font-weight:800;
        }
        .sep{ height:1px; margin:6px 0; background:var(--border,#2a2a2a); opacity:.9; }

        .r, .c{
          display:flex; align-items:center; gap:10px;
          padding:6px 4px; border-radius:8px;
        }
        .r:hover, .c:hover{ background:rgba(255,255,255,.04); }

        input[type="radio"]{
          appearance:none; width:16px; height:16px; margin:0;
          border:1.6px solid var(--border,#3a3a3a);
          border-radius:50%; display:inline-grid; place-items:center;
          background:transparent; flex:0 0 auto;
        }
        input[type="radio"]::before{
          content:""; width:8px; height:8px; border-radius:50%;
          transform:scale(0); transition:120ms transform ease-in-out;
          background:var(--accent,#3b82f6);
        }
        input[type="radio"]:checked{ border-color:var(--accent,#3b82f6); }
        input[type="radio"]:checked::before{ transform:scale(1); }

        .c input[type="checkbox"]{
          appearance:none; width:16px; height:16px; margin:0;
          border:1.6px solid var(--border,#3a3a3a); border-radius:4px;
          display:inline-grid; place-items:center; background:transparent;
        }
        .c input[type="checkbox"]::before{
          content:""; width:10px; height:10px; transform:scale(0);
          transition:120ms transform ease-in-out;
          background:var(--accent,#3b82f6);
        }
        .c input[type="checkbox"]:checked{ border-color:var(--accent,#3b82f6); }
        .c input[type="checkbox"]:checked::before{ transform:scale(1); }

        .r-flex{ display:flex; align-items:center; gap:8px; padding:6px 4px; }
        .num{
          width:64px; height:28px; border-radius:8px;
          border:1px solid var(--border,#3a3a3a);
          background:var(--bg,#0b0b0b); color:var(--text,#eaeaea);
          font-size:12.5px; font-weight:700; text-align:center; padding:0 8px;
        }
      `}</style>
    </div>
  );
}
