// components/Strategy/SummaryTable.jsx
"use client";

import React, { useMemo } from "react";
import { fmtCur, fmtNum } from "../../utils/format";

const TYPE_LABEL = {
  lc: "Long Call",
  sc: "Short Call",
  lp: "Long Put",
  sp: "Short Put",
  ls: "Long Stock",
  ss: "Short Stock",
};

const IS_STOCK = (t) => t === "ls" || t === "ss";

/**
 * Compute signed premium for a single row
 * Long options (lc/lp): pay premium  -> negative
 * Short options (sc/sp): receive premium -> positive
 * Stocks: no premium (—)
 */
function signedPremium(row) {
  const p = Number(row?.premium);
  const q = Number(row?.qty || 0);
  if (!Number.isFinite(p) || !Number.isFinite(q)) return 0;
  if (IS_STOCK(row.type)) return 0;
  const isLong = row.type === "lc" || row.type === "lp";
  return (isLong ? -1 : +1) * p * q;
}

export default function SummaryTable({
  rows = [],
  currency = "USD",
  title = "Summary",
}) {
  const cleanRows = Array.isArray(rows) ? rows.filter(Boolean) : [];

  const netPremium = useMemo(
    () => cleanRows.reduce((acc, r) => acc + signedPremium(r), 0),
    [cleanRows]
  );

  return (
    <section className="card dense">
      <div className="s-head">{title}</div>

      {cleanRows.length === 0 ? (
        <div className="s-empty">
          No legs selected yet. Add positions in <b>Configuration</b>.
        </div>
      ) : (
        <>
          <div className="s-grid s-grid-head">
            <div>Position</div>
            <div>Strike</div>
            <div>Expiration</div>
            <div>Volume</div>
            <div>Premium</div>
          </div>

          <div className="divider" />

          <div className="s-list">
            {cleanRows.map((r) => {
              const isStock = IS_STOCK(r.type);
              return (
                <div className="s-grid s-row" key={r.id}>
                  <div className="pos">
                    <span className={`badge ${r.type}`}>{TYPE_LABEL[r.type] || "—"}</span>
                  </div>
                  <div className="mono">{isStock ? "—" : fmtNum(r.K)}</div>
                  <div className="mono">{isStock ? "—" : `${fmtNum(r.days, 0)}d`}</div>
                  <div className="mono">{fmtNum(r.qty, 0)}</div>
                  <div className={`mono ${signedPremium(r) >= 0 ? "credit" : "debit"}`}>
                    {isStock ? "—" : fmtCur(Math.abs(signedPremium(r)), currency)}
                    <span className="pm">{signedPremium(r) >= 0 ? "  credit" : "  debit"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="footer">
            <div className="spacer" />
            <div className="np-label">Net Premium:</div>
            <div className={`np-value ${netPremium >= 0 ? "credit" : "debit"}`}>
              {fmtCur(Math.abs(netPremium), currency)}
              <span className="pm">{netPremium >= 0 ? "  credit" : "  debit"}</span>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .card.dense {
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg);
        }
        .s-head {
          font-weight: 700;
          margin-bottom: 10px;
        }
        .s-empty {
          padding: 12px;
          border: 1px dashed var(--border);
          border-radius: 10px;
          opacity: 0.85;
        }
        .s-grid {
          display: grid;
          grid-template-columns: 1.4fr 0.9fr 0.9fr 0.8fr 1.1fr;
          gap: 8px;
          align-items: center;
        }
        .s-grid-head {
          font-size: 12px;
          opacity: 0.75;
          padding: 2px 0;
        }
        .divider {
          height: 1px;
          background: var(--border);
          margin: 6px 0;
          opacity: 0.65;
        }
        .s-list {
          display: grid;
          gap: 8px;
        }
        .s-row {
          padding: 6px 0;
          border-bottom: 1px dashed var(--border);
        }
        .s-row:last-child {
          border-bottom: none;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          height: 26px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: var(--card);
          font-weight: 600;
          font-size: 12.5px;
        }
        .mono {
          font-variant-numeric: tabular-nums;
        }
        .pm {
          font-size: 11px;
          opacity: 0.7;
          margin-left: 6px;
        }
        .credit {
          color: #16a34a;
        }
        .debit {
          color: #ef4444;
        }
        .footer {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 10px;
          border-top: 1px solid var(--border);
          padding-top: 10px;
          margin-top: 8px;
        }
        .np-label {
          font-weight: 600;
          opacity: 0.85;
        }
        .np-value {
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
      `}</style>
    </section>
  );
}
