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
      <div className="grid head-row">
        <div className="c cell">Price</div>
        <div className="c cell">Ask</div>
        <div className="c cell">Bid</div>

        <div className="mid cell">
          <span className="arrow">↑</span> Strike
        </div>
        <div className="mid cell">IV, %</div>

        <div className="p cell">Bid</div>
        <div className="p cell">Ask</div>
        <div className="p cell">Price</div>
      </div>

      <div className="empty card">
        <div className="title">No options loaded</div>
        <div className="sub">
          Pick a provider or upload a screenshot, then choose an expiry.
        </div>
      </div>

      <style jsx>{`
        .wrap{ margin-top:10px; }
        .heads{
          display:flex; align-items:center; justify-content:space-between;
          margin: 12px 0 8px;
        }
        .h-left, .h-right{
          font-weight:800; font-size:28px; letter-spacing:.2px; color:#0f172a;
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
          border-top:1px solid #E6E9EF;
          border-bottom:1px solid #E6E9EF;
          font-weight:700; font-size:15px; color:#2b3442;
        }
        .cell{ height:28px; display:flex; align-items:center; }
        .c{ justify-content:flex-start; }  /* Calls side */
        .p{ justify-content:flex-end; }    /* Puts side */
        .mid{ justify-content:center; text-align:center; }
        .arrow{ margin-right:6px; font-weight:900; }

        .card{
          border:1px solid #E6E9EF; border-radius:14px; background:#fff;
          padding:18px; margin-top:14px;
        }
        .title{ font-weight:800; font-size:18px; margin-bottom:6px; }
        .sub{ opacity:.75; }

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:22px; }
          .head-row{ font-size:14px; }
        }
      `}</style>
    </div>
  );
}
