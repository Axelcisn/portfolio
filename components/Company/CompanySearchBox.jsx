// components/Company/CompanySearchBox.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Props:
 * - placeholder?: string
 * - defaultQuery?: string
 * - onPick: (item) => void  // item: { symbol, name, exchange, conid? }
 */
export default function CompanySearchBox({ placeholder = "Search", defaultQuery = "", onPick }) {
  const [q, setQ] = useState(defaultQuery);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [idx, setIdx] = useState(-1);
  const acRef = useRef(null);
  const boxRef = useRef(null);
  const listId = "csb-listbox";

  // Normalize IBKR secdef item -> {symbol,name,exchange,conid}
  const mapItem = useCallback((r) => {
    const symbol = String(r?.symbol || "").toUpperCase();
    const name = r?.companyName || r?.companyHeader?.split(" - ")[0] || symbol;
    const exchange = r?.description || ""; // e.g. "NASDAQ", "TSE"
    const conid = r?.conid ? String(r.conid) : undefined;
    return { symbol, name, exchange, conid };
  }, []);

  // Debounced fetch to our proxy
  useEffect(() => {
    if (!q || q.trim().length < 1) {
      setItems([]); setOpen(false); setErr(""); setIdx(-1);
      return;
    }
    // cancel previous
    try { acRef.current?.abort(); } catch {}
    const ac = new AbortController();
    acRef.current = ac;

    const t = setTimeout(async () => {
      setLoading(true); setErr("");
      try {
        const res = await fetch(`/api/ibkr/search?symbol=${encodeURIComponent(q.trim())}`, {
          cache: "no-store", signal: ac.signal
        });
        const text = await res.text();
        let json;
        try { json = JSON.parse(text); } catch { json = text; }
        if (!res.ok) throw new Error(typeof json === "string" ? json : (json?.error || res.statusText));
        const arr = Array.isArray(json) ? json : [];
        const mapped = arr.map(mapItem).filter(x => x.symbol);
        setItems(mapped.slice(0, 20));
        setOpen(true);
        setIdx(mapped.length ? 0 : -1);
      } catch (e) {
        if (ac.signal.aborted) return;
        setItems([]);
        setOpen(true);
        setIdx(-1);
        setErr(String(e?.message || e));
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => { clearTimeout(t); try { ac.abort(); } catch {} };
  }, [q, mapItem]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const choose = useCallback((it) => {
    if (!it) return;
    setQ(it.symbol);
    setOpen(false);
    try { onPick?.(it); } catch {}
  }, [onPick]);

  const onKeyDown = useCallback((e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (!open) {
      if (e.key === "Enter" && q.trim()) choose({ symbol: q.trim().toUpperCase(), name: "", exchange: "" });
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[idx] ?? items[0] ?? (q.trim() ? { symbol: q.trim().toUpperCase(), name: "", exchange: "" } : null);
      choose(it);
    } else if (e.key === "Escape") { setOpen(false); }
  }, [open, items, idx, q, choose]);

  const renderLine = (it) => {
    const ex = it.exchange ? ` • ${it.exchange}` : "";
    return `${it.symbol} — ${it.name}${ex}`;
  };

  return (
    <div className="csb" ref={boxRef}>
      <input
        className="csb-input"
        type="text"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (items.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={idx >= 0 ? `csb-opt-${idx}` : undefined}
      />
      <div className="csb-indicators" aria-hidden="true">
        {loading ? <span className="dot dot-on" /> : <span className="dot" />}
      </div>

      {open && (
        <ul id={listId} role="listbox" className="csb-pop">
          {err && <li className="muted small">{err}</li>}
          {!err && items.length === 0 && q && <li className="muted small">No results</li>}
          {!err && items.map((it, i) => (
            <li
              id={`csb-opt-${i}`}
              role="option"
              aria-selected={i === idx}
              key={`${it.symbol}-${i}`}
              className={`row ${i === idx ? "is-active" : ""}`}
              onMouseEnter={() => setIdx(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(it)}
              title={renderLine(it)}
            >
              <strong className="sym">{it.symbol}</strong>
              <span className="name">{it.name}</span>
              {it.exchange ? <span className="exch">{it.exchange}</span> : null}
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .csb{ position:relative; width:100%; max-width:520px; }
        .csb-input{
          width:100%; padding:10px 12px; border-radius:8px;
          border:1px solid color-mix(in srgb, var(--text) 18%, transparent);
          background: var(--card, #0b0b0c); color: var(--text, #e5e7eb);
          outline:none;
        }
        .csb-input:focus{ border-color: var(--accent, #3b82f6); }
        .csb-indicators{ position:absolute; right:8px; top:50%; transform:translateY(-50%); }
        .dot{ width:8px; height:8px; border-radius:999px; display:inline-block;
          background: color-mix(in srgb, var(--text) 25%, var(--card)); opacity:.35; }
        .dot-on{ opacity:.95; background: color-mix(in srgb, var(--accent, #3b82f6) 70%, var(--card)); }
        .csb-pop{
          position:absolute; z-index:30; left:0; right:0; margin-top:6px;
          border:1px solid color-mix(in srgb, var(--text) 18%, transparent);
          background: var(--card, #0b0b0c); border-radius:10px; padding:6px; max-height:320px; overflow:auto;
          box-shadow: 0 6px 20px rgba(0,0,0,.35);
        }
        .row{ display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:8px; cursor:pointer; }
        .row:hover,.row.is-active{ background: color-mix(in srgb, var(--accent, #3b82f6) 18%, transparent); }
        .sym{ width:82px; flex:0 0 auto; }
        .name{ opacity:.9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .exch{ margin-left:auto; opacity:.6; font-size:12px; }
        .small{ font-size:12px; }
        .muted{ opacity:.7; }
      `}</style>
    </div>
  );
}
