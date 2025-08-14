// components/Strategy/BreakevenPanel.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import rowsToApiLegs from "./hooks/rowsToApiLegs";

/* ------------ strategy alias handling ------------ */
const STRAT_ALIASES = Object.freeze({
  // single legs
  longcall: "long_call",
  long_call: "long_call",
  shortcall: "short_call",
  short_call: "short_call",
  longput: "long_put",
  long_put: "long_put",
  shortput: "short_put",
  short_put: "short_put",

  // simple spreads
  bullcallspread: "bull_call_spread",
  bull_call_spread: "bull_call_spread",
  bearcallspread: "bear_call_spread",
  bear_call_spread: "bear_call_spread",
  bullputspread: "bull_put_spread",
  bull_put_spread: "bull_put_spread",
  bearputspread: "bear_put_spread",
  bear_put_spread: "bear_put_spread",

  // multi-leg
  longstraddle: "long_straddle",
  long_straddle: "long_straddle",
  shortstraddle: "short_straddle",
  short_straddle: "short_straddle",
  longstrangle: "long_strangle",
  long_strangle: "long_strangle",
  shortstrangle: "short_strangle",
  short_strangle: "short_strangle",
  ironcondor: "iron_condor",
  iron_condor: "iron_condor",
  ironbutterfly: "iron_butterfly",
  iron_butterfly: "iron_butterfly",
  callratio: "call_ratio",
  call_ratio: "call_ratio",
  putratio: "put_ratio",
  put_ratio: "put_ratio",
  collar: "collar",
  callcalendar: "call_calendar",
  call_calendar: "call_calendar",
  putcalendar: "put_calendar",
  put_calendar: "put_calendar",
  longbox: "long_box",
  long_box: "long_box",
  shortbox: "short_box",
  short_box: "short_box",
  leaps: "long_call", // treat LEAPS like a long call for BE purposes
});

function normalizeStrategyKey(x) {
  if (!x) return null;
  const s = String(x).toLowerCase().replace(/\s+/g, "").replace(/-/g, "");
  return STRAT_ALIASES[s] ?? null;
}

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

/** If a straddle was chosen but strikes differ, use the correct *strangle* key. */
function disambiguateStraddle(key, legs) {
  if (key !== "short_straddle" && key !== "long_straddle") return key;

  const side = key.startsWith("short") ? "short" : "long";
  const callK = legs
    .filter((l) => l.type === "call" && l.side === side && Number.isFinite(l?.strike))
    .map((l) => Number(l.strike));
  const putK = legs
    .filter((l) => l.type === "put" && l.side === side && Number.isFinite(l?.strike))
    .map((l) => Number(l.strike));

  if (callK.length && putK.length) {
    const diff = Math.abs(callK[0] - putK[0]);
    if (diff > 1e-6) {
      return side === "short" ? "short_strangle" : "long_strangle";
    }
  }
  return key;
}

