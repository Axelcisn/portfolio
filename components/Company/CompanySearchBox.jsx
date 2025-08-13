// components/Company/CompanySearchBox.jsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Desktop search box for tickers/companies.
 * Props:
 *  - placeholder?: string
 *  - autoFocus?: boolean
 *  - defaultQuery?: string
 *  - onPick?: (result) => void   // { symbol, name, exchange, type, currency }
 */
export default function CompanySearchBox({
  placeholder = "Search company or ticker",
  autoFocus = false,
  defaultQuery = "",
  onPick,
}) {
  const [q, setQ] = useState(defaultQuery);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]); // array of {symbol,name,exchange,type,currency}
  const [active, setActive] = useState(-1);   // keyboard focus index
  const [err, setErr] = useState(null);

  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const debounceT = useRef(null);
  const keepOpenT = useRef(null);

  const trimmed = q.trim();

  // --- fetch suggestions (debounced + abortable)
  const runSearch = useCallback((query) => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch {}
    }
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setErr(null);

    const url = `/api/company/search?q=${encodeURIComponent(query)}&limit=8`;
    fetch(url, { cache: "no-store", signal: ac.signal })
      .then((r) => r.json())
      .then((j) => {
        if (ac.signal.aborted) return;
        const list = Array.isArray(j?.results) ? j.results : [];
        setResults(list);
        setActive(list.length ? 0 : -1);
      })
      .catch((e) => {
        if (ac.signal.aborted) return;
        setErr(e?.message || "Search failed");
        setResults([]);
        setActive(-1);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
  }, []);

  // Debounce on query change
  useEffect(() => {
    if (!trimmed) {
      setResults([]);
      setActive(-1);
      setLoading(false);
      return;
    }
    if (debounceT.current) clearTimeout(debounceT.current);
    debounceT.current = setTimeout(() => runSearch(trimmed), 200);
    return () => {
      if (debounceT.current) clearTimeout(debounceT.current);
    };
  }, [trimmed, runSearch]);

  // Click outside to close
  useEffect(() => {
    const onDown = (e) => {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  const onFocus = () => {
    if (trimmed && results.length) setOpen(true);
  };
  const onBlur = () => {
    // allow click on an item
    if (keepOpenT.current) clearTimeout(keepOpenT.current);
    keepOpenT.current = setTimeout(() => setOpen(false), 120);
  };

  const choose = (idx) => {
    const item = results[idx];
    if (!item) return;
    setQ(item.symbol || "");
    setOpen(false);
    onPick?.(item);
    // Return focus to the input for a smooth desktop flow
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min((results.length || 1) - 1, (i < 0 ? 0 : i + 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, (i < 0 ? 0 : i - 1)));
    } else if (e.key === "Enter") {
      if (open && active >= 0) {
        e.preventDefault();
        choose(active);
      } else if (trimmed) {
        // Heuristic enter: if there is at least one result, pick it
        if (results[0]) {
          e.preventDefault();
          choose(0);
        }
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const onInput = (e) => {
    setQ(e.target.value);
    setOpen(true);
  };

  // Highlight matched symbol portion
  const renderName = (sym, name) => {
    const s = String(sym || "");
    const t = trimmed.toUpperCase();
    const idx = s.toUpperCase().indexOf(t);
    if (idx < 0 || !t) return <span className="sym">{s}</span>;
    return (
      <span className="sym">
        {s.slice(0, idx)}
        <b>{s.slice(idx, idx + t.length)}</b>
        {s.slice(idx + t.length)}
      </span>
    );
  };

  // tiny icons per type
  const TypeIcon = ({ type }) => {
    const t = String(type || "").toUpperCase();
    // Simple outline for all types; keep design minimal
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10H7a2 2 0 0 1-2-2V7z" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 17v-6h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div className={`field ${open ? "is-open" : ""}`}>
        <input
          ref={inputRef}
          type="text"
          className="input"
          placeholder={placeholder}
          value={q}
          onChange={onInput}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={open ? "true" : "false"}
          aria-autocomplete="list"
          aria-controls="company-suggest"
        />
        {/* spinner */}
        <span className={`spin ${loading ? "is-on" : ""}`} aria-hidden="true" />
        {/* clear */}
        {q && !loading && (
          <button
            type="button"
            className="x"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setQ(""); setResults([]); setActive(-1); setOpen(false); inputRef.current?.focus(); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>

      {open && (
        <div className="sheet" role="listbox" id="company-suggest">
          {err && (
            <div className="empty">Search failed. Try again.</div>
          )}
          {!err && loading && results.length === 0 && (
            <div className="empty">Searching…</div>
          )}
          {!err && !loading && results.length === 0 && trimmed && (
            <div className="empty">No results.</div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.symbol}-${i}`}
              role="option"
              aria-selected={active === i ? "true" : "false"}
              className={`row ${active === i ? "is-active" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              title={`${r.symbol} — ${r.name}`}
            >
              <div className="ico"><TypeIcon type={r.type} /></div>
              <div className="txt">
                <div className="line1">
                  {renderName(r.symbol, r.name)}
                </div>
                <div className="line2">
                  <span className="name">{r.name}</span>
                  {r.exchange ? <span className="sep">•</span> : null}
                  {r.exchange ? <span className="exch">{r.exchange}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .search-wrap{ position: relative; width: 100%; }

        .field{
          position: relative;
          display: flex;
          align-items: center;
          height: 40px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--card);
          transition: box-shadow .16s ease, border-color .16s ease;
        }
        .field.is-open{ box-shadow: 0 6px 22px rgba(0,0,0,.08); }

        .input{
          flex:1; height:100%;
          padding: 0 36px 0 12px;
          background: transparent;
          color: var(--text);
          font-size: 14px;
          font-weight: 600;
          border: 0; outline: none;
        }

        .x{
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          height: 26px; width: 26px; border-radius: 9px;
          border: 1px solid var(--border);
          background: var(--card);
          color: color-mix(in srgb, var(--text) 70%, var(--card));
          display: inline-flex; align-items: center; justify-content: center;
        }
        .x:hover{ box-shadow: 0 2px 10px rgba(0,0,0,.07); }

        .spin{
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          width: 18px; height: 18px; border-radius: 50%;
          border: 2px solid transparent; border-top-color: var(--text);
          opacity: 0; pointer-events: none;
        }
        .spin.is-on{ opacity: .6; animation: sp 0.9s linear infinite; }
        @keyframes sp{ to { transform: translateY(-50%) rotate(360deg); } }

        /* Sheet */
        .sheet{
          position: absolute; left: 0; right: 0; top: calc(100% + 8px);
          border-radius: 14px;
          border: 1px solid var(--border);
          background: color-mix(in srgb, var(--card) 90%, transparent);
          -webkit-backdrop-filter: saturate(1.8) blur(10px);
          backdrop-filter: saturate(1.8) blur(10px);
          box-shadow: 0 12px 30px rgba(0,0,0,.10);
          padding: 6px;
          z-index: 60;
        }

        .row{
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px;
          border-radius: 10px;
          cursor: pointer;
          color: var(--text);
          transition: background .12s ease, transform .08s ease;
        }
        .row:hover{ background: color-mix(in srgb, var(--text) 8%, transparent); }
        .row.is-active{ background: color-mix(in srgb, var(--accent, #3b82f6) 12%, transparent); }

        .ico{
          flex: 0 0 auto; width: 20px; height: 20px;
          display:flex; align-items:center; justify-content:center;
          color: color-mix(in srgb, var(--text) 80%, var(--card));
        }

        .txt{ min-width: 0; }
        .line1{ font-size: 13.5px; font-weight: 800; letter-spacing: .2px; }
        .line1 .sym b{ color: var(--accent, #3b82f6); }
        .line2{ font-size: 12.5px; opacity: .75; display:flex; gap:6px; }

        .empty{
          padding: 10px; text-align: center;
          font-size: 13px; opacity: .8;
        }
      `}</style>
    </div>
  );
}
