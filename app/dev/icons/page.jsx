// app/dev/icons/page.jsx
"use client";

import React from "react";
import StrategyIcon from "../../../components/Icons/StrategyIcon.jsx";

const NAMES = [
  "manual",
  "long-call","short-call",
  "long-put","short-put",
  "protective-put","leaps",
  "bear-call-spread","bull-put-spread","bear-put-spread",
  "long-straddle","short-straddle","long-strangle","short-strangle",
  "call-calendar","put-calendar",
  "call-diagonal","put-diagonal",
  "iron-condor","iron-butterfly",
  "call-butterfly","put-butterfly",
  "reverse-condor",
  "call-ratio","put-ratio",
  "call-backspread","put-backspread",
  "covered-call","covered-put",
  "collar","strap",
  "long-box","short-box",
  "reversal","stock-repair"
];

export default function IconsPreview() {
  return (
    <main className="wrap">
      <h1>Strategy Icons — Preview</h1>
      <p className="muted">Visual check for OA-style icon tiles and mapping.</p>
      <div className="grid">
        {NAMES.map((n) => (
          <div key={n} className="tile">
            <div className="ico">
              <StrategyIcon name={n} size={56} />
            </div>
            <div className="cap" title={n}>{n}</div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .wrap{ padding:20px; }
        .muted{ opacity:.7; margin-top:-6px; }
        .grid{
          margin-top:14px;
          display:grid; gap:14px;
          grid-template-columns: repeat(auto-fill, minmax(180px,1fr));
        }
        .tile{
          border:1px solid var(--border, #2a2f3a);
          border-radius:14px; padding:12px;
          background: var(--card, #111214);
          display:flex; gap:12px; align-items:center;
        }
        .ico{ width:56px; height:56px; flex:0 0 auto; }
        .cap{
          font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }

        @media (prefers-color-scheme: light){
          .tile{ background:#fff; border-color:#e5e7eb; }
        }
      `}</style>
    </main>
  );
}
