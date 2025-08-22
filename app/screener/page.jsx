"use client";

import { useEffect, useState } from "react";

export default function ScreenerPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("screener_saved");
      const list = raw ? JSON.parse(raw) : [];
      setItems(list);
    } catch {}
  }, []);

  const remove = (symbol, strategy) => {
    const next = items.filter((i) => !(i.symbol === symbol && i.strategy === strategy));
    setItems(next);
    try { localStorage.setItem("screener_saved", JSON.stringify(next)); } catch {}
  };

  const fmt = (ts) => new Date(ts).toLocaleString();

  return (
    <div className="screener-page">
      <div className="scr-head">
        <h1>Screener</h1>
        <input className="scr-search" placeholder="Lookup symbols…" />
      </div>
      {items.length ? (
        <table className="scr-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Strategy</th>
              <th>Saved</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx}>
                <td>{it.symbol}</td>
                <td>{it.strategy}</td>
                <td>{fmt(it.savedAt)}</td>
                <td>
                  <button onClick={() => remove(it.symbol, it.strategy)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">No saved strategies.</p>
      )}
      <style jsx>{`
        .screener-page{ background:var(--bg); color:var(--text); min-height:100vh; padding:24px; }
        .scr-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .scr-search{ padding:8px 12px; border:1px solid var(--border); border-radius:8px; background:var(--card); color:var(--text); }
        .scr-table{ width:100%; border-collapse:collapse; }
        .scr-table th, .scr-table td{ border-bottom:1px solid var(--border); padding:8px 12px; text-align:left; }
        .scr-table th{ background:var(--card); font-weight:600; }
        .scr-table tr:hover{ background:var(--card); }
        button{ background:transparent; border:0; cursor:pointer; color:var(--text); }
        .empty{ color:var(--muted); }
      `}</style>
    </div>
  );
}
