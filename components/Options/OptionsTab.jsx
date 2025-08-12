"use client";
import { useEffect, useMemo, useState } from "react";

export default function ChainTable({ symbol, currency, provider, groupBy, expiryISO }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [calls, setCalls] = useState([]);
  const [puts, setPuts] = useState([]);
  const [meta, setMeta] = useState(null);

  // fetch options only when provider=api + symbol + expiryISO
  useEffect(() => {
    setErr(null);
    setCalls([]); setPuts([]); setMeta(null);
    if (provider !== "api" || !symbol || !expiryISO) return;

    let abort = false;
    (async () => {
      try {
        setLoading(true);
        const u = `/api/options?symbol=${encodeURIComponent(symbol)}&date=${encodeURIComponent(expiryISO)}`;
        const r = await fetch(u, { cache: "no-store" });
        const j = await r.json();
        if (abort) return;

        if (!r.ok || j?.ok === false) throw new Error(j?.error || "Failed");
        setCalls(Array.isArray(j.data?.calls) ? j.data.calls : []);
        setPuts(Array.isArray(j.data?.puts) ? j.data.puts : []);
        setMeta(j.data?.meta || null);
      } catch (e) {
        setErr(e?.message || "Error");
      } finally {
        setLoading(false);
      }
    })();

    return () => { abort = true; };
  }, [provider, symbol, expiryISO]);

  // union of strikes for perfect left/center/right symmetry
  const strikes = useMemo(() => {
    const s = new Set();
    for (const c of calls) if (Number.isFinite(c?.strike)) s.add(c.strike);
    for (const p of puts) if (Number.isFinite(p?.strike)) s.add(p.strike);
    return Array.from(s).sort((a, b) => a - b);
  }, [calls, puts]);

  const byStrike = (arr) => {
    const m = new Map();
    for (const o of arr) if (Number.isFinite(o?.strike)) m.set(o.strike, o);
    return m;
  };
  const callsBy = useMemo(() => byStrike(calls), [calls]);
  const putsBy = useMemo(() => byStrike(puts), [puts]);

  const fmt2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "—");
  const fmt1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");

  return (
    <div className="wrap">
      <div className="heads">
        <div className="h-left">Calls</div>
        <div className="h-mid" />
        <div className="h-right">Puts</div>
      </div>

      {/* Header row */}
      <div className="grid head-row">
        <div className="c cell">Price</div>
        <div className="c cell">Ask</div>
        <div className="c cell">Bid</div>

        <div className="mid cell">
          <span className="arrow">↑</span> Strike
        </div>
        <div className="mid cell">IV, %</div>

        <div className="p cell">Bid</div>
        <div className="p cell">Ask</div>
        <div className="p cell">Price</div>
      </div>

      {/* Rows */}
      {loading ? (
        <div className="card"><div className="title">Loading chain…</div></div>
      ) : err ? (
        <div className="card"><div className="title">Error</div><div className="sub">{err}</div></div>
      ) : !strikes.length ? (
        <div className="card">
          <div className="title">No options loaded</div>
          <div className="sub">Pick a provider or upload a screenshot, then choose an expiry{meta?.expiry ? ` (e.g., ${meta.expiry}).` : "."}</div>
        </div>
      ) : (
        strikes.map((K) => {
          const c = callsBy.get(K) || {};
          const p = putsBy.get(K) || {};
          return (
            <div className="grid row" key={`r-${K}`}>
              {/* Calls (left) */}
              <div className="c cell">{fmt2(c.price)}</div>
              <div className="c cell">{fmt2(c.ask)}</div>
              <div className="c cell">{fmt2(c.bid)}</div>

              {/* Center */}
              <div className="mid cell strike">{fmt2(K)}</div>
              <div className="mid cell">{fmt1(c?.ivPct ?? p?.ivPct)}</div>

              {/* Puts (right) */}
              <div className="p cell">{fmt2(p.bid)}</div>
              <div className="p cell">{fmt2(p.ask)}</div>
              <div className="p cell">{fmt2(p.price)}</div>
            </div>
          );
        })
      )}

      <style jsx>{`
        .wrap{ margin-top:10px; }
        .heads{ display:flex; align-items:center; justify-content:space-between; margin:12px 0 8px; }
        .h-left, .h-right{ font-weight:800; font-size:28px; letter-spacing:.2px; color:var(--text,#0f172a); }
        .h-mid{ flex:1; }

        /* 8 columns: 3 (calls) + 2 (center) + 3 (puts)  */
        .grid{
          display:grid;
          grid-template-columns:
            minmax(86px,1fr) minmax(86px,1fr) minmax(86px,1fr)
            112px 86px
            minmax(86px,1fr) minmax(86px,1fr) minmax(86px,1fr);
          gap: 6px 14px; align-items:center;
        }
        .head-row{
          padding: 8px 0 10px;
          border-top:1px solid var(--border,#E6E9EF);
          border-bottom:1px solid var(--border,#E6E9EF);
          font-weight:700; font-size:15px; color:var(--text,#2b3442);
        }
        .row{ padding:10px 0; border-bottom:1px dashed color-mix(in oklab, var(--border,#E6E9EF) 70%, transparent); }
        .cell{ height:28px; display:flex; align-items:center; }
        .c{ justify-content:flex-start; }
        .p{ justify-content:flex-end; }
        .mid{ justify-content:center; text-align:center; }
        .strike{ font-weight:700; }

        .arrow{ margin-right:6px; font-weight:900; }
        .card{ border:1px solid var(--border,#E6E9EF); border-radius:14px; background:var(--card,#fff); padding:18px; margin-top:14px; }
        .title{ font-weight:800; font-size:18px; margin-bottom:6px; }
        .sub{ opacity:.75; }

        @media (max-width: 980px){
          .h-left, .h-right{ font-size:22px; }
          .head-row{ font-size:14px; }
        }
      `}</style>
    </div>
  );
}
