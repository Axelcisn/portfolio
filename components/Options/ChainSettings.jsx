// components/Options/ChainSettings.jsx
"use client";

export default function ChainSettings({ settings, onChange, onClose }) {
  // defaults (kept minimal; pick sensible initial columns)
  const s = {
    showBy: "20",       // "10" | "20" | "all" | "custom"
    customRows: 25,
    sort: "asc",        // "asc" | "desc"
    cols: { bid: true, ask: true, price: true },
    ...(settings || {}),
  };

  const set = (patch) => onChange?.({ ...s, ...patch });

  const colList = [
    ["bid", "Bid"], ["ask", "Ask"], ["price", "Price"],
    ["delta", "Delta"], ["gamma", "Gamma"], ["theta", "Theta"], ["vega", "Vega"], ["rho", "Rho"],
    ["tval", "Time value"], ["ival", "Intr. value"], ["askIv", "Ask IV, %"], ["bidIv", "Bid IV, %"],
  ];

  return (
    <div className="panel" role="dialog" aria-label="Chain table settings">
      <div className="head">
        <div className="title">Chain table settings</div>
        <button className="x" onClick={onClose} aria-label="Close settings">×</button>
      </div>

      {/* Show by */}
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
              onChange={(e) =>
                set({
                  showBy: "custom",
                  customRows: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </label>
        </div>
      </div>

      {/* Strike sort */}
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

      {/* Columns */}
      <div className="sec">
        <div className="label">Customize columns</div>
        <div className="cols">
          {colList.map(([k, lab]) => (
            <label key={k} className="col">
              <input
                type="checkbox"
                checked={!!s.cols?.[k]}
                onChange={(e) =>
                  set({ cols: { ...(s.cols || {}), [k]: e.target.checked } })
                }
              />
              <span>{lab}</span>
            </label>
          ))}
        </div>
      </div>

      <style jsx>{`
        .panel{
          background: var(--card, #ffffff);
          color: var(--text, #0f172a);
          border:1px solid var(--border, #E6E9EF);
          border-radius:16px;
          box-shadow: 0 12px 40px rgba(0,0,0,.14);
          width:100%;
          max-width:100%;
          padding:10px 14px 14px;
        }

        .head{
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom:6px;
        }
        .title{ font-weight:800; font-size:14px; letter-spacing:.02em; }

        .x{
          width:28px; height:28px; border-radius:8px;
          border:1px solid var(--border, #E6E9EF);
          background: var(--card, #ffffff);
          color: var(--text, #0f172a);
          font-size:18px; line-height:1;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer;
        }
        .x:hover{ background: var(--surface, #f7f9fc); }

        .sec{ padding:10px 6px; border-top:1px solid var(--border, #E6E9EF); }
        .sec:first-of-type{ border-top:0; padding-top:4px; }
        .label{
          font-size:12px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
          opacity:.7; margin-bottom:8px;
        }

        .rows{ display:flex; flex-direction:column; gap:8px; }
        .row{
          display:flex; align-items:center; gap:10px;
          font-weight:600; font-size:14px;
        }

        /* Theme-aware form controls */
        .row input[type="radio"],
        .col input[type="checkbox"]{
          width:16px; height:16px;
          accent-color: var(--accent, #3b82f6);
        }

        .custom .num{
          margin-left:auto; width:74px; height:32px; border-radius:8px;
          border:1px solid var(--border, #E6E9EF);
          background: var(--surface, #f7f9fc);
          color: var(--text, #0f172a);
          padding:0 8px; font-weight:700;
        }

        .cols{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:10px 14px;
        }
        .col{ display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; }

        /* Focus visibility */
        .x:focus,
        .row input:focus,
        .col input:focus,
        .custom .num:focus{
          outline: 2px solid var(--accent, #3b82f6);
          outline-offset: 2px;
        }
      `}</style>
    </div>
  );
}
