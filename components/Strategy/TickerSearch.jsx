"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useDebounce from "@/hooks/useDebounce";

export default function TickerSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Type ticker or company…",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [highlight, setHighlight] = useState(-1);
  const debounced = useDebounce(value, 200);
  const abortRef = useRef(null);
  const wrapRef = useRef(null);

  // close dropdown when clicking outside
  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // fetch suggestions
  useEffect(() => {
    setErr("");
    if (!debounced || debounced.trim().length < 1) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);

    if (abortRef.current) abortRef.current.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;

    const q = encodeURIComponent(debounced.trim());
    fetch(`/api/search?q=${q}`, { cache: "no-store", signal: ctl.signal })
      .then(r => r.ok ? r.json() : r.json().catch(() => ({})).then(j => { throw new Error(j?.error || r.statusText); }))
      .then(j => {
        const rows = Array.isArray(j?.results) ? j.results : [];
        setItems(rows.map(r => ({
          symbol: r.symbol || r.ticker || "",
          name: r.name || r.longname || r.shortname || "",
          exch: r.exchange || r.exch || "",
          type: r.type || r.quoteType || "",
        })));
        setLoading(false);
        setHighlight(rows.length ? 0 : -1);
      })
      .catch(e => {
        if (ctl.signal.aborted) return;
        setLoading(false);
        setErr(String(e?.message || e));
        setItems([]);
      });

    return () => ctl.abort();
  }, [debounced]);

  function choose(idx) {
    const it = items[idx];
    if (!it) return;
    onSelect?.(it.symbol, it);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight(h => (h + 1) % Math.max(1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight(h => (h - 1 + Math.max(1, items.length)) % Math.max(1, items.length));
    } else if (e.key === "Enter") {
      if (highlight >= 0) {
        e.preventDefault();
        choose(highlight);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        value={value}
        onChange={e => onChange?.(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-neutral-700 bg-transparent px-3 py-2 outline-none focus:border-[#007aff]"
        inputMode="text"
        autoCorrect="off"
        autoCapitalize="characters"
      />
      {open && (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-neutral-700 bg-[#111114] shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-sm text-neutral-400">Searching…</div>
          )}
          {!loading && err && (
            <div className="px-3 py-2 text-sm text-red-400">Error: {err}</div>
          )}
          {!loading && !err && items.length === 0 && (
            <div className="px-3 py-2 text-sm text-neutral-400">No matches</div>
          )}
          {!loading && items.length > 0 && (
            <ul role="listbox">
              {items.map((it, idx) => (
                <li
                  key={`${it.symbol}-${idx}`}
                  role="option"
                  aria-selected={idx === highlight}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseDown={e => { e.preventDefault(); }}  // keep focus
                  onClick={() => choose(idx)}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-[#1b1b20] ${idx === highlight ? "bg-[#1b1b20]" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium tabular-nums">{it.symbol}</span>
                    <span className="text-xs text-neutral-500">{it.exch || it.type}</span>
                  </div>
                  <div className="truncate text-neutral-300">{it.name}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
