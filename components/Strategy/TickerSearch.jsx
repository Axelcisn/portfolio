// components/Strategy/TickerSearch.jsx
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Props:
 *  - value?: string (initial/controlled text)
 *  - onType?: (text: string) => void
 *  - onPick?: (item: { symbol: string, name?: string, exchange?: string }) => void
 */
export default function TickerSearch({ value = "", onType, onPick }) {
  const [q, setQ] = useState(value);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(-1); // highlighted item
  const boxRef = useRef(null);
  const timer = useRef(null);

  // keep input in sync if parent updates value
  useEffect(() => {
    setQ(value || "");
  }, [value]);

  // Debounced search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    onType?.(q);
    if (!q || !q.trim()) {
      setItems([]);
      setOpen(false);
      setIdx(-1);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { cache: "no-store" });
        const j = await res.json();
        if (Array.isArray(j?.results)) {
          setItems(j.results.slice(0, 12));
          setOpen(true);
          setIdx(j.results.length ? 0 : -1);
        } else {
          setItems([]);
          setOpen(false);
          setIdx(-1);
        }
      } catch {
        setItems([]);
        setOpen(false);
        setIdx(-1);
      }
    }, 250);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, onType]);

  // Close on outside click
  useEffect(() => {
    function onDoc(e) {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(item) {
    setQ(item.symbol);
    setOpen(false);
    setIdx(-1);
    onPick?.(item);
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(items.length > 0);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((p) => (items.length ? (p + 1) % items.length : -1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((p) => (items.length ? (p - 1 + items.length) % items.length : -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && idx >= 0 && idx < items.length) {
        pick(items[idx]);
      } else if (q && q.trim()) {
        // allow free-typed tickers
        pick({ symbol: q.trim().toUpperCase(), name: q.trim() });
      }
    }
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => items.length && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Type ticker or company (e.g., AAPL, ENEL.MI)"
        style={{ width: 280 }}
      />

      {open && items.length > 0 && (
        <ul
          style={{
            position: "absolute",
            zIndex: 20,
            top: "100%",
            left: 0,
            right: 0,
            maxHeight: 260,
            overflowY: "auto",
            margin: 0,
            padding: 0,
            listStyle: "none",
            background: "var(--card, white)",
            border: "1px solid rgba(0,0,0,0.15)",
            borderTop: "none",
          }}
        >
          {items.map((it, i) => (
            <li
              key={`${it.symbol}-${i}`}
              onMouseDown={(e) => e.preventDefault()} // keep focus
              onClick={() => pick(it)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                background: i === idx ? "rgba(0,0,0,0.08)" : "transparent",
                display: "flex",
                gap: 8,
                alignItems: "baseline",
              }}
            >
              <strong style={{ minWidth: 72 }}>{it.symbol}</strong>
              <span style={{ opacity: 0.8 }}>{it.name}</span>
              {it.exchange && <span style={{ opacity: 0.6 }}> · {it.exchange}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
