// components/Strategy/BreakevenPanel.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Convert PositionBuilder rows ➜ legs expected by the BE API. */
function rowsToApiLegs(rows = []) {
  const legs = [];
  for (const r of rows || []) {
    if (!r) continue;
    const t = String(r.type || "").toLowerCase();

    // map builder codes -> (type, side)
    let type = null, side = null;
    if (t === "lc") { type = "call"; side = "long"; }
    else if (t === "sc") { type = "call"; side = "short"; }
    else if (t === "lp") { type = "put";  side = "long"; }
    else if (t === "sp") { type = "put";  side = "short"; }
    else if (t === "ls") { type = "stock"; side = "long"; }
    else if (t === "ss") { type = "stock"; side = "short"; }
    else continue; // ignore unknowns

    const qty = Number.isFinite(Number(r.qty)) ? Math.max(0, Number(r.qty)) : 1;

    if (type === "stock") {
      // For covered/protective structures. UI may carry a price in r.price or r.premium.
      const price = Number(r.price ?? r.premium);
      legs.push({
        type, side, qty,
        ...(Number.isFinite(price) ? { price: Number(price) } : {}),
      });
    } else {
      const strike  = Number(r.K ?? r.strike);
      const premium = Number(r.premium);
      legs.push({
        type, side, qty,
        strike: Number.isFinite(strike)  ? Number(strike)  : null,
        ...(Number.isFinite(premium) ? { premium: Number(premium) } : {}),
      });
    }
  }
  return legs;
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

export default function BreakevenPanel({
  rows,
  spot = null,          // if present, show distance from spot
  currency = "USD",
  contractSize = 1,     // reserved for futures/FX, 1 for equities
}) {
  const [state, setState] = useState({ loading: false, be: null, error: null, meta: null });
  const acRef = useRef(null);
  const seqRef = useRef(0);

  const legs = useMemo(() => rowsToApiLegs(rows), [rows]);

  useEffect(() => {
    const run = async () => {
      // cancel any in-flight
      try { acRef.current?.abort(); } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      const mySeq = ++seqRef.current;

      setState((s) => ({ ...s, loading: true, error: null }));

      // light debounce to avoid hammering while typing
      await new Promise((r) => setTimeout(r, 220));
      if (ac.signal.aborted || mySeq !== seqRef.current) return;

      try {
        const res = await fetch("/api/strategy/breakeven", {
          method: "POST",
          cache: "no-store",
          signal: ac.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legs, contractSize }),
        });
        const j = await res.json();
        if (ac.signal.aborted || mySeq !== seqRef.current) return;

        // Accept both shapes: { be, meta } OR { data: { be, meta } }
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
  }, [legs, contractSize]);

  const isRange = Array.isArray(state.be) && state.be.length === 2;
  const isPoint = Array.isArray(state.be) && state.be.length === 1;

  return (
    <section className="card dense">
      <div className="be-head">
        <div className="be-title">Break-even</div>
        <div className="be-aside">{state.meta?.used ? String(state.meta.used).replace(/_/g, " ") : "—"}</div>
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
