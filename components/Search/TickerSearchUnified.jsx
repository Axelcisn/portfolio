// components/Search/TickerSearchUnified.jsx
"use client";
import React, { useEffect, useRef, useState } from "react";

export default function TickerSearchUnified({ onSelect, placeholder = "Search tickers..." }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const cache = useRef(new Map());
  const acRef = useRef(null);
  const debounceRef = useRef(null);

  const MIN_LEN = 2;
  const LIMIT = 8;
  const DEBOUNCE_MS = 220;

  useEffect(() => {
    return () => {
      if (acRef.current) acRef.current.abort();
      clearTimeout(debounceRef.current);
    };
  }, []);

  const fetchResults = async (qstr, { nocache = false } = {}) => {
    if (!qstr || qstr.length < MIN_LEN) {
      setResults([]);
      setLoading(false);
      return;
    }

    const key = `${qstr}|${LIMIT}`;
    if (!nocache && cache.current.has(key)) {
      setResults(cache.current.get(key));
      setLoading(false);
      return;
    }

    if (acRef.current) { try { acRef.current.abort(); } catch {} }
    const ac = new AbortController();
    acRef.current = ac;
    setLoading(true);

    try {
      const u = `/api/company/search?q=${encodeURIComponent(qstr)}&limit=${LIMIT}`;
      const r = await fetch(u, { signal: ac.signal, cache: "no-store" });
      if (!r.ok) throw new Error("fetch");
      const j = await r.json();

      // Normalize various possible payload shapes
      let list = [];
      if (Array.isArray(j?.results)) list = j.results;
      else if (Array.isArray(j?.data?.results)) list = j.data.results;
      else if (Array.isArray(j?.data)) list = j.data;
      else if (Array.isArray(j)) list = j;

      const out = (list || []).slice(0, LIMIT).map((it) => ({
        symbol: it.symbol || it.ticker || "",
        name: it.name || it.longname || it.description || "",
        exchange: it.exchange || it.exch || "",
        currency: it.currency || "USD",
        type: it.type || "EQUITY",
      }));
      cache.current.set(key, out);
      setResults(out);
    } catch (e) {
      if (e?.name === "AbortError") { /* aborted */ }
      else setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q || q.length < MIN_LEN) { setResults([]); setOpen(false); setLoading(false); return; }
    debounceRef.current = setTimeout(() => {
      fetchResults(q);
      setOpen(true);
      setActive(-1);
    }, DEBOUNCE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const handleSelect = (item) => {
    setQ(item.symbol);
    setOpen(false);
    setActive(-1);
    onSelect?.(item);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active >= 0 ? active : 0];
      if (item) handleSelect(item);
    }
    if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };

  return (
    <div className="tsu" style={{ position: "relative" }}>
      <input
        aria-label="Search tickers"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        className="search-input"
      />
      {open && (
        <ul className="search-list" role="listbox" style={{
          position: "absolute", left: 0, right: 0, zIndex: 60,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 6,
          maxHeight: 300, overflow: "auto", padding: 8, boxShadow: "0 6px 20px rgba(0,0,0,.35)"
        }}>
          {loading && <li className="muted">Loading…</li>}
          {!loading && results.length === 0 && <li className="muted">No results</li>}
          {results.map((r, i) => (
            <li
              key={r.symbol + i}
              role="option"
              aria-selected={i === active}
              onMouseDown={(ev) => { ev.preventDefault(); handleSelect(r); }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex", justifyContent: "space-between", gap: 12,
                padding: "8px 10px", borderRadius: 6,
                background: i === active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                cursor: "pointer"
              }}
            >
              <div style={{ minWidth: 100 }}>
                <div style={{ fontWeight: 800 }}>{r.symbol}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{r.name}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <div style={{ fontSize: 12 }}>{r.exchange}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{r.type}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
