"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Controlled settings panel.
 * props.settings is the single source of truth.
 */
export default function ChainSettings({ settings, onChange, onClose }) {
  const s = settings || {};
  const [customText, setCustomText] = useState(String(s.customRows ?? 25));

  // Keep text in sync if parent changes customRows from outside
  useEffect(() => { setCustomText(String(s.customRows ?? 25)); }, [s.customRows]);

  // Helpers
  const set = (patch) => onChange?.({ ...s, ...patch });
  const toggleCol = (k) => set({ columns: { ...(s.columns||{}), [k]: !s.columns?.[k] } });

  // Custom rows handling
  const onCustomChange = (val) => {
    setCustomText(val);
    // auto-select "custom" and clamp
    const n = Math.max(5, Math.min(500, Number(val.replace(/[^\d]/g, "")) || 0));
    set({ rowsMode: "custom", customRows: n });
  };

  // Radio helper
  const Radio = ({ checked, onChange, children }) => (
    <label className="radio">
      <input type="radio" checked={!!checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );

  // Checkbox helper
  const Checkbox = ({ checked, onChange, children }) => (
    <label className="check">
      <input type="checkbox" checked={!!checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );

  const cols = useMemo(() => ({
    bid: "Bid", ask: "Ask", price: "Price",
    delta: "Delta", gamma: "Gamma", theta: "Theta", vega: "Vega", rho: "Rho",
    timeValue: "Time value", intrinsic: "Intr. value",
    askIv: "Ask IV, %", bidIv: "Bid IV, %",
  }), []);

  return (
    <div className="wrap" role="dialog" aria-label="Chain table settings">
      <div className="sec">
        <div className="h">SHOW BY</div>
        <div className="rows">
          <Radio checked={s.rowsMode==="10"} onChange={() => set({ rowsMode:"10" })}>10 rows</Radio>
          <Radio checked={s.rowsMode==="20"} onChange={() => set({ rowsMode:"20" })}>20 rows</Radio>
          <Radio checked={s.rowsMode==="all"} onChange={() => set({ rowsMode:"all" })}>All rows</Radio>
          <div className="custom">
            <Radio checked={s.rowsMode==="custom"} onChange={() => set({ rowsMode:"custom" })}>Custom</Radio>
            <input
              className="num"
              value={customText}
              onChange={(e)=>onCustomChange(e.target.value)}
              onFocus={() => set({ rowsMode:"custom" })}
              disabled={s.rowsMode!=="custom"}
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div className="div" />

      <div className="sec">
        <div className="h">STRIKE SORT</div>
        <div className="rows">
          <Radio checked={s.sort==="asc"}  onChange={() => set({ sort:"asc"  })}>Ascending</Radio>
          <Radio checked={s.sort==="desc"} onChange={() => set({ sort:"desc" })}>Descending</Radio>
        </div>
      </div>

      <div className="div" />

      <div className="sec">
        <div className="h">CUSTOMIZE COLUMNS</div>
        <div className="cols">
          {Object.entries(cols).map(([k,label])=>(
            <Checkbox key={k} checked={!!s.columns?.[k]} onChange={() => toggleCol(k)}>{label}</Checkbox>
          ))}
        </div>
      </div>

      <style jsx>{`
        .wrap{
          width: 360px; max-height: 70vh; overflow:auto;
          padding:12px; border-radius:14px;
        }
        .h{ font-size:12px; letter-spacing:.06em; font-weight:800; opacity:.7; margin:6px 0 8px; }
        .rows{ display:flex; flex-direction:column; gap:6px; }
        .div{ height:1px; background:var(--border); margin:10px 0; }
        .radio, .check{
          display:flex; align-items:center; gap:10px; font-size:13px; font-weight:700;
        }
        .radio input[type="radio"], .check input[type="checkbox"]{
          width:16px; height:16px; accent-color:var(--accent,#3b82f6);
        }
        .custom{ display:flex; align-items:center; gap:10px; }
        .num{
          width:70px; height:28px; border:1px solid var(--border); background:var(--bg);
          border-radius:8px; padding:0 10px; font-weight:700; text-align:center;
        }
        .cols{ display:grid; grid-template-columns: 1fr; gap:8px; }
        @media (min-width:520px){ .cols{ grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
}
