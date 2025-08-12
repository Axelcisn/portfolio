"use client";

export default function ChainTable({ symbol, currency, provider, groupBy, expiry }) {
  // Empty state for now; structure + perfect symmetry
  return (
    <div className="wrap">
      <div className="heads">
        <div className="h-left">Calls</div>
        <div className="h-mid" />
        <div className="h-right">Puts</div>
      </div>

      {/* Column headers use same grid as rows for perfect alignment */}
      <div className="grid head-row" role="row">
        <div className="c cell" role="columnheader">Price</div>
        <div className="c cell" role="columnheader">Ask</div>
        <div className="c cell" role="columnheader">Bid</div>

        <div className="mid cell" role="columnheader">
          <span className="arrow" aria-hidden="true">↑</span> Strike
        </div>
        <div className="mid cell" role="columnheader">IV, %</div>

        <div className="p cell" role="columnheader">Bid</div>
        <div className="p cell" role="columnheader">Ask</div>
        <div className="p cell" role="columnheader">Price</div>
      </div>

      <div className="empty card">
        <div className="title">No options loaded</div>
        <div className="sub">
          Pick a provider or upload a screenshot, then choose an expiry
          {expiry?.m && expiry?.d ? ` (e.g., ${expiry.m} ${expiry.d})` : ""}.
        </div>
      </div>

      <style jsx>{`
        .wrap{ margin-top:10px; }

        .heads{
          display:flex; align-items:center; justify-content:space-between;
          margin: 10px 0 6px;
        }
        .h-left, .h-right{
          font-weight:800; font-size:22px; letter-spacing:.2px;
          color: var(--text, #0f172a);
        }
        .h-mid{ flex:1; }

        /* 8 columns: 3 (calls) + 2 (center) + 3 (puts)  */
        .grid{
          display:grid;
          grid-template-columns:
            minmax(86px,1fr) minmax(86px,1fr) minmax(86px,1fr)
            112px 86px
            minmax(86px,1fr) minmax(86px,1fr) minmax(86px,1fr);
          gap: 6px 14px;
          align-items:center;
        }
        .head-row{
          padding: 8px 0 10px;
          border-top:1px solid var(--border, #E6E9EF);
          border-bottom:1px solid var(--border, #E6E9EF);
          font-weight:700; font-size:13.5px;
          color: var(--text, #2b3442);
        }
        .cell{ height:26px; display:flex; align-items:center; }
        .c{ justify-content:flex-start; }  /* Calls side */
        .p{ justify-content:flex-end; }    /* Puts side */
        .mid{ justify-content:center; text-align:center; }
        .arrow{ margin-right:6px; font-weight:900; color: var(--accent, #3b82f6); }

        .card{
          border:1px solid var(--border, #E6E9EF);
          border-radius:14px;
          background: var(--card, #fff);
          color: var(--text, #0f172a);
          padding:16px 18px;
          margin-top:14px;
        }
        .title{ font-weight:800; font-size:16px; margin-bottom:4px; }
        .sub{ opacity:.75; font-size:13px; }

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:20px; }
          .head-row{ font-size:13px; }
          .cell{ height:24px; }
        }
      `}</style>
    </div>
  );
}