export default function BreakevenPanel({
  rows,
  strategy = null,     // explicit strategy id/name (optional)
  spot = null,         // if present, show distance from spot
  currency = "USD",
  contractSize = 1,    // reserved for futures/FX, 1 for equities
}) {
  const [state, setState] = useState({ loading: false, be: null, error: null, meta: null });
  const acRef = useRef(null);
  const seqRef = useRef(0);

  // single source of truth for leg mapping
  const legs = useMemo(() => rowsToApiLegs(rows), [rows]);

  // normalize strategy; if unknown we'll omit it (server will infer)
  const normalizedStrategy = useMemo(() => normalizeStrategyKey(strategy), [strategy]);

  // NEW: if "straddle" but strikes mismatch, switch to "strangle"
  const effectiveStrategy = useMemo(
    () => (normalizedStrategy ? disambiguateStraddle(normalizedStrategy, legs) : null),
    [normalizedStrategy, legs]
  );

  useEffect(() => {
    const run = async () => {
      // No legs → nothing to compute
      if (!Array.isArray(legs) || legs.length === 0) {
        setState({ loading: false, be: null, error: "no_legs", meta: null });
        return;
      }

      try { acRef.current?.abort(); } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      const mySeq = ++seqRef.current;

      setState((s) => ({ ...s, loading: true, error: null }));

      // tiny debounce for UX batching
      await new Promise((r) => setTimeout(r, 180));
      if (ac.signal.aborted || mySeq !== seqRef.current) return;

      try {
        const payload = { legs, contractSize };
        if (effectiveStrategy) payload.strategy = effectiveStrategy;

        const res = await fetch("/api/strategy/breakeven", {
          method: "POST",
          cache: "no-store",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const j = await res.json().catch(() => ({}));
        if (ac.signal.aborted || mySeq !== seqRef.current) return;

        const be   = Array.isArray(j?.be) ? j.be : Array.isArray(j?.data?.be) ? j.data.be : null;
        const meta = j?.meta ?? j?.data?.meta ?? null;

        if (!res.ok || j?.ok === false || !Array.isArray(be) || be.length === 0) {
          setState({ loading: false, be: null, error: j?.error || "unavailable", meta });
          return;
        }
        setState({ loading: false, be, error: null, meta });
      } catch (e) {
        if (!ac.signal.aborted) {
          setState({ loading: false, be: null, error: String(e?.message || e), meta: null });
        }
      }
    };

    run();
    return () => { try { acRef.current?.abort(); } catch {} };
  }, [legs, contractSize, effectiveStrategy]);

  const isRange = Array.isArray(state.be) && state.be.length === 2;
  const isPoint = Array.isArray(state.be) && state.be.length === 1;

  // Prefer resolved_by label if the backend provides it; otherwise show effective key
  const resolvedLabel =
    state.meta?.resolved_by ||
    state.meta?.used ||
    (effectiveStrategy ? effectiveStrategy.replace(/_/g, " ") : "—");

  return (
    <section className="card dense">
      <div className="be-head">
        <div className="be-title">Break-even</div>
        <div className="be-aside">{resolvedLabel}</div>
      </div>

      {state.loading ? (
        <div className="be-skel" aria-hidden="true">
          <span className="sk"></span>
          <span className="sk"></span>
        </div>
      ) : state.error ? (
        <div className="be-error">Break-even unavailable for current legs.</div>
      ) : isRange ? (
        <div className="be-row">
          <div className="be-col">
            <div className="k">Lower</div>
            <div className="v">{fmtPrice(state.be[0], currency)}</div>
            {Number.isFinite(spot) && Number.isFinite(state.be[0]) && (
              <div className="hint">Δ {(((state.be[0] - spot) / spot) * 100).toFixed(2)}%</div>
            )}
          </div>
          <div className="be-col">
            <div className="k">Upper</div>
            <div className="v">{fmtPrice(state.be[1], currency)}</div>
            {Number.isFinite(spot) && Number.isFinite(state.be[1]) && (
              <div className="hint">Δ {(((state.be[1] - spot) / spot) * 100).toFixed(2)}%</div>
            )}
          </div>
        </div>
      ) : isPoint ? (
        <div className="be-row">
          <div className="be-col">
            <div className="k">Price</div>
            <div className="v">{fmtPrice(state.be[0], currency)}</div>
            {Number.isFinite(spot) && Number.isFinite(state.be[0]) && (
              <div className="hint">Δ {(((state.be[0] - spot) / spot) * 100).toFixed(2)}%</div>
            )}
          </div>
        </div>
      ) : (
        <div className="be-error">Break-even unavailable for current legs.</div>
      )}

      <style jsx>{`
        .be-head{
          display:flex; align-items:center; justify-content:space-between; gap:10px;
          margin-bottom:6px;
        }
        .be-title{ font-weight:700; }
        .be-aside{ font-size:12px; color:var(--muted); }

        .be-row{
          display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px;
        }
        .be-col{
          border:1px solid var(--border);
          border-radius:12px;
          padding:10px;
          background:var(--card);
          transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
        }
        .be-col:hover{
          transform: translateY(-1px);
          box-shadow: var(--shadow-soft);
          border-color: color-mix(in srgb, var(--text) 14%, var(--border));
        }
        .k{ font-size:12px; color:var(--muted); margin-bottom:4px; }
        .v{ font-weight:700; font-variant-numeric: tabular-nums; }
        .hint{ margin-top:2px; font-size:12px; color:var(--muted); }

        .be-error{ color:#ef4444; }

        .be-skel{ display:flex; gap:10px; }
        .sk{
          height:16px; width:38%;
          border-radius:8px; background: color-mix(in srgb, var(--text) 10%, transparent);
          animation: pulse .9s ease-in-out infinite alternate;
        }
        @keyframes pulse{ from{ opacity:.45 } to{ opacity:.8 } }

        @media (max-width:700px){ .be-row{ grid-template-columns:1fr; } }
      `}</style>
    </section>
  );
}
