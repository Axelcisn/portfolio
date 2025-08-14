// components/Strategy/BreakEvenBadge.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import rowsToApiLegs from "./hooks/rowsToApiLegs";

function fmtPrice(x, ccy = "USD") {
  if (!Number.isFinite(x)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(x);
  } catch {
    return Number(x).toFixed(2);
  }
}

// simple best-effort guesser (used only if parent does not pass strategy)
function guessStrategyKey(rows = []) {
  const nz = rows.filter(r => Number(r?.qty || 0) !== 0);
  const only = (t) => nz.filter(r => r?.type === t);
  const has = (t) => only(t).length > 0;

  if (only("lc").length === 1 && nz.length === 1) return "long_call";
  if (only("lp").length === 1 && nz.length === 1) return "long_put";
  if (only("sc").length === 1 && nz.length === 1) return "short_call";
  if (only("sp").length === 1 && nz.length === 1) return "short_put";

  if (has("lc") && has("sc")) {
    const Klong  = Number(rows.find(r=>r.type==="lc")?.K);
    const Kshort = Number(rows.find(r=>r.type==="sc")?.K);
    if (Number.isFinite(Klong) && Number.isFinite(Kshort)) {
      if (Kshort > Klong) return "bull_call_spread";
      if (Kshort < Klong) return "bear_call_spread";
    }
  }
  if (has("lp") && has("sp")) {
    const Klong  = Number(rows.find(r=>r.type==="lp")?.K);
    const Kshort = Number(rows.find(r=>r.type==="sp")?.K);
    if (Number.isFinite(Klong) && Number.isFinite(Kshort)) {
      if (Klong > Kshort) return "bear_put_spread";
      if (Klong < Kshort) return "bull_put_spread";
    }
  }
  if (only("sc").length === 1 && only("sp").length === 1) return "short_strangle";

  return null;
}

export default function BreakEvenBadge({
  rows,
  strategy = null,
  currency = "USD",
  contractSize = 1,
}) {
  const [state, setState] = useState({ loading: false, be: null, error: null, meta: null });
  const acRef = useRef(null);
  const seqRef = useRef(0);

  const legs = useMemo(() => rowsToApiLegs(rows || []), [rows]);
  const strategyKey = useMemo(() => {
    if (strategy && String(strategy).trim()) return String(strategy);
    return guessStrategyKey(rows || []);
  }, [strategy, rows]);

  useEffect(() => {
    const run = async () => {
      if (!strategyKey) {
        setState({ loading: false, be: null, error: "strategy_unavailable", meta: null });
        return;
      }
      try { acRef.current?.abort(); } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      const mySeq = ++seqRef.current;
      setState(s => ({ ...s, loading: true, error: null }));

      await new Promise(r => setTimeout(r, 150));
      if (ac.signal.aborted || mySeq !== seqRef.current) return;

      try {
        const res = await fetch("/api/strategy/breakeven", {
          method: "POST",
          cache: "no-store",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy: strategyKey, legs, contractSize }),
        });
        const j = await res.json();
        if (ac.signal.aborted || mySeq !== seqRef.current) return;

        const be = Array.isArray(j?.be) ? j.be : Array.isArray(j?.data?.be) ? j.data.be : null;
        const meta = j?.meta ?? j?.data?.meta ?? null;

        if (!res.ok || j?.ok === false || !Array.isArray(be) || be.length === 0) {
          setState({ loading: false, be: null, error: j?.error || "unavailable", meta });
        } else {
          setState({ loading: false, be, error: null, meta });
        }
      } catch (e) {
        if (!ac.signal.aborted) setState({ loading: false, be: null, error: String(e?.message || e), meta: null });
      }
    };
    run();
    return () => { try { acRef.current?.abort(); } catch {} };
  }, [legs, contractSize, strategyKey]);

  if (state.loading) return <span className="muted">—</span>;
  if (state.error || !Array.isArray(state.be) || state.be.length === 0) {
    return <span className="err">Break-even unavailable for current legs.</span>;
  }
  // KPI shows at most one or two values; for long call we'll have one.
  const [a, b] = state.be;
  return (
    <span className="be-badge">
      {Number.isFinite(a) && !Number.isFinite(b) && fmtPrice(a, currency)}
      {Number.isFinite(a) && Number.isFinite(b) &&
        `${fmtPrice(a, currency)} | ${fmtPrice(b, currency)}`}
      <style jsx>{`
        .be-badge { font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
        .muted { color: var(--muted); }
        .err { color: #ef4444; font-weight: 600; white-space: nowrap; }
      `}</style>
    </span>
  );
}
