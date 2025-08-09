"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useDebounce from "../../hooks/useDebounce";

/**
 * Excel/Google-Finance–style ticker search.
 *
 * Props:
 *   value: string                // controlled input value
 *   onChange: (text) => void     // called on text change
 *   onSelect: (item) => void     // called when a suggestion is chosen
 *   onEnter: (text) => void      // called when Enter is pressed with current text
 *   placeholder?: string
 */
export default function TickerSearch({
  value,
  onChange,
  onSelect,
  onEnter,
  placeholder = "Ticker or company",
}) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const boxRef = useRef(null);

  const q = (value ?? "").trim();
  const dq = useDebounce(q, 200);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!dq) {
        setItems([]);
        return;
      }
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(dq)}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        const arr = Array.isArray(j?.results) ? j.results : j ?? [];
        setItems(arr.slice(0, 8));
        setOpen(true);
        setHighlight(arr.length ? 0 : -1);
      } catch {
        if (!cancelled) {
          setItems([]);
          setOpen(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const choose = (item) => {
    onSelect?.(item);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (items.length ? (h + 1) % items.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) =>
        items.length ? (h - 1 + items.length) % items.length : -1
      );
    } else if (e.key === "Enter") {
      if (open && highlight >= 0 && items[highlight]) {
        e.preventDefault();
        choose(items[highlight]);
      } else {
        // Confirm with raw text (e.g., "AAPL")
        onEnter?.(q);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const dropdown = useMemo(() => {
    if (!open || !items.length) return null;
    return (
      <ul
        role="listbox"
        className="z-50 absolute left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-lg"
      >
        {items.map((it, i) => {
          const sym = it.symbol ?? it.ticker ?? "";
          const nm = it.name ?? it.longname ?? it.shortname ?? "";
          const ex = it.exch ?? it.exchange ?? "";
          const ccy = it.currency ?? it.ccy ?? "";
        return (
            <li
              key={`${sym}-${i}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(it);
              }}
              className={`px-3 py-2 cursor-pointer ${
                i === highlight ? "bg-zinc-800" : "hover:bg-zinc-800/60"
              }`}
            >
              <div className="text-sm font-medium">{sym}</div>
              <div className="text-xs text-zinc-400 truncate">
                {nm}
                {ex ? ` • ${ex}` : ""}{ccy ? ` • ${ccy}` : ""}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }, [open, items, highlight]);

  return (
    <div ref={boxRef} className="relative">
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(items.length > 0)}
        className="w-full rounded-xl border border-zinc-700/50 bg-transparent px-3 py-2 outline-none"
        autoComplete="off"
        spellCheck="false"
      />
      {dropdown}
    </div>
  );
}
