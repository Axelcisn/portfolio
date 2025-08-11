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
 * Row shape:
 * { id, type: 'lc'|'sc'|'lp'|'sp'|'ls'|'ss', K: number|null, premium: number|null,
 *   qty: number, days: number|null, enabled: boolean }
 *
 * Notes
 * - For stock rows (ls/ss) `K` acts as entry price; `days` is ignored (disabled).
 */
export default function PositionBuilder({
  rows: rowsProp = [],
  onChange,
  currency = "USD",
  defaultDays = 30,
}) {
  const [rows, setRows] = useState(() =>
    (rowsProp && rowsProp.length ? rowsProp : []).map((r) => ({
      id: r.id ?? uid(),
      enabled: r.enabled ?? true,
      qty: Math.max(1, Number(r.qty ?? 1)),
      ...r,
    }))
  );

  // sync from parent if it replaces rows
  useEffect(() => {
    if (rowsProp) {
      setRows(
        rowsProp.map((r) => ({
          id: r.id ?? uid(),
          enabled: r.enabled ?? true,
          qty: Math.max(1, Number(r.qty ?? 1)),
          ...r,
        }))
      );
    }
  }, [rowsProp?.length]);

  useEffect(() => {
    onChange?.(rows);
  }, [rows, onChange]);

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
    () => ["Strike", "Type", "Expiration", "Volume", "Premium"],
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

      {rows.map((r) => {
        const isStock = r.type === "ls" || r.type === "ss";
        return (
          <div key={r.id} className="grid row">
            {/* Strike / Entry price */}
            <div>
              <input
                className="field"
                placeholder={isStock ? "Entry price" : "Strike"}
                inputMode="decimal"
                step="0.01"
                value={r.K ?? ""}
                onChange={(e) =>
                  setRow(r.id, { K: e.target.value === "" ? null : Number(e.target.value) })
                }
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
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Expiration (days) — disabled for stock */}
            <div>
              <input
                className="field"
                placeholder="days"
                inputMode="numeric"
                min={1}
                step={1}
                disabled={isStock}
                value={
                  isStock
                    ? ""
                    : Number.isFinite(r.days)
                    ? r.days
                    : (defaultDays ?? 30)
                }
                onChange={(e) =>
                  setRow(r.id, {
                    days: e.target.value === "" ? null : Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </div>

            {/* Volume (lots/shares) */}
            <div>
              <input
                className="field"
                inputMode="numeric"
                min={1}
                step={1}
                value={r.qty ?? 1}
                onChange={(e) =>
                  setRow(r.id, {
                    qty: Math.max(1, Number(e.target.value || 1)),
                  })
                }
              />
            </div>

            {/* Premium */}
            <div>
              <input
                className="field"
                placeholder={currency}
                inputMode="decimal"
                step="0.01"
                value={r.premium ?? ""}
                onChange={(e) =>
                  setRow(r.id, {
                    premium: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>

            {/* Row actions: improved trash icon */}
            <div className="end">
              <button
                className="icon"
                title="Remove position"
                aria-label="Remove position"
                onClick={() => removeRow(r.id)}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  {/* Trash can with lid (clean outline) */}
                  <path
                    d="M9 3.5h6m-9 3h12M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7M9 7l1-3h4l1 3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path d="M10 10v7M14 10v7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}

      {/* Add new position */}
      <div className="add">
        <button className="addBtn" onClick={addRow}>+ New position</button>
      </div>

      <style jsx>{`
        .pb { display: grid; gap: 8px; }
        .grid {
          display: grid;
          grid-template-columns: 1.2fr 1.3fr 0.9fr 0.8fr 1.0fr 40px; /* + actions */
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
          display: inline-flex; align-items: center; justify-content: center;
          transition: background .15s ease, border-color .15s ease, transform .08s ease;
        }
        .icon:hover { background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.45); color: #ef4444; }
        .icon:active { transform: translateY(1px); }
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
