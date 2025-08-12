// components/Options/ChainSettings.jsx
"use client";

import React, { useState } from "react";

export default function ChainSettings({
  onClose,
  showCount = "20",      // "10" | "20" | "all" | "custom"
  sortDir = "asc",       // "asc" | "desc"
  columns = { bid:true, ask:true, price:true },
  onChange,
}) {
  const [mode, setMode] = useState(showCount);
  const [customN, setCustomN] = useState(25);
  const [dir, setDir] = useState(sortDir);
  const [cols, setCols] = useState(columns);

  const toggleCol = (k) => setCols(c => ({ ...c, [k]: !c[k] }));

  return (
    <div className="pop" role="dialog" aria-label="Chain table settings">
      <div className="group">
        <div className="gh">SHOW BY</div>
        <label className="row">
          <input type="radio" name="cnt" checked={mode==="10"} onChange={()=>setMode("10")} />
          <span>10 rows</span>
        </label>
        <label className="row">
          <input type="radio" name="cnt" checked={mode==="20"} onChange={()=>setMode("20")} />
          <span>20 rows</span>
        </label>
        <label className="row">
          <input type="radio" name="cnt" checked={mode==="all"} onChange={()=>setMode("all")} />
          <span>All rows</span>
        </label>
        <label className="row">
          <input type="radio" name="cnt" checked={mode==="custom"} onChange={()=>setMode("custom")} />
          <span>Custom</span>
          <input
            type="number" min="1" step="1"
            className="n"
            value={customN}
            onChange={(e)=>setCustomN(Math.max(1, +e.target.value || 1))}
            disabled={mode!=="custom"}
          />
        </label>
      </div>

      <div className="sep" />

      <div className="group">
        <div className="gh">STRIKE SORT</div>
        <label className="row">
          <input type="radio" name="dir" checked={dir==="asc"} onChange={()=>setDir("asc")} />
          <span>Ascending</span>
        </label>
        <label className="row">
          <input type="radio" name="dir" checked={dir==="desc"} onChange={()=>setDir("desc")} />
          <span>Descending</span>
        </label>
      </div>

      <div className="sep" />

      <div className="group">
        <div className="gh">CUSTOMIZE COLUMNS</div>
        <div className="cols">
          <label className="row"><input type="checkbox" checked={!!cols.bid}   onChange={()=>toggleCol("bid")} /><span>Bid</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.ask}   onChange={()=>toggleCol("ask")} /><span>Ask</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.price} onChange={()=>toggleCol("price")} /><span>Price</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.delta} onChange={()=>toggleCol("delta")} /><span>Delta</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.gamma} onChange={()=>toggleCol("gamma")} /><span>Gamma</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.theta} onChange={()=>toggleCol("theta")} /><span>Theta</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.vega}  onChange={()=>toggleCol("vega")} /><span>Vega</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.rho}   onChange={()=>toggleCol("rho")} /><span>Rho</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.time}  onChange={()=>toggleCol("time")} /><span>Time value</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.intr}  onChange={()=>toggleCol("intr")} /><span>Intr. value</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.askiv} onChange={()=>toggleCol("askiv")} /><span>Ask IV, %</span></label>
          <label className="row"><input type="checkbox" checked={!!cols.bidiv} onChange={()=>toggleCol("bidiv")} /><span>Bid IV, %</span></label>
        </div>
      </div>

      <div className="actions">
        <button
          type="button"
          className="ghost"
          onClick={() => onClose?.()}
        >
          Close
        </button>
        <button
          type="button"
          className="save"
          onClick={() => { onChange?.({ show:mode, customN, dir, columns:cols }); onClose?.(); }}
        >
          Apply
        </button>
      </div>

      <style jsx>{`
        .pop{
          width: 360px;
          border:1px solid var(--border,#e5e7eb);
          background: var(--bg,#fff);
          border-radius:16px;
          box-shadow: 0 20px 40px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.06);
          padding:14px 14px 12px;
          font-size:14px;
          color: var(--text,#0f172a);
        }
        .group + .group{ margin-top:6px; }
        .gh{
          font-size:12px; letter-spacing:.12em; font-weight:800; opacity:.7;
          margin:6px 0 8px 2px;
        }
        .row{
          display:flex; align-items:center; gap:10px;
          padding:6px 4px; border-radius:8px;
        }
        .row:hover{ background: var(--card,#f6f7f8); }
        input[type="radio"], input[type="checkbox"]{ width:18px; height:18px; }

        .n{
          width:76px; height:32px; margin-left:auto;
          border:1px solid var(--border,#e5e7eb); border-radius:8px;
          background: var(--card,#f7f8fa); padding:0 10px; font-weight:700;
        }
        .sep{ height:1px; background:var(--border,#e5e7eb); margin:8px 0; }

        .cols{
          display:grid; grid-template-columns: 1fr 1fr; gap:2px 18px;
        }

        .actions{
          display:flex; justify-content:flex-end; gap:8px; margin-top:10px;
        }
        .ghost{
          height:32px; padding:0 10px; border-radius:8px;
          border:1px solid var(--border,#e5e7eb); background:var(--bg,#fff);
          font-weight:700;
        }
        .save{
          height:32px; padding:0 12px; border-radius:8px;
          border:0; background:var(--accent,#2563eb); color:#fff; font-weight:800;
        }
      `}</style>
    </div>
  );
}
