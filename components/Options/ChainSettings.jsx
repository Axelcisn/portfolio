// components/Options/ChainSettings.jsx
"use client";

import { useEffect, useRef } from "react";

export default function ChainSettings({
  open = false,
  onClose = () => {},

  rowsMode = "10",                 // '10' | '20' | 'all' | 'custom'
  customRows = 25,
  onRowsModeChange = () => {},
  onCustomRowsChange = () => {},

  sort = "asc",                    // 'asc' | 'desc'
  onSortChange = () => {},

  columns = {},                    // { bid, ask, price, delta, ... }
  onColumnsChange = () => {},

  style = {},
}) {
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) onClose?.();
    };
    const esc = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", handle);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", esc);
    };
  }, [open, onClose]);

  const toggleCol = (k) => onColumnsChange({ ...columns, [k]: !columns[k] });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="popover"
      ref={boxRef}
      style={style}
    >
      <div className="section">
        <div className="title">SHOW BY</div>
        <label className={`row ${rowsMode === "10" ? "is-active" : ""}`}>
          <input type="radio" name="rows" checked={rowsMode === "10"} onChange={() => onRowsModeChange("10")} />
          <span>10 rows</span>
        </label>
        <label className={`row ${rowsMode === "20" ? "is-active" : ""}`}>
          <input type="radio" name="rows" checked={rowsMode === "20"} onChange={() => onRowsModeChange("20")} />
          <span>20 rows</span>
        </label>
        <label className={`row ${rowsMode === "all" ? "is-active" : ""}`}>
          <input type="radio" name="rows" checked={rowsMode === "all"} onChange={() => onRowsModeChange("all")} />
          <span>All rows</span>
        </label>
        <div className={`custom ${rowsMode === "custom" ? "is-active" : ""}`}>
          <label className="row">
            <input type="radio" name="rows" checked={rowsMode === "custom"} onChange={() => onRowsModeChange("custom")} />
            <span>Custom</span>
          </label>
          <input
            type="number"
            className="num"
            min={1}
            value={customRows}
            onChange={(e) => onCustomRowsChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </div>
      </div>

      <div className="divider" />

      <div className="section">
        <div className="title">STRIKE SORT</div>
        <label className={`row ${sort === "asc" ? "is-active" : ""}`}>
          <input type="radio" name="sort" checked={sort === "asc"} onChange={() => onSortChange("asc")} />
          <span>Ascending</span>
        </label>
        <label className={`row ${sort === "desc" ? "is-active" : ""}`}>
          <input type="radio" name="sort" checked={sort === "desc"} onChange={() => onSortChange("desc")} />
          <span>Descending</span>
        </label>
      </div>

      <div className="divider" />

      <div className="section">
        <div className="title">CUSTOMIZE COLUMNS</div>

        {[
          ["bid", "Bid"],
          ["ask", "Ask"],
          ["price", "Price"],
          ["delta", "Delta"],
          ["gamma", "Gamma"],
          ["theta", "Theta"],
          ["vega", "Vega"],
          ["rho", "Rho"],
          ["timeValue", "Time value"],
          ["intrinsicValue", "Intr. value"],
          ["askIv", "Ask IV, %"],
          ["bidIv", "Bid IV, %"],
        ].map(([k, label]) => (
          <label key={k} className="row chk">
            <input type="checkbox" checked={!!columns[k]} onChange={() => toggleCol(k)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <style jsx>{`
        .popover{
          position:absolute;
          top: 48px;                 /* sits below toolbar */
          right: 8px;
          width: 300px;
          max-height: 70vh;
          overflow:auto;
          padding: 12px;
          border-radius: 12px;
          background: var(--card, #101010);
          color: var(--text, #eaeaea);
          border: 1px solid var(--border, rgba(255,255,255,.12));
          box-shadow: 0 16px 40px rgba(0,0,0,.45);
          z-index: 30;
        }
        .title{ font-size:12px; letter-spacing:.2px; opacity:.8; margin-bottom:8px; }
        .row{
          display:flex; align-items:center; gap:10px;
          height:34px; border-radius:8px; padding:0 8px;
          cursor:pointer; user-select:none;
        }
        .row input{ pointer-events:auto; }
        .row.is-active{ background: rgba(255,255,255,.05); }
        .chk{ height:30px; }
        .custom{ display:flex; align-items:center; gap:8px; padding-left:6px; }
        .num{
          width:84px; height:30px; border-radius:8px; padding:0 8px;
          border:1px solid var(--border); background:var(--bg,#0b0b0b); color:var(--text);
          font-weight:700;
        }
        .section + .section{ margin-top:8px; }
        .divider{ height:1px; background: var(--border, rgba(255,255,255,.12)); margin:10px 0; }
      `}</style>
    </div>
  );
}
