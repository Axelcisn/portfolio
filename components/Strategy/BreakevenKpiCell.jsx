// components/Strategy/BreakevenKpiCell.jsx
"use client";

import { useMemo } from "react";
import * as be from "../../lib/strategy/breakeven.js";

/* ---------- helpers ---------- */
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";
const isNum = (x) => Number.isFinite(Number(x));
const fmt = (v, ccy) => (isNum(v) ? `${moneySign(ccy)}${Number(v).toFixed(2)}` : "—");
const toNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Convert PositionBuilder rows (lc/sc/lp/sp/ls/ss) ➜ lib legs */
function rowsToLibLegs(rows = []) {
  const out = [];
  for (const r of rows || []) {
    const t = String(r?.type || "").toLowerCase();
    const qty = toNum(r?.qty) ?? 1;
    const K = toNum(r?.K ?? r?.strike);
    const prem = toNum(r?.premium);

    if (t === "lc") out.push({ kind: "call", side: "long", strike: K, premium: prem, qty });
    else if (t === "sc") out.push({ kind: "call", side: "short", strike: K, premium: prem, qty });
    else if (t === "lp") out.push({ kind: "put",  side: "long", strike: K, premium: prem, qty });
    else if (t === "sp") out.push({ kind: "put",  side: "short", strike: K, premium: prem, qty });
    else if (t === "ls") {
      // Stock basis goes in `premium` for the lib’s stock leg
      const price = toNum(r?.price ?? r?.premium ?? r?.K);
      out.push({ kind: "stock", side: "long", premium: price, qty });
    } else if (t === "ss") {
      const price = toNum(r?.price ?? r?.premium ?? r?.K);
      out.push({ kind: "stock", side: "short", premium: price, qty });
    }
  }
  return out;
}

/** Legacy adapter (in case an older lib variant is present) */
function rowsToLegacyObject(rows = []) {
  const out = {
    lc: { enabled: false, K: null, qty: 0, premium: null },
    sc: { enabled: false, K: null, qty: 0, premium: null },
    lp: { enabled: false, K: null, qty: 0, premium: null },
    sp: { enabled: false, K: null, qty: 0, premium: null },
  };
  for (const r of rows) {
    if (!r?.type || !(r.type in out)) continue;
    const K = toNum(r.K);
    const qty = toNum(r.qty) ?? 0;
    const prem = toNum(r.premium);
    out[r.type] = { enabled: qty !== 0 && isNum(K), K, qty, premium: prem };
  }
  return out;
}

/** Try all known lib entry points */
function pickFallbackFn() {
  return (
    be.computeBreakEvenFromRows ||
    be.computeBreakEven ||
    be.calcBreakEven ||
    be.breakEvenFromRows ||
    be.breakEven ||
    null
  );
}

/**
 * Props:
 *  - rows
 *  - currency
 *  - className
 */
export default function BreakevenKpiCell({ rows, currency = "USD", className = "" }) {
  const result = useMemo(() => {
    if (!rows || rows.length === 0) return { kind: "empty" };

    const legs = rowsToLibLegs(rows);

    // 1) Prefer the new API
    try {
      if (typeof be.computeBreakEvens === "function") {
        const out = be.computeBreakEvens(legs);
        const arr = Array.isArray(out?.be)
          ? out.be
          : Array.isArray(out)
          ? out
          : Array.isArray(out?.value)
          ? out.value
          : null;

        if (Array.isArray(arr) && arr.some(isNum)) {
          return { kind: "ok", be: arr.filter(isNum).slice(0, 2) };
        }
      }
    } catch (e) {
      // fall through to legacy
    }

    // 2) Legacy fallbacks (older libs)
    try {
      const fn = pickFallbackFn();
      if (fn) {
        const maybe =
          fn(rows, { allowApprox: true, tolerateMissing: true }) ??
          fn(rowsToLegacyObject(rows), { allowApprox: true, tolerateMissing: true });

        const arr = Array.isArray(maybe)
          ? maybe
          : Array.isArray(maybe?.be)
          ? maybe.be
          : Array.isArray(maybe?.value)
          ? maybe.value
          : null;

        if (Array.isArray(arr) && arr.some(isNum)) {
          return { kind: "ok", be: arr.filter(isNum).slice(0, 2) };
        }
      }
    } catch (e) {
      return { kind: "error", reason: String(e?.message || e) };
    }

    return { kind: "unavailable", reason: "No compatible break-even function." };
  }, [rows]);

  if (result.kind === "ok") {
    const [a, b] = result.be;
    return (
      <div className={`be-kpi ${className}`}>
        {isNum(a) && !isNum(b) && <span className="v">{fmt(a, currency)}</span>}
        {isNum(a) && isNum(b) && (
          <span className="v">
            {fmt(a, currency)} <span className="sep">|</span> {fmt(b, currency)}
          </span>
        )}
        <style jsx>{`
          .be-kpi { min-width: 0; }
          .v { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
          .sep { opacity: .55; padding: 0 4px; }
        `}</style>
      </div>
    );
  }

  if (result.kind === "unavailable" || result.kind === "error") {
    return (
      <div className={`be-kpi ${className}`}>
        <span className="be-err">Break-even unavailable for current legs.</span>
        <style jsx>{`
          .be-err { color: #ef4444; font-weight: 600; font-size: .95rem; white-space: nowrap; }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`be-kpi ${className}`}>
      <span className="muted" title="Add valid legs to compute break-even.">—</span>
      <style jsx>{`.muted{ color: var(--muted); }`}</style>
    </div>
  );
}
