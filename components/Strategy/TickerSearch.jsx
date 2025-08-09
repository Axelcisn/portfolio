// components/Strategy/TickerSearch.jsx
"use client";

import { useEffect, useRef, useState } from "react";
import useDebounce from "../../hooks/useDebounce";

export default function TickerSearch({
  value = "",
  onPick = () => {},
  onEnter = () => {},
  placeholder = "Type ticker or company…",
}) {
  const [q, setQ] = useState(value);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(q, 200);
  const boxRef = useRef(null);

  useEffect(() => { setQ(value || ""); }, [value]);

  useEffect(() => {
    let abort = false;
    async function run() {
      const term = (debounced || "").trim();
      if (!term) { setItems([]); setOpen(false); return; }
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = await r.json();
        if (!abort) { setItems(Array.isArray(j?.results) ? j.results : j); setOpen(true); }
      } catch {
        if (!abort) { setItems([]); setOpen(false); }
      }
    }
    run();
    return () => { abort = true; };
  }, [debounced]);

  // close the list after the click finishes so blur doesn't cancel selection
  const pick = (it) => {
    onPick(it);
    setQ(it.symbol || "");
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <input
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-black"
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter(q.trim());
        }}
        onFocus={() => { if (items.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />

      {open && items.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded border border-gray-300 bg-white shadow">
          {items.map((it, i) => (
            <button
              key={`${it.symbol}-${i}`}
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-100"
              onMouseDown={(e) => { e.preventDefault(); pick(it); }}
            >
              <div className="w-28 font-semibold text-black">{it.symbol}</div>
              <div className="flex-1 text-black">{it.name || ""}</div>
              <div className="shrink-0 text-gray-500">{it.exchDisp || it.exchange || ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
