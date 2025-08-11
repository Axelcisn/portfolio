// components/Strategy/StrategyConfigTable.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

const LABEL = { lc: "Long Call", sc: "Short Call", lp: "Long Put", sp: "Short Put" };

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// long debits – short credits
function netPremium(legs) {
  const n = (x) => Number(x || 0);
  const lc = n(legs?.lc?.premium) * n(legs?.lc?.qty);
  const lp = n(legs?.lp?.premium) * n(legs?.lp?.qty);
  const sc = n(legs?.sc?.premium) * n(legs?.sc?.qty);
  const sp = n(legs?.sp?.premium) * n(legs?.sp?.qty);
  return (lc + lp) - (sc + sp);
}

/**
 * Props
 * - legs: { lc?, sc?, lp?, sp? } with { enabled?:boolean, K:null|number, qty:number, premium:null|number }
 * - currency?: ISO code (default "USD")
 * - onChange?: (updatedLegs) => void
 * - canEditVolume?: boolean (default false)
 * - showNetPremium?: boolean (default false) — renders a one-line total if desired
 */
export default function StrategyConfigTable({
  legs = {},
  currency = "USD",
  onChange,
  canEditVolume = false,
  showNetPremium = false,
}) {
  const [rows, setRows] = useState(() => ({ lc: legs.lc, sc: legs.sc, lp: legs.lp, sp: legs.sp }));

  useEffect(() => {
    setRows({ lc: legs.lc, sc: legs.sc, lp: legs.lp, sp: legs.sp });
  }, [legs?.lc, legs?.sc, legs?.lp, legs?.sp]);

  const order = ["lc", "sc", "lp", "sp"].filter(
    (k) => rows?.[k] && (rows[k].qty !== 0 || rows[k].enabled || rows[k].K != null)
  );

  const total = useMemo(() => netPremium(rows), [rows]);

  function updateLeg(key, field, value) {
    setRows((prev) => {
      const next = { ...prev, [key]: { ...(prev?.[key] || { qty: 0 }) } };
      if (field === "K") next[key].K = numOrNull(value);
      else if (field === "premium") next[key].premium = numOrNull(value);
      else if (field === "qty") {
        const n = Number(value);
        next[key].qty = Number.isFinite(n) ? n : (prev?.[key]?.qty ?? 0);
      }
      onChange?.(next);
      return next;
    });
  }

  return (
    <div className="cfg">
      <div className="row header">
        <div>Position</div>
        <div>Strike</div>
        <div>Volume</div>
        <div>Premium</div>
      </div>

      {order.length === 0 && (
        <div className="empty">Select a strategy to configure its legs.</div>
      )}

      {order.map((k) => {
        const leg = rows[k] || {};
        return (
          <div className="row" key={k}>
            <div className="pos">{LABEL[k]}</div>

            <div>
              <input
                className="field"
                placeholder="—"
                value={leg.K ?? ""}
                onChange={(e) => updateLeg(k, "K", e.target.value)}
                inputMode="decimal"
              />
            </div>

            <div className={`vol ${canEditVolume ? "" : "ro"}`}>
              {canEditVolume ? (
                <input
                  className="field"
                  value={leg.qty ?? 0}
                  onChange={(e) => updateLeg(k, "qty", e.target.value)}
                  inputMode="numeric"
                />
              ) : (
                <span>{Number(leg.qty ?? 0)}</span>
              )}
            </div>

            <div>
              <input
                className="field"
                placeholder="—"
                value={leg.premium ?? ""}
                onChange={(e) => updateLeg(k, "premium", e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
        );
      })}

      {showNetPremium && (
        <div className="footer">
          <div className="np-label">Net Premium:</div>
          <div className="np-value">
            {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(total || 0)}
          </div>
        </div>
      )}

      <style jsx>{`
        .cfg { margin-top: 4px; }
        .row {
          display: grid;
          grid-template-columns: 1.4fr 1.1fr 0.9fr 1.1fr; /* matches Summary */
          gap: 10px;
          align-items: center;
          padding: 6px 0;
        }
        .row.header { font-size: 12px; opacity: 0.75; padding-top: 0; }
        .pos { font-weight: 600; }
        .field {
          height: 34px; width: 100%;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          border-radius: 8px;
          padding: 0 10px;
        }
        .vol.ro { opacity: 0.85; }
        .empty {
          margin: 8px 0 6px; padding: 10px;
          border: 1px dashed var(--border); border-radius: 8px;
          opacity: 0.8;
        }
        .footer {
          display: flex; justify-content: flex-end; gap: 8px;
          padding-top: 8px; margin-top: 6px;
          border-top: 1px solid var(--border);
        }
        .np-label { font-size: 12px; opacity: 0.7; }
        .np-value { font-weight: 700; }
      `}</style>
    </div>
  );
}
