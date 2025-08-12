// components/Options/ExpiryStrip.jsx
"use client";

import { useMemo } from "react";

/**
 * ExpiryStrip
 * Props:
 *  - expiries: array of Date | string (YYYY-MM-DD). Optional; if empty, a fallback demo set is shown
 *  - value: string (YYYY-MM-DD) currently selected
 *  - onChange: (value: string) => void
 */
export default function ExpiryStrip({ expiries = [], value = null, onChange }) {
  // --- helpers ---
  const toKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;

  const parseDate = (v) => {
    if (v instanceof Date) return v;
    // tolerant parser for YYYY-MM-DD
    const m = String(v || "").match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(v);
    return Number.isFinite(d?.getTime()) ? d : null;
  };

  // --- fallback demo (when no data yet) ---
  const fallback = useMemo(() => {
    // matches your screenshot order
    const demo = [
      ["Aug", [15, 22, 29]],
      ["Sep", [5, 12, 19, 26]],
      ["Oct", [17]],
      ["Nov", [21]],
      ["Dec", [19]],
      ["Jan ’26", [16]],
      ["Feb", [20]],
      ["Mar", [20]],
      ["May", [15]],
      ["Jun", [18]],
      ["Aug", [21]],
      ["Sep", [18]],
      ["Dec", [18]],
      ["Jan ’27", [15]],
      ["Jun", [17]],
      ["Dec", [17]],
    ];

    // anchor everything to this year just to have stable keys
    const now = new Date();
    const y = now.getFullYear();

    let month = now.getMonth(); // just progress months so keys are unique
    const groups = demo.map(([label, days]) => {
      const g = {
        label,
        days: days.map((d) => {
          const dt = new Date(y, month, d);
          month = (month + 1) % 12; // progress a bit so keys don't collide
          return { key: toKey(dt), day: d };
        }),
      };
      return g;
    });
    return groups;
  }, []);

  // --- real grouping (when expiries is provided) ---
  const grouped = useMemo(() => {
    if (!Array.isArray(expiries) || expiries.length === 0) return fallback;

    const byMonth = new Map();
    for (const raw of expiries) {
      const d = parseDate(raw);
      if (!d) continue;
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const monthLabel = d.toLocaleString(undefined, {
        month: "short",
        year: "2-digit",
      });
      if (!byMonth.has(monthKey))
        byMonth.set(monthKey, { label: monthLabel, days: [] });
      byMonth.get(monthKey).days.push({ key: toKey(d), day: d.getDate() });
    }

    // sort months and days
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([_, g]) => ({
        label: g.label,
        days: g.days.sort((a, b) => a.day - b.day),
      }));
  }, [expiries, fallback]);

  const selectedKey = useMemo(() => {
    const d = parseDate(value);
    return d ? toKey(d) : null;
  }, [value]);

  return (
    <div className="strip" role="group" aria-label="Option expirations">
      {grouped.map((g, i) => (
        <div className="month" key={`m-${i}`}>
          <div className="label">{g.label}</div>
          <div className="days">
            {g.days.map((d) => {
              const active = d.key === selectedKey;
              return (
                <button
                  key={d.key}
                  type="button"
                  className={`chip ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => onChange?.(d.key)}
                >
                  {d.day}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <style jsx>{`
        .strip {
          display: flex;
          gap: 28px;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 6px 2px 2px;
          white-space: nowrap; /* prevents wrapping to a second row */
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        .strip::-webkit-scrollbar {
          height: 8px;
        }
        .strip::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 8px;
        }

        .month {
          display: inline-flex;
          flex-direction: column;
          align-items: flex-start;
          min-width: max-content;
        }
        .label {
          font-size: 14px;
          font-weight: 800;
          color: var(--text);
          opacity: 0.9;
          padding-bottom: 8px;
          position: relative;
          margin-bottom: 8px;
        }
        .label::after {
          content: "";
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px;
          background: var(--border);
          opacity: 0.9;
        }
        .days {
          display: inline-flex;
          gap: 10px;
        }
        .chip {
          height: 34px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--card, #f4f5f6);
          color: var(--text);
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 120ms ease, background 120ms ease;
        }
        .chip:hover {
          transform: translateY(-1px);
          background: rgba(0, 0, 0, 0.04);
        }
        .chip.is-active {
          background: var(--text);
          color: var(--bg, #fff);
          border-color: var(--text);
        }
      `}</style>
    </div>
  );
}
