"use client";
import { useEffect, useState } from "react";
import useDebounce from "../../hooks/useDebounce";
import { fmtNum } from "../../utils/format";

export default function CompanyCard({ value, onConfirm, onHorizonChange, onIvSourceChange, onIvValueChange }) {
  const [query, setQuery] = useState(value?.symbol || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(value || null);
  const [details, setDetails] = useState(null);
  const [ivSource, setIvSource] = useState("live");
  const [ivManual, setIvManual] = useState("");
  const debounced = useDebounce(query, 300);

  useEffect(() => {
    if (!debounced || (selected && debounced === selected.symbol)) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debounced)}`)
      .then(r => r.json()).then(d => setResults(d.results || []))
      .finally(() => setLoading(false));
  }, [debounced, selected]);

  const confirm = async (sym) => {
    const symbol = sym || (results[0]?.symbol ?? query.toUpperCase());
    if (!symbol) { alert("Select a company/ticker."); return; }
    const r = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}`);
    const d = await r.json();
    const next = { symbol, ...d };
    setSelected(next); setDetails(d); setResults([]); setQuery(symbol);
    onConfirm?.(next);
  };

  useEffect(() => { onIvSourceChange?.(ivSource); }, [ivSource, onIvSourceChange]);
  useEffect(() => {
    const v = ivSource === "manual" ? parseFloat(ivManual) : (ivSource === "live" ? details?.ivLive : details?.ivHist);
    onIvValueChange?.(isFinite(v) ? v : undefined);
  }, [ivSource, ivManual, details, onIvValueChange]);

  return (
    <section className="card">
      <h3>Company</h3>

      <label>Company / Ticker</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="btn" style={{ flex: 1, background: "transparent" }}
               placeholder="Search by name or ticker…" value={query}
               onChange={e => { setQuery(e.target.value); setSelected(null); }} />
        <button className="btn" onClick={() => confirm()} disabled={loading}>
          {loading ? "Searching…" : "Confirm"}
        </button>
      </div>

      {results.length > 0 && (
        <div className="card" style={{ marginTop: 8 }}>
          <div className="small">No exact match — pick one:</div>
          <div style={{ display: "grid", gap: 6 }}>
            {results.map(r => (
              <button key={r.symbol} className="btn" onClick={() => confirm(r.symbol)}>
                {r.symbol} • {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div className="grid grid-3">
            <div className="card"><div className="small">Currency</div><div><strong>{details?.currency ?? "—"}</strong></div></div>
            <div className="card"><div className="small">Spot Price</div><div><strong>{fmtNum(details?.spot)}</strong></div></div>
            <div className="card"><div className="small">Beta</div><div><strong>{fmtNum(details?.beta)}</strong></div></div>
          </div>

          <div className="grid grid-3">
            <div className="card"><div className="small">52W High</div><div><strong>{fmtNum(details?.high52)}</strong></div></div>
            <div className="card"><div className="small">52W Low</div><div><strong>{fmtNum(details?.low52)}</strong></div></div>
            <div className="card">
              <div className="small">Time (days)</div>
              <input className="btn" type="number" min={1} step={1} defaultValue={30}
                     onChange={e => onHorizonChange?.(parseInt(e.target.value || "0", 10))} />
            </div>
          </div>

          <div className="card">
            <div className="small">Implied Volatility</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select className="btn" value={ivSource} onChange={e => setIvSource(e.target.value)}>
                <option value="live">Live IV</option>
                <option value="hist">Historical IV</option>
                <option value="manual">Manual</option>
              </select>
              {ivSource === "manual"
                ? <input className="btn" placeholder="e.g., 0.30" value={ivManual} onChange={e => setIvManual(e.target.value)} />
                : <span className="small">{ivSource === "live" ? fmtNum(details?.ivLive) : fmtNum(details?.ivHist)}</span>}
              {details?.currency !== "EUR" && <span className="btn small">Converted to EUR</span>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
