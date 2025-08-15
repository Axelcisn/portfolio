// components/Search/TickerSearchUnified.jsx
"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

const TickerSearchUnified = React.forwardRef(function TickerSearchUnified(
  {
    onSelect,
    placeholder = "Search tickers…",
    minLen = 2,
    limit = 8,
    debounceMs = 220,
    initialValue = "",
    endpoint = "/api/company/search",
    mapResult,
  },
  forwardedRef
) {
  const [q, setQ] = useState(initialValue);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const cache = useRef(new Map());
  const acRef = useRef(null);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listId = useRef(`tsu-list-${Math.random().toString(36).slice(2, 9)}`);
  const activeId = (i) => `${listId.current}-opt-${i}`;

  useEffect(() => {
    if (!forwardedRef) return;
    if (typeof forwardedRef === "function") forwardedRef(inputRef.current);
    else forwardedRef.current = inputRef.current;
  }, [forwardedRef]);

  useEffect(() => {
    return () => {
      try { acRef.current?.abort(); } catch {}
      clearTimeout(debounceRef.current);
    };
  }, []);

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
      if (!qstr || qstr.length < minLen) {
        setResults([]);
        setLoading(false);
        return;
      }
      const key = `${qstr}|${limit}|${endpoint}`;
      if (cache.current.has(key)) {
        setResults(cache.current.get(key));
        setLoading(false);
        return;
      }
      try { acRef.current?.abort(); } catch {}
      const ac = new AbortController();
      acRef.current = ac;
      setLoading(true);
      try {
        const u = `${endpoint}?q=${encodeURIComponent(qstr)}&limit=${limit}`;
        const r = await fetch(u, { signal: ac.signal, cache: "no-store" });
        if (!r.ok) throw new Error("fetch");
        const j = await r.json();
        let list = [];
        if (Array.isArray(j?.results)) list = j.results;
        else if (Array.isArray(j?.data?.results)) list = j.data.results;
        else if (Array.isArray(j?.data)) list = j.data;
        else if (Array.isArray(j)) list = j;
        const out = (list || []).slice(0, limit).map(normalize);
        cache.current.set(key, out);
        setResults(out);
      } catch (e) {
        if (e?.name !== "AbortError") setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [endpoint, limit, minLen, normalize]
  );

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!q || q.length < minLen) { setResults([]); setOpen(false); setLoading(false); return; }
    debounceRef.current = setTimeout(() => {
      fetchResults(q);
      setOpen(true);
      setActive(-1);
    }, debounceMs);
    return () => clearTimeout(debounceRef.current);
  }, [q, fetchResults, debounceMs, minLen]);

  const close = useCallback(() => { setOpen(false); setActive(-1); }, []);
  const openIfResults = useCallback(() => { if (results.length) setOpen(true); }, [results.length]);

  useEffect(() => {
    const onDoc = (ev) => { if (!wrapperRef.current?.contains(ev.target)) close(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("touchstart", onDoc); };
  }, [close]);

  const handleSelect = (item) => {
    setQ(item.symbol || "");
    close();
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
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  useEffect(() => {
    if (active < 0) return;
    document.getElementById(activeId(active))?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      {/* input pill */}
      <div
        style={{
          position: "relative",
          height: 44,
          background: "var(--pill-bg, #171a1f)",
          border: "1px solid var(--border, #2a2f3a)",
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          paddingLeft: 38,
          paddingRight: 32,
        }}
      >
        {/* search icon */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            opacity: .85,
          }}
        >
          🔎
        </span>

        <input
          ref={inputRef}
          aria-label="Search tickers"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId.current}
          aria-activedescendant={active >= 0 ? activeId(active) : undefined}
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => openIfResults()}
          onKeyDown={onKeyDown}
          autoComplete="off"
          inputMode="search"
          style={{
            height: 42,
            width: "100%",
            background: "transparent",
            border: 0,
            outline: "none",
            color: "var(--foreground, #e5e7eb)",
            fontSize: 14.5,
          }}
        />

        {/* clear */}
        {!!q && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQ(""); setResults([]); close(); inputRef.current?.focus(); }}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 18,
              height: 18,
              borderRadius: 9,
              border: "1px solid var(--border, #2a2f3a)",
              background: "transparent",
              color: "var(--foreground, #e5e7eb)",
              fontSize: 12,
              lineHeight: "16px",
              padding: 0,
              cursor: "pointer",
              opacity: .8,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* dropdown */}
      {open && (
        <ul
          id={listId.current}
          role="listbox"
          style={{
            position: "absolute", left: 0, right: 0, zIndex: 60,
            background: "var(--card, #0f1115)", border: "1px solid var(--border, #2a2f3a)",
            borderRadius: 10, marginTop: 8, maxHeight: 320, overflow: "auto",
            padding: 8, boxShadow: "0 8px 26px rgba(0,0,0,.45)"
          }}
        >
          {loading && <li className="muted" role="status" style={{ padding: "8px 10px" }}>Loading…</li>}
          {!loading && results.length === 0 && <li className="muted" style={{ padding: "8px 10px" }}>No results</li>}
          {results.map((r, i) => (
            <li
              id={activeId(i)}
              key={`${r.symbol || "sym"}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(ev) => { ev.preventDefault(); handleSelect(r); }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: "flex", justifyContent: "space-between", gap: 12,
                padding: "10px 12px", borderRadius: 8,
                background: i === active ? "color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent)" : "transparent",
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
