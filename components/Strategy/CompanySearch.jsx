// components/Strategy/CompanySearch.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export default function CompanySearch({
  value = "",
  onSelect = () => {},
  placeholder = "Search ticker or company…",
  maxItems = 12,
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => setQ(value), [value]);

  // debounce search
  useEffect(() => {
    if (!q?.trim()) {
      setItems([]);
      setOpen(false);
      return;
    }
    setErr("");
    setLoading(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `Search ${r.status}`);
        const mapped = (Array.isArray(j) ? j : j?.quotes || j?.results || [])
          .filter((it) => it?.symbol || it?.ticker)
          .slice(0, maxItems)
          .map((it) => ({
            ticker: it.symbol || it.ticker,
            name:
              it.shortname ||
              it.shortName ||
              it.longname ||
              it.longName ||
              it.name ||
              "",
            exchange:
              it.exchDisp ||
              it.exchange ||
              it.exch ||
              (it.market || "").toUpperCase(),
          }));
        setItems(mapped);
        setActive(0);
        setOpen(true);
      } catch (e) {
        setErr(String(e?.message || e));
        setItems([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [q, maxItems]);

  function choose(idx) {
    const it = items[idx];
    if (!it) return;
    setQ(it.ticker);
    setOpen(false);
    onSelect(it);
  }

  function onKeyDown(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // keep active row in view
  useEffect(() => {
    const list = listRef.current;
    const node = list?.querySelector(`[data-idx="${active}"]`);
    if (list && node) {
      const nTop = node.offsetTop;
      const nBot = nTop + node.offsetHeight;
      if (nTop < list.scrollTop) list.scrollTop = nTop;
      else if (nBot > list.scrollTop + list.clientHeight)
        list.scrollTop = nBot - list.clientHeight;
    }
  }, [active]);

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="company-search-listbox"
        aria-autocomplete="list"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q?.trim() && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-300 bg-white/90 px-3 py-2 text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {open && (
        <div
          id="company-search-listbox"
          role="listbox"
          ref={listRef}
          className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-xl border border-gray-300 bg-white shadow-lg"
        >
          {loading && (
            <div className="px-3 py-2 text-sm text-gray-500">Searching…</div>
          )}
          {!loading && items.length === 0 && !err && (
            <div className="px-3 py-2 text-sm text-gray-500">No results</div>
          )}
          {!loading && err && (
            <div className="px-3 py-2 text-sm text-red-600">{err}</div>
          )}
          {!loading &&
            items.map((it, i) => (
              <button
                key={`${it.ticker}-${i}`}
                role="option"
                aria-selected={i === active}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                  i === active ? "bg-blue-50" : "bg-white"
                } hover:bg-blue-50`}
              >
                <div className="min-w-14 font-semibold text-gray-900">
                  {it.ticker}
                </div>
                <div className="grow text-sm text-gray-600 truncate">
                  {it.name || "—"}
                </div>
                <div className="text-[11px] font-medium text-gray-500">
                  {(it.exchange || "").toUpperCase()}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
