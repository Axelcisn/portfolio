// components/Strategy/BreakevenKpiCell.jsx
"use client";

import { useMemo } from "react";
import * as be from "../../lib/strategy/breakeven.js";

/* ---------- helpers ---------- */
const moneySign = (ccy) =>
  ccy === "EUR" ? "€" : ccy === "GBP" ? "£" : ccy === "JPY" ? "¥" : "$";

const isNum = (x) => Number.isFinite(Number(x));
const fmt = (v, ccy) => (isNum(v) ? `${moneySign(ccy)}${Number(v).toFixed(2)}` : "—");

/** Builder rows -> lib legs: [{ kind, side, strike, premium, qty }] */
function rowsToLibLegs(rows = []) {
  const out = [];
  for (const r of rows) {
    if (!r) continue;
    const t = String(r.type || "").toLowerCase();

    let kind = null, side = null;
    if (t === "lc" || t.includes("long call"))  { kind = "call"; side = "long"; }
    else if (t === "sc" || t.includes("short call")) { kind = "call"; side = "short"; }
    else if (t === "lp" || t.includes("long put"))  { kind = "put";  side = "long"; }
    else if (t === "sp" || t.includes("short put")) { kind = "put";  side = "short"; }
    else if (t === "ls" || t.includes("long stock"))  { kind = "stock"; side = "long"; }
    else if (t === "ss" || t.includes("short stock")) { kind = "stock"; side = "short"; }
    else continue;

    const strike  = Number(r.K ?? r.strike);
    const premium = Number(r.premium);
    const qty     = Number.isFinite(Number(r.qty)) ? Math.max(0, Number(r.qty)) : 1;

    if (kind === "stock") {
      const price = Number(r.price ?? r.premium);
      out.push({ kind, side, qty, ...(Number.isFinite(price) ? { premium: Number(price) } : {}) });
    } else {
      out.push({
        kind, side, qty,
        strike: Number.isFinite(strike) ? Number(strike) : null,
        ...(Number.isFinite(premium) ? { premium: Number(premium) } : {}),
      });
    }
  }
  return out;
}

/** Fallback adapter for libs that expect { lc/sc/lp/sp } buckets */
function rowsToBuckets(rows = []) {
  const out = {
    lc: { enabled: false, K: null, qty: 0, premium: null },
    sc: { enabled: false, K: null, qty: 0, premium: null },
    lp: { enabled: false, K: null, qty: 0, premium: null },
    sp: { enabled: false, K: null, qty: 0, premium: null },
  };
  for (const r of rows || []) {
    const t = String(r?.type || "").toLowerCase();
    if (!(t in out)) continue;
    const K = Number(r.K);
    const qty = Number(r.qty || 0);
    const prem = Number.isFinite(Number(r.premium)) ? Number(r.premium) : null;
    out[t] = {
      enabled: qty !== 0 && Number.isFinite(K),
      K: Number.isFinite(K) ? K : null,
      qty,
      premium: prem,
    };
  }
  return out;
}

/** Try to find any BE function the lib may export */
function pickLegacyFn() {
  return (
    be.computeBreakEvenFromRows ||
    be.computeBreakEven ||
    be.calcBreakEven ||
    be.breakEvenFromRows ||
    be.breakEven ||
    null
  );
}

export default function BreakevenKpiCell({ rows, currency = "USD", className = "" }) {
  const result = useMemo(() => {
    if (!rows || !rows.length) return { kind: "empty" };

    try {
      // 1) Preferred path: new lib API
      if (typeof be.computeBreakEvens === "function") {
        const legs = rowsToLibLegs(rows);
        const out = be.computeBreakEvens(legs);
        const arr = Array.isArray(out?.be) ? out.be : Array.isArray(out) ? out : null;
        if (arr && arr.some(isNum)) {
          return { kind: "ok", be: arr.filter(isNum).slice(0, 2) };
        }
      }

      // 2) Fallback to any legacy function
      const legacy = pickLegacyFn();
      if (legacy) {
        const maybe =
          legacy(rows, { allowApprox: true, tolerateMissing: true }) ??
          legacy(rowsToBuckets(rows), { allowApprox: true, tolerateMissing: true });

        const beArr = Array.isArray(maybe)
          ? maybe
          : Array.isArray(maybe?.be)
          ? maybe.be
          : Array.isArray(maybe?.value)
          ? maybe.value
          : null;

        if (beArr && beArr.some(isNum)) {
          return { kind: "ok", be: beArr.filter(isNum).slice(0, 2) };
        }
      }

      return { kind: "unavailable", reason: "No compatible break-even function found." };
    } catch (e) {
      return { kind: "error", reason: String(e?.message || e) };
    }
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
          .v { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
          .sep { opacity: .55; padding: 0 4px; }
          .be-kpi { min-width: 0; }
        `}</style>
      </div>
    );
  }

  if (result.kind === "unavailable" || result.kind === "error") {
    return (
      <div className={`be-kpi ${className}`}>
        <span className="be-err">Break-even unavailable for current legs.</span>
        <style jsx>{`
          .be-err { color: #ef4444; font-weight: 600; font-size: 0.95rem; white-space: nowrap; }
        `}</style>
      </div>
    );
  }

  return (
    <div className={`be-kpi ${className}`}>
      <span className="muted" title="Add valid legs to compute break-even.">—</span>
      <style jsx>{`.muted { color: var(--muted); }`}</style>
    </div>
  );
}
