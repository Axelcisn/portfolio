// components/Strategy/PositionBuilder.jsx
"use client";

import { useEffect, useMemo, useState } from "react";

const TYPE_OPTIONS = [
  { value: "lc", label: "Long Call" },
  { value: "sc", label: "Short Call" },
  { value: "lp", label: "Long Put" },
  { value: "sp", label: "Short Put" },
  { value: "ls", label: "Long Stock" },
  { value: "ss", label: "Short Stock" },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Row shape we emit/consume:
 * { id, type: 'lc'|'sc'|'lp'|'sp'|'ls'|'ss', K: number|null, premium: number|null,
 *   qty: number, days: number|null, enabled: boolean }
 *
 * Notes
 * - For stock rows (ls/ss) `K` acts as the entry **price**.
 * - `days` is days to expiration; for stock rows it may be null and is ignored.
 */
export default function PositionBuilder({
  rows: rowsProp = [],
  onChange,
  currency = "USD",
  defaultDays = 30,   // fallback if not provided by the page
}) {
  const [rows, setRows] = useState(() =>
    (rowsProp && rowsProp.length ? rowsProp : [])
      .map((r) => ({ id: r.id ?? uid(), enabled: true, qty: 1, ...r }))
  );

  useEffect(() => {
    // keep in sync if parent replaces rows
    if (rowsProp) {
      setRows(
        rowsProp.map((r) => ({ id: r.id ?? uid(), enabled: r.enabled ?? true, qty: r.qty ?? 1, ...r }))
      );
    }
  }, [rowsProp?.length]);

  useEffect(() => { onChange?.(rows); }, [rows]);

  function setRow(id, patch) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: uid(),
        type: "lc",
        K: null,
        premium: null,
        qty: 1,
        days: defaultDays ?? 30,
        enabled: true,
      },
    ]);
  }

  const headerCols = useMemo(
    () => ["Strike", "Type", "Expiration", "Premium"],
    []
  );

  return (
    <div className="pb">
      {/* Header */}
      <div className="grid head">
        {headerCols.map((h) => (
          <div key={h} className="th">{h}</div>
        ))}
        <div className="th end" aria-hidden />
      </div>

      {/* Rows */}
      {rows.length === 0 && (
        <div className="empty">No positions yet. Use “+ New position”.</div>
      )}

      {rows.map((r) => (
        <div key={r.id} className="grid row">
          {/* Strike / Price */}
          <div>
            <input
              className="field"
              placeholder={r.type === "ls" || r.type === "ss" ? "Entry price" : "Strike"}
              inputMode="decimal"
              value={r.K ?? ""}
              onChange={(e) => setRow(r.id, { K: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>

          {/* Type */}
          <div>
            <select
              className="field"
              value={r.type}
              onChange={(e) => setRow(r.id, { type: e.target.value })}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Expiration (days) — disabled for stock */}
          <div>
            <input
              className="field"
              placeholder="days"
              inputMode="numeric"
              disabled={r.type === "ls" || r.type === "ss"}
              value={
                r.type === "ls" || r.type === "ss"
                  ? ""
                  : (Number.isFinite(r.days) ? r.days : (defaultDays ?? 30))
              }
              onChange={(e) => setRow(r.id, { days: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>

          {/* Premium */}
          <div>
            <input
              className="field"
              placeholder={currency}
              inputMode="decimal"
              value={r.premium ?? ""}
              onChange={(e) => setRow(r.id, { premium: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>

          {/* Row actions */}
          <div className="end">
            <button className="icon" onClick={() => removeRow(r.id)} aria-label="Remove position">
              <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M6 7h12M10 7v10m4-10v10M9 7l1-2h4l1 2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Add new position */}
      <div className="add">
        <button className="addBtn" onClick={addRow}>+ New position</button>
      </div>

      <style jsx>{`
        .pb { display: grid; gap: 8px; }
        .grid {
          display: grid;
          grid-template-columns: 1.2fr 1.3fr 1.0fr 1.0fr 40px;
          gap: 10px;
          align-items: center;
        }
        .head { font-size: 12px; opacity: 0.75; }
        .th.end { text-align: right; }
        .row { }
        .end { display: flex; justify-content: flex-end; }
        .field {
          height: 36px; width: 100%;
          border: 1px solid var(--border);
          background: var(--bg);
          color: var(--text);
          border-radius: 8px;
          padding: 0 10px;
        }
        .icon {
          width: 32px; height: 32px; border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card); color: var(--text);
        }
        .add { display: flex; justify-content: center; }
        .addBtn {
          width: 100%; max-width: 520px; height: 36px;
          border: 1px dashed var(--border);
          background: transparent; color: var(--text);
          border-radius: 10px;
        }
        .empty {
          padding: 10px;
          border: 1px dashed var(--border);
          border-radius: 10px;
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
