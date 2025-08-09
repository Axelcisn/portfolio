"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Simple ticker/company search with built-in debounce (no external hook).
 * Props:
 *   value?: string
 *   disabled?: boolean
 *   placeholder?: string
 *   onSelect: (item) => void   // item = { symbol, name, exch?, type? }
 */
export default function TickerSearch({
  value = "",
  disabled = false,
  placeholder = "Type ticker or company…",
  onSelect,
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  // Debounced search against /api/search?q=...
  useEffect(() => {
    if (!q || q.trim().length < 1) {
      setItems([]);
      setOpen(false);
      return;
    }

    // debounce 250ms
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        abortRef.current?.abort?.();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        setLoading(true);

        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({ results: [] }));
        setItems(Array.isArray(data?.results) ? data.results.slice(0, 10) : []);
        setOpen(true);
      } catch (_) {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timerRef.current);
      abortRef.current?.abort?.();
    };
  }, [q]);

  function handlePick(item) {
    setQ(item.symbol);
    setOpen(false);
    setItems([]);
    onSelect?.(item);
  }

  return (
    <div className="relative w-full">
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        className="w-full rounded-lg bg-transparent border border-neutral-700 px-3 py-2 outline-none"
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {open && (items.length > 0 || loading) && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-neutral-300">Searching…</div>
          )}
          {!loading &&
            items.map((it) => (
              <button
                key={`${it.symbol}-${it.name}`}
                type="button"
                onClick={() => handlePick(it)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-800"
              >
                <span className="font-mono text-sm">{it.symbol}</span>
                <span className="text-sm text-neutral-300 truncate">
                  {it.name}
                </span>
              </button>
            ))}
          {!loading && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}
