// components/Strategy/ui/BreakEvenBadges.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * <BreakEvenBadges />
 * Lightweight presentation for one or two break-even levels.
 *
 * Props:
 * - be: number | number[] | null    // break-even(s); null/[] => "—"
 * - currency?: string               // "USD"|"EUR"|"GBP"|"JPY"|..., default "USD"
 * - loading?: boolean               // fades values slightly when fetching
 * - label?: string                  // left label, default "Break-even"
 * - precision?: number              // decimals, default 2
 * - className?: string
 *
 * Usage:
 *   <BreakEvenBadges be={[375.5, 422.3]} currency="USD" loading={false} />
 */

const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : ccy === "CHF" ? "CHF " :
  ccy === "CAD" ? "C$" : ccy === "AUD" ? "A$" : ccy === "GBP" ? "£" : "$";

const toNum = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

function fmtMoney(n, ccy = "USD", precision = 2) {
  const sign = moneySign(ccy);
  try {
    return sign + Number(n).toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  } catch {
    return sign + Number(n).toFixed(precision);
  }
}

export default function BreakEvenBadges({
  be,
  currency = "USD",
  loading = false,
  label = "Break-even",
  precision = 2,
  className = "",
}) {
  // normalize to sorted unique array (0..2 items expected)
  const values = useMemo(() => {
    const arr = Array.isArray(be) ? be : be == null ? [] : [be];
    const nums = arr
      .map(toNum)
      .filter((x) => x != null)
      .sort((a, b) => a - b);
    // dedupe tiny numeric noise
    const out = [];
    for (const v of nums) if (!out.length || Math.abs(out[out.length - 1] - v) > 1e-9) out.push(v);
    return out;
  }, [be]);

  // pulse on change (subtle)
  const [pulse, setPulse] = useState(false);
  const prevKeyRef = useRef("");
  const key = values.join("|");
  useEffect(() => {
    if (prevKeyRef.current && prevKeyRef.current !== key) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 480);
      return () => clearTimeout(t);
    }
    prevKeyRef.current = key;
  }, [key]);

  const chipClass = `be-chip${pulse ? " pulse" : ""}`;
  const isPending = loading ? " is-pending" : "";

  return (
    <div className={`be-wrap ${className}`}>
      <div className="be-label">{label}</div>
      <div className={`be-row${isPending}`}>
        {values.length === 0 && <span className="be-empty">—</span>}

        {values.length === 1 && (
          <span className={chipClass} title="Break-even">
            <span className="k">BE</span>
            <span className="v">{fmtMoney(values[0], currency, precision)}</span>
          </span>
        )}

        {values.length === 2 && (
          <>
            <span className={chipClass} title="Lower break-even">
              <span className="k">Lower</span>
              <span className="v">{fmtMoney(values[0], currency, precision)}</span>
            </span>
            <span className={chipClass} title="Upper break-even">
              <span className="k">Upper</span>
              <span className="v">{fmtMoney(values[1], currency, precision)}</span>
            </span>
          </>
        )}
      </div>

      <style jsx>{`
        .be-wrap{
          display:grid;
          grid-template-columns: 1fr auto;
          align-items:center;
          gap:12px;
          width:100%;
        }
        .be-label{
          font-size:12px; color:var(--muted);
          letter-spacing:.2px;
        }
        .be-row{
          display:flex; align-items:center; justify-content:flex-end;
          gap:8px; flex-wrap:wrap;
          transition: opacity .15s ease;
        }
        .be-row.is-pending{ opacity:.92; }

        .be-empty{
          font-weight:600; opacity:.7;
        }

        .be-chip{
          display:inline-flex; align-items:center; gap:8px;
          height:30px; padding:0 12px;
          border-radius:9999px;
          border:1px solid var(--border);
          background:var(--bg);
          color:var(--text);
          font-size:12px;
          box-shadow: 0 1px 0 rgba(0,0,0,.04);
          transition: transform .12s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease, filter .12s ease;
        }
        .be-chip:hover{
          background:var(--card);
          border-color: color-mix(in srgb, var(--text) 14%, var(--border));
          box-shadow: var(--shadow-soft);
          transform: translateY(-1px);
        }
        .be-chip:active{
          transform: translateY(0);
          filter: brightness(.98);
        }
        .be-chip:focus{
          outline: var(--focus-w) solid var(--accent);
          outline-offset: 2px;
        }
        .be-chip.pulse{
          animation: bePulse .38s ease-out;
        }
        @keyframes bePulse{
          0%{ transform: scale(.98); box-shadow: 0 0 0 0 rgba(0,122,255,.08); }
          100%{ transform: scale(1); box-shadow: 0 0 0 0 rgba(0,122,255,0); }
        }

        .k{
          font-weight:600; letter-spacing:.2px; opacity:.85;
        }
        .v{
          font-variant-numeric: tabular-nums;
          font-weight:700;
          white-space:nowrap;
        }

        @media (prefers-color-scheme: light){
          .be-chip{
            background:#fff; color:#111827; border:1px solid var(--border, #e5e7eb);
          }
          .be-chip:hover{
            border-color:#a3a3a3;
          }
        }
      `}</style>
    </div>
  );
}
