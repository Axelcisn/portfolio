// components/Strategy/TickerSearch.jsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
// use the local hook with a RELATIVE import (no "@/")
import useDebounce from "../../hooks/useDebounce";

export default function TickerSearch({
  value = "",
  onPick,          // (item) => void
  onEnter,         // (symbolString) => void (fallback if nothing picked)
  placeholder = "AAPL, MSFT, Tesla…",
  minChars = 1,
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1); // keyboard focus index
  const boxRef = useRef(null);
  const listRef = useRef(null);
  const debounced = useDebounce(query, 200);

  useEffect(() => setQuery(value || ""), [value]);

  // fetch suggestions
  useEffect(() => {
    let abort = new AbortController();
    async function run() {
      const q = debounced.trim();
      if (q.length < minChars) {
        setResults([]);
        return;
      }
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
          signal: abort.signal,
        });
        const j = await r.json().catch(() => ({ results: [] }));
        setResults(Array.isArray(j.results) ? j.results : []);
        setOpen(true);
        setHighlight(-1);
      } catch {
        if (!abort.signal.aborted) {
          setResults([]);
          setOpen(true);
          setHighlight(-1);
        }
      }
    }
    run();
    return () => abort.abort();
  }, [debounced, minChars]);

  // close list on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(item) {
    onPick?.(item);
    setQuery(item.symbol || "");
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === "Enter") {
        onEnter?.(query.trim());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const idx = highlight >= 0 ? highlight : 0;
      pick(results[idx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const list = useMemo(() => {
    return results.map((r, i) => {
      const sub =
        [r.name, r.exchange].filter(Boolean).join(" · ") ||
        (r.currency ? `CCY: ${r.currency}` : "");
      const active = i === highlight;
      return (
        <li
          key={`${r.symbol}-${i}`}
          role="option"
          aria-selected={active}
          // use onMouseDown so it fires BEFORE input blur hides the list
          onMouseDown={(ev) => {
            ev.preventDefault();
            pick(r);
          }}
          className={`px-3 py-2 cursor-pointer ${active ? "bg-gray-200" : "bg-white"} hover:bg-gray-100`}
        >
          <div className="font-medium">{r.symbol}</div>
          {sub && <div className="text-sm text-gray-600">{sub}</div>}
        </li>
      );
    });
  }, [results, highlight]);

  return (
    <div className="relative" ref={boxRef}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-3 py-2 text-black"
        autoComplete="off"
        spellCheck={false}
      />
      {open && results.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-gray-300 bg-white shadow"
        >
          {list}
        </ul>
      )}
    </div>
  );
}
