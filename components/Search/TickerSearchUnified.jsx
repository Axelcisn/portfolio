// components/Search/TickerSearchUnified.jsx
"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

const TickerSearchUnified = React.forwardRef(function TickerSearchUnified(
  {
    onSelect,
    placeholder = "Search companies, tickers…",
    minLen = 2,
    limit = 8,
    debounceMs = 220,
    endpoint = "/api/company/search",
    mapResult,
  },
  forwardedRef
) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const cache = useRef(new Map());
  const acRef = useRef(null);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useRef(`tsu-${Math.random().toString(36).slice(2, 8)}`);
  const optId = (i) => `${listId.current}-opt-${i}`;

  // expose input ref if parent passes a ref
  useEffect(() => {
    if (!forwardedRef) return;
    if (typeof forwardedRef === "function") forwardedRef(inputRef.current);
    else forwardedRef.current = inputRef.current;
  }, [forwardedRef]);

  useEffect(() => () => { try { acRef.current?.abort(); } catch {}; clearTimeout(debounceRef.current); }, []);

  const normalize = useCallback(
    (it) =>
      (mapResult
        ? mapResult(it)
        : {
            symbol: it.symbol || it.ticker || "",
            name: it.name || it.longname || it.description || "",
            exchange: it.exchange || it.exch || "",
            currency: it.currency || "USD",
            type: it.type || it.quoteType || "EQUITY",
            raw: it,
          }),
    [mapResult]
  );

  const fetchResults = useCallback(
    async (qstr) => {
      if (!qstr || qstr.length < minLen) { setResults([]); setLoading(false); return; }

      const key = `${endpoint}|${qstr}|${limit}`;
      if (cache.current.has(key)) { setResults(cache.current.get(key)); setLoading(false); return; }

      try { acRef.current?.abort(); } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      setLoading(true);

      try {
        const u = `${endpoint}?q=${encodeURIComponent(qstr)}&limit=${limit}`;
        const r = await fetch(u, { signal: ac.signal, cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "search_failed");

        let list = [];
        if (Array.isArray(j?.results)) list = j.results;
        else if (Array.isArray(j?.data?.results)) list = j.data.results;
        else if (Array.isArray(j?.data)) list = j.data;
        else if (Array.isArray(j)) list = j;

        const out = (list || []).slice(0, limit).map(normalize);
        cache.current.set(key, out);
        setResults(out);
        setOpen(true);
      } catch (e) {
        if (e?.name !== "AbortError") { setResults([]); setOpen(false); }
      } finally {
        setLoading(false);
      }
    },
    [endpoint, limit, minLen, normalize]
  );

  // debounce input
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q || q.length < minLen) { setResults([]); setOpen(false); setLoading(false); return; }
    debounceRef.current = setTimeout(() => fetchResults(q), debounceMs);
    return () => clearTimeout(debounceRef.current);
  }, [q, fetchResults, debounceMs, minLen]);

  // close on outside click
  useEffect(() => {
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); };
  }, []);

  const handleSelect = (item) => {
    setQ(item.symbol || "");
    setOpen(false);
    setActive(-1);
    onSelect?.(item);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      if (results.length) { setOpen(true); setActive(0); e.preventDefault(); }
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(results.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); const item = results[active >= 0 ? active : 0]; if (item) handleSelect(item); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  };

  // keep highlighted item in view
  useEffect(() => {
    if (active < 0) return;
    document.getElementById(optId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%", height: "100%", zIndex: 1200 }}>
      {/* full-height input (matches parent pill height) */}
      <input
        ref={inputRef}
        aria-label="Search tickers"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId.current}
        aria-activedescendant={active >= 0 ? optId(active) : undefined}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => { if (results.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        className="search-input"
        autoComplete="off"
        inputMode="search"
        style={{
          height: "100%", width: "100%",
          background: "transparent", border: 0, outline: 0,
          color: "var(--foreground,#e5e7eb)", fontSize: 14.5,
          paddingLeft: 38, paddingRight: 36, // room for icons
          boxSizing: "border-box",
        }}
      />

      {/* clear button (SVG, not emoji) */}
      {!!q && (
        <button
          type="button"
          aria-label="Clear"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setQ(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
          style={{
            position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
            width: 22, height: 22, display: "grid", placeItems: "center",
            borderRadius: 11, border: "1px solid var(--border,#2a2f3a)",
            background: "transparent", cursor: "pointer", opacity: .9
          }}
        >
          {/* X-circle icon */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" opacity=".5"></circle>
            <path d="M15 9l-6 6M9 9l6 6"></path>
          </svg>
        </button>
      )}

      {/* dropdown */}
      {open && (
        <ul
          id={listId.current}
          role="listbox"
          style={{
            position: "absolute", left: 0, right: 0, top: "calc(100% + 8px)",
            background: "var(--card,#0f1115)", border: "1px solid var(--border,#2a2f3a)",
            borderRadius: 10, maxHeight: 320, overflow: "auto", padding: 8,
            boxShadow: "0 8px 26px rgba(0,0,0,.45)", zIndex: 1200
          }}
        >
          {loading && <li className="muted" role="status" style={{ padding: "8px 10px" }}>Loading…</li>}
          {!loading && results.length === 0 && <li className="muted" style={{ padding: "8px 10px" }}>No results</li>}
          {results.map((r, i) => (
            <li
              id={optId(i)}
              key={`${r.symbol || "sym"}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(ev) => { ev.preventDefault(); handleSelect(r); }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex", justifyContent: "space-between", gap: 12,
                padding: "10px 12px", borderRadius: 8,
                background: i === active ? "color-mix(in srgb, var(--accent,#3b82f6) 12%, transparent)" : "transparent",
                cursor: "pointer"
              }}
            >
              <div style={{ minWidth: 100 }}>
                <div style={{ fontWeight: 800 }}>{r.symbol}</div>
                <div style={{ fontSize: 12.5, opacity: 0.8 }}>{r.name}</div>
              </div>
              <div style={{ textAlign: "right", minWidth: 90 }}>
                <div style={{ fontSize: 12.5 }}>{r.exchange}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{r.type}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default TickerSearchUnified;
