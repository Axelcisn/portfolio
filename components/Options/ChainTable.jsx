// components/Options/ChainTable.jsx
"use client";

import React from "react";

export default function ChainTable({ provider, mode, settings }) {
  // Empty state placeholder (no data wired yet)
  return (
    <section className="table-wrap">
      <div className="hdr">
        <div className="colgrp">
          <div className="th">Price</div>
          <div className="th">Ask</div>
          <div className="th">Bid</div>
        </div>

        <div className="mid">
          <div className="th">↑ Strike</div>
          <div className="th">IV, %</div>
        </div>

        <div className="colgrp right">
          <div className="th">Bid</div>
          <div className="th">Ask</div>
          <div className="th">Price</div>
        </div>
      </div>

      <div className="empty">
        <div className="title">No options loaded</div>
        <div className="msg">
          Pick a provider or upload a screenshot, then choose an expiry.
        </div>
      </div>

      <style jsx>{`
        .table-wrap{ margin-top:6px; }
        .hdr{
          display:grid; grid-template-columns: 1fr 1fr 1fr;
          align-items:center; gap:10px;
          padding: 6px 0 10px; border-bottom:1px solid var(--border);
        }
        .colgrp{ display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
        .mid{ display:grid; grid-template-columns: 1fr 1fr; gap:10px; }
        .right{ text-align:right; }

        .th{
          font-size:13px; font-weight:700; letter-spacing:.02em; opacity:.8;
        }

        .empty{
          margin-top:12px;
          border:1px solid var(--border); border-radius:14px; background:var(--card);
          padding:18px 20px;
        }
        .title{ font-size:14px; font-weight:800; margin-bottom:4px; }
        .msg{ font-size:13px; opacity:.8; }
      `}</style>
    </section>
  );
}
